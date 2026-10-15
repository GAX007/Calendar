// N3: Gemini estimates the effort of a new Moodle deliverable
import { GoogleGenAI, Type } from '@google/genai';
import type { EntregaItem } from '../../services/moodleTypes';
import { madridLocal } from '../../planner/time';
import { normalizarEstimacion, type EstimacionIA } from '../logica';

const MODELOS = ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];

let ai: GoogleGenAI | null = null;
export function geminiDisponible(): boolean {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}
function cliente(): GoogleGenAI {
  if (!ai) ai = new GoogleGenAI({ apiKey: (process.env.GEMINI_API_KEY || '').trim() });
  return ai;
}

export interface Precedente { titulo: string; asignatura: string; horas_est: number; horas_reales: number }

export function promptEstimacion(t: EntregaItem, asignatura: string, precedentes: Precedente[]): string {
  const historial = precedentes.length
    ? precedentes.map(p => `- ${p.titulo} (${p.asignatura}): estimadas ${p.horas_est} h, reales ${p.horas_reales} h`).join('\n')
    : '- Sin historial todavía.';
  return [
    'Eres el asistente de estudio de un estudiante de Ingeniería Informática.',
    'Estima cuánto trabajo le llevará esta tarea de Moodle. Responde solo con el JSON pedido.',
    '',
    `Asignatura: ${asignatura}`,
    `Título: ${t.titulo}`,
    `Tipo en Moodle: ${t.tipo === 'cierre_cuestionario' ? 'cuestionario' : 'entrega'}`,
    `Fecha límite (Madrid): ${madridLocal(t.deadline_utc).replace('T', ' ')}`,
    `Descripción: ${(t.descripcion || 'sin descripción').replace(/\s+/g, ' ').slice(0, 2000)}`,
    '',
    'Lo que le han llevado tareas anteriores:',
    historial,
    '',
    'Criterios: un cuestionario suele ser 0,5-1 h; una práctica de programación 3-8 h; un informe 2-4 h.',
    'tipo_trabajo es "profundo" si requiere concentración (programar, resolver, redactar) y "ligero" si es mecánico (leer, revisar, subir).',
    'min_viable_min son los minutos de la versión mínima entregable si va justo de tiempo (mínimo 20).',
    'nota: una frase en español de España que explique la estimación.',
  ].join('\n');
}

export async function estimarEntrega(t: EntregaItem, asignatura: string, precedentes: Precedente[], presupuestoMs = 12000): Promise<EstimacionIA & { modelo: string }> {
  const deadline = Date.now() + presupuestoMs;
  let ultimoError: unknown = null;
  for (const model of MODELOS) {
    const restante = deadline - Date.now();
    if (restante < 1500) break;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const respuesta = await Promise.race([
        cliente().models.generateContent({
          model,
          contents: promptEstimacion(t, asignatura, precedentes),
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                horas_est: { type: Type.NUMBER },
                tipo_trabajo: { type: Type.STRING, enum: ['profundo', 'ligero'] },
                dificultad: { type: Type.INTEGER },
                min_viable_min: { type: Type.INTEGER },
                nota: { type: Type.STRING },
              },
              required: ['horas_est', 'tipo_trabajo', 'dificultad', 'min_viable_min', 'nota'],
            },
          },
        }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timeout ${model}`)), restante); }),
      ]);
      return { ...normalizarEstimacion(JSON.parse(respuesta.text || '{}')), modelo: model };
    } catch (err) {
      ultimoError = err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error('Gemini no ha respondido');
}
