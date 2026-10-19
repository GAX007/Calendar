// Service-role client for the nightly assistant. Never import this from browser code.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isOwnerEmail } from '../../lib/cuenta';

let client: SupabaseClient | null = null;

const clean = (value?: string) => (value || '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();

export function clienteServicio(): SupabaseClient {
  if (client) return client;
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw new Error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables del servidor');
  const hasWebSocket = typeof (globalThis as any).WebSocket !== 'undefined';
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // REST only: avoid Realtime initialisation failures on older Netlify runtimes
    ...(hasWebSocket ? {} : { realtime: { transport: class { constructor() { throw new Error('Solo REST'); } } as any } }),
  });
  return client;
}

export function comprobar<T>(result: { data: T; error: { message: string } | null }, contexto: string): T {
  if (result.error) {
    if (/does not exist|schema cache|could not find/i.test(result.error.message)) {
      throw new Error(`${contexto}: falta ejecutar supabase/migration_fase4_asistente.sql (${result.error.message})`);
    }
    throw new Error(`${contexto}: ${result.error.message}`);
  }
  return result.data;
}

// Checking a token only needs the public key: used when the service key is not configured (local dev)
let verificador: SupabaseClient | null = null;
function clienteVerificador(): SupabaseClient {
  if (clean(process.env.SUPABASE_SERVICE_ROLE_KEY)) return clienteServicio();
  if (verificador) return verificador;
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
  const key = clean(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
  if (!url || !key) throw new Error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables del servidor');
  verificador = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return verificador;
}

// Resolves the user of a request from its Supabase access token
export async function usuarioDeToken(authorization?: string): Promise<{ id: string; email?: string } | null> {
  const token = (authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await clienteVerificador().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email };
}

// Moodle (MOODLE_ICS_URL) and the default university schedule belong to one account,
// MOODLE_OWNER_USER_ID. Without that variable nobody is the owner (fail closed).
export function propietarioMoodle(): string | null {
  return clean(process.env.MOODLE_OWNER_USER_ID) || null;
}

export function esPropietario(user: { id: string } | null | undefined): boolean {
  const owner = propietarioMoodle();
  return Boolean(owner && user && user.id === owner);
}

// The default university calendar: the owner id, or Xavier's verified account email
export function esCalendarioPropietario(user: { id: string; email?: string } | null | undefined): boolean {
  return Boolean(user && (esPropietario(user) || isOwnerEmail(user.email)));
}

export type AccesoMoodle = { tipo: 'anonimo' } | { tipo: 'ajeno'; userId: string } | { tipo: 'propietario'; userId: string };

// Who is asking for Moodle data: only the owner sees and edits it; other accounts get an empty Moodle
export async function accesoMoodle(authorization?: string): Promise<AccesoMoodle> {
  const user = await usuarioDeToken(authorization);
  if (!user) return { tipo: 'anonimo' };
  return esPropietario(user) ? { tipo: 'propietario', userId: user.id } : { tipo: 'ajeno', userId: user.id };
}

// Answer of the Moodle API to a request that may not see the owner's data:
// anonymous → 401, reads of another account → an empty Moodle, writes → 403
export function respuestaMoodleAjena(acceso: AccesoMoodle, method: string, ruta: string): { status: number; body: Record<string, unknown> } {
  if (acceso.tipo === 'anonimo') return { status: 401, body: { ok: false, error: 'Inicia sesión para ver tus entregas de Moodle' } };
  if (method.toUpperCase() === 'GET') {
    const r = ruta.replace(/\/+$/, '');
    if (r.endsWith('/entregas')) return { status: 200, body: { ok: true, entregas: [] } };
    if (r.endsWith('/asignaturas')) return { status: 200, body: { ok: true, asignaturas: [] } };
    if (r.endsWith('/cambios')) return { status: 200, body: { ok: true, cambios: [] } };
    if (r.endsWith('/sync-log')) return { status: 200, body: { ok: true, logs: [] } };
  }
  return { status: 403, body: { ok: false, error: 'Tu cuenta no tiene Moodle conectado' } };
}
