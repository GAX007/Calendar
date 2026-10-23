import { useCallback, useEffect, useRef, useState } from 'react';
import type { ItemCierre } from '../asistente/logica';
import type { Accion } from '../asistente/interpretar';
import { quitarEco, respuestaSiNo, seguirEscuchando, SILENCIO_FIN_CONVERSACION_MS } from '../asistente/conversacion';
import type { TaskItem } from '../types';
import { prepararGuionEntregas, prepararGuionVoz } from '../services/asistenteService';
import {
  construirContexto, deshacerVoz, ejecutarAccion, interpretarFrase, transcribirVoz, type Deshacer, type Turno,
} from '../services/asistenteVozService';
import { desbloquearVoz, esperarFinVoz, esperarVoces, hablar, pararVoz, vozDisponible } from '../utils/voz';
import {
  abrirMicro, cerrarMicro, escuchar, escucharTurno, estadoMicro, MENSAJE_INSEGURO, prepararAudio, type Escucha,
} from '../utils/escuchar';
import { haptic } from '../utils/haptics';

// Voice assistant state shared by the Hoy header ("Escuchar mi día") and the assistant bar.
// Same behaviour as EscucharDia: reads the day aloud and interprets free sentences into actions.
// Conversation: when the answer asks something, the microphone reopens by itself after speaking
// and the next answer goes to the assistant with the previous turns, until there is no question,
// nobody speaks for a few seconds or the user stops it.

export type EstadoVoz = 'parado' | 'escuchando' | 'pensando' | 'hablando';
// What the answer panel is showing: the spoken summary of the day or the answer to a sentence
export type ModoPanel = 'dia' | 'respuesta' | null;

export interface ResultadoDictado {
  texto: string;
  cancelado?: boolean;
  error?: string;
}

const NO_ENTIENDO = 'No te he entendido. Puedes preguntarme por otro día, decirme que no tienes libre una franja, que pospongas o descartes una entrega o que te apunte un deber.';
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
  const [pendiente, setPendienteEstado] = useState<Accion | null>(null);
  const [ultima, setUltimaEstado] = useState<Deshacer | null>(null);
  // The assistant is waiting for an answer: the panel shows "Te escucho" and the bar keeps the conversation
  const [conversando, setConversando] = useState(false);

  const parar = useRef<() => void>(() => undefined);
  const escucha = useRef<Escucha | null>(null);
  const peticion = useRef(0);
  const historial = useRef<Turno[]>([]);
  const ops = useRef(opciones);
  ops.current = opciones;
  // Open microphone of the current conversation (opened in the user's tap) and what to do after speaking
  const micro = useRef<MediaStream | null>(null);
  const siguiente = useRef<(() => void) | null>(null);
  const turnos = useRef(0);
  // What the assistant said last, to tell its own echo from the user's answer
  const ultimoDicho = useRef('');
  const escucharRespuestaRef = useRef<(reintento?: boolean) => Promise<void>>(async () => undefined);
  const pendienteRef = useRef<Accion | null>(null);
  const ultimaRef = useRef<Deshacer | null>(null);
  const setPendiente = useCallback((a: Accion | null) => { pendienteRef.current = a; setPendienteEstado(a); }, []);
  const setUltima = useCallback((d: Deshacer | null) => { ultimaRef.current = d; setUltimaEstado(d); }, []);

  const terminarConversacion = useCallback(() => {
    siguiente.current = null;
    cerrarMicro(micro.current);
    micro.current = null;
    turnos.current = 0;
    setConversando(false);
  }, []);

  useEffect(() => () => { peticion.current++; escucha.current?.cancelar(); pararVoz(); cerrarMicro(micro.current); }, []);

  const responder = useCallback((lista: string[], id: number, enVoz: boolean) => {
    ultimoDicho.current = lista.join(' ');
    if (id !== peticion.current) return;
    setFrases(lista);
    setActual(-1);
    const despues = () => {
      const seguir = siguiente.current;
      siguiente.current = null;
      if (seguir) seguir(); else terminarConversacion();
    };
    if (!enVoz || !vozDisponible()) { setEstado('parado'); if (!enVoz) terminarConversacion(); else despues(); return; }
    setEstado('hablando');
    parar.current = hablar(lista, {
      onFrase: setActual,
      onFin: () => { if (id === peticion.current) { setEstado('parado'); setActual(-1); despues(); } },
    });
  }, [terminarConversacion]);

  const ejecutar = useCallback(async (id: number, fn: () => Promise<string[]>, enVoz: boolean) => {
    setError('');
    setEstado('pensando');
    try {
      const [lista] = await Promise.all([fn(), enVoz ? esperarVoces() : Promise.resolve([])]);
      if (lista.length) responder(lista, id, enVoz);
      else if (id === peticion.current) { setEstado('parado'); terminarConversacion(); }
    } catch (err) {
      if (id !== peticion.current) return;
      const mensaje = err instanceof Error ? err.message : String(err);
      setError(mensaje);
      siguiente.current = null;
      responder([mensaje], id, enVoz);
    }
  }, [responder, terminarConversacion]);

  // Runs one action that changes something and keeps what is needed to undo it
  const aplicar = useCallback(async (accion: Accion, confirmar: boolean): Promise<{ frases: string[]; seguir: boolean }> => {
    const { userId, tareas, onActividadAnadida, onTareaCambiada } = ops.current;
    if (!userId) throw new Error('Inicia sesión para que el asistente pueda cambiar tu agenda.');
    const r = await ejecutarAccion(userId, accion, tareas, confirmar);
    if (r.confirmar) { setPendiente(accion); if (r.deshacer) setUltima(r.deshacer); return { frases: r.frases, seguir: false }; }
    if (r.tareaNueva) onActividadAnadida?.(r.tareaNueva);
    if (r.tareaCambiada) onTareaCambiada?.(r.tareaCambiada);
    if (r.tareaBorrada) ops.current.onActividadQuitada?.(r.tareaBorrada);
    if (r.deshacer) { setUltima(r.deshacer); haptic(15); }
    return { frases: r.frases, seguir: true };
  }, [setPendiente, setUltima]);

  const deshacer = useCallback(async (d: Deshacer | null) => {
    const { userId, onActividadQuitada, onTareaCambiada } = ops.current;
    if (!d || !userId) return ['No hay nada que deshacer.'];
    const r = await deshacerVoz(userId, d);
    if (r.quitarTarea) onActividadQuitada?.(r.quitarTarea);
    if (r.restaurarTarea) onTareaCambiada?.(r.restaurarTarea);
    setUltima(null);
    setPendiente(null);
    return r.frases;
  }, [setPendiente, setUltima]);

  // After answering: keep listening when the assistant asked something and the microphone is open
  const prepararSiguiente = useCallback((salida: string[], enVoz: boolean, aclaracion: boolean) => {
    const seguir = enVoz && micro.current !== null
      && seguirEscuchando({ frases: salida, pendiente: Boolean(pendienteRef.current), aclaracion, turnos: turnos.current });
    siguiente.current = seguir ? () => void escucharRespuestaRef.current() : null;
    setConversando(seguir);
  }, []);

  // A free sentence: the model (or the local parser offline) decides the actions, then they run in order
  const procesar = useCallback((texto: string, id: number, enVoz: boolean) => ejecutar(id, async () => {
    const { userId, tareas, cierre } = ops.current;
    if (!userId) throw new Error('Inicia sesión para hablar con el asistente.');
    const ultimaActual = ultimaRef.current;
    const ctx = await construirContexto(userId, tareas);
    const interp = await interpretarFrase(texto, ctx, historial.current);
    if (id !== peticion.current) return [];
    setLocal(interp.local);
    setPendiente(null);
    const salida: string[] = [];
    let aclaracion = false;
    if (interp.respuesta && !interp.acciones.some(a => CONSULTAS.has(a.tipo))) salida.push(interp.respuesta);
    for (const accion of interp.acciones) {
      try {
        if (accion.tipo === 'resumen') salida.push(...(await prepararGuionVoz(userId, ops.current.tareas, cierre, accion.fecha, accion.detalle)).frases);
        else if (accion.tipo === 'entregas') salida.push(...await prepararGuionEntregas(userId, accion.dias));
        else if (accion.tipo === 'deshacer') salida.push(...await deshacer(ultimaActual));
        else if (accion.tipo === 'parar') { terminarConversacion(); return []; }
        else if (accion.tipo === 'pedir_aclaracion') { aclaracion = true; if (!salida.includes(accion.pregunta)) salida.push(accion.pregunta); }
        else {
          const r = await aplicar(accion, false);
          // A confirmation question replaces the model's own sentence, so it is not asked twice
          if (!r.seguir && salida.length === 1 && salida[0] === interp.respuesta) salida.length = 0;
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
    prepararSiguiente(salida, enVoz, aclaracion);
    return salida;
  }, enVoz), [ejecutar, aplicar, deshacer, prepararSiguiente, setPendiente, terminarConversacion]);

  // Next turn of a conversation: records on the open stream until a pause; silence ends the conversation
  const escucharRespuesta = useCallback(async (reintento = false) => {
    const stream = micro.current;
    if (!stream) { terminarConversacion(); return; }
    const id = ++peticion.current;
    if (!reintento) turnos.current++;
    setOidoDefinitivo('');
    setOidoProvisional('');
    // The microphone opens only once the voice has really finished, plus a pause: otherwise it hears the assistant
    await esperarFinVoz();
    if (id !== peticion.current) return;
    setEstado('escuchando');
    haptic(8);
    const e = escucharTurno(stream, transcribirVoz, SILENCIO_FIN_CONVERSACION_MS);
    escucha.current = e;
    const oido = await e.texto.catch(() => '');
    if (id !== peticion.current) return;
    escucha.current = null;
    // Whatever repeats the assistant's last answer is its own echo, not the user's answer
    const texto = quitarEco(oido, ultimoDicho.current);
    if (!texto && oido && !reintento) { void escucharRespuestaRef.current(true); return; }
    if (!texto) { setEstado('parado'); terminarConversacion(); return; }
    setOidoDefinitivo(texto);
    const espera = pendienteRef.current;
    const corta = espera ? respuestaSiNo(texto) : null;
    // A plain "sí" or "no" to a pending confirmation runs at once, without asking the model again
    if (espera && corta === 'si') {
      setPendiente(null);
      historial.current = [...historial.current, { usuario: texto, asistente: '' }].slice(-3);
      void ejecutar(id, async () => {
        const r = await aplicar(espera, true);
        prepararSiguiente(r.frases, true, false);
        return r.frases;
      }, true);
      return;
    }
    if (espera && corta === 'no') {
      setPendiente(null);
      siguiente.current = null;
      responder(['Vale, no lo hago.'], id, true);
      return;
    }
    void procesar(texto, id, true);
  }, [aplicar, ejecutar, prepararSiguiente, procesar, responder, setPendiente, terminarConversacion]);
  escucharRespuestaRef.current = escucharRespuesta;

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
  }, [ejecutar, setPendiente]);

  // Listens to one sentence and returns it without acting on it. Called from a tap: opens the
  // microphone that the rest of the conversation reuses (iOS does not allow opening it later).
  const dictar = useCallback(async (): Promise<ResultadoDictado> => {
    const microEstado = estadoMicro();
    if (microEstado === 'inseguro') return { texto: '', error: MENSAJE_INSEGURO };
    if (microEstado === 'no_soportado') return { texto: '', error: 'Este navegador no permite dictar.' };
    parar.current();
    pararVoz();
    desbloquearVoz();
    prepararAudio();
    setError('');
    setOidoDefinitivo('');
    setOidoProvisional('');
    setEstado('escuchando');
    const id = ++peticion.current;
    const conCuenta = Boolean(ops.current.userId);
    if (conCuenta && !micro.current) micro.current = await abrirMicro();
    turnos.current = 0;
    // With a session the clip is also transcribed by OpenAI, which knows the Basque subject names
    const e = escuchar((_, definitivo, provisional) => { setOidoDefinitivo(definitivo); setOidoProvisional(provisional); },
      conCuenta ? transcribirVoz : undefined, micro.current || undefined);
    escucha.current = e;
    try {
      const texto = await e.texto;
      if (id !== peticion.current) return { texto: '', cancelado: true };
      escucha.current = null;
      setEstado('parado');
      if (!texto) { terminarConversacion(); return { texto: '', error: 'No te he oído. Toca el micrófono y habla.' }; }
      return { texto };
    } catch (err) {
      if (id !== peticion.current) return { texto: '', cancelado: true };
      escucha.current = null;
      setEstado('parado');
      terminarConversacion();
      return { texto: '', error: err instanceof Error ? err.message : String(err) };
    }
  }, [terminarConversacion]);

  // Stops listening and keeps what was heard
  const terminarDictado = useCallback(() => { escucha.current?.detener(); }, []);

  const cancelarDictado = useCallback(() => {
    peticion.current++;
    escucha.current?.cancelar();
    escucha.current = null;
    setEstado('parado');
    terminarConversacion();
  }, [terminarConversacion]);

  // Sends a sentence to the assistant; `enVoz` speaks the answer (and may continue the conversation)
  const enviar = useCallback((texto: string, enVoz = true) => {
    if (enVoz) desbloquearVoz();
    setModo('respuesta');
    setFrases([]);
    turnos.current = 0;
    const id = ++peticion.current;
    void procesar(texto, id, enVoz);
  }, [procesar]);

  const detener = useCallback(() => {
    peticion.current++;
    escucha.current?.cancelar();
    escucha.current = null;
    parar.current();
    pararVoz();
    setEstado('parado');
    setActual(-1);
    terminarConversacion();
  }, [terminarConversacion]);

  const cerrar = useCallback(() => {
    detener();
    setModo(null);
    setFrases([]);
    setPendiente(null);
    setUltima(null);
    setError('');
  }, [detener, setPendiente, setUltima]);

  const confirmarPendiente = useCallback(() => {
    const accion = pendienteRef.current;
    if (!accion) return;
    desbloquearVoz();
    setPendiente(null);
    const id = ++peticion.current;
    void ejecutar(id, async () => {
      const r = await aplicar(accion, true);
      prepararSiguiente(r.frases, true, false);
      return r.frases;
    }, true);
  }, [ejecutar, aplicar, prepararSiguiente, setPendiente]);

  const descartarPendiente = useCallback(() => { setPendiente(null); detener(); }, [detener, setPendiente]);

  const deshacerAhora = useCallback(() => {
    desbloquearVoz();
    const id = ++peticion.current;
    const d = ultimaRef.current;
    void ejecutar(id, () => deshacer(d), true);
  }, [ejecutar, deshacer]);

  return {
    estado, modo, frases, actual, oidoDefinitivo, oidoProvisional, error, local, pendiente, ultima, conversando,
    puedeHablar: vozDisponible(),
    escucharDia, dictar, terminarDictado, cancelarDictado, enviar, detener, cerrar,
    confirmarPendiente, descartarPendiente, deshacerAhora,
  };
}

export type AsistenteVoz = ReturnType<typeof useAsistenteVoz>;
