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
