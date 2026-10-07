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
let supabaseTablesExist: boolean | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (url && key && url.startsWith('https://') && !url.includes('tu-proyecto') && !url.includes('YOUR_SUPABASE_URL')) {
    try {
      supabaseClient = createClient(url, key);
      return supabaseClient;
    } catch {
      return null;
    }
  }
  return null;
}

// Local store file path (safe across restarts in Node / Netlify dev / serverless)
const isServerless = Boolean(
  process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT
);
const LOCAL_STORE_DIR = isServerless ? os.tmpdir() : path.resolve(process.cwd(), 'data');
const LOCAL_STORE_FILE = path.resolve(LOCAL_STORE_DIR, 'moodle_store.json');

function readLocalData(): MoodleDataSchema {
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
  try {
    if (!fs.existsSync(LOCAL_STORE_DIR)) {
      fs.mkdirSync(LOCAL_STORE_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[MoodleStore] Error writing local data:', err);
  }
}

/**
 * Check whether Supabase tables are ready and accessible
 */
async function canUseSupabase(): Promise<boolean> {
  if (supabaseTablesExist !== null) return supabaseTablesExist;
  const client = getSupabaseClient();
  if (!client) {
    supabaseTablesExist = false;
    return false;
  }
  try {
    const { error } = await client.from('entregas').select('uid').limit(1);
    if (error) {
      supabaseTablesExist = false;
      return false;
    }
    supabaseTablesExist = true;
    return true;
  } catch {
    supabaseTablesExist = false;
    return false;
  }
}

export class MoodleStore {
  // -------------------------------------------------------------
  // ASIGNATURAS
  // -------------------------------------------------------------
  static async getAsignaturas(): Promise<AsignaturaItem[]> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      const { data, error } = await client.from('asignaturas').select('*').order('codigo');
      if (!error && data && data.length > 0) {
        return data as AsignaturaItem[];
      }
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

  static async ensureInitialAsignaturas(): Promise<void> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      for (const asig of INITIAL_ASIGNATURAS) {
        await client.from('asignaturas').upsert(asig, { onConflict: 'codigo' });
      }
    }
    const local = readLocalData();
    let changed = false;
    for (const initAsig of INITIAL_ASIGNATURAS) {
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
      const { data, error } = await client.from('entregas').select('*').eq('uid', uid).single();
      if (!error && data) return data as EntregaItem;
    }
    const local = readLocalData();
    return local.entregas.find((e) => e.uid === uid) || null;
  }

  static async upsertEntrega(entrega: EntregaItem): Promise<EntregaItem> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      await client.from('entregas').upsert(entrega, { onConflict: 'uid' });
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
      if (!error && data) return data as EntregaItem;
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
      await client.from('cambios').insert(cambios);
    }
    const local = readLocalData();
    local.cambios.unshift(...cambios);
    writeLocalData(local);
  }

  static async marcarCambiosVistos(): Promise<void> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      await client.from('cambios').update({ visto: true }).eq('visto', false);
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
      if (!error && data) return data as SyncLogItem[];
    }
    const local = readLocalData();
    const sorted = [...local.sync_log].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );
    return sorted.slice(0, limit);
  }

  static async insertSyncLog(log: SyncLogItem): Promise<void> {
    if (await canUseSupabase()) {
      const client = getSupabaseClient()!;
      await client.from('sync_log').insert(log);
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
    writeLocalData(fresh);
    supabaseTablesExist = false;
  }
}
