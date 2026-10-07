import fs from 'fs';
import path from 'path';
import os from 'os';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AsignaturaItem,
  EntregaItem,
  CambioItem,
  SyncLogItem,
  INITIAL_ASIGNATURAS,
} from './moodleTypes';

interface MoodleDataSchema {
  asignaturas: AsignaturaItem[];
  entregas: EntregaItem[];
  cambios: CambioItem[];
  sync_log: SyncLogItem[];
}

let supabaseClient: SupabaseClient | null = null;
let testData: MoodleDataSchema | null = null;
let supabaseInitError: string | null = null;

function sanitizeEnvValue(val?: string): string {
  if (!val) return '';
  return val
    .trim()
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
    .trim();
}

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;
  const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const rawKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    '';

  const url = sanitizeEnvValue(rawUrl);
  const key = sanitizeEnvValue(rawKey);

  if (!url) {
    supabaseInitError = 'URL de Supabase no encontrada en variables de entorno';
    return null;
  }
  if (!key) {
    supabaseInitError = 'Clave de Supabase no encontrada en variables de entorno';
    return null;
  }
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    supabaseInitError = `URL de Supabase inválida: "${url.substring(0, 15)}" (debe empezar por https://)`;
    return null;
  }
  if (url.includes('tu-proyecto') || url.includes('YOUR_SUPABASE_URL')) {
    supabaseInitError = 'La URL de Supabase contiene el placeholder por defecto';
    return null;
  }

  try {
    const isWebSocketAvailable =
      typeof globalThis !== 'undefined' && typeof (globalThis as any).WebSocket !== 'undefined';
    const realtimeConfig = isWebSocketAvailable
      ? undefined
      : {
          // Este cliente solo usa REST. Evita que la inicialización de Realtime
          // rompa las funciones antiguas de Netlify antes de realizar una consulta.
          transport: class RestOnlyWebSocket {
            constructor() { throw new Error('Este cliente de Moodle solo admite consultas REST.'); }
          } as any,
        };

    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      ...(realtimeConfig ? { realtime: realtimeConfig } : {}),
    });
    supabaseInitError = null;
    return supabaseClient;
  } catch (err: any) {
    supabaseInitError = `Error en createClient: ${err?.message || err}`;
    console.error('[MoodleStore] Error instanciando createClient:', supabaseInitError);
    return null;
  }
}

// Local store file path (safe across restarts in Node / Netlify dev / serverless)
const isServerless = Boolean(
  process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT
);
const LOCAL_STORE_DIR = isServerless ? os.tmpdir() : path.resolve(process.cwd(), 'data');
const LOCAL_STORE_FILE = path.resolve(LOCAL_STORE_DIR, 'moodle_store.json');

function readLocalData(): MoodleDataSchema {
  if (testData) return structuredClone(testData);
  if (isServerless) throw new Error('Supabase no está disponible. Netlify requiere almacenamiento persistente.');
  try {
    if (!fs.existsSync(LOCAL_STORE_DIR)) {
      fs.mkdirSync(LOCAL_STORE_DIR, { recursive: true });
    }
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const content = fs.readFileSync(LOCAL_STORE_FILE, 'utf8');
      const data = JSON.parse(content);
      return {
        asignaturas: Array.isArray(data.asignaturas) && data.asignaturas.length > 0 ? data.asignaturas : [...INITIAL_ASIGNATURAS],
        entregas: Array.isArray(data.entregas) ? data.entregas : [],
        cambios: Array.isArray(data.cambios) ? data.cambios : [],
        sync_log: Array.isArray(data.sync_log) ? data.sync_log : [],
      };
    }
  } catch (err) {
    console.warn('[MoodleStore] Error reading local data:', err);
  }
  return {
    asignaturas: [...INITIAL_ASIGNATURAS],
    entregas: [],
    cambios: [],
    sync_log: [],
  };
}

function writeLocalData(data: MoodleDataSchema): void {
  if (testData) { testData = structuredClone(data); return; }
  if (isServerless) throw new Error('No se pueden guardar entregas en almacenamiento temporal de Netlify.');
  try {
    if (!fs.existsSync(LOCAL_STORE_DIR)) {
      fs.mkdirSync(LOCAL_STORE_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    throw new Error('No se pudieron guardar las entregas en el almacenamiento local.');
  }
}

export interface SupabaseDiagnostics {
  conectado: boolean;
  tiene_url: boolean;
  origen_url: string;
  tiene_key: boolean;
  tipo_key: string;
  error: string | null;
}

export async function getSupabaseDiagnostics(): Promise<SupabaseDiagnostics> {
  if (testData) return { conectado: false, tiene_url: false, origen_url: 'pruebas', tiene_key: false, tipo_key: 'ninguno', error: null };
  const urlSource = process.env.SUPABASE_URL
    ? 'SUPABASE_URL'
    : process.env.VITE_SUPABASE_URL
    ? 'VITE_SUPABASE_URL'
    : 'ninguno';
  const url = sanitizeEnvValue(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');

  let keyType = 'ninguno';
  let rawKey = '';
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    keyType = 'service_role';
    rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else if (process.env.SUPABASE_ANON_KEY) {
    keyType = 'anon';
    rawKey = process.env.SUPABASE_ANON_KEY;
  } else if (process.env.VITE_SUPABASE_ANON_KEY) {
    keyType = 'anon';
    rawKey = process.env.VITE_SUPABASE_ANON_KEY;
  }
  const key = sanitizeEnvValue(rawKey);

  if (!url || !key) {
    return {
      conectado: false,
      tiene_url: Boolean(url),
      origen_url: urlSource,
      tiene_key: Boolean(key),
      tipo_key: keyType,
      error: !url ? 'Falta SUPABASE_URL / VITE_SUPABASE_URL en servidor' : 'Falta SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY',
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      conectado: false,
      tiene_url: true,
      origen_url: urlSource,
      tiene_key: true,
      tipo_key: keyType,
      error: supabaseInitError || 'No se pudo instanciar createClient con las credenciales',
    };
  }

  try {
    const checks = await Promise.all(['asignaturas', 'entregas', 'cambios', 'sync_log'].map(async (table) => {
      const { error } = await client.from(table).select('*').limit(0);
      return error ? `${table}: ${error.message}` : null;
    }));
    if (checks.some(Boolean)) {
      return {
        conectado: false,
        tiene_url: true,
        origen_url: urlSource,
        tiene_key: true,
        tipo_key: keyType,
        error: checks.filter(Boolean).join('; '),
      };
    }
    return {
      conectado: true,
      tiene_url: true,
      origen_url: urlSource,
      tiene_key: true,
      tipo_key: keyType,
      error: null,
    };
  } catch (err: any) {
    return {
      conectado: false,
      tiene_url: true,
      origen_url: urlSource,
      tiene_key: true,
      tipo_key: keyType,
      error: err?.message || 'Error de conexión a Supabase',
    };
  }
}

/**
 * Check whether Supabase tables are ready and accessible
 */
async function canUseSupabase(): Promise<boolean> {
  if (testData) return false;
  if (getSupabaseClient()) return true;
  if (isServerless || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) {
    throw new Error(supabaseInitError || 'Supabase no está configurado en el servidor');
  }
  return false;
}

export class MoodleStore {
  // -------------------------------------------------------------
  // ASIGNATURAS
  // -------------------------------------------------------------
  static async getAsignaturas(): Promise<AsignaturaItem[]> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const { data, error } = await client.from('asignaturas').select('*').order('codigo');
      if (error) throw new Error(`No se pudieron cargar asignaturas: ${error.message}`);
      return (data || []) as AsignaturaItem[];
    }
    const local = readLocalData();
    return local.asignaturas;
  }

  static async updateAsignatura(codigo: string, fields: Partial<AsignaturaItem>): Promise<AsignaturaItem | null> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const { data, error } = await client
        .from('asignaturas')
        .update(fields)
        .eq('codigo', codigo)
        .select()
        .single();
      if (error) throw new Error(`No se pudo actualizar la asignatura: ${error.message}`);
      if (!error && data) {
        return data as AsignaturaItem;
      }
    }
    const local = readLocalData();
    const idx = local.asignaturas.findIndex((a) => a.codigo === codigo);
    if (idx !== -1) {
      local.asignaturas[idx] = { ...local.asignaturas[idx], ...fields };
      writeLocalData(local);
      return local.asignaturas[idx];
    }
    return null;
  }

  static async ensureInitialAsignaturas(codigos: string[] = []): Promise<void> {
    const seeds = [...INITIAL_ASIGNATURAS];
    for (const codigo of new Set(codigos)) {
      if (!seeds.some(a => a.codigo === codigo)) seeds.push({ codigo, nombre: codigo, cuatrimestre: null, activa: true });
    }
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const { error } = await client.from('asignaturas').upsert(seeds, { onConflict: 'codigo', ignoreDuplicates: true });
      if (error) throw new Error(`No se pudieron preparar las asignaturas: ${error.message}`);
      return;
    }
    const local = readLocalData();
    let changed = false;
    for (const initAsig of seeds) {
      if (!local.asignaturas.some((a) => a.codigo === initAsig.codigo)) {
        local.asignaturas.push(initAsig);
        changed = true;
      }
    }
    if (changed) {
      writeLocalData(local);
    }
  }

  // -------------------------------------------------------------
  // ENTREGAS
  // -------------------------------------------------------------
  static async getEntregas(options?: {
    includeOcultas?: boolean;
    asignatura?: string;
    estado?: string;
  }): Promise<EntregaItem[]> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      let query = client.from('entregas').select('*').order('deadline_utc', { ascending: true });
      if (!options?.includeOcultas) {
        query = query.eq('oculta_por_grupo', false);
      }
      if (options?.asignatura) {
        query = query.eq('asignatura_codigo', options.asignatura);
      }
      if (options?.estado) {
        query = query.eq('estado', options.estado);
      }
      const { data, error } = await query;
      if (error) throw new Error(`No se pudieron cargar entregas: ${error.message}`);
      if (!error && data) {
        return data as EntregaItem[];
      }
    }

    const local = readLocalData();
    let result = [...local.entregas];
    if (!options?.includeOcultas) {
      result = result.filter((e) => !e.oculta_por_grupo);
    }
    if (options?.asignatura) {
      result = result.filter((e) => e.asignatura_codigo === options.asignatura);
    }
    if (options?.estado) {
      result = result.filter((e) => e.estado === options.estado);
    }
    result.sort((a, b) => new Date(a.deadline_utc).getTime() - new Date(b.deadline_utc).getTime());
    return result;
  }

  static async getAllEntregasRaw(): Promise<EntregaItem[]> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const { data, error } = await client.from('entregas').select('*');
      if (error) throw new Error(`No se pudieron cargar entregas: ${error.message}`);
      if (!error && data) {
        return data as EntregaItem[];
      }
    }
    const local = readLocalData();
    return local.entregas;
  }

  static async getEntrega(uid: string): Promise<EntregaItem | null> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const { data, error } = await client.from('entregas').select('*').eq('uid', uid).maybeSingle();
      if (error) throw new Error(`No se pudo cargar la entrega: ${error.message}`);
      return data as EntregaItem | null;
    }
    const local = readLocalData();
    return local.entregas.find((e) => e.uid === uid) || null;
  }

  static async upsertEntrega(entrega: EntregaItem): Promise<EntregaItem> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const { error } = await client.from('entregas').upsert(entrega, { onConflict: 'uid' });
      if (error) {
        console.error('[MoodleStore] Error en upsertEntrega en Supabase:', error.message);
        throw new Error(`Error en Supabase al guardar entrega ${entrega.uid}: ${error.message}`);
      }
      return entrega;
    }
    const local = readLocalData();
    const idx = local.entregas.findIndex((e) => e.uid === entrega.uid);
    if (idx !== -1) {
      local.entregas[idx] = { ...local.entregas[idx], ...entrega };
    } else {
      local.entregas.push(entrega);
    }
    writeLocalData(local);
    return entrega;
  }

  static async updateEntrega(uid: string, fields: Partial<EntregaItem>): Promise<EntregaItem | null> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const { data, error } = await client
        .from('entregas')
        .update(fields)
        .eq('uid', uid)
        .select()
        .single();
      if (error) {
        throw new Error(`No se pudo actualizar la entrega: ${error.message}`);
      } else if (data) {
        return data as EntregaItem;
      }
    }
    const local = readLocalData();
    const idx = local.entregas.findIndex((e) => e.uid === uid);
    if (idx !== -1) {
      local.entregas[idx] = { ...local.entregas[idx], ...fields };
      writeLocalData(local);
      return local.entregas[idx];
    }
    return null;
  }

  // -------------------------------------------------------------
  // CAMBIOS
  // -------------------------------------------------------------
  static async getCambios(onlyUnseen: boolean = false): Promise<CambioItem[]> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      let query = client.from('cambios').select('*').order('fecha', { ascending: false });
      if (onlyUnseen) {
        query = query.eq('visto', false);
      }
      const { data, error } = await query;
      if (error) throw new Error(`No se pudieron cargar cambios: ${error.message}`);
      if (!error && data) return data as CambioItem[];
    }
    const local = readLocalData();
    let result = [...local.cambios];
    if (onlyUnseen) {
      result = result.filter((c) => !c.visto);
    }
    result.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    return result;
  }

  static async insertCambios(cambios: CambioItem[]): Promise<void> {
    if (cambios.length === 0) return;
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const { error } = await client.from('cambios').insert(cambios);
      if (error) {
        throw new Error(`No se pudieron guardar cambios: ${error.message}`);
      }
      return;
    }
    const local = readLocalData();
    local.cambios.unshift(...cambios);
    writeLocalData(local);
  }

  static async marcarCambiosVistos(): Promise<void> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const { error } = await client.from('cambios').update({ visto: true }).eq('visto', false);
      if (error) throw new Error(`No se pudieron marcar los cambios: ${error.message}`);
      return;
    }
    const local = readLocalData();
    local.cambios = local.cambios.map((c) => ({ ...c, visto: true }));
    writeLocalData(local);
  }

  // -------------------------------------------------------------
  // SYNC LOG
  // -------------------------------------------------------------
  static async getSyncLogs(limit: number = 20): Promise<SyncLogItem[]> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const { data, error } = await client
        .from('sync_log')
        .select('*')
        .order('fecha', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`No se pudo cargar el historial: ${error.message}`);
      if (!error && data) return data as SyncLogItem[];
    }
    const local = readLocalData();
    const sorted = [...local.sync_log].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );
    return sorted.slice(0, limit);
  }

  static async insertSyncLog(log: SyncLogItem & { detalles?: any }): Promise<void> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const payload: any = { ...log };
      const { error } = await client.from('sync_log').insert(payload);
      if (error) {
        console.warn('[MoodleStore] Error insertando sync_log en Supabase:', error.message);
        // Si falló por falta de la columna opcional 'detalles', reintentar sin ella
        if (payload.detalles && error.message.includes('detalles')) {
          delete payload.detalles;
          try {
            await client.from('sync_log').insert(payload);
          } catch {
            // ignore fallback error
          }
        }
      }
      return;
    }
    const local = readLocalData();
    local.sync_log.unshift(log);
    if (local.sync_log.length > 100) {
      local.sync_log = local.sync_log.slice(0, 100);
    }
    writeLocalData(local);
  }

  // Reset helper for isolated test executions
  static _resetLocalStoreForTesting(): void {
    const fresh: MoodleDataSchema = {
      asignaturas: [...INITIAL_ASIGNATURAS],
      entregas: [],
      cambios: [],
      sync_log: [],
    };
    testData = fresh;
  }
}
