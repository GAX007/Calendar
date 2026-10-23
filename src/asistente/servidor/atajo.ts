// iPhone shortcut ("Atajo"): the lock-screen button records audio and sends it here. The server transcribes it,
// understands it and RUNS the actions on the user's account with the same code as the app (acciones.ts),
// then returns a sentence for the shortcut to read aloud. A question keeps the conversation open.
// Authentication: a long personal token created in the app, stored only as its SHA-256.
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { construirContextoCon, deshacerCon, ejecutarAccionCon, type BackendAsistente, type Deshacer, type Resultado } from '../acciones';
import { normalizarInterpretacion, promptAsistente, type Accion, type ContextoAsistente } from '../interpretar';
import { quitarEco, respuestaSiNo, seguirEscuchando, terminaEnPregunta, ultimaPregunta } from '../conversacion';
import { ahoraMadrid, limitesPorCheckin, planActual } from '../logica';
import { guionBreve, guionDelDia, guionEntregas } from '../voz';
import { addDays } from '../../planner/time';
import type { UniversityWorkRow } from '../../planner/university';
import type { TaskItem, UniversitySubject } from '../../types';
import { fromDbRow, toDbRow } from '../../utils/tareasDb';
import { newId } from '../../utils/uuid';
import { MoodleStore } from '../../services/moodleStore';
import { updateEntregaUserFields, updateEntregasEstado } from '../../services/moodleSyncService';
import { cargarCheckins, cargarPlanificador, mutarComoUsuario } from './datos';
import { comprobar, esPropietario } from './supabase';
import { interpretarConOpenAI, limpiarPalabrasClave, transcribirConOpenAI } from './openai';

export const PREFIJO_TOKEN = 'ca_';
const CONVERSACION_MINUTOS = 15;
const CONVERSACION_SIN_ID_MINUTOS = 3;
const VOCABULARIO = ['Moodle', 'Galdetegia', 'Ariketak', 'PBL', 'labs', 'entrega', 'cuestionario', 'gimnasio', 'karate'];

export const hashToken = (token: string) => crypto.createHash('sha256').update(token.trim()).digest('hex');
export const generarToken = () => `${PREFIJO_TOKEN}${crypto.randomBytes(32).toString('base64url')}`;

// --- Tokens -------------------------------------------------------------------------------
export async function crearTokenAtajo(sb: SupabaseClient, userId: string, nombre: string): Promise<{ id: string; token: string }> {
  const token = generarToken();
  const fila = comprobar(await sb.from('asistente_tokens').insert({ user_id: userId, hash: hashToken(token), nombre: nombre.trim().slice(0, 60) || 'Atajo de iPhone' })
    .select('id').single(), 'asistente_tokens');
  return { id: (fila as any).id, token };
}

export async function listarTokensAtajo(sb: SupabaseClient, userId: string) {
  return comprobar(await sb.from('asistente_tokens').select('id, nombre, creado_en, ultimo_uso')
    .eq('user_id', userId).is('revocado_en', null).order('creado_en', { ascending: false }), 'asistente_tokens') || [];
}

export async function revocarTokenAtajo(sb: SupabaseClient, userId: string, id: string): Promise<void> {
  comprobar(await sb.from('asistente_tokens').update({ revocado_en: new Date().toISOString() }).eq('id', id).eq('user_id', userId), 'asistente_tokens');
}

export async function usuarioDeTokenAtajo(sb: SupabaseClient, authorization?: string): Promise<string | null> {
  const token = (authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token.startsWith(PREFIJO_TOKEN) || token.length < 40) return null;
  const fila = comprobar(await sb.from('asistente_tokens').select('id, user_id').eq('hash', hashToken(token)).is('revocado_en', null).maybeSingle(), 'asistente_tokens') as any;
  if (!fila) return null;
  await sb.from('asistente_tokens').update({ ultimo_uso: new Date().toISOString() }).eq('id', fila.id);
  return fila.user_id;
}

// --- The user's data, with the service key and always filtered by user ---------------------
export function backendServidor(sb: SupabaseClient, userId: string): BackendAsistente {
  const propietario = esPropietario({ id: userId });
  const trabajos = async () => (comprobar(await sb.from('trabajos_universidad').select('*').eq('user_id', userId), 'trabajos_universidad') || []) as UniversityWorkRow[];
  return {
    cargar: async () => {
      const ahora = ahoraMadrid(), hoy = ahora.slice(0, 10);
      const data = await cargarPlanificador(sb, userId);
      const limites = limitesPorCheckin(await cargarCheckins(sb, userId, hoy, hoy), data.parametros.max_horas_profundas_dia);
      return { ahora, hoy, data, limites };
    },
    mutar: async (data, accion, datos) => { await mutarComoUsuario(sb, userId, data.revision, accion, datos); },
    // Moodle is the owner's feed only (MOODLE_OWNER_USER_ID); the store filters by that account
    estadosMoodle: async (uids, estado) => {
      if (!propietario) throw new Error('Tu cuenta no tiene Moodle conectado.');
      await updateEntregasEstado(uids, estado);
    },
    editarMoodle: async (uid, campos) => {
      if (!propietario) throw new Error('Tu cuenta no tiene Moodle conectado.');
      await updateEntregaUserFields(uid, campos);
    },
    trabajosUni: trabajos,
    guardarTrabajo: async (trabajo, asignatura, eliminar = false) => {
      comprobar(await sb.rpc('asistente_guardar_trabajo', { p_user: userId, p_trabajo: trabajo, p_asignatura: asignatura, p_eliminar: eliminar }), 'trabajo');
    },
    asignaturasUni: async () => {
      const vistas = new Map<string, UniversitySubject>();
      for (const r of await trabajos()) if (r.activo && r.asignatura?.id) vistas.set(r.asignatura.id, r.asignatura);
      return [...vistas.values()];
    },
    asignaturasMoodle: async () => propietario ? (await MoodleStore.getAsignaturas()).map(a => ({ codigo: a.codigo, nombre: a.nombre })) : [],
    avisar: () => undefined,
  };
}

async function tareasCercanas(sb: SupabaseClient, userId: string, hoy: string): Promise<TaskItem[]> {
  const filas = comprobar(await sb.from('tasks').select('*').eq('user_id', userId)
    .gte('date', addDays(hoy, -1)).lte('date', addDays(hoy, 14)), 'tasks') || [];
  return (filas as any[]).map(fromDbRow);
}

// Agenda changes of an action (new activity, moved or restored task, removed task), saved for the user
async function aplicarEnAgenda(sb: SupabaseClient, userId: string, r: Partial<Resultado> & { quitarTarea?: string; restaurarTarea?: TaskItem }) {
  for (const t of [r.tareaNueva, r.tareaCambiada, r.restaurarTarea].filter(Boolean) as TaskItem[]) {
    comprobar(await sb.from('tasks').upsert(toDbRow(t, userId)), 'tasks');
  }
  for (const id of [r.quitarTarea, r.tareaBorrada].filter(Boolean) as string[]) {
    comprobar(await sb.from('tasks').delete().eq('id', id).eq('user_id', userId), 'tasks');
  }
}

// --- Conversation (so "sí" or "la de Física" after a question keeps its meaning) -----------
interface Conversacion { id: string; historial: { usuario: string; asistente: string }[]; pendiente: Accion | null; deshacer: Deshacer | null }

// With the id the shortcut sends back, the conversation lasts 15 minutes. Without it (the variable was not wired into
// the URL, or the shortcut was launched again to answer), the user's latest conversation of the last 3 minutes goes on.
async function cargarConversacion(sb: SupabaseClient, userId: string, id?: string): Promise<Conversacion> {
  const nueva: Conversacion = { id: newId(), historial: [], pendiente: null, deshacer: null };
  const conId = Boolean(id && /^[0-9a-f-]{36}$/i.test(id));
  const consulta = sb.from('asistente_conversaciones').select('*').eq('user_id', userId);
  const fila = comprobar(await (conId ? consulta.eq('id', id!) : consulta.order('actualizado_en', { ascending: false }).limit(1)).maybeSingle(),
    'asistente_conversaciones') as any;
  const vigencia = (conId ? CONVERSACION_MINUTOS : CONVERSACION_SIN_ID_MINUTOS) * 60000;
  if (!fila || Date.now() - new Date(fila.actualizado_en).getTime() > vigencia) return nueva;
  return { id: fila.id, historial: fila.historial || [], pendiente: fila.pendiente || null, deshacer: fila.deshacer || null };
}

async function guardarConversacion(sb: SupabaseClient, userId: string, c: Conversacion) {
  comprobar(await sb.from('asistente_conversaciones').upsert({ id: c.id, user_id: userId, historial: c.historial.slice(-3),
    pendiente: c.pendiente, deshacer: c.deshacer, actualizado_en: new Date().toISOString() }), 'asistente_conversaciones');
}

export interface RespuestaAtajo { texto: string; seguir: boolean; conversacion: string; oido: string }

// One turn: audio (or text) in, spoken answer out. Runs the actions on the user's account.
export async function turnoAtajo(sb: SupabaseClient, userId: string, entrada: { audio?: Buffer; mimeType?: string; texto?: string; conversacion?: string }): Promise<RespuestaAtajo> {
  const b = backendServidor(sb, userId);
  const conv = await cargarConversacion(sb, userId, entrada.conversacion);
  const { ahora, hoy, data, limites } = await b.cargar();
  const tareas = await tareasCercanas(sb, userId, hoy);
  const ctx: ContextoAsistente = await construirContextoCon(b, tareas);
  let texto = (entrada.texto || '').trim().slice(0, 600);
  if (!texto && entrada.audio) {
    const pistas = limpiarPalabrasClave([...ctx.asignaturas.flatMap(s => [s.name, s.code]), ...ctx.entregas.map(e => e.titulo.replace(/^\[[^\]]+\]\s*/, '')), ...VOCABULARIO]);
    texto = (await transcribirConOpenAI(entrada.audio, entrada.mimeType || 'audio/m4a', pistas)).trim();
  }
  // What the assistant asked last: an answer to it keeps the conversation going
  const ultimo = conv.historial.at(-1)?.asistente || '';
  const preguntaAbierta = Boolean(conv.pendiente) || terminaEnPregunta([ultimo]);
  // The recording may have caught the end of the spoken answer: drop that echo
  texto = quitarEco(texto, ultimo);
  if (!texto) {
    const repetir = preguntaAbierta ? `No te he oído bien. ${ultimaPregunta(ultimo)}` : 'No te he oído. Vuelve a intentarlo.';
    return { texto: repetir, seguir: preguntaAbierta, conversacion: conv.id, oido: '' };
  }

  const salida: string[] = [];
  let actuo = false;
  let aclaracion = false, pendiente: Accion | null = null, terminar = false;
  const ejecutar = async (accion: Accion, confirmar: boolean) => {
    const r = await ejecutarAccionCon(b, accion, tareas, confirmar);
    actuo = true;
    if (r.confirmar) {
      pendiente = accion;
      // The confirmation question replaces the model's own sentence, so it is not asked twice
      if (salida.length === 1 && !confirmar) salida.length = 0;
    } else { await aplicarEnAgenda(sb, userId, r); if (r.deshacer) conv.deshacer = r.deshacer; }
    salida.push(...r.frases);
    return !r.confirmar;
  };

  const corta = conv.pendiente ? respuestaSiNo(texto) : null;
  try {
    if (conv.pendiente && corta === 'si') await ejecutar(conv.pendiente, true);
    else if (conv.pendiente && corta === 'no') { actuo = true; salida.push('Vale, no lo hago.'); }
    else {
      const historial = conv.historial.map(t => `Usuario: ${t.usuario}\nAsistente: ${t.asistente}`).join('\n');
      const prompt = `Contexto: ${JSON.stringify(ctx)}\n\n${historial ? `Conversación reciente:\n${historial}\n\n` : ''}Ha dicho: "${texto.replace(/"/g, "'")}"`;
      // No reasoning: the whole turn has to fit in Netlify's time limit (~10 s)
      const { texto: json } = await interpretarConOpenAI(promptAsistente(), prompt, 7000, 'none');
      const interp = normalizarInterpretacion(json, ctx, texto);
      if (interp.respuesta && !interp.acciones.some(a => a.tipo === 'resumen' || a.tipo === 'entregas')) salida.push(interp.respuesta);
      for (const accion of interp.acciones) {
        if (accion.tipo === 'resumen') {
          actuo = true;
          const input = { data, plan: planActual(data, accion.fecha, ahora, limites), tareas, ahoraLocal: ahora, fecha: accion.fecha };
          salida.push(...(accion.detalle ? guionDelDia(input) : guionBreve(input)).frases);
        }
        else if (accion.tipo === 'entregas') { actuo = true; salida.push(...guionEntregas(data, planActual(data, hoy, ahora, limites), ahora, accion.dias)); }
        else if (accion.tipo === 'deshacer') {
          if (!conv.deshacer) { salida.push('No hay nada que deshacer.'); continue; }
          actuo = true;
          const r = await deshacerCon(b, conv.deshacer);
          await aplicarEnAgenda(sb, userId, r);
          conv.deshacer = null;
          salida.push(...r.frases);
        }
        else if (accion.tipo === 'parar') { terminar = true; salida.length = 0; salida.push('Hasta luego.'); break; }
        else if (accion.tipo === 'pedir_aclaracion') { aclaracion = true; if (!salida.includes(accion.pregunta)) salida.push(accion.pregunta); }
        else if (!await ejecutar(accion, false)) break;
      }
    }
  } catch (err) {
    salida.push(err instanceof Error ? err.message : String(err));
  }
  // An answer to an open question that did nothing and asked nothing: ask again instead of ending the conversation
  if (preguntaAbierta && !actuo && !aclaracion && !pendiente && !terminar) {
    salida.length = 0;
    salida.push(`No te he entendido. ${ultimaPregunta(ultimo)}`);
    pendiente = conv.pendiente;
  }
  if (!salida.length) salida.push('No te he entendido. Prueba con «¿qué tengo hoy?» o «me voy al cine de 6 a 9».');
  conv.pendiente = pendiente;
  conv.historial = [...conv.historial, { usuario: texto, asistente: salida.join(' ') }].slice(-3);
  const seguir = !terminar && seguirEscuchando({ frases: salida, pendiente: Boolean(pendiente), aclaracion, turnos: conv.historial.length - 1 });
  await guardarConversacion(sb, userId, conv);
  return { texto: salida.join(' '), seguir, conversacion: conv.id, oido: texto };
}
