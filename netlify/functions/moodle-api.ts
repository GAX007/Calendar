import { MoodleStore } from '../../src/services/moodleStore';
import {
  syncMoodleDeliverables,
  createManualEntrega,
  updateEntregaUserFields,
} from '../../src/services/moodleSyncService';

interface HandlerEvent {
  path: string;
  httpMethod: string;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: string | null;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
};

export const handler = async (event: HandlerEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  // Normalizar ruta para extraer el recurso relativo
  let path = event.path || '';
  if (path.includes('/.netlify/functions/moodle-api')) {
    path = path.replace('/.netlify/functions/moodle-api', '');
  } else if (path.includes('/api/moodle')) {
    path = path.replace('/api/moodle', '');
  }
  if (!path.startsWith('/')) path = '/' + path;
  const cleanPath = path.split('?')[0].replace(/\/+$/, '') || '/';
  const method = (event.httpMethod || 'GET').toUpperCase();

  try {
    // -------------------------------------------------------------
    // 1. SYNC NOW: POST /sync-now
    // -------------------------------------------------------------
    if (cleanPath === '/sync-now' || cleanPath === '') {
      const result = await syncMoodleDeliverables();
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(result),
      };
    }

    // -------------------------------------------------------------
    // 2. ENTREGAS: GET /entregas, POST /entregas
    // -------------------------------------------------------------
    if (cleanPath === '/entregas') {
      if (method === 'GET') {
        const includeOcultas = event.queryStringParameters?.includeOcultas === 'true';
        const asignatura = event.queryStringParameters?.asignatura;
        const estado = event.queryStringParameters?.estado;
        const entregas = await MoodleStore.getEntregas({
          includeOcultas,
          asignatura,
          estado,
        });
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, entregas }),
        };
      }

      if (method === 'POST') {
        const payload = JSON.parse(event.body || '{}');
        const { titulo, asignatura_codigo, deadline_madrid, descripcion } = payload;
        if (!titulo || !asignatura_codigo || !deadline_madrid) {
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              ok: false,
              error: 'Faltan campos obligatorios: titulo, asignatura_codigo, deadline_madrid',
            }),
          };
        }
        const entrega = await createManualEntrega({
          titulo,
          asignatura_codigo,
          deadline_madrid,
          descripcion,
        });
        return {
          statusCode: 201,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, entrega }),
        };
      }
    }

    // -------------------------------------------------------------
    // 3. ENTREGA INDIVIDUAL: PATCH /entregas/:uid
    // -------------------------------------------------------------
    if (cleanPath.startsWith('/entregas/')) {
      const rawUid = cleanPath.replace('/entregas/', '');
      const uid = decodeURIComponent(rawUid);

      if (method === 'PATCH') {
        const payload = JSON.parse(event.body || '{}');
        const { estado, dificultad, horas_est, horas_reales, min_viable_min } = payload;
        const updated = await updateEntregaUserFields(uid, {
          estado,
          dificultad,
          horas_est,
          horas_reales,
          min_viable_min,
        });
        if (!updated) {
          return {
            statusCode: 404,
            headers: CORS_HEADERS,
            body: JSON.stringify({ ok: false, error: 'Entrega no encontrada' }),
          };
        }
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, entrega: updated }),
        };
      }
    }

    // -------------------------------------------------------------
    // 4. ASIGNATURAS: GET /asignaturas, PUT /asignaturas/:codigo
    // -------------------------------------------------------------
    if (cleanPath === '/asignaturas') {
      if (method === 'GET') {
        const asignaturas = await MoodleStore.getAsignaturas();
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, asignaturas }),
        };
      }
    }

    if (cleanPath.startsWith('/asignaturas/')) {
      const rawCodigo = cleanPath.replace('/asignaturas/', '');
      const codigo = decodeURIComponent(rawCodigo);

      if (method === 'PUT') {
        const payload = JSON.parse(event.body || '{}');
        const { nombre, cuatrimestre, activa } = payload;
        const updated = await MoodleStore.updateAsignatura(codigo, {
          nombre,
          cuatrimestre,
          activa,
        });
        if (!updated) {
          return {
            statusCode: 404,
            headers: CORS_HEADERS,
            body: JSON.stringify({ ok: false, error: 'Asignatura no encontrada' }),
          };
        }
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, asignatura: updated }),
        };
      }
    }

    // -------------------------------------------------------------
    // 5. CAMBIOS: GET /cambios, POST /cambios/marcar-vistos
    // -------------------------------------------------------------
    if (cleanPath === '/cambios') {
      if (method === 'GET') {
        const onlyUnseen = event.queryStringParameters?.onlyUnseen === 'true';
        const cambios = await MoodleStore.getCambios(onlyUnseen);
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, cambios }),
        };
      }
    }

    if (cleanPath === '/cambios/marcar-vistos') {
      if (method === 'POST') {
        await MoodleStore.marcarCambiosVistos();
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true }),
        };
      }
    }

    // -------------------------------------------------------------
    // 6. SYNC LOG: GET /sync-log
    // -------------------------------------------------------------
    if (cleanPath === '/sync-log') {
      if (method === 'GET') {
        const limit = event.queryStringParameters?.limit
          ? parseInt(event.queryStringParameters.limit, 10)
          : 20;
        const logs = await MoodleStore.getSyncLogs(limit);
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: true, logs }),
        };
      }
    }

    // Ruta no reconocida en Moodle API
    return {
      statusCode: 404,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: false,
        error: `Ruta de Moodle API no encontrada: [${method}] ${cleanPath}`,
      }),
    };
  } catch (err: any) {
    console.error('[moodle-api] Error ejecutando petición:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: false,
        error: err?.message || 'Error interno en Moodle API',
      }),
    };
  }
};
