// Service-role client for the nightly assistant. Never import this from browser code.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

// Resolves the user of a request from its Supabase access token
export async function usuarioDeToken(authorization?: string): Promise<{ id: string; email?: string } | null> {
  const token = (authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await clienteServicio().auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email };
}
