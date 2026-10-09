import { supabase } from '../lib/supabase';
import type { UniversityHomework, UniversitySubject } from '../types';
import { localDeadlineUtc, type UniversityWorkRow } from '../planner/university';

export const UNIVERSITY_PLANNER_UPDATED = 'university-planner-updated';
function client() {
  if (!supabase) throw new Error('Inicia sesión y configura Supabase para guardar tus deberes y exámenes');
  return supabase;
}
function checked<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(/schema cache|does not exist|could not find/i.test(error.message)
    ? 'Falta aplicar la migración de Universidad en Supabase' : error.message);
  return data;
}
export async function loadUniversityWorks(): Promise<UniversityWorkRow[]> {
  const result: UniversityWorkRow[] = [];
  for (let page = 0; ; page++) {
    const rows = checked(await client().from('trabajos_universidad').select('*').order('id').range(page * 1000, page * 1000 + 999)) || [];
    result.push(...rows);
    if (rows.length < 1000) return result;
  }
}
export function homeworkFromRow(row: UniversityWorkRow): UniversityHomework {
  return { ...row.datos, id: row.id, plannerUid: `uni:${row.id}`, estimatedHours: Number(row.horas_est),
    status: row.estado === 'hecha' || row.estado === 'descartada' ? 'entregado' : row.datos.status === 'en_progreso' ? 'en_progreso' : 'pendiente' };
}
export async function saveUniversityWork(work: UniversityHomework, subject: UniversitySubject, remove = false): Promise<void> {
  if (!remove) {
    localDeadlineUtc(`${work.dueDate}T${work.dueTime || '23:59'}`);
    if (!work.title.trim() || !subject?.id || !Number.isFinite(work.estimatedHours ?? 2) || (work.estimatedHours ?? 2) <= 0 || (work.estimatedHours ?? 2) > 500)
      throw new Error('Indica un título y una estimación entre 0 y 500 horas');
  }
  checked(await client().rpc('guardar_trabajo_universidad', { p_trabajo: work, p_asignatura: subject, p_eliminar: remove }));
  window.dispatchEvent(new Event(UNIVERSITY_PLANNER_UPDATED));
}
