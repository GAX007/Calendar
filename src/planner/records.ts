import { validDate } from './time';

export interface DailyCheckin {
  user_id: string;
  fecha: string;
  energia: number;
  sueno_h: number;
  fatiga: number;
  nota: string | null;
}
export type CheckinValues = Pick<DailyCheckin, 'energia' | 'sueno_h' | 'fatiga' | 'nota'>;

export function needsTodayCheckin(today: string, checkin: DailyCheckin | null): boolean {
  return !checkin || checkin.fecha !== today;
}
export function parseRealHours(value: string): number | null {
  if (!value.trim()) return null;
  const hours = Number(value.trim().replace(',', '.'));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || !Number.isInteger(hours * 4)) {
    throw new Error('Horas reales: usa un valor mayor que 0 y hasta 24, en pasos de 0,25');
  }
  return hours;
}
export function validateCheckin(fecha: string, values: CheckinValues): void {
  if (!validDate(fecha)) throw new Error('Fecha del check-in inválida');
  if (![values.energia, values.fatiga].every(n => Number.isInteger(n) && n >= 1 && n <= 5)) {
    throw new Error('Energía y fatiga deben estar entre 1 y 5');
  }
  if (!Number.isFinite(values.sueno_h) || values.sueno_h < 0 || values.sueno_h > 16 || !Number.isInteger(values.sueno_h * 2)) {
    throw new Error('Horas de sueño: usa un valor entre 0 y 16, en pasos de 0,5');
  }
}
