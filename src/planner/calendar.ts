import { expandEventos, sortBlocks } from './engine';
import { blockStart, minutes } from './time';
import type { Plan, PlanInput } from './types';

export const isCalendarEvento = (e: { id: string }) => e.id.startsWith('calendar-fijo:');

/** Union of occupied windows with the same margins and bounds as the planner. */
export function calendarOccupancy(input: PlanInput): [string, number, number][] {
  const byDay = new Map<string, [number, number][]>();
  const cut = [input.ahora_local, input.corte_local || input.ahora_local].sort().at(-1)!;
  for (const e of input.eventos.filter(isCalendarEvento)) {
    const day = e.fecha_inicio;
    if (day < cut.slice(0, 10)) continue;
    const start = Math.max(minutes(e.inicio_local) - input.parametros.margen_min, minutes(input.parametros.hora_inicio_dia), day === cut.slice(0, 10) ? minutes(cut.slice(11)) : 0);
    const end = Math.min(minutes(e.fin_local) + input.parametros.margen_min, minutes(input.parametros.hora_fin_dia));
    if (end > start) byDay.set(day, [...(byDay.get(day) || []), [start, end]]);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([day, intervals]) => {
    const merged: [number, number][] = [];
    for (const interval of intervals.sort(([a], [b]) => a - b)) {
      const last = merged.at(-1);
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    return merged.map(([start, end]) => [day, start, end] as [string, number, number]);
  });
}

export function calendarAllocationKey(input: PlanInput | null, saved: boolean): string {
  if (!input) return '';
  const cut = [input.ahora_local, input.corte_local || input.ahora_local].sort().at(-1)!;
  return JSON.stringify({ ...input, saved,
    eventos: input.eventos.filter(e => !isCalendarEvento(e)), calendar: calendarOccupancy(input),
    bloques_previos: input.bloques_previos?.filter(b => !b.evento_id?.startsWith('calendar-fijo:') || blockStart(b) < cut),
  });
}

/** Refresh class labels/identities without allocating study blocks again. */
export function refreshCalendarBlocks(plan: Plan, input: PlanInput): Plan {
  const cut = [input.ahora_local, input.corte_local || input.ahora_local].sort().at(-1)!;
  const bloques = [...plan.bloques.filter(b => !b.evento_id?.startsWith('calendar-fijo:') || blockStart(b) < cut),
    ...expandEventos(input.eventos.filter(isCalendarEvento), input.desde, input.hasta).filter(b => blockStart(b) >= cut)].sort(sortBlocks);
  return { ...plan, bloques };
}
