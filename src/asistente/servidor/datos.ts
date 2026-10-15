// Database access of the nightly assistant (service role, always filtered by user)
import type { SupabaseClient } from '@supabase/supabase-js';
import { assemblePlannerData, type PlannerData } from '../../planner/data';
import type { UniversityWorkRow } from '../../planner/university';
import type { DailyCheckin } from '../../planner/records';
import type { Aviso, EstadoBloque, ItemCierre } from '../logica';
import { comprobar } from './supabase';

async function todas(sb: SupabaseClient, tabla: string, filtrar: (q: any) => any, orden: string): Promise<any[]> {
  const result: any[] = [];
  for (let page = 0; ; page++) {
    const rows: any[] = comprobar<any[]>(await filtrar(sb.from(tabla).select('*')).order(orden).range(page * 1000, page * 1000 + 999), tabla) || [];
    result.push(...rows);
    if (rows.length < 1000) return result;
  }
}

export async function usuariosDelPlanificador(sb: SupabaseClient): Promise<string[]> {
  const rows = comprobar(await sb.from('parametros').select('user_id').eq('clave', '_revision'), 'parametros') || [];
  return [...new Set(rows.map((r: any) => r.user_id as string))];
}

export async function cargarPlanificador(sb: SupabaseClient, userId: string): Promise<PlannerData> {
  const own = (q: any) => q.eq('user_id', userId);
  const [parametros, moodle, university, eventos, bloques, deuda] = await Promise.all([
    todas(sb, 'parametros', own, 'clave'),
    todas(sb, 'entregas', q => q, 'uid'),
    todas(sb, 'trabajos_universidad', own, 'id') as Promise<UniversityWorkRow[]>,
    todas(sb, 'eventos', own, 'id'),
    todas(sb, 'bloques_plan', q => own(q).eq('activo', true), 'id'),
    todas(sb, 'deuda', own, 'id'),
  ]);
  return assemblePlannerData(parametros, moodle, university, eventos, bloques, deuda);
}

export async function cargarEstados(sb: SupabaseClient, userId: string, desde: string, hasta: string): Promise<Map<string, EstadoBloque>> {
  const rows = comprobar(await sb.from('asistente_bloques_estado').select('bloque_id, estado')
    .eq('user_id', userId).gte('fecha', desde).lte('fecha', hasta), 'asistente_bloques_estado') || [];
  return new Map(rows.map((r: any) => [r.bloque_id, r.estado]));
}

export async function cargarCheckins(sb: SupabaseClient, userId: string, desde: string, hasta: string): Promise<DailyCheckin[]> {
  return comprobar(await sb.from('checkins').select('*').eq('user_id', userId).gte('fecha', desde).lte('fecha', hasta), 'checkins') || [];
}

export async function cargarCierres(sb: SupabaseClient, userId: string, desde: string, hasta: string): Promise<{ fecha: string; items: ItemCierre[]; estado: string }[]> {
  return comprobar(await sb.from('asistente_cierres').select('fecha, items, estado').eq('user_id', userId)
    .gte('fecha', desde).lte('fecha', hasta), 'asistente_cierres') || [];
}

export async function cargarLogs(sb: SupabaseClient, userId: string): Promise<{ uid: string; fecha: string; horas_reales: number }[]> {
  return todas(sb, 'task_logs', q => q.eq('user_id', userId), 'id');
}

export async function existeResumen(sb: SupabaseClient, userId: string, fecha: string, tipo: 'manana' | 'semanal'): Promise<boolean> {
  const row = comprobar(await sb.from('asistente_resumenes').select('fecha').eq('user_id', userId)
    .eq('fecha', fecha).eq('tipo', tipo).maybeSingle(), 'asistente_resumenes');
  return Boolean(row);
}

export async function guardarResumen(sb: SupabaseClient, userId: string, fecha: string, tipo: 'manana' | 'semanal', datos: unknown): Promise<void> {
  comprobar(await sb.from('asistente_resumenes').upsert({ user_id: userId, fecha, tipo, datos, creado_en: new Date().toISOString() },
    { onConflict: 'user_id,fecha,tipo' }), 'asistente_resumenes');
}

export async function existeCierre(sb: SupabaseClient, userId: string, fecha: string): Promise<boolean> {
  const row = comprobar(await sb.from('asistente_cierres').select('fecha').eq('user_id', userId).eq('fecha', fecha).maybeSingle(), 'asistente_cierres');
  return Boolean(row);
}

// Inserts only the notices not created before and returns those new ones
export async function registrarAvisos(sb: SupabaseClient, userId: string, avisos: Aviso[]): Promise<Aviso[]> {
  if (!avisos.length) return [];
  const rows = comprobar(await sb.from('asistente_avisos')
    .upsert(avisos.map(a => ({ user_id: userId, ...a })), { onConflict: 'user_id,clave', ignoreDuplicates: true })
    .select('clave, tipo, titulo, cuerpo, url'), 'asistente_avisos') || [];
  return rows as Aviso[];
}

// Runs a planner mutation as the user, with all the checks of mutar_planificador
export async function mutarComoUsuario(sb: SupabaseClient, userId: string, revision: string, accion: string, datos: unknown): Promise<string> {
  return comprobar(await sb.rpc('asistente_como_usuario', { p_user: userId, p_revision: revision, p_accion: accion, p_datos: datos }), accion);
}
