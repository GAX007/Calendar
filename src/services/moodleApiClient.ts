import {
  AsignaturaItem,
  EntregaItem,
  CambioItem,
  SyncLogItem,
  INITIAL_ASIGNATURAS,
  MoodleSyncPasos,
} from './moodleTypes';

export interface SyncApiResponse {
  ok: boolean;
  pasos?: MoodleSyncPasos;
  nuevos: number;
  actualizados: number;
  borrados: number;
  cambiosCount: number;
  error?: string | null;
  fecha: string;
}

async function moodleFetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const data = await response.clone().json().catch(() => null);
  if (!data || typeof data !== 'object' || typeof data.ok !== 'boolean') {
    throw new Error('El servidor de Moodle no está disponible. La web ha devuelto una página en lugar de datos; revisa el despliegue de las funciones de Netlify.');
  }
  if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status} al conectar con Moodle`);
  return response;
}

export function moodleSyncError(error?: string | null): string {
  if (error === 'url_no_configurada') return 'Falta conectar tu calendario. Obtén la URL en Moodle → Calendario → Exportar calendario y configúrala en el servidor.';
  if (error?.startsWith('contenido_invalido')) return 'Moodle no ha devuelto un calendario completo. Genera una nueva URL de exportación; el enlace de acceso al aula no sirve.';
  if (error === 'descarga_fallida') return 'No se pudo descargar el calendario. Comprueba que la URL de exportación de Moodle sigue siendo válida y vuelve a intentarlo.';
  if (error?.startsWith('supabase_desconectado')) return 'No se pueden guardar tus entregas. Revisa la conexión y las tablas de Supabase en el servidor.';
  return error || 'No se pudo completar la sincronización.';
}

export async function syncMoodleNow(): Promise<SyncApiResponse> {
  const response = await moodleFetch('/api/moodle/sync-now', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Error HTTP ${response.status} al sincronizar con Moodle`);
  }
  return data;
}

export async function fetchEntregas(options?: {
  includeOcultas?: boolean;
  asignatura?: string;
  estado?: string;
}): Promise<EntregaItem[]> {
  const params = new URLSearchParams();
  if (options?.includeOcultas) params.set('includeOcultas', 'true');
  if (options?.asignatura) params.set('asignatura', options.asignatura);
  if (options?.estado) params.set('estado', options.estado);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await moodleFetch(`/api/moodle/entregas${qs}`);
  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} al cargar entregas`);
  }
  const data = await response.json();
  return data.entregas || [];
}

export async function createManualEntregaApi(data: {
  titulo: string;
  asignatura_codigo: string;
  deadline_madrid: string;
  descripcion?: string;
}): Promise<EntregaItem> {
  const response = await moodleFetch('/api/moodle/entregas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Error al crear entrega manual`);
  }
  const res = await response.json();
  return res.entrega;
}

export async function updateEntregaApi(
  uid: string,
  fields: {
    estado?: string;
    dificultad?: number | null;
    horas_est?: number | null;
    horas_reales?: number | null;
    min_viable_min?: number | null;
  }
): Promise<EntregaItem> {
  const response = await moodleFetch(`/api/moodle/entregas/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Error al actualizar entrega`);
  }
  const res = await response.json();
  return res.entrega;
}

export async function fetchAsignaturasApi(): Promise<AsignaturaItem[]> {
  const response = await moodleFetch('/api/moodle/asignaturas');
  if (!response.ok) {
    return [...INITIAL_ASIGNATURAS];
  }
  const data = await response.json();
  return data.asignaturas || INITIAL_ASIGNATURAS;
}

export async function updateAsignaturaApi(
  codigo: string,
  fields: Partial<AsignaturaItem>
): Promise<AsignaturaItem> {
  const response = await moodleFetch(`/api/moodle/asignaturas/${encodeURIComponent(codigo)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!response.ok) {
    throw new Error(`Error al actualizar asignatura ${codigo}`);
  }
  const data = await response.json();
  return data.asignatura;
}

export async function fetchCambiosApi(onlyUnseen: boolean = false): Promise<CambioItem[]> {
  const response = await moodleFetch(`/api/moodle/cambios?onlyUnseen=${onlyUnseen}`);
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data.cambios || [];
}

export async function marcarCambiosVistosApi(): Promise<void> {
  await moodleFetch('/api/moodle/cambios/marcar-vistos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function fetchSyncLogsApi(limit: number = 10): Promise<SyncLogItem[]> {
  const response = await moodleFetch(`/api/moodle/sync-log?limit=${limit}`);
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data.logs || [];
}
