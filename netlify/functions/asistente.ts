import { ejecutarAsistente } from '../../src/asistente/servidor/tareas';

/**
 * Netlify Scheduled Function: asistente nocturno, cada 15 minutos.
 * Decide según la hora de Madrid qué toca: cierre del día (23:30), parte de la mañana (07:00),
 * repaso semanal (domingo 21:00), estimación de entregas nuevas y avisos.
 */
export const config = {
  schedule: '*/15 * * * *',
};

export const handler = async () => {
  const informe = await ejecutarAsistente();
  console.log('[Asistente]', JSON.stringify(informe));
  return { statusCode: informe.errores.length ? 500 : 200, body: JSON.stringify(informe) };
};
