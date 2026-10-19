// Voice assistant brain, shared by the server (prompt for the model) and the app (checks every action before running it).
// Pure functions: no browser or network APIs, so it can be tested.
import type { Evento } from '../planner/types';
import { addDays, validDate, validLocal } from '../planner/time';
import { area, interpretarComando, type Comando } from './comandosVoz';

export interface ContextoAsistente {
  ahora_local: string; // YYYY-MM-DDTHH:mm, Madrid
  dia_semana: string;
  // Pending deliverables (Moodle and University) of the next weeks; asignatura is its subject code
  entregas: { uid: string; titulo: string; vence_local: string; horas_est: number | null; asignatura?: string }[];
  // Study blocks of today and tomorrow
  bloques: { task_uid: string; titulo: string; fecha: string; inicio: string; fin: string }[];
  // Fixed things of today and tomorrow: classes, events, agenda tasks (only agenda tasks carry tarea_id)
  agenda: { tarea_id?: string; titulo: string; fecha: string; inicio: string; fin: string }[];
  asignaturas: { id: string; code: string; name: string }[];
}

export const TIPOS_DEBER = ['practica', 'ejercicios', 'proyecto', 'examen', 'lectura', 'otro'] as const;
export type TipoDeber = typeof TIPOS_DEBER[number];

export type Accion =
  | { tipo: 'resumen'; fecha: string }
  | { tipo: 'entregas'; dias: number }
  // A fixed one-off event (cine, médico…) that the plan works around; imprevisto = the user called it that
  | { tipo: 'anadir_actividad'; fecha: string; inicio: string; fin: string; titulo: string; area: Evento['area']; imprevisto?: boolean }
  | { tipo: 'bloquear_franja'; fecha: string; inicio: string; fin: string; titulo: string; area: Evento['area'] }
  | { tipo: 'aplazar_entrega'; uid: string; titulo: string }
  | { tipo: 'mover_tarea'; tarea_id: string; titulo: string; fecha: string; inicio: string; fin: string }
  | { tipo: 'anadir_deber'; titulo: string; asignatura_id: string | null; vence_local: string; horas_est: number; tipo_deber: TipoDeber }
  // Change title, deadline or estimated hours of one deliverable (only the fields given)
  | { tipo: 'modificar_entrega'; uid: string; titulo: string; nuevo_titulo?: string; vence_local?: string; horas_est?: number }
  | { tipo: 'descartar_entrega'; uid: string; titulo: string }
  // All pending deliverables of one subject; more than 3 need confirmation
  | { tipo: 'descartar_asignatura'; asignatura: string; uids: string[]; confirmado: boolean }
  | { tipo: 'deshacer' }
  | { tipo: 'parar' }
  | { tipo: 'pedir_aclaracion'; pregunta: string };

export interface Interpretacion {
  respuesta: string;
  acciones: Accion[];
}

export const TIPOS_ACCION = ['resumen', 'entregas', 'anadir_actividad', 'bloquear_franja', 'aplazar_entrega', 'mover_tarea',
  'anadir_deber', 'modificar_entrega', 'descartar_entrega', 'descartar_asignatura', 'deshacer', 'parar', 'pedir_aclaracion'] as const;

// Above this many deliverables, discarding a whole subject needs a spoken "sí"
export const MAX_DESCARTE_SIN_CONFIRMAR = 3;

// Every field the model may fill, for a strict JSON schema (OpenAI Structured Outputs): all present, null when unused
export const CAMPOS_ACCION = {
  tipo: { type: 'string', enum: [...TIPOS_ACCION] },
  fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
  inicio: { type: ['string', 'null'], description: 'HH:mm' },
  fin: { type: ['string', 'null'], description: 'HH:mm' },
  titulo: { type: ['string', 'null'] },
  motivo: { type: ['string', 'null'] },
  uid: { type: ['string', 'null'] },
  tarea_id: { type: ['string', 'null'] },
  asignatura_id: { type: ['string', 'null'] },
  asignatura: { type: ['string', 'null'], description: 'código de asignatura de las entregas' },
  vence_local: { type: ['string', 'null'], description: 'YYYY-MM-DDTHH:mm' },
  horas_est: { type: ['number', 'null'] },
  tipo_deber: { type: ['string', 'null'] },
  dias: { type: ['integer', 'null'] },
  pregunta: { type: ['string', 'null'] },
  imprevisto: { type: ['boolean', 'null'] },
  confirmado: { type: ['boolean', 'null'] },
} as const;

export function esquemaInterpretacion() {
  return {
    type: 'object',
    properties: {
      respuesta: { type: 'string' },
      acciones: {
        type: 'array',
        items: { type: 'object', properties: CAMPOS_ACCION, required: Object.keys(CAMPOS_ACCION), additionalProperties: false },
      },
    },
    required: ['respuesta', 'acciones'],
    additionalProperties: false,
  };
}

export function promptAsistente(): string {
  return `Eres el asistente de voz de una app de agenda y planificación de estudio de un estudiante universitario en Madrid.
Recibes lo que ha dicho por voz (transcrito automáticamente: puede tener errores, p. ej. "laps" suele ser "labs" = laboratorios/prácticas) y el contexto de su agenda en JSON.
Estudia en una universidad vasca: muchas asignaturas y entregas tienen nombres en euskera ("Programazio Aurreratua", "Industri Informatika", "Galdetegia" = cuestionario, "Ariketak" = ejercicios). Casa lo que diga con las asignaturas y entregas del contexto aunque la transcripción venga deformada o mezcle castellano y euskera ("programación avanzada" o "programazio aurreratua" = la asignatura Programazio Aurreratua).
Decide qué acciones ejecutar y devuelve SOLO JSON con { "respuesta": string, "acciones": [...] }. En cada acción rellena los campos que use y pon null en los demás.

Acciones posibles (campo "tipo"):
- "resumen" {fecha}: quiere saber qué tiene un día ("¿y mañana?", "dime más del día siguiente", "¿qué tengo el jueves?"). Hoy si no dice día.
- "entregas" {dias}: pregunta por sus entregas o deberes pendientes en general.
- "anadir_actividad" {fecha, inicio, fin, titulo, imprevisto}: va a hacer algo a una hora ("me voy al cine de 18:00 a 23:00", gym, salir, trabajar, médico…). Se guarda como horario FIJO de ese día y el plan de estudio se reorganiza alrededor. titulo corto con la actividad ("Cine"). imprevisto = true SOLO si él dice que es un imprevisto; si no, false.
- "modificar_entrega" {uid, titulo (nuevo título o null), vence_local (nueva fecha límite o null), horas_est (nuevas horas o null)}: quiere cambiar el título, la fecha de entrega o las horas estimadas de una entrega concreta ("la práctica de Programazio Aurreratua es para el viernes", "a los labs dales 5 horas").
- "descartar_entrega" {uid}: no va a hacer una entrega concreta o no le interesa ("descarta el cuestionario 3", "esa no la hago").
- "descartar_asignatura" {asignatura, confirmado}: quiere descartar TODAS las entregas pendientes de una asignatura; asignatura = el código que aparece en las entregas del contexto. confirmado = true solo si en la conversación reciente ya le preguntaste y ha dicho que sí.
- "bloquear_franja" {fecha, inicio, fin, motivo}: dice que NO tiene libre o está ocupado en una franja ("esta mañana no tengo libre", "por la tarde no puedo estudiar"). El estudio de esa franja se moverá a otro hueco automáticamente.
- "aplazar_entrega" {uid}: quiere dejar para otro día el trabajo de una entrega concreta ("pospón la práctica de MATLAB", "hoy no hago los labs, mejor mañana") sin dar una franja ocupada. Pasa a planificarse desde mañana.
- "mover_tarea" {tarea_id, fecha, inicio, fin}: mover una tarea de su agenda (las que tienen tarea_id) a otro día u hora.
- "anadir_deber" {titulo, asignatura_id, vence_local, horas_est, tipo_deber}: le han mandado un deber, práctica, trabajo o examen nuevo. tipo_deber: practica | ejercicios | proyecto | examen | lectura | otro.
- "deshacer": quiere deshacer lo último que hiciste.
- "parar": quiere que te calles.
- "pedir_aclaracion" {pregunta}: falta algo imprescindible o dudas entre varias entregas/tareas.

Reglas:
- Rellena SIEMPRE todos los campos que lista cada acción: bloquear_franja y anadir_actividad llevan fecha, inicio Y fin; mover_tarea lleva la NUEVA fecha, inicio y fin (si dice "a la misma hora", copia las horas de la tarea).
- Usa SOLO uid, tarea_id, asignatura_id y códigos de asignatura que aparezcan en el contexto. Si no sabes cuál es, usa "pedir_aclaracion".
- "Mañana" sin día de la semana es el día siguiente a ahora_local. Si dice solo horas ("de 18:00 a 23:00") es hoy.
- Fechas YYYY-MM-DD y horas HH:mm (24 h), zona Madrid. "ahora_local" es el momento actual: nunca pongas acciones en el pasado.
- Franjas: "por la mañana" = 09:00-14:00, "por la tarde" = 15:00-21:00, "por la noche" = 21:00-23:00, "todo el día" = 09:00-23:00. Si la franja ya ha empezado, empieza en la hora actual redondeada a 5 minutos.
- Una hora de 1 a 7 sin "de la mañana" es de tarde. Si no dice hora de fin de una actividad, 1 hora (gym 1 h 30).
- Si dice que está ocupado en una franja Y nombra una entrega, basta con "bloquear_franja": el plan moverá ese estudio solo. Usa "aplazar_entrega" cuando quiera quitar esa entrega del día sin franja concreta.
- Para un deber nuevo sin fecha de entrega clara, pide aclaración. Sin hora de entrega, 23:59. Sin estimación, deja horas_est en 0.
- Puedes devolver varias acciones si pide varias cosas. Si solo charla, "acciones": [] y respondes.
- "respuesta": una frase corta, natural y en español de España para decir en voz alta antes de ejecutar (p. ej. "Vale, te libero la mañana."). No inventes resultados: la app dirá después qué bloques ha movido. Para pedir_aclaracion pon la pregunta también en "respuesta".`;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const hora = (v: unknown) => typeof v === 'string' && HORA.test(v.trim().slice(0, 5)) ? v.trim().slice(0, 5) : null;
const texto = (v: unknown, max = 200) => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const capital = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s;
const normal = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Checks one action from the model against the context. Returns null when it cannot be run safely.
export function validarAccion(raw: unknown, ctx: ContextoAsistente, dicho = ''): Accion | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const ahora = ctx.ahora_local, hoy = ahora.slice(0, 10);
  const fechaOk = (v: unknown) => typeof v === 'string' && validDate(v) && v >= hoy && v <= addDays(hoy, 120) ? v : null;
  switch (a.tipo) {
    case 'resumen': return { tipo: 'resumen', fecha: fechaOk(a.fecha) || hoy };
    case 'entregas': {
      const dias = Math.round(Number(a.dias) || 7);
      return { tipo: 'entregas', dias: Math.min(Math.max(dias, 1), 30) };
    }
    case 'anadir_actividad':
    case 'bloquear_franja': {
      // Only hours ("de 18:00 a 23:00") mean today
      const fecha = fechaOk(a.fecha) || (a.fecha == null || a.fecha === '' ? hoy : null), inicio = hora(a.inicio);
      // A busy stretch without an end lasts until the end of that part of the day
      const fin = hora(a.fin) || (a.tipo === 'bloquear_franja' && inicio ? (inicio < '14:00' ? '14:00' : inicio < '21:00' ? '21:00' : '23:00') : null);
      if (!fecha || !inicio || !fin || fin <= inicio || `${fecha}T${fin}` <= ahora) return null;
      if (a.tipo === 'bloquear_franja') {
        const motivo = texto(a.motivo, 120);
        return { tipo: 'bloquear_franja', fecha, inicio, fin, titulo: motivo ? `Ocupado: ${motivo}` : 'Ocupado', area: 'otro' };
      }
      // A model sometimes puts the activity in "motivo" or leaves it out: take it from what was said
      const local = interpretarComando(dicho, ahora);
      const titulo = capital(texto(a.titulo) || texto(a.motivo) || (local.tipo === 'anadir' ? local.titulo : '') || 'Actividad');
      return { tipo: 'anadir_actividad', fecha, inicio, fin, titulo, area: area(titulo), ...(a.imprevisto === true ? { imprevisto: true } : {}) };
    }
    case 'modificar_entrega': {
      const e = ctx.entregas.find(e => e.uid === a.uid);
      if (!e) return null;
      const nuevo = capital(texto(a.titulo));
      let vence = texto(a.vence_local, 16);
      if (validDate(vence)) vence = `${vence}T${e.vence_local.slice(11, 16) || '23:59'}`;
      const horas = Number(a.horas_est);
      const cambio = {
        ...(nuevo && nuevo !== e.titulo ? { nuevo_titulo: nuevo } : {}),
        ...(validLocal(vence) && vence > ahora && vence !== e.vence_local ? { vence_local: vence } : {}),
        ...(a.horas_est != null && Number.isFinite(horas) && horas > 0 && horas <= 500 ? { horas_est: Math.round(horas * 4) / 4 } : {}),
      };
      return Object.keys(cambio).length ? { tipo: 'modificar_entrega', uid: e.uid, titulo: e.titulo, ...cambio } : null;
    }
    case 'descartar_entrega': {
      const e = ctx.entregas.find(e => e.uid === a.uid);
      return e ? { tipo: 'descartar_entrega', uid: e.uid, titulo: e.titulo } : null;
    }
    case 'descartar_asignatura': {
      // By code; a subject id or name the model used instead is matched too
      const pedida = normal(texto(a.asignatura) || texto(a.asignatura_id));
      const s = ctx.asignaturas.find(s => normal(s.id) === pedida || normal(s.code) === pedida || normal(s.name) === pedida);
      const codigos = new Set([pedida, ...(s ? [normal(s.code)] : [])].filter(Boolean));
      const uids = ctx.entregas.filter(e => e.asignatura && codigos.has(normal(e.asignatura))).map(e => e.uid);
      if (!uids.length) return null;
      const codigo = ctx.entregas.find(e => e.uid === uids[0])!.asignatura!;
      return { tipo: 'descartar_asignatura', asignatura: s?.name || codigo, uids, confirmado: a.confirmado === true };
    }
    case 'aplazar_entrega': {
      const e = ctx.entregas.find(e => e.uid === a.uid);
      return e ? { tipo: 'aplazar_entrega', uid: e.uid, titulo: e.titulo } : null;
    }
    case 'mover_tarea': {
      const t = ctx.agenda.find(t => t.tarea_id && t.tarea_id === a.tarea_id);
      const fecha = fechaOk(a.fecha) || fechaOk(texto(a.vence_local, 16).slice(0, 10)) || t?.fecha;
      const inicio = hora(a.inicio) || t?.inicio, fin = hora(a.fin) || t?.fin;
      if (!t || !fecha || !inicio || !fin || fin <= inicio || `${fecha}T${fin}` <= ahora) return null;
      if (fecha === t.fecha && inicio === t.inicio && fin === t.fin) return null; // nothing would move
      return { tipo: 'mover_tarea', tarea_id: t.tarea_id!, titulo: t.titulo, fecha, inicio, fin };
    }
    case 'anadir_deber': {
      const titulo = capital(texto(a.titulo));
      let vence = texto(a.vence_local, 16);
      if (validDate(vence)) vence = `${vence}T23:59`;
      if (!titulo || !validLocal(vence) || vence <= ahora) return null;
      // Gemini sometimes leaves the subject out: look for its name or code in what the user said
      const normal = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const frase = normal(` ${dicho} ${titulo} `).replace(/[^a-z0-9ñ]+/g, ' ');
      const asignatura = ctx.asignaturas.find(s => s.id === a.asignatura_id)
        || ctx.asignaturas.find(s => frase.includes(` ${normal(s.name)} `) || (s.code.length >= 2 && frase.includes(` ${normal(s.code)} `)));
      const dichas = frase.match(/\b(\d+(?: \d+)?) horas?\b/);
      const horas = Number(a.horas_est) > 0 ? Number(a.horas_est) : dichas ? Number(dichas[1].replace(' ', '.')) : 0;
      const tipo = TIPOS_DEBER.includes(a.tipo_deber as TipoDeber) ? a.tipo_deber as TipoDeber : 'practica';
      return { tipo: 'anadir_deber', titulo, asignatura_id: asignatura?.id || null, vence_local: vence.slice(0, 16),
        horas_est: Number.isFinite(horas) && horas > 0 && horas <= 500 ? Math.round(horas * 4) / 4 : 2, tipo_deber: tipo };
    }
    case 'deshacer': return { tipo: 'deshacer' };
    case 'parar': return { tipo: 'parar' };
    case 'pedir_aclaracion': {
      const pregunta = texto(a.pregunta, 300);
      return pregunta ? { tipo: 'pedir_aclaracion', pregunta } : null;
    }
    default: return null;
  }
}

// Gemini's JSON (string or object) → checked actions. Unknown or unsafe actions are dropped and counted.
export function normalizarInterpretacion(raw: unknown, ctx: ContextoAsistente, dicho = ''): Interpretacion & { descartadas: number } {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { obj = null; }
  }
  const o = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>;
  const lista = Array.isArray(o.acciones) ? o.acciones.slice(0, 5) : [];
  const acciones = lista.map(a => validarAccion(a, ctx, dicho)).filter((a): a is Accion => a !== null);
  const descartadas = lista.length - acciones.length;
  // Never announce a change that is not going to happen
  const respuesta = descartadas && !acciones.length ? 'No he entendido bien qué cambiar. ¿Me lo dices de otra forma?' : texto(o.respuesta, 400);
  return { respuesta, acciones, descartadas };
}

// Offline fallback: the local parser's command as actions
export function accionesDeComando(c: Comando): Accion[] {
  switch (c.tipo) {
    case 'anadir': return [{ tipo: 'anadir_actividad', fecha: c.fecha, inicio: c.inicio, fin: c.fin, titulo: c.titulo, area: c.area }];
    case 'consulta': return [{ tipo: 'resumen', fecha: c.fecha }];
    case 'entregas': return [{ tipo: 'entregas', dias: 7 }];
    case 'deshacer': return [{ tipo: 'deshacer' }];
    case 'parar': return [{ tipo: 'parar' }];
    default: return [];
  }
}
