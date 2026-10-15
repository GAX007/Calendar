// Client side of the nightly assistant: summaries, notices, block status, undo and push
import { supabase } from '../lib/supabase';
import type { Aviso, EstadoBloque, ItemCierre, RepasoSemanal, ResumenManana } from '../asistente/logica';
import { entradaSemana } from '../asistente/logica';
import { generatePlan } from '../planner/engine';
import { madridLocal } from '../planner/time';
import { loadPlanner, savePlan } from './plannerService';

export const ASISTENTE_ACTUALIZADO = 'asistente-actualizado';

export interface AvisoGuardado extends Aviso { leido: boolean; creado_en: string }
export interface CierreGuardado { fecha: string; items: ItemCierre[]; estado: 'aplicado' | 'deshecho' }

function client() {
  if (!supabase) throw new Error('Inicia sesión para usar el asistente');
  return supabase;
}
function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) {
    if (/does not exist|schema cache|could not find/i.test(result.error.message)) {
      throw new Error('Falta ejecutar supabase/migration_fase4_asistente.sql en Supabase');
    }
    throw new Error(result.error.message);
  }
  return result.data;
}

export async function cargarResumen<T = ResumenManana>(userId: string, fecha: string, tipo: 'manana' | 'semanal'): Promise<T | null> {
  const row = checked(await client().from('asistente_resumenes').select('datos').eq('user_id', userId).eq('fecha', fecha).eq('tipo', tipo).maybeSingle());
  return (row?.datos as T) || null;
}

// Latest weekly review generated on or after `desde`
export async function cargarRepasoReciente(userId: string, desde: string): Promise<RepasoSemanal | null> {
  const rows = checked(await client().from('asistente_resumenes').select('datos').eq('user_id', userId).eq('tipo', 'semanal')
    .gte('fecha', desde).order('fecha', { ascending: false }).limit(1)) || [];
  return (rows[0]?.datos as RepasoSemanal) || null;
}

export async function cargarAvisos(userId: string): Promise<AvisoGuardado[]> {
  return checked(await client().from('asistente_avisos').select('*').eq('user_id', userId).eq('leido', false)
    .order('creado_en', { ascending: false }).limit(20)) || [];
}
export async function marcarAvisoLeido(userId: string, clave: string): Promise<void> {
  checked(await client().from('asistente_avisos').update({ leido: true }).eq('user_id', userId).eq('clave', clave));
}

export async function cargarCierre(userId: string, fecha: string): Promise<CierreGuardado | null> {
  return checked(await client().from('asistente_cierres').select('fecha, items, estado').eq('user_id', userId).eq('fecha', fecha).maybeSingle());
}

// Undo the nightly close, then save the week's plan again with the restored blocks
export async function deshacerCierre(fecha: string): Promise<void> {
  checked(await client().rpc('asistente_deshacer_cierre', { p_fecha: fecha }));
  await recalcularYGuardarSemana();
}

export async function recalcularYGuardarSemana(limites?: Record<string, number>): Promise<void> {
  const ahora = madridLocal(new Date());
  const data = await loadPlanner();
  const input = entradaSemana(data, ahora.slice(0, 10), ahora, limites);
  await savePlan(data, generatePlan(input), input.hasta, ahora);
  window.dispatchEvent(new Event(ASISTENTE_ACTUALIZADO));
}

export async function cargarEstadosBloques(userId: string, desde: string, hasta: string): Promise<Map<string, EstadoBloque>> {
  const rows = checked(await client().from('asistente_bloques_estado').select('bloque_id, estado').eq('user_id', userId)
    .gte('fecha', desde).lte('fecha', hasta)) || [];
  return new Map(rows.map((r: { bloque_id: string; estado: EstadoBloque }) => [r.bloque_id, r.estado]));
}
export async function marcarBloque(userId: string, bloqueId: string, fecha: string, estado: EstadoBloque | null): Promise<void> {
  if (estado === null) {
    checked(await client().from('asistente_bloques_estado').delete().eq('user_id', userId).eq('bloque_id', bloqueId));
    return;
  }
  checked(await client().from('asistente_bloques_estado').upsert({ user_id: userId, bloque_id: bloqueId, fecha, estado, actualizado_en: new Date().toISOString() },
    { onConflict: 'user_id,bloque_id' }));
}

export async function guardarPlanLigero(userId: string, fecha: string, valor: boolean): Promise<void> {
  checked(await client().from('checkins').update({ plan_ligero: valor }).eq('user_id', userId).eq('fecha', fecha));
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Inicia sesión para usar el asistente');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || (json.errores?.length ? json.errores.join('; ') : `Error ${res.status}`));
  return json as T;
}

export async function ejecutarTarea(tarea: 'cierre' | 'parte' | 'semanal' | 'estimar' | 'avisos') {
  return post<{ hechas: string[]; errores: string[] }>('/api/asistente/ejecutar', { tarea });
}

// ---- Push (N7) ----
export type EstadoPush = 'no_soportado' | 'requiere_instalar' | 'denegado' | 'activo' | 'inactivo';

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export async function estadoPush(): Promise<EstadoPush> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return esIOS() && !instalada() ? 'requiere_instalar' : 'no_soportado';
  }
  if (Notification.permission === 'denied') return 'denegado';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'activo' : 'inactivo';
}

function base64ToUint8(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

export async function activarPush(): Promise<void> {
  const { clave } = await (await fetch('/api/asistente/push/clave')).json().catch(() => ({ clave: null }));
  if (!clave) throw new Error('El servidor aún no tiene las claves VAPID configuradas');
  if (await Notification.requestPermission() !== 'granted') throw new Error('Has denegado el permiso de notificaciones');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8(clave) });
  await post('/api/asistente/push/suscribir', { suscripcion: sub.toJSON() });
  await post('/api/asistente/push/prueba', {}).catch(() => undefined);
}

export async function desactivarPush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await post('/api/asistente/push/baja', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}

// Number on the app icon: deliverables due within 48 h
export function actualizarBadge(n: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (n > 0) void nav.setAppBadge?.(n);
    else void nav.clearAppBadge?.();
  } catch {
    // Badging API not available
  }
}
