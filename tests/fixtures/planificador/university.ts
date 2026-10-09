// Asignatura, deber y examen enteramente inventados.
import type { UniversityHomework, UniversitySubject } from '../../../src/types';
import type { UniversityWorkRow } from '../../../src/planner/university';
export const subject: UniversitySubject = { id: 'materia-ficticia', name: 'Matemática imaginaria', code: 'DEMO', color: 'indigo' };
export function universityWork(fields: Partial<UniversityHomework> = {}): UniversityWorkRow {
  const datos: UniversityHomework = { id: 'examen-inventado', subjectId: subject.id, title: 'Examen inventado',
    dueDate: '2026-10-26', dueTime: '10:00', type: 'examen', priority: 'alta', status: 'pendiente',
    estimatedHours: 6, createdAt: '2026-10-01T00:00:00Z', ...fields };
  return { id: datos.id, datos, asignatura: subject, deadline_local: `${datos.dueDate}T${datos.dueTime}`,
    horas_est: datos.estimatedHours ?? 2, estado: datos.status === 'entregado' ? 'hecha' : 'pendiente',
    activo: true, aplazamientos: 0, plan_no_antes_de: null, min_viable_min: null,
    tamano_bloque_min: null, hueco_inicio_local: null, hueco_fin_local: null };
}
