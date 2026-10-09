import { examDays } from './university';
import { addDays } from './time';

interface Slot { fecha: string; start: number; end: number }
/** Practical defaults: balanced 30–60 min sessions, one session per exam/day.
 * Spacing and retrieval have evidence; these exact intervals are our heuristic.
 */
export function examSessions(slots: Slot[], deadline: string, estimate: number, remaining: number, cut: string): Slot[] {
  const targets = examDays(deadline, estimate);
  const first = targets[0];
  const last = deadline.slice(0, 10) === cut.slice(0, 10) ? deadline.slice(0, 10) : addDays(deadline.slice(0, 10), -1);
  const n = Math.ceil(remaining / 60);
  const lengths = Array.from({ length: n }, (_, i) => Math.floor(remaining / n) + (i < remaining % n ? 1 : 0));
  const usedDays = new Set<string>();
  const result: Slot[] = [];
  for (let i = 0; i < n; i++) {
    const target = targets[Math.min(targets.length - 1, Math.floor((estimate - remaining) / 60) + i)];
    const dayDistance = (day: string) => Math.abs(Date.parse(`${day}T12:00Z`) - Date.parse(`${target}T12:00Z`));
    const available = slots.filter(s => s.fecha >= first && s.fecha <= last && !usedDays.has(s.fecha) && s.end - s.start >= lengths[i])
      .sort((a, b) => dayDistance(a.fecha) - dayDistance(b.fecha) || a.fecha.localeCompare(b.fecha) || a.start - b.start);
    const slot = available[0];
    if (!slot) continue;
    usedDays.add(slot.fecha);
    result.push({ ...slot, end: slot.start + lengths[i] });
  }
  return result.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.start - b.start);
}
