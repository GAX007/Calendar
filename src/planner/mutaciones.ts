// Payloads of the planner RPC (mutar_planificador), shared by the app (user session) and the server
// (asistente_como_usuario, for the iPhone shortcut). Pure: no network.
import type { DiffSocial, Evento, Plan } from './types';
import type { PlannerData } from './data';
import { validateEvento } from './engine';
import { madridLocal, weekStart } from './time';
import { entregaSnapshot } from './snapshot';

export type Mutar = (data: PlannerData, accion: string, datos: unknown) => Promise<void>;

export function datosPlan(data: PlannerData, plan: Plan, hasta: string, ahora: string) {
  const desde_local = [ahora, `${weekStart(hasta)}T00:00`].sort().at(-1)!;
  return { desde_local, hasta, bloques: plan.bloques, entregas_snapshot: entregaSnapshot(data.entregas) };
}

export function datosSocial(data: PlannerData, evento: Evento, diff: DiffSocial, baseline: Plan, confirmarDeuda: boolean) {
  if (diff.requiere_confirmacion && !confirmarDeuda) throw new Error('Confirma la advertencia de deuda antes de guardar');
  if (diff.desde_local < madridLocal(new Date())) throw new Error('La vista previa ha caducado. Calcula de nuevo');
  return { evento, desde_local: diff.desde_local, hasta: diff.hasta, bloques: diff.plan.bloques, plan_base: baseline.bloques,
    nueva_deuda: diff.nueva_deuda, recortes: diff.recortes, confirmar_deuda: confirmarDeuda, entregas_snapshot: entregaSnapshot(data.entregas) };
}

export async function guardarSocial(mutar: Mutar, data: PlannerData, evento: Evento, diff: DiffSocial, baseline: Plan, confirmarDeuda: boolean) {
  try {
    await mutar(data, 'social', datosSocial(data, evento, diff, baseline, confirmarDeuda));
  } catch (err) {
    // Supabase without migration_fase5_imprevisto.sql only accepts events that move no earlier block
    if (err instanceof Error && /El corte debe coincidir/.test(err.message)) {
      throw new Error('Para mover los bloques que chocan con el imprevisto falta aplicar supabase/migration_fase5_imprevisto.sql en Supabase');
    }
    throw err;
  }
}

export async function guardarEvento(mutar: Mutar, data: PlannerData, evento: Evento) {
  validateEvento(evento);
  await mutar(data, 'evento', evento);
}
