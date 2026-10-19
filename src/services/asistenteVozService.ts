// Voice assistant in the app: understands a sentence (OpenAI on the server, local parser as fallback) and runs it
// with the shared actions (src/asistente/acciones.ts) on the user's own session.
import { interpretarComando } from '../asistente/comandosVoz';
import { accionesDeComando, type Accion, type ContextoAsistente, type Interpretacion } from '../asistente/interpretar';
import {
  construirContextoCon, deshacerCon, ejecutarAccionCon, type BackendAsistente, type Deshacer, type Resultado,
} from '../asistente/acciones';
import type { TaskItem } from '../types';
import { sessionAuthHeaders } from '../lib/supabase';
import { mutatePlanner } from './plannerService';
import { getUniversitySubjects } from './universityService';
import { loadUniversityWorks, saveUniversityWork } from './universityPlannerService';
import { fetchAsignaturasApi, updateEntregaApi, updateEntregasEstadoApi } from './moodleApiClient';
import { ASISTENTE_ACTUALIZADO, contextoVoz } from './asistenteService';

export type { Deshacer, Resultado } from '../asistente/acciones';
const INTERPRETAR_TIMEOUT_MS = 15000;

export interface Turno { usuario: string; asistente: string }

// The app's backend: the user's Supabase session and the Moodle API
function backendApp(userId: string): BackendAsistente {
  return {
    cargar: () => contextoVoz(userId),
    mutar: mutatePlanner,
    estadosMoodle: async (uids, estado) => { await updateEntregasEstadoApi(uids, estado); },
    editarMoodle: async (uid, campos) => { await updateEntregaApi(uid, campos); },
    trabajosUni: loadUniversityWorks,
    guardarTrabajo: saveUniversityWork,
    asignaturasUni: async () => getUniversitySubjects(),
    asignaturasMoodle: () => fetchAsignaturasApi().catch(() => []),
    avisar: () => window.dispatchEvent(new Event(ASISTENTE_ACTUALIZADO)),
  };
}

export async function construirContexto(userId: string, tareas: TaskItem[]): Promise<ContextoAsistente> {
  const ctx = await construirContextoCon(backendApp(userId), tareas);
  recordarPalabras(ctx);
  return ctx;
}

export function ejecutarAccion(userId: string, accion: Accion, tareas: TaskItem[], confirmar = false): Promise<Resultado> {
  return ejecutarAccionCon(backendApp(userId), accion, tareas, confirmar);
}

export function deshacerVoz(userId: string, d: Deshacer) {
  return deshacerCon(backendApp(userId), d);
}

// The server model first (OpenAI); without network or key, the local parser
export async function interpretarFrase(texto: string, ctx: ContextoAsistente, historial: Turno[] = []): Promise<Interpretacion & { local: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERPRETAR_TIMEOUT_MS);
  try {
    const res = await fetch('/api/asistente/interpretar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await sessionAuthHeaders()) }, signal: controller.signal,
      body: JSON.stringify({ texto, contexto: ctx, historial: historial.slice(-3) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.acciones)) throw new Error('Respuesta sin acciones');
    return { respuesta: String(json.respuesta || ''), acciones: json.acciones as Accion[], local: false };
  } catch {
    return { respuesta: '', acciones: accionesDeComando(interpretarComando(texto, ctx.ahora_local)), local: true };
  } finally {
    clearTimeout(timer);
  }
}

// Names the transcription should recognise (Basque subjects, deliverables): refreshed with every context
let palabrasClave: string[] = [];
const VOCABULARIO = ['Moodle', 'Galdetegia', 'Ariketak', 'PBL', 'labs', 'entrega', 'cuestionario', 'gimnasio', 'karate'];
function recordarPalabras(ctx: ContextoAsistente) {
  palabrasClave = [...ctx.asignaturas.flatMap(s => [s.name, s.code]), ...ctx.entregas.map(e => e.titulo.replace(/^\[[^\]]+\]\s*/, '').slice(0, 60)), ...VOCABULARIO];
}

async function palabrasParaTranscribir(): Promise<string[]> {
  if (palabrasClave.length) return palabrasClave;
  const moodle = await fetchAsignaturasApi().catch(() => []);
  return [...getUniversitySubjects().flatMap(s => [s.name, s.code]), ...moodle.map(a => a.nombre), ...VOCABULARIO];
}

// "Hablar": the clip goes to OpenAI's transcription on the server; any failure leaves the browser's text
export async function transcribirVoz(audio: Blob): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error('No se pudo leer el audio'));
    lector.readAsDataURL(audio);
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('/api/asistente/transcribir', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(await sessionAuthHeaders()) },
      body: JSON.stringify({ audioBase64: base64, mimeType: audio.type.split(';')[0] || 'audio/webm', palabrasClave: await palabrasParaTranscribir() }),
    });
    if (!res.ok) return '';
    const json = await res.json().catch(() => ({}));
    return typeof json.texto === 'string' ? json.texto : '';
  } finally {
    clearTimeout(timer);
  }
}
