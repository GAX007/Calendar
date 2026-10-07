import https from 'https';
import http from 'http';
import { parseMoodleICS, formatToMadridTime } from '../utils/moodleIcsParser';
import { MoodleStore } from './moodleStore';
import {
  EntregaItem,
  CambioItem,
  SyncLogItem,
  EntregaEstado,
  MIS_GRUPOS_CONFIG,
  DEFAULT_MIS_GRUPOS,
} from './moodleTypes';

export interface SyncResult {
  ok: boolean;
  nuevos: number;
  actualizados: number;
  borrados: number;
  cambiosCount: number;
  error?: string;
  fecha: string;
}

/**
 * Sanitizar mensajes de error para nunca filtrar el token ni la URL completa de Moodle
 */
function sanitizeErrorMessage(error: any): string {
  const raw = error?.message || (typeof error === 'string' ? error : 'Error desconocido de sincronización');
  return raw
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL_PROTEGIDA]')
    .replace(/authtoken=[a-zA-Z0-9_-]+/gi, 'authtoken=[REDACTED]')
    .replace(/token=[a-zA-Z0-9_-]+/gi, 'token=[REDACTED]');
}

/**
 * Descarga el contenido de una URL sin imprimir nunca los parámetros en consola
 */
function fetchUrlContent(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        return reject(new Error(`HTTP ${res.statusCode} al descargar el feed de calendario`));
      }
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve(body));
    });

    req.on('error', (err) => {
      reject(new Error(`Fallo de conexión de red: ${err.message}`));
    });

    req.setTimeout(25000, () => {
      req.destroy();
      reject(new Error('Tiempo de espera agotado (timeout) descargando feed'));
    });
  });
}

/**
 * Función principal de sincronización de entregas de Moodle.
 * Cumple con todas las reglas de la Fase 1:
 * - Upsert por UID
 * - Respeta campos propios (estado, dificultad, horas_est, horas_reales, min_viable_min)
 * - borrada_en_moodle = true si desaparece del feed
 * - Detección y registro en tabla 'cambios' si cambia deadline_utc o título
 * - sync_log en éxito o fallo
 */
export async function syncMoodleDeliverables(options?: {
  icsContentOverride?: string;
  misGrupos?: MIS_GRUPOS_CONFIG;
}): Promise<SyncResult> {
  const syncDate = new Date().toISOString();
  const misGrupos = options?.misGrupos || DEFAULT_MIS_GRUPOS;

  try {
    let icsContent = options?.icsContentOverride;

    if (!icsContent) {
      const moodleUrl = (process.env.MOODLE_ICS_URL || '').trim();
      if (!moodleUrl) {
        throw new Error('La variable de entorno MOODLE_ICS_URL no está configurada en el servidor');
      }
      icsContent = await fetchUrlContent(moodleUrl);
    }

    if (!icsContent || !icsContent.includes('BEGIN:VCALENDAR')) {
      throw new Error('El contenido recibido no es un feed válido de iCalendar (ICS)');
    }

    // Parsear eventos usando las reglas auditadas
    const parsedEvents = parseMoodleICS(icsContent, misGrupos);

    // Asegurar asignaturas iniciales
    await MoodleStore.ensureInitialAsignaturas();

    // Obtener entregas existentes
    const existingEntregas = await MoodleStore.getAllEntregasRaw();
    const existingMap = new Map<string, EntregaItem>(existingEntregas.map((e) => [e.uid, e]));

    let nuevos = 0;
    let actualizados = 0;
    let borrados = 0;
    const nuevosCambios: CambioItem[] = [];

    const feedUids = new Set<string>();

    for (const event of parsedEvents) {
      feedUids.add(event.uid);
      const existing = existingMap.get(event.uid);

      if (existing) {
        // Comprobar si cambió deadline_utc o título
        let hasChanges = false;

        if (existing.deadline_utc !== event.deadline_utc) {
          nuevosCambios.push({
            id: `cambio-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            uid: event.uid,
            campo: 'deadline_utc',
            antes: existing.deadline_utc,
            despues: event.deadline_utc,
            fecha: syncDate,
            visto: false,
          });
          hasChanges = true;
        }

        if (existing.titulo !== event.titulo) {
          nuevosCambios.push({
            id: `cambio-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            uid: event.uid,
            campo: 'titulo',
            antes: existing.titulo,
            despues: event.titulo,
            fecha: syncDate,
            visto: false,
          });
          hasChanges = true;
        }

        // Si cambió algún campo de Moodle
        const moodleChanged =
          hasChanges ||
          existing.borrada_en_moodle ||
          existing.titulo_raw !== event.titulo_raw ||
          existing.tipo !== event.tipo ||
          existing.grupo !== event.grupo ||
          existing.oculta_por_grupo !== event.oculta_por_grupo ||
          existing.descripcion !== event.descripcion ||
          existing.moodle_modificado_utc !== event.moodle_modificado_utc;

        if (moodleChanged) {
          // REGLA 3: Los campos propios nunca se pisan en la sincronización
          const merged: EntregaItem = {
            ...existing,
            asignatura_codigo: event.asignatura_codigo,
            titulo_raw: event.titulo_raw,
            titulo: event.titulo,
            tipo: event.tipo,
            grupo: event.grupo,
            oculta_por_grupo: event.oculta_por_grupo,
            deadline_utc: event.deadline_utc,
            descripcion: event.descripcion,
            moodle_modificado_utc: event.moodle_modificado_utc,
            borrada_en_moodle: false,
            // Campos propios preservados intactos:
            estado: existing.estado,
            dificultad: existing.dificultad,
            horas_est: existing.horas_est,
            horas_reales: existing.horas_reales,
            min_viable_min: existing.min_viable_min,
            grupo_confirmado: existing.grupo_confirmado,
          };

          await MoodleStore.upsertEntrega(merged);
          actualizados++;
        }
      } else {
        // Nueva entrega no existente
        const nueva: EntregaItem = {
          uid: event.uid,
          asignatura_codigo: event.asignatura_codigo,
          titulo_raw: event.titulo_raw,
          titulo: event.titulo,
          tipo: event.tipo,
          grupo: event.grupo,
          oculta_por_grupo: event.oculta_por_grupo,
          deadline_utc: event.deadline_utc,
          descripcion: event.descripcion,
          moodle_modificado_utc: event.moodle_modificado_utc,
          borrada_en_moodle: false,
          estado: 'pendiente',
          dificultad: null,
          horas_est: null,
          horas_reales: null,
          min_viable_min: null,
          grupo_confirmado: false,
        };

        await MoodleStore.upsertEntrega(nueva);
        nuevos++;
      }
    }

    // REGLA 4: Si un uid deja de aparecer en el feed: borrada_en_moodle = true. No se elimina la fila.
    // (No aplica a entregas manuales creadas en la app, prefijo manual-)
    for (const existing of existingEntregas) {
      if (!existing.uid.startsWith('manual-') && !feedUids.has(existing.uid) && !existing.borrada_en_moodle) {
        await MoodleStore.updateEntrega(existing.uid, { borrada_en_moodle: true });
        borrados++;
      }
    }

    // Guardar los cambios detectados en la tabla 'cambios'
    if (nuevosCambios.length > 0) {
      await MoodleStore.insertCambios(nuevosCambios);
    }

    // Guardar en 'sync_log'
    const logItem: SyncLogItem = {
      id: `sync-${Date.now()}`,
      fecha: syncDate,
      ok: true,
      nuevos,
      actualizados,
      borrados,
      error: null,
    };
    await MoodleStore.insertSyncLog(logItem);

    return {
      ok: true,
      nuevos,
      actualizados,
      borrados,
      cambiosCount: nuevosCambios.length,
      fecha: syncDate,
    };
  } catch (err: any) {
    const sanitizedError = sanitizeErrorMessage(err);
    console.error('[MoodleSync] Sincronización fallida:', sanitizedError);

    // REGLA 6: Una sincronización fallida no borra ni modifica nada. Guarda el error y la hora en sync_log.
    const failureLog: SyncLogItem = {
      id: `sync-${Date.now()}`,
      fecha: syncDate,
      ok: false,
      nuevos: 0,
      actualizados: 0,
      borrados: 0,
      error: sanitizedError,
    };
    await MoodleStore.insertSyncLog(failureLog);

    return {
      ok: false,
      nuevos: 0,
      actualizados: 0,
      borrados: 0,
      cambiosCount: 0,
      error: sanitizedError,
      fecha: syncDate,
    };
  }
}

/**
 * Crear una entrega manual
 */
export async function createManualEntrega(data: {
  titulo: string;
  asignatura_codigo: string;
  deadline_madrid: string; // ISO o "YYYY-MM-DDTHH:mm"
  descripcion?: string;
}): Promise<EntregaItem> {
  const uid = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  // Convertir fecha de Madrid a UTC
  const inputDate = new Date(data.deadline_madrid);
  const deadlineUtc = !isNaN(inputDate.getTime()) ? inputDate.toISOString() : new Date().toISOString();

  const nueva: EntregaItem = {
    uid,
    asignatura_codigo: data.asignatura_codigo,
    titulo_raw: data.titulo.trim(),
    titulo: data.titulo.trim(),
    tipo: 'entrega',
    grupo: null,
    oculta_por_grupo: false,
    deadline_utc: deadlineUtc,
    descripcion: data.descripcion?.trim() || '',
    moodle_modificado_utc: null,
    borrada_en_moodle: false,
    estado: 'pendiente',
    dificultad: null,
    horas_est: null,
    horas_reales: null,
    min_viable_min: null,
    grupo_confirmado: false,
  };

  return await MoodleStore.upsertEntrega(nueva);
}

/**
 * Modificar campos propios de una entrega
 */
export async function updateEntregaUserFields(
  uid: string,
  fields: {
    estado?: EntregaEstado;
    dificultad?: number | null;
    horas_est?: number | null;
    horas_reales?: number | null;
    min_viable_min?: number | null;
  }
): Promise<EntregaItem | null> {
  return await MoodleStore.updateEntrega(uid, fields);
}
