// "What's next" for outside assistants (Jarvis on the PC): the coming activities and deliverables as data, so they can
// remind the user before each one. Same sources as the spoken summary (voz.ts): planner events, agenda tasks with a time,
// study blocks of the plan and pending deliverables. Pure function, no database: the route loads the data.
import type { PlannerData } from '../planner/data';
import type { Plan } from '../planner/types';
import type { TaskItem } from '../types';
import { expandEventos } from '../planner/engine';
import { addDays, blockEnd, madridLocal } from '../planner/time';
import { addMinutesLocal, esCandidata } from './logica';
import { guionBreve } from './voz';

export interface ActividadProxima {
  id: string;          // stable per occurrence: the same activity on the same day and time keeps its id
  clase: 'evento' | 'tarea' | 'estudio';
  fecha: string;       // YYYY-MM-DD, Madrid
  inicio: string;      // HH:mm, Madrid
  fin: string | null;
  titulo: string;
  area?: string;
}
export interface EntregaProxima { uid: string; titulo: string; vence: string; tipo: string; asignatura: string }
export interface Proximos {
  ahora: string;
  zona: 'Europe/Madrid';
  actividades: ActividadProxima[];
  entregas: EntregaProxima[];
  resumen_hoy: string;
}

export function proximos(input: { data: PlannerData; tareas: TaskItem[]; ahoraLocal: string; dias: number;
  planDe: (fecha: string) => Plan }): Proximos {
  const { data, tareas, ahoraLocal } = input;
  const pedido = Number(input.dias);
  const dias = Number.isFinite(pedido) && pedido > 0 ? Math.min(7, Math.max(1, Math.round(pedido))) : 2;
  const hoy = ahoraLocal.slice(0, 10);
  const limite = addMinutesLocal(ahoraLocal, dias * 24 * 60);
  const actividades: ActividadProxima[] = [];
  for (let i = 0; i < dias; i++) {
    const dia = addDays(hoy, i);
    for (const b of expandEventos(data.eventos, dia, dia)) {
      if (blockEnd(b) <= ahoraLocal) continue;
      const area = data.eventos.find(e => e.id === b.evento_id)?.area;
      actividades.push({ id: `evento:${b.evento_id || b.id}:${dia}T${b.inicio_local}`, clase: 'evento', fecha: dia,
        inicio: b.inicio_local, fin: b.fin_local, titulo: b.titulo, ...(area ? { area } : {}) });
    }
    for (const t of tareas) {
      if (t.date !== dia || t.completed || !t.time) continue;
      const inicio = t.time.slice(0, 5), fin = t.endTime ? t.endTime.slice(0, 5) : null;
      if (`${dia}T${fin || inicio}` <= ahoraLocal) continue;
      actividades.push({ id: `tarea:${t.id}:${dia}T${inicio}`, clase: 'tarea', fecha: dia, inicio, fin, titulo: t.title });
    }
    for (const b of input.planDe(dia).bloques) {
      if (b.fecha !== dia || !b.task_uid || blockEnd(b) <= ahoraLocal) continue;
      actividades.push({ id: `estudio:${b.task_uid}:${dia}T${b.inicio_local}`, clase: 'estudio', fecha: dia,
        inicio: b.inicio_local, fin: b.fin_local, titulo: b.titulo });
    }
  }
  // Same title at the same time from two sources (a task copied into the planner): only once
  const vistos = new Set<string>();
  const unicas = actividades
    .sort((a, b) => `${a.fecha}T${a.inicio}`.localeCompare(`${b.fecha}T${b.inicio}`))
    .filter(a => {
      const clave = `${a.fecha}T${a.inicio}|${a.titulo.trim().toLowerCase()}`;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });

  const entregas = data.entregas.filter(esCandidata)
    .map(t => ({ uid: t.uid, titulo: t.titulo, vence: madridLocal(t.deadline_utc), tipo: t.tipo || 'entrega',
      asignatura: t.asignatura_codigo || '' }))
    .filter(e => e.vence > ahoraLocal && e.vence <= limite)
    .sort((a, b) => a.vence.localeCompare(b.vence));

  const resumen = guionBreve({ data, plan: input.planDe(hoy), tareas, ahoraLocal }).frases.join(' ');
  return { ahora: ahoraLocal, zona: 'Europe/Madrid', actividades: unicas, entregas, resumen_hoy: resumen };
}
