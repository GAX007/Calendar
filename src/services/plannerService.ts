import { supabase } from '../lib/supabase';
import type { EntregaItem } from './moodleTypes';
import type { DiffSocial, Evento, Parametros, Plan } from '../planner/types';
import { validateEvento, validateParametros } from '../planner/engine';
import { assemblePlannerData, type PlannerData } from '../planner/data';
import { madridLocal, weekStart } from '../planner/time';
import { datosPlan, guardarEvento, guardarSocial } from '../planner/mutaciones';
import { loadUniversityWorks } from './universityPlannerService';

export type { PlannerData } from '../planner/data';
function client() {
  if (!supabase) throw new Error('Falta configurar Supabase para guardar el planificador');
  return supabase;
}
function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) {
    if (/does not exist|schema cache|could not find/i.test(result.error.message)) throw new Error('Falta aplicar la migración de fase 2 en Supabase. Los horarios se guardan únicamente en la base de datos');
    throw new Error(result.error.message);
  }
  return result.data;
}
async function rows(table: string, active = false): Promise<any[]> {
  const all: any[] = [];
  for (let page = 0; ; page++) {
    let q = client().from(table).select('*').order(table === 'entregas' ? 'uid' : 'id').range(page * 1000, page * 1000 + 999);
    if (active) q = q.eq('activo', true);
    const data = checked(await q) || [];
    all.push(...data);
    if (data.length < 1000) return all;
  }
}
export async function loadPlanner(): Promise<PlannerData> {
  const before = checked(await client().from('parametros').select('*')) || [];
  const [moodle, university, allEventos, bloques, deuda] = await Promise.all([rows('entregas'), loadUniversityWorks(), rows('eventos'), rows('bloques_plan', true), rows('deuda')]);
  const after = checked(await client().from('parametros').select('*')) || [];
  if ((before.find(p => p.clave === '_revision')?.valor || '') !== (after.find(p => p.clave === '_revision')?.valor || '')) throw new Error('Los horarios han cambiado mientras se cargaban. Vuelve a actualizar');
  return assemblePlannerData(after, moodle, university, allEventos, bloques, deuda);
}
export async function mutatePlanner(data: PlannerData, action: string, payload: unknown): Promise<void> {
  checked(await client().rpc('mutar_planificador', { p_revision: data.revision, p_accion: action, p_datos: payload }));
}
export async function saveEvento(data: PlannerData, evento: Evento) {
  return guardarEvento(mutatePlanner, data, evento);
}
export async function saveParametros(data: PlannerData, parametros: Parametros) {
  validateParametros(parametros);
  return mutatePlanner(data, 'parametros', parametros);
}
export async function savePlan(data: PlannerData, plan: Plan, hasta: string, ahora: string) {
  return mutatePlanner(data, 'plan', datosPlan(data, plan, hasta, ahora));
}
export async function confirmSocial(data: PlannerData, evento: Evento, diff: DiffSocial, baseline: Plan, confirmarDeuda: boolean) {
  return guardarSocial(mutatePlanner, data, evento, diff, baseline, confirmarDeuda);
}
