import type { EntregaItem } from '../services/moodleTypes';
import { DEFAULT_PARAMETROS, type Bloque, type Deuda, type Evento, type Parametros } from './types';
import { validateParametros } from './engine';
import { entregaSnapshot } from './snapshot';
import { universityTask, type UniversityWorkRow } from './university';

export interface PlannerData {
  revision: string;
  plan_revision: string;
  entregas: EntregaItem[];
  eventos: Evento[];
  parametros: Parametros;
  bloques: Bloque[];
  deuda: Deuda[];
}

// Builds the planner state from raw table rows. Shared by the app (user session) and the nightly assistant (service role).
export function assemblePlannerData(parametrosRows: { clave: string; valor: any }[], moodle: any[], university: UniversityWorkRow[],
  allEventos: any[], bloques: any[], deuda: any[]): PlannerData {
  const entregas = [...moodle, ...university.map(universityTask)];
  const eventos = allEventos.filter(e => e.activo !== false);
  const values = Object.fromEntries(parametrosRows.map(p => [p.clave, p.valor]));
  const parametros = { ...DEFAULT_PARAMETROS, ...Object.fromEntries(Object.entries(values).filter(([key]) => key in DEFAULT_PARAMETROS)) } as Parametros;
  validateParametros(parametros);
  const savedSnapshot = values._plan_entregas;
  const sameSnapshot = savedSnapshot && JSON.stringify(savedSnapshot.map((t: any) => Object.entries(t).sort())) === JSON.stringify(entregaSnapshot(entregas).map(t => Object.entries(t).sort()));
  return { revision: values._revision || '', plan_revision: sameSnapshot ? values._plan_revision || '' : '', entregas, eventos, parametros,
    bloques: bloques.map(b => ({ ...b, task_uid: b.trabajo_id ? `uni:${b.trabajo_id}` : b.task_uid, inicio_local: b.inicio_local.slice(0, 5), fin_local: b.fin_local.slice(0, 5) })),
    deuda: deuda.map(d => ({ ...d, task_uid: d.trabajo_id ? `uni:${d.trabajo_id}` : d.task_uid })) };
}
