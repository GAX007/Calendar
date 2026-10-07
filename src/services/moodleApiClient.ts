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

export async function syncMoodleNow(): Promise<SyncApiResponse> {
  let response = await fetch('/api/moodle/sync-now', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.status === 404) {
    response = await fetch('/sync-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  }

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
  const response = await fetch(`/api/moodle/entregas${qs}`);
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
  const response = await fetch('/api/moodle/entregas', {
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
  const response = await fetch(`/api/moodle/entregas/${encodeURIComponent(uid)}`, {
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
  const response = await fetch('/api/moodle/asignaturas');
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
  const response = await fetch(`/api/moodle/asignaturas/${encodeURIComponent(codigo)}`, {
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
  const response = await fetch(`/api/moodle/cambios?onlyUnseen=${onlyUnseen}`);
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data.cambios || [];
}

export async function marcarCambiosVistosApi(): Promise<void> {
  await fetch('/api/moodle/cambios/marcar-vistos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function fetchSyncLogsApi(limit: number = 10): Promise<SyncLogItem[]> {
  const response = await fetch(`/api/moodle/sync-log?limit=${limit}`);
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return data.logs || [];
}
