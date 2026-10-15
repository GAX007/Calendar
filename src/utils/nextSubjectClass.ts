import type { TaskItem, UniversitySubject } from '../types';
import { validDate, validLocal } from '../planner/time';

function normalise(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function matchesSubject(title: string, subject: UniversitySubject): boolean {
  const name = normalise(subject.name), text = normalise(title), code = normalise(subject.code);
  if (name && ` ${text} `.includes(` ${name} `)) return true;
  // El código debe ser una etiqueta completa, nunca parte de otra palabra.
  // Admitir títulos breves "PA", "[PA] Clase" o "PA - Laboratorio".
  if (!code || code.length < 2) return false;
  if (text === code || text === `clase ${code}`) return true;
  const leadingLabel = title.trim().match(/^(?:\[([^\]]+)\]|([^:\-|]+)\s*[:\-|])/);
  return Boolean(leadingLabel && normalise(leadingLabel[1] || leadingLabel[2]) === code);
}

/** Calendar ya aporta las ocurrencias reconciliadas, incluidas sus excepciones.
 * Excluye todo hoy, aunque una clase de hoy todavía no haya empezado. */
export function findNextSubjectClass(tasks: readonly TaskItem[], subject: UniversitySubject | undefined, today: string): TaskItem | null {
  if (!subject || !validDate(today)) return null;
  const classes = tasks.filter(t => t.category === 'Academics'
    && (t.extractedFields?.calendarSource === 'google-calendar' || t.id.startsWith('gcal-'))
    && t.date > today && validLocal(`${t.date}T${t.time}`) && matchesSubject(t.title, subject));
  classes.sort((a,b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return classes[0] || null;
}
