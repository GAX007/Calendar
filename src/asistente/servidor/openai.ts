// OpenAI for the voice assistant: GPT-6 Luna understands the sentence (Structured Outputs, strict schema)
// and gpt-transcribe turns the recorded audio into text with the user's subject names as hints.
// Plain fetch to the REST API: no SDK. Never import this from browser code (it reads OPENAI_API_KEY).
import { esquemaInterpretacion } from '../interpretar';

export const MODELO_INTERPRETAR = 'gpt-6-luna';
export const MODELO_TRANSCRIBIR = 'gpt-transcribe';
const API = 'https://api.openai.com/v1';

const clave = () => (process.env.OPENAI_API_KEY || '').trim().replace(/^["'`]+|["'`]+$/g, '');
export function openaiDisponible(): boolean {
  return clave().length > 20;
}

async function conTiempo<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fn(controller.signal); }
  catch (err) { throw controller.signal.aborted ? new Error(`OpenAI no respondió en ${Math.round(ms / 1000)} s`) : err; }
  finally { clearTimeout(timer); }
}

async function error(res: Response): Promise<Error> {
  const json: any = await res.json().catch(() => null);
  return new Error(`OpenAI ${res.status}: ${json?.error?.message || res.statusText}`);
}

export interface UsoOpenAI { entrada: number; salida: number }

// Returns the model's JSON text (to be checked by normalizarInterpretacion) and the tokens used.
// 'low' reasoning ≈ 4.5 s; 'none' ≈ 2.5 s (the shortcut uses it to fit in Netlify's time limit).
export async function interpretarConOpenAI(instrucciones: string, entrada: string, ms = 12000,
  esfuerzo: 'none' | 'low' = process.env.OPENAI_REASONING === 'none' ? 'none' : 'low'): Promise<{ texto: string; uso: UsoOpenAI }> {
  return conTiempo(ms, async signal => {
    const res = await fetch(`${API}/responses`, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${clave()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELO_INTERPRETAR,
        instructions: instrucciones,
        input: entrada,
        reasoning: { effort: esfuerzo },
        max_output_tokens: 2000,
        store: false,
        text: { format: { type: 'json_schema', name: 'interpretacion', schema: esquemaInterpretacion(), strict: true } },
      }),
    });
    if (!res.ok) throw await error(res);
    const json: any = await res.json();
    if (json.status === 'incomplete') throw new Error(`Respuesta incompleta de OpenAI (${json.incomplete_details?.reason || 'sin motivo'})`);
    // output_text is an SDK helper; in the raw API the text is in the message content
    const partes = (json.output || []).flatMap((o: any) => o.type === 'message' ? o.content || [] : []);
    const rechazo = partes.find((p: any) => p.type === 'refusal');
    if (rechazo) throw new Error(`OpenAI no quiso responder: ${rechazo.refusal}`);
    const texto = partes.filter((p: any) => p.type === 'output_text').map((p: any) => p.text).join('');
    if (!texto) throw new Error('OpenAI devolvió una respuesta vacía');
    return { texto, uso: { entrada: json.usage?.input_tokens || 0, salida: json.usage?.output_tokens || 0 } };
  });
}

// Keywords may not contain <, >, CR or LF (OpenAI rule); one per field
export function limpiarPalabrasClave(lista: string[]): string[] {
  return [...new Set(lista.map(k => String(k || '').replace(/[<>\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(k => k.length >= 2 && k.length <= 80))].slice(0, 60);
}

export async function transcribirConOpenAI(audio: Buffer, mimeType: string, palabrasClave: string[], ms = 15000): Promise<string> {
  return conTiempo(ms, async signal => {
    const extension = /mp4|m4a|aac/.test(mimeType) ? 'm4a' : /mpeg|mp3/.test(mimeType) ? 'mp3' : /wav/.test(mimeType) ? 'wav' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `voz.${extension}`);
    form.append('model', MODELO_TRANSCRIBIR);
    form.append('prompt', 'Un estudiante universitario habla con el asistente de su agenda, en castellano y a veces en euskera (nombres de asignaturas y entregas).');
    // Basque is not accepted as a language hint (400): the subject names go in as keywords instead
    form.append('languages[]', 'es');
    for (const k of limpiarPalabrasClave(palabrasClave)) form.append('keywords[]', k);
    const res = await fetch(`${API}/audio/transcriptions`, { method: 'POST', signal, headers: { Authorization: `Bearer ${clave()}` }, body: form });
    if (!res.ok) throw await error(res);
    const json: any = await res.json();
    return String(json.text || '').trim();
  });
}
