import { syncMoodleDeliverables } from '../../src/services/moodleSyncService';

/**
 * Netlify Scheduled Function: ejecuta cada 2 horas (0 cada 2 horas)
 */
export const config = {
  schedule: '0 */2 * * *',
};

export const handler = async () => {
  console.log('[Scheduled] Ejecutando sincronización de Moodle (cada 2 horas)...');
  try {
    const result = await syncMoodleDeliverables();
    console.log('[Scheduled] Sincronización completada:', {
      ok: result.ok,
      nuevos: result.nuevos,
      actualizados: result.actualizados,
      borrados: result.borrados,
    });
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Sincronización periódica completada con éxito',
        result,
      }),
    };
  } catch (err: any) {
    console.error('[Scheduled] Error en sincronización periódica');
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: 'Fallo en la sincronización programada',
      }),
    };
  }
};
