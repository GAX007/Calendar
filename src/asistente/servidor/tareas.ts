// Nightly assistant jobs. Runs every 15 minutes (Netlify scheduled function) and decides
// what is due from the Madrid time; each job is recorded so it only runs once per day.
import type { SupabaseClient } from '@supabase/supabase-js';
import { entregaSnapshot } from '../../planner/snapshot';
import { addDays, weekStart } from '../../planner/time';
import {
  addMinutesLocal, ahoraMadrid, avisosDeAhora, bloquesSinHacer, calibrar, cambiosDeFactor, entregasSinEstimar, esDomingo,
  horaDeAvisos, limitesPorCheckin, minutoDelDia, planActual, planDelCierre, planVigente, repasoSemanal, resumenManana,
} from '../logica';
import {
  cargarCheckins, cargarCierres, cargarEstados, cargarLogs, cargarPlanificador, existeCierre, existeResumen,
  guardarResumen, mutarComoUsuario, registrarAvisos, usuariosDelPlanificador,
} from './datos';
import { clienteServicio, comprobar } from './supabase';
import { estimarEntrega, geminiDisponible, type Precedente } from './gemini';
import { enviarPush } from './push';

export type Tarea = 'cierre' | 'parte' | 'semanal' | 'estimar' | 'avisos';
export const TAREAS: Tarea[] = ['estimar', 'cierre', 'parte', 'semanal', 'avisos'];

export interface Informe { ahora: string; hechas: string[]; errores: string[] }

const MAX_PUSH_POR_EJECUCION = 3;
// Netlify stops scheduled functions at 30 s: the AI estimate only uses the time left after the user jobs
const LIMITE_MS = 26000;

export async function ejecutarAsistente(opts: { ahora?: Date; forzar?: Tarea[]; usuario?: string } = {}): Promise<Informe> {
  const now = opts.ahora || new Date();
  const t0 = Date.now();
  const ahora = ahoraMadrid(now), hoy = ahora.slice(0, 10), minuto = minutoDelDia(ahora);
  const informe: Informe = { ahora, hechas: [], errores: [] };
  const toca = (tarea: Tarea, cuando: boolean) => opts.forzar ? opts.forzar.includes(tarea) : cuando;
  const paso = async (nombre: string, fn: () => Promise<string | null>) => {
    try { const r = await fn(); if (r) informe.hechas.push(`${nombre}: ${r}`); }
    catch (err) { informe.errores.push(`${nombre}: ${err instanceof Error ? err.message : String(err)}`); }
  };
  let sb: SupabaseClient;
  try { sb = clienteServicio(); } catch (err) { informe.errores.push(String(err instanceof Error ? err.message : err)); return informe; }

  const usuarios = opts.usuario ? [opts.usuario] : await usuariosDelPlanificador(sb).catch(err => { informe.errores.push(String(err.message)); return []; });
  for (const userId of usuarios) {
    if (toca('cierre', minuto >= 23 * 60 + 30)) await paso('cierre', () => cierreDelDia(sb, userId, ahora, Boolean(opts.forzar)));
    if (toca('parte', minuto >= 7 * 60 && minuto < 12 * 60)) await paso('parte', () => parteDeLaManana(sb, userId, ahora, Boolean(opts.forzar)));
    if (toca('semanal', esDomingo(hoy) && minuto >= 21 * 60 && minuto < 23 * 60 + 30)) await paso('semanal', () => repasoDeLaSemana(sb, userId, ahora, Boolean(opts.forzar)));
    if (toca('avisos', horaDeAvisos(ahora))) await paso('avisos', () => enviarAvisos(sb, userId, ahora, now));
  }
  // Deliverables are shared, so one per run is enough (96 runs a day); the next run plans with the estimate
  const restante = LIMITE_MS - (Date.now() - t0);
  if (toca('estimar', true) && geminiDisponible() && restante > 6000) await paso('estimar', () => estimarNuevas(sb, now, 1, Math.min(12000, restante - 2000)));
  return informe;
}

async function limitesDeHoy(sb: SupabaseClient, userId: string, hoy: string, maxProfundas: number) {
  return limitesPorCheckin(await cargarCheckins(sb, userId, hoy, hoy), maxProfundas);
}

// N1: blocks of today not marked as done leave the history, their tasks move to tomorrow and the plan is saved
async function cierreDelDia(sb: SupabaseClient, userId: string, ahora: string, forzado: boolean): Promise<string | null> {
  const hoy = ahora.slice(0, 10);
  if (await existeCierre(sb, userId, hoy)) return forzado ? 'el cierre de hoy ya estaba hecho' : null;
  let data = await cargarPlanificador(sb, userId);
  const sinHacer = bloquesSinHacer(data, hoy, await cargarEstados(sb, userId, hoy, hoy), ahora);
  comprobar(await sb.rpc('asistente_aplicar_cierre', { p_user: userId, p_fecha: hoy, p_bloques: sinHacer.map(b => b.id), p_revision: data.revision }), 'cierre');
  if (sinHacer.length) data = await cargarPlanificador(sb, userId);
  const corte = addMinutesLocal(ahora, 1);
  const { plan, desde, hasta } = planDelCierre(data, corte, await limitesDeHoy(sb, userId, hoy, data.parametros.max_horas_profundas_dia));
  if (!sinHacer.length && planVigente(data, desde, hasta)) return 'sin bloques pendientes; el plan guardado sigue vigente';
  const desde_local = [corte, `${desde}T00:00`].sort().at(-1)!;
  await mutarComoUsuario(sb, userId, data.revision, 'plan', { desde_local, hasta, bloques: plan.bloques, entregas_snapshot: entregaSnapshot(data.entregas) });
  return `${sinHacer.length} bloques sin hacer movidos; plan guardado hasta el ${hasta}`;
}

// N2: morning summary, stored for the app and sent as a notification
async function parteDeLaManana(sb: SupabaseClient, userId: string, ahora: string, forzado: boolean): Promise<string | null> {
  const hoy = ahora.slice(0, 10);
  if (!forzado && await existeResumen(sb, userId, hoy, 'manana')) return null;
  const data = await cargarPlanificador(sb, userId);
  const limites = await limitesDeHoy(sb, userId, hoy, data.parametros.max_horas_profundas_dia);
  const plan = planActual(data, hoy, ahora, limites);
  const ayer = addDays(hoy, -1);
  const cierre = (await cargarCierres(sb, userId, ayer, ayer)).find(c => c.estado === 'aplicado')?.items || [];
  const resumen = resumenManana(data, plan, ahora, cierre, Boolean(limites?.[hoy]));
  await guardarResumen(sb, userId, hoy, 'manana', resumen);
  const en48h = resumen.entregas.filter(e => e.vence_local <= addMinutesLocal(ahora, 48 * 60)).length;
  await enviarPush(sb, userId, { title: 'Tu día', body: resumen.texto, url: '/', tag: `manana:${hoy}`, badge: en48h });
  return resumen.texto;
}

// N4 + N5: calibration with the real hours and weekly review
async function repasoDeLaSemana(sb: SupabaseClient, userId: string, ahora: string, forzado: boolean): Promise<string | null> {
  const hoy = ahora.slice(0, 10);
  if (!forzado && await existeResumen(sb, userId, hoy, 'semanal')) return null;
  const desde = weekStart(hoy), hasta = addDays(desde, 6);
  let data = await cargarPlanificador(sb, userId);
  const logs = await cargarLogs(sb, userId);
  const calibracion = calibrar(data.entregas, logs);
  const cambios = cambiosDeFactor(data.entregas, calibracion);
  for (const c of cambios) {
    comprobar(await sb.from('entregas').update({ factor_calibracion: c.factor }).eq('uid', c.uid).eq('estado', 'pendiente'), 'calibración');
  }
  if (cambios.length) data = await cargarPlanificador(sb, userId);
  const siguiente = planActual(data, addDays(hasta, 1), ahora);
  const repaso = repasoSemanal({
    data, desde, hasta, ahoraLocal: ahora, estados: await cargarEstados(sb, userId, desde, hasta),
    cierres: await cargarCierres(sb, userId, desde, hasta), logs, checkins: await cargarCheckins(sb, userId, desde, hasta),
    calibracion, siguiente,
  });
  await guardarResumen(sb, userId, hoy, 'semanal', repaso);
  await enviarPush(sb, userId, { title: 'Tu repaso semanal', body: repaso.texto, url: '/?repaso=1', tag: `semanal:${hoy}` });
  return `${repaso.texto} Calibración: ${cambios.length} entregas ajustadas.`;
}

// N7 + "not done" reminder
async function enviarAvisos(sb: SupabaseClient, userId: string, ahora: string, now: Date): Promise<string | null> {
  const hoy = ahora.slice(0, 10);
  const data = await cargarPlanificador(sb, userId);
  const plan = planActual(data, hoy, ahora, await limitesDeHoy(sb, userId, hoy, data.parametros.max_horas_profundas_dia));
  const nuevos = await registrarAvisos(sb, userId, avisosDeAhora(data, plan, ahora, now));
  // The first run may find many; the rest stay in the app's notice list
  for (const a of nuevos.slice(0, MAX_PUSH_POR_EJECUCION)) await enviarPush(sb, userId, { title: a.titulo, body: a.cuerpo, url: a.url, tag: a.clave });
  return nuevos.length ? `${nuevos.length} avisos nuevos` : null;
}

// N3: Gemini estimates new Moodle deliverables that still use the provisional 2 h
async function estimarNuevas(sb: SupabaseClient, now: Date, max: number, presupuestoMs: number): Promise<string | null> {
  const pendientes = comprobar(await sb.from('entregas').select('*').is('horas_est', null).is('estimado_ia_en', null).eq('estado', 'pendiente'), 'entregas') || [];
  const objetivo = entregasSinEstimar(pendientes, now).slice(0, max);
  if (!objetivo.length) return null;
  const asignaturas = new Map<string, string>((comprobar(await sb.from('asignaturas').select('codigo, nombre'), 'asignaturas') || [])
    .map((a: any) => [a.codigo, a.nombre]));
  const logs = comprobar(await sb.from('task_logs').select('uid, horas_reales').order('creado_en', { ascending: false }).limit(30), 'task_logs') || [];
  const hechas = new Map<string, any>((comprobar(await sb.from('entregas').select('uid, titulo, asignatura_codigo, horas_est')
    .in('uid', logs.map((l: any) => l.uid).length ? logs.map((l: any) => l.uid) : ['-']), 'entregas') || []).map((e: any) => [e.uid, e]));
  const precedentes: Precedente[] = logs.map((l: any) => ({ l, e: hechas.get(l.uid) })).filter(({ e }: any) => e?.horas_est > 0).slice(0, 8)
    .map(({ l, e }: any) => ({ titulo: e.titulo, asignatura: asignaturas.get(e.asignatura_codigo) || e.asignatura_codigo, horas_est: Number(e.horas_est), horas_reales: Number(l.horas_reales) }));
  const hechasAhora: string[] = [];
  for (const t of objetivo) {
    const est = await estimarEntrega(t, asignaturas.get(t.asignatura_codigo) || t.asignatura_codigo || 'sin asignatura', precedentes, presupuestoMs);
    comprobar(await sb.from('entregas').update({
      horas_est: est.horas_est, tipo_trabajo: est.tipo_trabajo, dificultad: est.dificultad, min_viable_min: est.min_viable_min,
      horas_ia: est.horas_est, estimacion_ia_nota: est.nota, estimado_ia_en: now.toISOString(),
    }).eq('uid', t.uid).is('horas_est', null), 'estimación');
    hechasAhora.push(`${t.titulo}: ${est.horas_est} h (${est.modelo})`);
  }
  return hechasAhora.join('; ');
}
