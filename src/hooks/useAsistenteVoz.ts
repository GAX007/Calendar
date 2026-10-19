import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemCierre } from '../asistente/logica';
import type { Accion } from '../asistente/interpretar';
import type { TaskItem } from '../types';
import { prepararGuionEntregas, prepararGuionVoz } from '../services/asistenteService';
import {
  construirContexto, deshacerVoz, ejecutarAccion, interpretarFrase, transcribirVoz, type Deshacer, type Turno,
} from '../services/asistenteVozService';
import { desbloquearVoz, esperarVoces, hablar, pararVoz, vozDisponible } from '../utils/voz';
import { escuchar, estadoMicro, MENSAJE_INSEGURO, type Escucha } from '../utils/escuchar';
import { haptic } from '../utils/haptics';

// Voice assistant state shared by the Hoy header ("Escuchar mi día") and the assistant bar.
// Same behaviour as EscucharDia: reads the day aloud and interprets free sentences into actions.

export type EstadoVoz = 'parado' | 'escuchando' | 'pensando' | 'hablando';
// What the answer panel is showing: the spoken summary of the day or the answer to a sentence
export type ModoPanel = 'dia' | 'respuesta' | null;

export interface ResultadoDictado {
  texto: string;
  cancelado?: boolean;
  error?: string;
}

const NO_ENTIENDO = 'No te he entendido. Puedes preguntarme por otro día, decirme que no tienes libre una franja, que pospongas una entrega o que te apunte un deber.';
const SATURADO = 'El asistente inteligente no responde ahora mismo; prueba en un minuto. Mientras, entiendo frases sencillas como «¿y mañana?» o «hoy de 5 a 7 voy al gimnasio».';
const CONSULTAS = new Set<Accion['tipo']>(['resumen', 'entregas']);

interface Opciones {
  userId?: string;
  tareas: TaskItem[];
  cierre: ItemCierre[];
  onActividadAnadida?: (tarea: TaskItem) => void;
  onActividadQuitada?: (tareaId: string) => void;
  onTareaCambiada?: (tarea: TaskItem) => void;
}

export function useAsistenteVoz(opciones: Opciones) {
  const [estado, setEstado] = useState<EstadoVoz>('parado');
  const [modo, setModo] = useState<ModoPanel>(null);
  const [frases, setFrases] = useState<string[]>([]);
  const [actual, setActual] = useState(-1);
  const [oidoDefinitivo, setOidoDefinitivo] = useState('');
  const [oidoProvisional, setOidoProvisional] = useState('');
  const [error, setError] = useState('');
  const [local, setLocal] = useState(false);
  const [pendiente, setPendiente] = useState<Accion | null>(null);
  const [ultima, setUltima] = useState<Deshacer | null>(null);

  const parar = useRef<() => void>(() => undefined);
  const escucha = useRef<Escucha | null>(null);
  const peticion = useRef(0);
  const historial = useRef<Turno[]>([]);
  const ops = useRef(opciones);
  ops.current = opciones;

  useEffect(() => () => { peticion.current++; escucha.current?.cancelar(); pararVoz(); }, []);

  const responder = useCallback((lista: string[], id: number, enVoz: boolean) => {
    if (id !== peticion.current) return;
    setFrases(lista);
    setActual(-1);
    if (!enVoz || !vozDisponible()) { setEstado('parado'); return; }
    setEstado('hablando');
    parar.current = hablar(lista, {
      onFrase: setActual,
      onFin: () => { if (id === peticion.current) { setEstado('parado'); setActual(-1); } },
    });
  }, []);

  const ejecutar = useCallback(async (id: number, fn: () => Promise<string[]>, enVoz: boolean) => {
    setError('');
    setEstado('pensando');
    try {
      const [lista] = await Promise.all([fn(), enVoz ? esperarVoces() : Promise.resolve([])]);
      if (lista.length) responder(lista, id, enVoz);
      else if (id === peticion.current) setEstado('parado');
    } catch (err) {
      if (id !== peticion.current) return;
      const mensaje = err instanceof Error ? err.message : String(err);
      setError(mensaje);
      responder([mensaje], id, enVoz);
    }
  }, [responder]);

  // Runs one action that changes something and keeps what is needed to undo it
  const aplicar = useCallback(async (accion: Accion, confirmar: boolean): Promise<{ frases: string[]; seguir: boolean }> => {
    const { userId, tareas, onActividadAnadida, onTareaCambiada } = ops.current;
    if (!userId) throw new Error('Inicia sesión para que el asistente pueda cambiar tu agenda.');
    const r = await ejecutarAccion(userId, accion, tareas, confirmar);
    if (r.confirmar) { setPendiente(accion); if (r.deshacer) setUltima(r.deshacer); return { frases: r.frases, seguir: false }; }
    if (r.tareaNueva) onActividadAnadida?.(r.tareaNueva);
    if (r.tareaCambiada) onTareaCambiada?.(r.tareaCambiada);
    if (r.deshacer) { setUltima(r.deshacer); haptic(15); }
    return { frases: r.frases, seguir: true };
  }, []);

  const deshacer = useCallback(async (d: Deshacer | null) => {
    const { userId, onActividadQuitada, onTareaCambiada } = ops.current;
    if (!d || !userId) return ['No hay nada que deshacer.'];
    const r = await deshacerVoz(userId, d);
    if (r.quitarTarea) onActividadQuitada?.(r.quitarTarea);
    if (r.restaurarTarea) onTareaCambiada?.(r.restaurarTarea);
    setUltima(null);
    setPendiente(null);
    return r.frases;
  }, []);

  // A free sentence: Gemini (or the local parser offline) decides the actions, then they run in order
  const procesar = useCallback((texto: string, id: number, enVoz: boolean, ultimaActual: Deshacer | null) => ejecutar(id, async () => {
    const { userId, tareas, cierre } = ops.current;
    if (!userId) throw new Error('Inicia sesión para hablar con el asistente.');
    const ctx = await construirContexto(userId, tareas);
    const interp = await interpretarFrase(texto, ctx, historial.current);
    if (id !== peticion.current) return [];
    setLocal(interp.local);
    setPendiente(null);
    const salida: string[] = [];
    if (interp.respuesta && !interp.acciones.some(a => CONSULTAS.has(a.tipo))) salida.push(interp.respuesta);
    for (const accion of interp.acciones) {
      try {
        if (accion.tipo === 'resumen') salida.push(...(await prepararGuionVoz(userId, ops.current.tareas, cierre, accion.fecha)).frases);
        else if (accion.tipo === 'entregas') salida.push(...await prepararGuionEntregas(userId, accion.dias));
        else if (accion.tipo === 'deshacer') salida.push(...await deshacer(ultimaActual));
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
  }, enVoz), [ejecutar, aplicar, deshacer]);

  // Reads the rest of today aloud
  const escucharDia = useCallback(() => {
    const { userId } = ops.current;
    if (!userId) return;
    haptic(10);
    desbloquearVoz();
    setModo('dia');
    setFrases([]);
    setPendiente(null);
    const id = ++peticion.current;
    void ejecutar(id, async () => (await prepararGuionVoz(userId, ops.current.tareas, ops.current.cierre)).frases, true);
  }, [ejecutar]);

  // Listens to one sentence and returns it without acting on it
  const dictar = useCallback(async (): Promise<ResultadoDictado> => {
    const micro = estadoMicro();
    if (micro === 'inseguro') return { texto: '', error: MENSAJE_INSEGURO };
    if (micro === 'no_soportado') return { texto: '', error: 'Este navegador no permite dictar.' };
    parar.current();
    pararVoz();
    desbloquearVoz();
    setError('');
    setOidoDefinitivo('');
    setOidoProvisional('');
    setEstado('escuchando');
    const id = ++peticion.current;
    // With a session the clip is also transcribed by OpenAI, which knows the Basque subject names
    const e = escuchar((_, definitivo, provisional) => { setOidoDefinitivo(definitivo); setOidoProvisional(provisional); },
      ops.current.userId ? transcribirVoz : undefined);
    escucha.current = e;
    try {
      const texto = await e.texto;
      if (id !== peticion.current) return { texto: '', cancelado: true };
      escucha.current = null;
      setEstado('parado');
      if (!texto) return { texto: '', error: 'No te he oído. Toca el micrófono y habla.' };
      return { texto };
    } catch (err) {
      if (id !== peticion.current) return { texto: '', cancelado: true };
      escucha.current = null;
      setEstado('parado');
      return { texto: '', error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  // Stops listening and keeps what was heard
  const terminarDictado = useCallback(() => { escucha.current?.detener(); }, []);

  const cancelarDictado = useCallback(() => {
    peticion.current++;
    escucha.current?.cancelar();
    escucha.current = null;
    setEstado('parado');
  }, []);

  // Sends a sentence to the assistant; `enVoz` speaks the answer
  const enviar = useCallback((texto: string, enVoz = true) => {
    if (enVoz) desbloquearVoz();
    setModo('respuesta');
    setFrases([]);
    const id = ++peticion.current;
    void procesar(texto, id, enVoz, ultima);
  }, [procesar, ultima]);

  const detener = useCallback(() => {
    peticion.current++;
    escucha.current?.cancelar();
    escucha.current = null;
    parar.current();
    pararVoz();
    setEstado('parado');
    setActual(-1);
  }, []);

  const cerrar = useCallback(() => {
    detener();
    setModo(null);
    setFrases([]);
    setPendiente(null);
    setUltima(null);
    setError('');
  }, [detener]);

  const confirmarPendiente = useCallback(() => {
    if (!pendiente) return;
    desbloquearVoz();
    const accion = pendiente;
    setPendiente(null);
    const id = ++peticion.current;
    void ejecutar(id, async () => (await aplicar(accion, true)).frases, true);
  }, [pendiente, ejecutar, aplicar]);

  const descartarPendiente = useCallback(() => setPendiente(null), []);

  const deshacerAhora = useCallback(() => {
    desbloquearVoz();
    const id = ++peticion.current;
    const d = ultima;
    void ejecutar(id, () => deshacer(d), true);
  }, [ejecutar, deshacer, ultima]);

  return {
    estado, modo, frases, actual, oidoDefinitivo, oidoProvisional, error, local, pendiente, ultima,
    puedeHablar: vozDisponible(),
    escucharDia, dictar, terminarDictado, cancelarDictado, enviar, detener, cerrar,
    confirmarPendiente, descartarPendiente, deshacerAhora,
  };
}

export type AsistenteVoz = ReturnType<typeof useAsistenteVoz>;
