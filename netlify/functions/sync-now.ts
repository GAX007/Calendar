import { syncMoodleDeliverables } from '../../src/services/moodleSyncService';
import { accesoMoodle, respuestaMoodleAjena } from '../../src/asistente/servidor/supabase';

/**
 * Netlify Function directa para el endpoint /sync-now y /api/moodle/sync-now
 * Devuelve siempre un JSON estructurado según las especificaciones de la Fase 1 / Paso 3.
 */
export const handler = async (event: { httpMethod?: string; headers?: Record<string, string> }) => {
  try {
    // Only the owner of the Moodle feed may trigger its sync
    const acceso = await accesoMoodle(event?.headers?.authorization || event?.headers?.Authorization);
    if (acceso.tipo !== 'propietario') {
      const { status, body } = respuestaMoodleAjena(acceso, 'POST', '/sync-now');
      return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' }, body: JSON.stringify(body) };
    }
    const result = await syncMoodleDeliverables();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: JSON.stringify({
        ok: false,
        error: err?.message || 'Error inesperado al sincronizar feed de Moodle',
        pasos: {
          url_configurada: Boolean(process.env.MOODLE_ICS_URL),
          descarga: { bytes: 0, empieza_por_vcalendar: false },
          eventos_parseados: 0,
          ocultos_por_grupo: 0,
          upsert: { nuevos: 0, actualizados: 0, errores: 1 },
        },
        nuevos: 0,
        actualizados: 0,
        borrados: 0,
        cambiosCount: 0,
        fecha: new Date().toISOString(),
      }),
    };
  }
};

