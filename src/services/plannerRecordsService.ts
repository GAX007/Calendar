import { supabase } from '../lib/supabase';
import { validateCheckin, type CheckinValues, type DailyCheckin } from '../planner/records';

function client() {
  if (!supabase) throw new Error('Inicia sesión y configura Supabase para guardar tus registros');
  return supabase;
}
function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) {
    if (/does not exist|schema cache|could not find/i.test(result.error.message)) {
      throw new Error('Falta ejecutar supabase/migration_fase3_registros.sql en Supabase');
    }
    throw new Error(result.error.message);
  }
  return result.data;
}
export async function loadTodayCheckin(userId: string, fecha: string): Promise<DailyCheckin | null> {
  return checked(await client().from('checkins').select('*').eq('user_id', userId).eq('fecha', fecha).maybeSingle());
}
export async function saveTodayCheckin(userId: string, fecha: string, values: CheckinValues): Promise<DailyCheckin> {
  validateCheckin(fecha, values);
  return checked(await client().from('checkins').upsert({ user_id: userId, fecha, ...values, nota: values.nota?.trim() || null },
    { onConflict: 'user_id,fecha' }).select('*').single());
}
// Estado y horas se guardan juntos, sin una escritura posterior que pueda fallar.
// El propietario y la fecha del registro se derivan en el RPC.
export async function completeEntrega(uid: string, horasReales: number | null, revision?: string): Promise<string> {
  if (horasReales !== null && (!Number.isFinite(horasReales) || horasReales <= 0 || horasReales > 24)) {
    throw new Error('Horas reales fuera de rango');
  }
  let expectedRevision = revision;
  if (expectedRevision === undefined) {
    const row = checked(await client().from('parametros').select('valor').eq('clave', '_revision').maybeSingle());
    expectedRevision = row?.valor || '';
  }
  return checked(await client().rpc('mutar_planificador', {
    p_revision: expectedRevision, p_accion: 'entrega', p_datos: { uid, estado: 'hecha' }, p_horas_reales: horasReales,
  }));
}
