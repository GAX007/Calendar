import type { UniversityHomework, UniversitySubject } from '../types';
import type { EntregaItem } from '../services/moodleTypes';
import { addDays, madridLocal, validLocal } from './time';

export interface UniversityWorkRow {
  id: string; datos: UniversityHomework; asignatura: UniversitySubject;
  deadline_local: string; horas_est: number; estado: EntregaItem['estado']; activo: boolean;
  aplazamientos: number; plan_no_antes_de: string | null;
  min_viable_min: number | null; tamano_bloque_min: number | null;
  hueco_inicio_local: string | null; hueco_fin_local: string | null;
}
export function universityTask(row: UniversityWorkRow): EntregaItem {
  return { uid: `uni:${row.id}`, asignatura_codigo: row.asignatura.code,
    titulo_raw: row.datos.title, titulo: `[${row.asignatura.code}] ${row.datos.title}`,
    tipo: 'entrega', grupo: null, oculta_por_grupo: false,
    deadline_utc: localDeadlineUtc(row.deadline_local.slice(0, 16)),
    descripcion: row.datos.description || '', moodle_modificado_utc: null,
    borrada_en_moodle: !row.activo, estado: row.estado, dificultad: null,
    horas_est: Number(row.horas_est), horas_reales: null, factor_calibracion: 1,
    tipo_trabajo: row.datos.type === 'lectura' ? 'ligero' : 'profundo',
    min_viable_min: row.min_viable_min, aplazamientos: row.aplazamientos,
    plan_no_antes_de: row.plan_no_antes_de?.slice(0, 16) || null,
    tamano_bloque_min: row.tamano_bloque_min,
    hueco_inicio_local: row.hueco_inicio_local?.slice(0, 16) || null,
    hueco_fin_local: row.hueco_fin_local?.slice(0, 16) || null,
    es_examen: row.datos.type === 'examen',
  };
}
// Round-trip Madrid wall time, including DST. Reject nonexistent spring times.
export function localDeadlineUtc(local: string): string {
  if (!validLocal(local)) throw new Error('Fecha u hora inválida');
  const wall = Date.parse(`${local}:00Z`);
  // PostgreSQL chooses standard time for the repeated autumn hour.
  for (const offset of [60, 120]) {
    const date = new Date(wall - offset * 60000);
    if (madridLocal(date) === local) return date.toISOString();
  }
  throw new Error('Esta hora no existe en Madrid por el cambio de horario');
}
export function examDays(deadline: string, minutes: number): string[] {
  const sessions = Math.ceil(minutes / 60);
  const window = Math.min(28, Math.max(4, sessions * 2));
  const end = addDays(deadline.slice(0, 10), -1);
  return Array.from({ length: sessions }, (_, i) => addDays(end,
    -Math.round((sessions - 1 - i) * (window - 1) / Math.max(1, sessions - 1))));
}
export function examCountdown(homework: UniversityHomework[], subjectId: string, today: string): string | null {
  const next = homework.filter(h => h.subjectId === subjectId && h.type === 'examen' && h.status !== 'entregado' && h.dueDate >= today)
    .sort((a, b) => `${a.dueDate}T${a.dueTime}`.localeCompare(`${b.dueDate}T${b.dueTime}`) || a.id.localeCompare(b.id))[0];
  if (!next) return null;
  const days = Math.round((Date.parse(`${next.dueDate}T12:00Z`) - Date.parse(`${today}T12:00Z`)) / 86400000);
  return `Examen ${days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`} · ${next.estimatedHours ?? 2} h de estudio`;
}
