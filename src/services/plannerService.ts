import { supabase } from '../lib/supabase';
import type { EntregaItem } from './moodleTypes';
import { DEFAULT_PARAMETROS, type Bloque, type Deuda, type DiffSocial, type Evento, type Parametros, type Plan } from '../planner/types';
import { validateEvento, validateParametros } from '../planner/engine';
import { madridLocal, weekStart } from '../planner/time';
import { entregaSnapshot } from '../planner/snapshot';
import { universityTask } from '../planner/university';
import { loadUniversityWorks } from './universityPlannerService';

export interface PlannerData {
  revision: string;
  plan_revision: string;
  entregas: EntregaItem[];
  eventos: Evento[];
  parametros: Parametros;
  bloques: Bloque[];
  deuda: Deuda[];
}
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
  const entregas = [...moodle, ...university.map(universityTask)];
  const eventos = allEventos.filter(e => e.activo !== false);
  const after = checked(await client().from('parametros').select('*')) || [];
  const values = Object.fromEntries(after.map(p => [p.clave, p.valor]));
  if ((before.find(p => p.clave === '_revision')?.valor || '') !== (values._revision || '')) throw new Error('Los horarios han cambiado mientras se cargaban. Vuelve a actualizar');
  const parametros = { ...DEFAULT_PARAMETROS, ...Object.fromEntries(Object.entries(values).filter(([key]) => key in DEFAULT_PARAMETROS)) } as Parametros;
  validateParametros(parametros);
  const savedSnapshot = values._plan_entregas;
  const sameSnapshot = savedSnapshot && JSON.stringify(savedSnapshot.map((t: any) => Object.entries(t).sort())) === JSON.stringify(entregaSnapshot(entregas).map(t => Object.entries(t).sort()));
  return { revision: values._revision || '', plan_revision: sameSnapshot ? values._plan_revision || '' : '', entregas, eventos, parametros,
    bloques: bloques.map(b => ({ ...b, task_uid: b.trabajo_id ? `uni:${b.trabajo_id}` : b.task_uid, inicio_local: b.inicio_local.slice(0, 5), fin_local: b.fin_local.slice(0, 5) })),
    deuda: deuda.map(d => ({ ...d, task_uid: d.trabajo_id ? `uni:${d.trabajo_id}` : d.task_uid })) };
}
export async function mutatePlanner(data: PlannerData, action: string, payload: unknown): Promise<void> {
  checked(await client().rpc('mutar_planificador', { p_revision: data.revision, p_accion: action, p_datos: payload }));
}
export async function saveEvento(data: PlannerData, evento: Evento) {
  validateEvento(evento);
  return mutatePlanner(data, 'evento', evento);
}
export async function saveParametros(data: PlannerData, parametros: Parametros) {
  validateParametros(parametros);
  return mutatePlanner(data, 'parametros', parametros);
}
export async function savePlan(data: PlannerData, plan: Plan, hasta: string, ahora: string) {
  const desde_local = [ahora, `${weekStart(hasta)}T00:00`].sort().at(-1)!;
  return mutatePlanner(data, 'plan', { desde_local, hasta, bloques: plan.bloques, entregas_snapshot: entregaSnapshot(data.entregas) });
}
export async function confirmSocial(data: PlannerData, evento: Evento, diff: DiffSocial, baseline: Plan, confirmarDeuda: boolean) {
  if (diff.requiere_confirmacion && !confirmarDeuda) throw new Error('Confirma la advertencia de deuda antes de guardar');
  if (diff.desde_local < madridLocal(new Date())) throw new Error('La vista previa ha caducado. Calcula de nuevo');
  return mutatePlanner(data, 'social', { evento, desde_local: diff.desde_local, hasta: diff.hasta,
    bloques: diff.plan.bloques, plan_base: baseline.bloques, nueva_deuda: diff.nueva_deuda,
    confirmar_deuda: confirmarDeuda, entregas_snapshot: entregaSnapshot(data.entregas) });
}
