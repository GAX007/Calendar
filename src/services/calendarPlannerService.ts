import { supabase } from '../lib/supabase';

export const CALENDAR_PLANNER_UPDATED = 'calendarasist:calendar-planner-updated';
export const CALENDAR_PLANNER_STATUS = 'calendarasist:calendar-planner-status';
export interface CalendarPlannerChange {
  actualizados: number;
  desactivados: number;
  horarios_cambiados: boolean;
}

export async function syncCalendarPlanner(
  userId?: string, client = supabase,
  notify = (change: CalendarPlannerChange) => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CALENDAR_PLANNER_UPDATED, { detail: { userId, ...change } }));
  },
): Promise<CalendarPlannerChange | null> {
  if (!userId || !client) return null;
  // El propietario procede de auth.uid() en SQL; no se envía desde el cliente.
  const { data, error } = await client.rpc('sincronizar_fijos_calendar');
  const message = error ? 'No se pudieron actualizar los fijos de Calendar. Comprueba la migración de Calendar y vuelve a sincronizar.' : '';
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CALENDAR_PLANNER_STATUS, { detail: { userId, error: message } }));
  if (error) throw new Error(message);
  const change = data as CalendarPlannerChange;
  if (change.actualizados || change.desactivados) notify(change);
  return change;
}
