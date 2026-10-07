import { syncMoodleDeliverables } from '../../src/services/moodleSyncService';

/**
 * Netlify Function directa para el endpoint /sync-now
 */
export const handler = async () => {
  try {
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
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ok: false,
        error: 'Error al sincronizar feed de Moodle',
      }),
    };
  }
};
