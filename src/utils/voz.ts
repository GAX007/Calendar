// Text to speech with the device's own voices (Web Speech API). Free and offline; works in iOS Safari and the installed PWA.
// iOS only allows speaking after a tap, so start it from a click handler.

export interface OpcionesVoz {
  velocidad?: number;
  vozURI?: string | null;
  onFrase?: (indice: number) => void;
  onFin?: (completo: boolean) => void;
}

const LS_VOZ = 'omni-voz-uri';
const LS_VELOCIDAD = 'omni-voz-velocidad';

// Safari drops onend if the utterance is garbage-collected while speaking
let enCurso: SpeechSynthesisUtterance[] = [];
let sesion = 0;

export function vozDisponible(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

// Spanish voices, Spain first and local (offline) voices before network ones
export function vocesEspanol(): SpeechSynthesisVoice[] {
  if (!vozDisponible()) return [];
  const rank = (v: SpeechSynthesisVoice) => (v.lang.replace('_', '-').toLowerCase() === 'es-es' ? 0 : 2) + (v.localService ? 0 : 1);
  return window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('es')).sort((a, b) => rank(a) - rank(b));
}

// Voices load asynchronously in Chrome and sometimes in Safari
export function esperarVoces(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!vozDisponible()) return Promise.resolve([]);
  const ya = vocesEspanol();
  if (ya.length) return Promise.resolve(ya);
  return new Promise(resolve => {
    const fin = () => { window.speechSynthesis.removeEventListener('voiceschanged', fin); clearTimeout(t); resolve(vocesEspanol()); };
    const t = setTimeout(fin, timeoutMs);
    window.speechSynthesis.addEventListener('voiceschanged', fin);
  });
}

function leer(clave: string): string | null {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function guardar(clave: string, valor: string | null) {
  try { if (valor === null) localStorage.removeItem(clave); else localStorage.setItem(clave, valor); } catch { /* private mode */ }
}
export function preferenciasVoz(): { vozURI: string | null; velocidad: number } {
  const v = Number(leer(LS_VELOCIDAD));
  return { vozURI: leer(LS_VOZ), velocidad: Number.isFinite(v) && v >= 0.7 && v <= 1.5 ? v : 1 };
}
export function guardarPreferenciasVoz(p: { vozURI?: string | null; velocidad?: number }) {
  if (p.vozURI !== undefined) guardar(LS_VOZ, p.vozURI);
  if (p.velocidad !== undefined) guardar(LS_VELOCIDAD, String(p.velocidad));
}

export function pararVoz(): void {
  sesion++;
  enCurso = [];
  if (vozDisponible()) window.speechSynthesis.cancel();
}

// Speaks the sentences one after another. Returns a function that stops it.
export function hablar(frases: string[], opciones: OpcionesVoz = {}): () => void {
  if (!vozDisponible()) { opciones.onFin?.(false); return () => undefined; }
  pararVoz();
  const id = sesion;
  const synth = window.speechSynthesis;
  const pref = preferenciasVoz();
  const voces = vocesEspanol();
  const voz = voces.find(v => v.voiceURI === (opciones.vozURI ?? pref.vozURI)) || voces[0] || null;
  const velocidad = opciones.velocidad ?? pref.velocidad;

  const siguiente = (i: number) => {
    if (id !== sesion) return;
    if (i >= frases.length) { enCurso = []; opciones.onFin?.(true); return; }
    const u = new SpeechSynthesisUtterance(frases[i]);
    u.lang = voz?.lang || 'es-ES';
    if (voz) u.voice = voz;
    u.rate = velocidad;
    u.onstart = () => { if (id === sesion) opciones.onFrase?.(i); };
    u.onend = () => siguiente(i + 1);
    u.onerror = e => {
      if (id !== sesion) return;
      // 'interrupted' and 'canceled' come from pararVoz or another app taking the audio
      if (e.error === 'interrupted' || e.error === 'canceled') { opciones.onFin?.(false); return; }
      siguiente(i + 1);
    };
    enCurso = [u];
    synth.speak(u);
  };
  // Safari can stay paused after another page used the speech engine
  if (synth.paused) synth.resume();
  siguiente(0);
  return () => { if (id === sesion) { pararVoz(); opciones.onFin?.(false); } };
}

// iOS needs the first utterance inside the tap; call this first when the text is still loading
export function desbloquearVoz(): void {
  if (!vozDisponible()) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  enCurso = [u];
  window.speechSynthesis.speak(u);
}
