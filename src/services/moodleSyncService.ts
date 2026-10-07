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
  MoodleSyncPasos,
} from './moodleTypes';

export type { MoodleSyncPasos };

export interface SyncResult {
  ok: boolean;
  pasos: MoodleSyncPasos;
  error: string | null;
  nuevos: number;
  actualizados: number;
  borrados: number;
  cambiosCount: number;
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

interface FetchResult {
  statusCode: number;
  body: string;
  bytes: number;
}

/**
 * Descarga el contenido de una URL con soporte de redirecciones sin imprimir nunca parámetros en consola
 */
function fetchUrlContent(urlStr: string, maxRedirects = 3): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const execute = (currentUrl: string, redirectsLeft: number) => {
      try {
        const parsed = new URL(currentUrl);
        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.get(currentUrl, (res) => {
          const status = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
            const redirectUrl = new URL(res.headers.location, currentUrl).toString();
            return execute(redirectUrl, redirectsLeft - 1);
          }

          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            const bytes = Buffer.byteLength(body, 'utf8');
            resolve({ statusCode: status, body, bytes });
          });
        });

        req.on('error', (err) => {
          reject(new Error(`Fallo de conexión de red: ${err.message}`));
        });

        req.setTimeout(25000, () => {
          req.destroy();
          reject(new Error('Tiempo de espera agotado (timeout) descargando feed'));
        });
      } catch (e: any) {
        reject(new Error(`URL no válida: ${e.message}`));
      }
    };

    execute(urlStr, maxRedirects);
  });
}

/**
 * Función principal de sincronización de entregas de Moodle.
 * Cumple con todas las reglas de la Fase 1 y diagnóstico estructurado de Paso 3:
 * - Upsert por UID
 * - Respeta campos propios (estado, dificultad, horas_est, horas_reales, min_viable_min)
 * - borrada_en_moodle = true si desaparece del feed
 * - Detección y registro en tabla 'cambios' si cambia deadline_utc o título
 * - sync_log en éxito o fallo con detalle de pasos
 */
export async function syncMoodleDeliverables(options?: {
  icsContentOverride?: string;
  misGrupos?: MIS_GRUPOS_CONFIG;
}): Promise<SyncResult> {
  const syncDate = new Date().toISOString();
  const misGrupos = options?.misGrupos || DEFAULT_MIS_GRUPOS;

  const pasos: MoodleSyncPasos = {
    url_configurada: false,
    descarga: {
      bytes: 0,
      empieza_por_vcalendar: false,
    },
    eventos_parseados: 0,
    ocultos_por_grupo: 0,
    upsert: {
      nuevos: 0,
      actualizados: 0,
      errores: 0,
    },
  };

  try {
    let icsContent = options?.icsContentOverride;

    if (!icsContent) {
      const moodleUrl = (process.env.MOODLE_ICS_URL || '').trim();
      if (!moodleUrl) {
        pasos.url_configurada = false;
        const failureLog: SyncLogItem = {
          id: `sync-${Date.now()}`,
          fecha: syncDate,
          ok: false,
          nuevos: 0,
          actualizados: 0,
          borrados: 0,
          error: 'url_no_configurada',
        };
        await MoodleStore.insertSyncLog({ ...failureLog, detalles: pasos });
        return {
          ok: false,
          error: 'url_no_configurada',
          pasos,
          nuevos: 0,
          actualizados: 0,
          borrados: 0,
          cambiosCount: 0,
          fecha: syncDate,
        };
      }

      pasos.url_configurada = true;

      // Descarga segura del feed
      let downloadResult: FetchResult;
      try {
        downloadResult = await fetchUrlContent(moodleUrl);
      } catch (networkErr: any) {
        pasos.descarga = {
          bytes: 0,
          empieza_por_vcalendar: false,
        };
        const errorMsg = 'descarga_fallida';
        const failureLog: SyncLogItem = {
          id: `sync-${Date.now()}`,
          fecha: syncDate,
          ok: false,
          nuevos: 0,
          actualizados: 0,
          borrados: 0,
          error: `${errorMsg}: ${sanitizeErrorMessage(networkErr)}`,
        };
        await MoodleStore.insertSyncLog({ ...failureLog, detalles: pasos });
        return {
          ok: false,
          error: errorMsg,
          pasos,
          nuevos: 0,
          actualizados: 0,
          borrados: 0,
          cambiosCount: 0,
          fecha: syncDate,
        };
      }

      pasos.descarga.estado_http = downloadResult.statusCode;
      pasos.descarga.bytes = downloadResult.bytes;

      if (downloadResult.statusCode < 200 || downloadResult.statusCode >= 300) {
        pasos.descarga.empieza_por_vcalendar = false;
        const errorMsg = 'descarga_fallida';
        const failureLog: SyncLogItem = {
          id: `sync-${Date.now()}`,
          fecha: syncDate,
          ok: false,
          nuevos: 0,
          actualizados: 0,
          borrados: 0,
          error: `${errorMsg} (HTTP ${downloadResult.statusCode})`,
        };
        await MoodleStore.insertSyncLog({ ...failureLog, detalles: pasos });
        return {
          ok: false,
          error: errorMsg,
          pasos,
          nuevos: 0,
          actualizados: 0,
          borrados: 0,
          cambiosCount: 0,
          fecha: syncDate,
        };
      }

      icsContent = downloadResult.body;
      const startsWithVcal = icsContent.trim().startsWith('BEGIN:VCALENDAR') || icsContent.includes('BEGIN:VCALENDAR');
      pasos.descarga.empieza_por_vcalendar = startsWithVcal;

      if (!startsWithVcal) {
        const errorMsg = 'contenido_invalido';
        const failureLog: SyncLogItem = {
          id: `sync-${Date.now()}`,
          fecha: syncDate,
          ok: false,
          nuevos: 0,
          actualizados: 0,
          borrados: 0,
          error: errorMsg,
        };
        await MoodleStore.insertSyncLog({ ...failureLog, detalles: pasos });
        return {
          ok: false,
          error: errorMsg,
          pasos,
          nuevos: 0,
          actualizados: 0,
          borrados: 0,
          cambiosCount: 0,
          fecha: syncDate,
        };
      }
    } else {
      // Viene de fixture / test override
      pasos.url_configurada = true;
      pasos.descarga = {
        estado_http: 200,
        bytes: Buffer.byteLength(icsContent, 'utf8'),
        empieza_por_vcalendar: icsContent.trim().startsWith('BEGIN:VCALENDAR') || icsContent.includes('BEGIN:VCALENDAR'),
      };
    }

    // Parsear eventos usando las reglas auditadas
    const parsedEvents = parseMoodleICS(icsContent, misGrupos);
    pasos.eventos_parseados = parsedEvents.length;
    pasos.ocultos_por_grupo = parsedEvents.filter((e) => e.oculta_por_grupo).length;

    // Asegurar asignaturas iniciales
    await MoodleStore.ensureInitialAsignaturas();

    // Obtener entregas existentes
    const existingEntregas = await MoodleStore.getAllEntregasRaw();
    const existingMap = new Map<string, EntregaItem>(existingEntregas.map((e) => [e.uid, e]));

    let nuevos = 0;
    let actualizados = 0;
    let borrados = 0;
    let upsertErrores = 0;
    const nuevosCambios: CambioItem[] = [];

    const feedUids = new Set<string>();

    for (const event of parsedEvents) {
      feedUids.add(event.uid);
      const existing = existingMap.get(event.uid);

      try {
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
      } catch (itemErr: any) {
        console.error(`[MoodleSync] Error en upsert de ${event.uid}:`, itemErr.message);
        upsertErrores++;
      }
    }

    pasos.upsert = {
      nuevos,
      actualizados,
      errores: upsertErrores,
    };

    // REGLA 4: Si un uid deja de aparecer en el feed: borrada_en_moodle = true. No se elimina la fila.
    // (No aplica a entregas manuales creadas en la app, prefijo manual-)
    for (const existing of existingEntregas) {
      if (!existing.uid.startsWith('manual-') && !feedUids.has(existing.uid) && !existing.borrada_en_moodle) {
        try {
          await MoodleStore.updateEntrega(existing.uid, { borrada_en_moodle: true });
          borrados++;
        } catch (err: any) {
          console.error(`[MoodleSync] Error marcando borrada ${existing.uid}:`, err.message);
        }
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
      error: upsertErrores > 0 ? `${upsertErrores} errores en upsert` : null,
    };
    await MoodleStore.insertSyncLog({ ...logItem, detalles: pasos });

    return {
      ok: true,
      pasos,
      error: null,
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
    await MoodleStore.insertSyncLog({ ...failureLog, detalles: pasos });

    return {
      ok: false,
      pasos,
      error: sanitizedError,
      nuevos: 0,
      actualizados: 0,
      borrados: 0,
      cambiosCount: 0,
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
