// Conversation turns of the voice assistant: when to keep listening and how to read a short answer.
// Pure: shared by the app (microphone reopens by itself) and the iPhone shortcut (loops while it asks).

export const SILENCIO_FIN_CONVERSACION_MS = 6000;
export const MAX_TURNOS_SEGUIDOS = 6;

const normal = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¡!¿?.,;:«»"']/g, ' ').replace(/\s+/g, ' ').trim();

// "sí", "vale, hazlo", "bai" (Basque) → si; "no", "déjalo", "ez" → no; anything longer or mixed → null (the model decides)
export function respuestaSiNo(texto: string): 'si' | 'no' | null {
  const t = normal(texto);
  if (!t || t.split(' ').length > 5) return null;
  const si = /^(si|sip|vale|claro|ok|okey|de acuerdo|hazlo|adelante|venga|perfecto|correcto|eso es|bai|bale|confirmo|confirmado)( (si|vale|hazlo|todas|todo|claro|porfa|por favor|adelante|venga))*$/;
  const no = /^(no|nop|dejalo|deja|cancela|cancelar|para|mejor no|ni hablar|ez|ezta|olvidalo|nada)( (no|gracias|dejalo|lo hagas|mejor))*$/;
  if (si.test(t)) return 'si';
  if (no.test(t)) return 'no';
  return null;
}

// The answer ends in a question when the assistant is waiting for something from the user
export function terminaEnPregunta(frases: string[]): boolean {
  const ultima = (frases.at(-1) || '').trim();
  return /\?\s*$/.test(ultima);
}

// Whether to reopen the microphone after speaking: a pending confirmation, a clarification or a question
export function seguirEscuchando(opciones: { frases: string[]; pendiente: boolean; aclaracion: boolean; turnos: number }): boolean {
  if (opciones.turnos >= MAX_TURNOS_SEGUIDOS) return false;
  return opciones.pendiente || opciones.aclaracion || terminaEnPregunta(opciones.frases);
}

const palabras = (v: string) => normal(v).split(' ').filter(Boolean);

// The microphone sometimes hears the assistant's own voice (it speaks through the speaker while recording starts).
// Removes the words at the start of what was heard that repeat the assistant's last answer, and returns the rest:
// "¿Las descarto todas? Sí" → "Sí"; an exact echo → "".
export function quitarEco(oido: string, ultimoAsistente: string): string {
  const o = palabras(oido), a = palabras(ultimoAsistente);
  if (!o.length || a.length < 2) return oido.trim();
  // Longest start of what was heard that appears, in order, inside the assistant's text
  let mejor = 0;
  for (let inicio = 0; inicio < a.length; inicio++) {
    let n = 0;
    while (n < o.length && inicio + n < a.length && o[n] === a[inicio + n]) n++;
    mejor = Math.max(mejor, n);
  }
  // One or two words could be a real answer that repeats the question ("todas", "todas sí"): only 3+ words are an echo
  if (mejor < 3) return oido.trim();
  if (mejor >= o.length) return '';
  // Keep the original words (with accents) after the echoed part; punctuation-only words do not count
  return oido.trim().split(/\s+/).filter(w => normal(w)).slice(mejor).join(' ');
}

// The question to repeat when the answer was not understood: the last sentence that asks something
export function ultimaPregunta(texto: string): string {
  const frases = texto.match(/[^.!?¿¡]*[¿¡]?[^.!?¿¡]*[.!?]+/g)?.map(f => f.trim()).filter(Boolean) || [texto.trim()];
  return [...frases].reverse().find(f => f.endsWith('?')) || '¿Me lo repites?';
}
