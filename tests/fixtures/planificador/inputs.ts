// Entirely fictional: never include the user's timetable in public fixtures.
import type { EntregaItem } from '../../../src/services/moodleTypes';
import { DEFAULT_PARAMETROS, type Evento, type PlanInput } from '../../../src/planner/types';

export function entrega(uid: string, fields: Partial<EntregaItem> = {}): EntregaItem {
  return { uid, asignatura_codigo: 'DEMO', titulo_raw: `Ejercicio inventado ${uid}`, titulo: `Ejercicio inventado ${uid}`,
    tipo: 'entrega', grupo: null, oculta_por_grupo: false, deadline_utc: '2026-10-05T21:00:00Z',
    descripcion: '', moodle_modificado_utc: null, borrada_en_moodle: false, estado: 'pendiente',
    dificultad: null, horas_est: 2, horas_reales: null, min_viable_min: null, tipo_trabajo: 'profundo',
    aplazamientos: 0, factor_calibracion: 1, ...fields };
}
export function evento(fields: Partial<Evento> = {}): Evento {
  return { id: 'fijo-inventado', titulo: 'Taller ficticio', inicio_local: '10:00', fin_local: '12:00',
    dias_semana: null, fecha_inicio: '2026-10-05', fecha_fin: null, tipo: 'fijo', bloqueo: true, area: 'otro', ...fields };
}
export function input(fields: Partial<PlanInput> = {}): PlanInput {
  return { desde: '2026-10-05', hasta: '2026-10-05', ahora_local: '2026-10-05T09:00',
    entregas: [entrega('a'), entrega('b')], eventos: [], parametros: { ...DEFAULT_PARAMETROS }, ...fields };
}
