import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Mic, Settings2, Square, Undo2, Volume2, X } from 'lucide-react';
import type { ItemCierre } from '../asistente/logica';
import type { Accion } from '../asistente/interpretar';
import type { TaskItem } from '../types';
import { prepararGuionEntregas, prepararGuionVoz } from '../services/asistenteService';
import {
  construirContexto, deshacerVoz, ejecutarAccion, interpretarFrase, type Deshacer, type Turno,
} from '../services/asistenteVozService';
import { desbloquearVoz, esperarVoces, guardarPreferenciasVoz, hablar, pararVoz, preferenciasVoz, vozDisponible } from '../utils/voz';
import { escuchar, estadoMicro, MENSAJE_INSEGURO, type Escucha } from '../utils/escuchar';
import { haptic } from '../utils/haptics';

const VELOCIDADES = [{ v: 0.9, label: 'Lenta' }, { v: 1, label: 'Normal' }, { v: 1.15, label: 'Rápida' }];
const chip = 'min-h-11 inline-flex items-center gap-1.5 rounded-xl px-3 text-sm font-semibold';
const NO_ENTIENDO = 'No te he entendido. Puedes preguntarme por otro día, decirme que no tienes libre una franja, que pospongas una entrega o que te apunte un deber.';
const SATURADO = 'El asistente inteligente no responde ahora mismo; prueba en un minuto. Mientras, entiendo frases sencillas como «¿y mañana?» o «hoy de 5 a 7 voy al gimnasio».';
const CONSULTAS =new Set<Accion['tipo']>(['resumen', 'entregas']);

interface Props {
  userId: string;
  tareas: TaskItem[];
  cierre: ItemCierre[];
  onActividadAnadida?: (tarea: TaskItem) => void;
  onActividadQuitada?: (tareaId: string) => void;
  onTareaCambiada?: (tarea: TaskItem) => void;
}

type Estado = 'parado' | 'escuchando' | 'pensando' | 'hablando';

// Voice assistant: reads today aloud and, with «Hablar», understands free sentences to answer, block time,
// postpone deliverables, add homework or move agenda tasks
export function EscucharDia({ userId, tareas, cierre, onActividadAnadida, onActividadQuitada, onTareaCambiada }: Props) {
  const [estado, setEstado] = useState<Estado>('parado');
  const [frases, setFrases] = useState<string[]>([]);
  const [actual, setActual] = useState(-1);
  const [oido, setOido] = useState('');
  const [local, setLocal] = useState(false);
  const [error, setError] = useState('');
  const [ajustes, setAjustes] = useState(false);
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  const [pref, setPref] = useState(preferenciasVoz);
  const [pendiente, setPendiente] = useState<Accion | null>(null);
  const [ultima, setUltima] = useState<Deshacer | null>(null);
  const parar = useRef<() => void>(() => undefined);
  const escucha = useRef<Escucha | null>(null);
  const peticion = useRef(0);
  const historial = useRef<Turno[]>([]);
  const tareasRef = useRef(tareas);
  tareasRef.current = tareas;

  useEffect(() => () => { peticion.current++; escucha.current?.cancelar(); pararVoz(); }, []);
  useEffect(() => { if (ajustes) void esperarVoces().then(setVoces); }, [ajustes]);

  if (!vozDisponible()) return null;
  const micro = estadoMicro();

  const responder = (lista: string[], id: number) => {
    if (id !== peticion.current) return;
    setFrases(lista); setEstado('hablando'); setActual(-1);
    parar.current = hablar(lista, {
      onFrase: setActual,
      onFin: () => { if (id === peticion.current) { setEstado('parado'); setActual(-1); } },
    });
  };

  const ejecutar = async (id: number, fn: () => Promise<string[]>) => {
    setError(''); setEstado('pensando');
    try {
      const [lista] = await Promise.all([fn(), esperarVoces()]);
      if (lista.length) responder(lista, id);
      else if (id === peticion.current) setEstado('parado');
    } catch (err) {
      if (id !== peticion.current) return;
      const mensaje = err instanceof Error ? err.message : String(err);
      setError(mensaje);
      responder([mensaje], id);
    }
  };

  // Runs one action that changes something and keeps what is needed to undo it
  const aplicar = async (accion: Accion, confirmar: boolean): Promise<{ frases: string[]; seguir: boolean }> => {
    const r = await ejecutarAccion(userId, accion, tareasRef.current, confirmar);
    if (r.confirmar) { setPendiente(accion); if (r.deshacer) setUltima(r.deshacer); return { frases: r.frases, seguir: false }; }
    if (r.tareaNueva) onActividadAnadida?.(r.tareaNueva);
    if (r.tareaCambiada) onTareaCambiada?.(r.tareaCambiada);
    if (r.deshacer) { setUltima(r.deshacer); haptic(15); }
    return { frases: r.frases, seguir: true };
  };

  const deshacer = async () => {
    if (!ultima) return ['No hay nada que deshacer.'];
    const r = await deshacerVoz(userId, ultima);
    if (r.quitarTarea) onActividadQuitada?.(r.quitarTarea);
    if (r.restaurarTarea) onTareaCambiada?.(r.restaurarTarea);
    setUltima(null); setPendiente(null);
    return r.frases;
  };

  // A free sentence: Gemini (or the local parser offline) decides the actions, then they run in order
  const procesar = (texto: string, id: number) => ejecutar(id, async () => {
    const ctx = await construirContexto(userId, tareasRef.current);
    const interp = await interpretarFrase(texto, ctx, historial.current);
    if (id !== peticion.current) return [];
    setLocal(interp.local); setPendiente(null);
    const salida: string[] = [];
    if (interp.respuesta && !interp.acciones.some(a => CONSULTAS.has(a.tipo))) salida.push(interp.respuesta);
    for (const accion of interp.acciones) {
      try {
        if (accion.tipo === 'resumen') salida.push(...(await prepararGuionVoz(userId, tareasRef.current, cierre, accion.fecha)).frases);
        else if (accion.tipo === 'entregas') salida.push(...await prepararGuionEntregas(userId, accion.dias));
        else if (accion.tipo === 'deshacer') salida.push(...await deshacer());
        else if (accion.tipo === 'parar') return [];
        else if (accion.tipo === 'pedir_aclaracion') { if (!salida.includes(accion.pregunta)) salida.push(accion.pregunta); }
        else {
          const r = await aplicar(accion, false);
          salida.push(...r.frases);
          if (!r.seguir) break;
        }
      } catch (err) {
        salida.push(err instanceof Error ? err.message : String(err));
        break;
      }
    }
    if (!salida.length) salida.push(interp.local ? SATURADO : NO_ENTIENDO);
    historial.current = [...historial.current, { usuario: texto, asistente: salida.join(' ') }].slice(-3);
    return salida;
  });

  const empezar = () => {
    haptic(10);
    desbloquearVoz();
    setOido('');
    const id = ++peticion.current;
    void ejecutar(id, async () => (await prepararGuionVoz(userId, tareasRef.current, cierre)).frases);
  };

  const hablarConmigo = async () => {
    if (micro === 'inseguro') { setError(MENSAJE_INSEGURO); return; }
    haptic(10);
    parar.current(); pararVoz();
    desbloquearVoz();
    setError(''); setFrases([]); setOido(''); setEstado('escuchando');
    const id = ++peticion.current;
    const e = escuchar(setOido);
    escucha.current = e;
    try {
      const texto = await e.texto;
      if (id !== peticion.current) return;
      escucha.current = null;
      if (!texto) { setEstado('parado'); setError('No te he oído. Toca el micrófono y habla.'); return; }
      setOido(texto);
      await procesar(texto, id);
    } catch (err) {
      if (id !== peticion.current) return;
      escucha.current = null;
      setEstado('parado');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const detener = () => {
    if (estado === 'escuchando') { escucha.current?.detener(); return; }
    peticion.current++; escucha.current?.cancelar(); escucha.current = null;
    parar.current(); pararVoz(); setEstado('parado'); setActual(-1);
  };
  const cambiar = (p: { vozURI?: string | null; velocidad?: number }) => { guardarPreferenciasVoz(p); setPref(preferenciasVoz()); };
  const confirmarPendiente = () => {
    if (!pendiente) return;
    desbloquearVoz();
    const accion = pendiente;
    setPendiente(null);
    const id = ++peticion.current;
    void ejecutar(id, async () => (await aplicar(accion, true)).frases);
  };
  const deshacerAhora = () => { desbloquearVoz(); const id = ++peticion.current; void ejecutar(id, deshacer); };

  const ocupado = estado !== 'parado';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        {!ocupado ? (
          <>
            <button type="button" onClick={empezar} className={`${chip} bg-indigo-600 text-white active:scale-95`}>
              <Volume2 className="w-4 h-4" /> Escuchar mi día
            </button>
            {micro !== 'no_soportado' && (
              <button type="button" onClick={() => void hablarConmigo()} aria-label="Hablar con el asistente"
                className={`${chip} border border-indigo-300 text-indigo-700 active:scale-95`}>
                <Mic className="w-4 h-4" /> Hablar
              </button>
            )}
          </>
        ) : (
          <button type="button" onClick={detener}
            className={`${chip} ${estado === 'escuchando' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'}`}>
            {estado === 'escuchando' ? <Mic className="w-4 h-4 animate-pulse" /> : estado === 'pensando' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
            {estado === 'escuchando' ? 'Escuchando… toca al terminar' : estado === 'pensando' ? 'Pensando…' : 'Parar'}
          </button>
        )}
        <button type="button" aria-label="Ajustes de voz" aria-expanded={ajustes} onClick={() => setAjustes(a => !a)}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
          <Settings2 className="w-4 h-4" />
        </button>
      </div>

      {ajustes && (
        <div className="rounded-xl bg-slate-50 p-3 flex flex-col gap-2 text-sm">
          <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Velocidad">
            {VELOCIDADES.map(o => (
              <button key={o.v} type="button" aria-pressed={pref.velocidad === o.v} onClick={() => cambiar({ velocidad: o.v })}
                className={`${chip} ${pref.velocidad === o.v ? 'bg-indigo-600 text-white' : 'border border-slate-300 text-slate-700'}`}>
                {o.label}
              </button>
            ))}
          </div>
          {voces.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500">Voz</span>
              <select value={pref.vozURI || ''} onChange={e => cambiar({ vozURI: e.target.value || null })}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-2 text-slate-800">
                <option value="">Automática ({voces[0].name})</option>
                {voces.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
              </select>
            </label>
          )}
          {voces.length === 0 && <p className="text-xs text-slate-500">Este dispositivo no tiene voces en español instaladas; se usará la voz por defecto.</p>}
          <p className="text-xs text-slate-500">
            Con «Hablar» puedes decir cosas como: «¿y mañana?», «hoy por la mañana no tengo libre», «pospón la práctica de MATLAB»,
            «me han mandado ejercicios de Física para el viernes» o «hoy de 11:30 a 13:30 voy a vender a bares». Reorganizo el plan y te digo qué he movido.
          </p>
          {micro === 'inseguro' && <p className="text-xs text-amber-700">{MENSAJE_INSEGURO}</p>}
        </div>
      )}

      {oido && (
        <p className="text-sm self-end max-w-[90%] rounded-xl bg-slate-100 text-slate-700 px-3 py-2">
          «{oido}»
        </p>
      )}

      {error && <p role="alert" className="text-sm rounded-xl bg-red-50 text-red-700 px-3 py-2">{error}</p>}

      {frases.length > 0 && estado !== 'escuchando' && (
        <div aria-live="polite" className="text-sm rounded-xl bg-indigo-50/70 text-slate-800 px-3 py-2">
          {estado === 'hablando' && actual >= 0 ? frases[actual] : frases.join(' ')}
          {local && <span className="block mt-1 text-xs text-slate-500">Modo básico: el asistente inteligente no responde ahora.</span>}
        </div>
      )}

      {(pendiente || ultima) && estado !== 'escuchando' && estado !== 'pensando' && (
        <div className="flex gap-2 flex-wrap">
          {pendiente && (
            <>
              <button type="button" onClick={confirmarPendiente} className={`${chip} bg-amber-500 text-white`}>
                <Check className="w-4 h-4" /> Sí, hazlo
              </button>
              <button type="button" onClick={() => setPendiente(null)} className={`${chip} border border-slate-300 text-slate-700`}>
                <X className="w-4 h-4" /> No
              </button>
            </>
          )}
          {ultima && !pendiente && (
            <button type="button" onClick={deshacerAhora} className={`${chip} border border-slate-300 text-slate-700`}>
              <Undo2 className="w-4 h-4" /> Deshacer «{ultima.titulo}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}
