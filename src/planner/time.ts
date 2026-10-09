export function madridLocal(instant: string | Date): string {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error('Fecha UTC inválida');
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const v = (key: string) => p.find(part => part.type === key)!.value;
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
}
export function minutes(time: string): number {
  if (!/^\d{2}:\d{2}(:00)?$/.test(time)) throw new Error('Hora inválida: usa HH:mm');
  const [h, m] = time.split(':').map(Number);
  if (h > 23 || m > 59) throw new Error('Hora fuera de rango');
  return h * 60 + m;
}
export function timeString(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
export function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`))
    && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
}
export function validLocal(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:00)?$/.test(value) || !validDate(value.slice(0, 10))) return false;
  try { minutes(value.slice(11)); return true; } catch { return false; }
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  return addDays(date, 1 - weekday);
}
export function daysBetween(from: string, until: string): string[] {
  const dates: string[] = [];
  for (let day = from; day <= until; day = addDays(day, 1)) dates.push(day);
  return dates;
}
export function blockStart(b: { fecha: string; inicio_local: string }): string { return `${b.fecha}T${b.inicio_local.slice(0, 5)}`; }
export function blockEnd(b: { fecha: string; fin_local: string }): string { return `${b.fecha}T${b.fin_local.slice(0, 5)}`; }
