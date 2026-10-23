// Speech to text for the voice assistant. Uses the browser's own recognition (Chrome, Android, iOS Safari) and,
// where it is missing or blocked, records a short clip and transcribes it on the server.
// Both need a secure context: they work on https and localhost, not on http://<LAN IP> from the phone.

type Reconocedor = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

const MAX_GRABACION_MS = 10000;

function constructorReconocimiento(): (new () => Reconocedor) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
const puedeGrabar = () => typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

export type EstadoMicro = 'ok' | 'inseguro' | 'no_soportado';
export function estadoMicro(): EstadoMicro {
  if (typeof window === 'undefined') return 'no_soportado';
  if (!window.isSecureContext) return 'inseguro';
  return constructorReconocimiento() || puedeGrabar() ? 'ok' : 'no_soportado';
}
export const MENSAJE_INSEGURO = 'El micrófono solo funciona con https o en localhost. Abre la app desde su dirección https (Netlify) o desde el ordenador.';

export interface Escucha {
  texto: Promise<string>;
  // Stops listening and keeps what was heard
  detener(): void;
  // Stops and discards
  cancelar(): void;
}

// Listens to one sentence. `onParcial` gets the text while the user is still talking,
// plus the part already confirmed and the part that may still change.
export type OnParcial = (texto: string, definitivo: string, provisional: string) => void;
// Server transcription of the recorded clip (OpenAI). Resolves '' or rejects when it is not available.
export type Transcriptor = (audio: Blob) => Promise<string>;
// `micro`: a stream already open for the whole conversation (kept open, not stopped here)
export function escuchar(onParcial?: OnParcial, transcribir?: Transcriptor, micro?: MediaStream): Escucha {
  const SR = constructorReconocimiento();
  if (transcribir && puedeGrabar()) return grabarConServidor(transcribir, SR, onParcial, micro);
  if (SR) return conReconocimiento(SR, onParcial);
  return grabarYTranscribir();
}

const MAX_HABLA_MS = 15000;
const SILENCIO_MS = 1400;

// Opens the microphone once, inside the user's tap: iOS Safari refuses to open it later without a gesture,
// so the conversation keeps this stream and records every following answer on it.
export async function abrirMicro(): Promise<MediaStream | null> {
  if (!puedeGrabar()) return null;
  try { return await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return null; }
}
export function cerrarMicro(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach(t => t.stop());
}

// One answer inside a conversation, on the already open stream: ends after a pause once the user spoke,
// or resolves '' when nobody speaks for `sinVozMs` (the conversation ends). No browser recognition (needs a gesture on iOS).
export function escucharTurno(micro: MediaStream, transcribir: Transcriptor, sinVozMs = 6000): Escucha {
  let cancelado = false, sinVoz = false, terminar: () => void = () => undefined;
  const texto = (async () => {
    const trozos: Blob[] = [];
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(micro); } catch { throw new Error('Este navegador no permite grabar.'); }
    const fin = new Promise<Blob>(resolve => {
      recorder.ondataavailable = e => { if (e.data.size) trozos.push(e.data); };
      recorder.onstop = () => resolve(new Blob(trozos, { type: recorder.mimeType || 'audio/webm' }));
    });
    const pararGrabacion = () => { if (recorder.state === 'recording') recorder.stop(); };
    terminar = pararGrabacion;
    recorder.start();
    const limite = setTimeout(pararGrabacion, MAX_HABLA_MS);
    const cerrarSilencio = detectarSilencio(micro, pararGrabacion, sinVozMs, () => { sinVoz = true; pararGrabacion(); });
    const audio = await fin;
    clearTimeout(limite);
    cerrarSilencio();
    if (cancelado || sinVoz || !audio.size) return '';
    try { return (await transcribir(audio)).trim(); } catch { return ''; }
  })();
  return { texto, detener: () => terminar(), cancelar: () => { cancelado = true; terminar(); } };
}

// Records the clip for the server while the browser's recognition (if any) shows the live text and detects the end.
// The server's text wins (it knows Basque subject names); the browser's text is the fallback.
function grabarConServidor(transcribir: Transcriptor, SR: (new () => Reconocedor) | null, onParcial?: OnParcial, micro?: MediaStream): Escucha {
  let cancelado = false, terminar: () => void = () => undefined;
  let reconocedor: Escucha | null = null;
  const texto = (async () => {
    let stream: MediaStream;
    if (micro) stream = micro;
    else {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { throw new Error('Permite el micrófono para esta app en los ajustes del navegador.'); }
    }
    const soltar = () => { if (!micro) stream.getTracks().forEach(t => t.stop()); };
    if (cancelado) { soltar(); return ''; }
    const trozos: Blob[] = [];
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream); }
    catch { soltar(); return SR ? conReconocimiento(SR, onParcial).texto : ''; }
    const fin = new Promise<Blob>(resolve => {
      recorder.ondataavailable = e => { if (e.data.size) trozos.push(e.data); };
      recorder.onstop = () => { soltar(); resolve(new Blob(trozos, { type: recorder.mimeType || 'audio/webm' })); };
    });
    const pararGrabacion = () => { if (recorder.state === 'recording') recorder.stop(); };
    let cerrarSilencio = () => undefined as void;
    terminar = () => { reconocedor?.detener(); pararGrabacion(); };
    recorder.start();
    const limite = setTimeout(terminar, MAX_HABLA_MS);
    // The browser's recognition ends on silence; without it (or if it fails), a simple level meter does
    // The end of the sentence is detected by silence (the level meter), so nothing has to be tapped to send it.
    // iOS recognition does not always end by itself; whichever ends first stops both.
    cerrarSilencio = detectarSilencio(stream, () => terminar());
    let delNavegador: Promise<string> = Promise.resolve('');
    if (SR) {
      reconocedor = conReconocimiento(SR, onParcial);
      delNavegador = reconocedor.texto.then(t => { pararGrabacion(); return t; }, () => '');
    }
    const audio = await fin;
    clearTimeout(limite);
    cerrarSilencio();
    reconocedor?.detener();
    const navegador = await Promise.race([delNavegador, new Promise<string>(r => setTimeout(() => r(''), 1500))]);
    if (cancelado || !audio.size) return '';
    try {
      const servidor = (await transcribir(audio)).trim();
      if (servidor) return servidor;
    } catch { /* fall back to the browser's text */ }
    if (navegador) return navegador;
    throw new Error('No he podido entenderte. Inténtalo otra vez.');
  })();
  return {
    texto,
    detener: () => terminar(),
    cancelar: () => { cancelado = true; reconocedor?.cancelar(); terminar(); },
  };
}

// Stops the recording after a pause once the user has spoken; `alSinVoz` when nothing is said for `sinVozMs`. Returns the cleanup.
function detectarSilencio(stream: MediaStream, alTerminar: () => void, sinVozMs?: number, alSinVoz?: () => void): () => void {
  const propio = !audioCompartido;
  const ctx = audioCompartido || crearAudio();
  if (!ctx) return () => undefined;
  const analizador = ctx.createAnalyser();
  analizador.fftSize = 1024;
  const fuente = ctx.createMediaStreamSource(stream);
  fuente.connect(analizador);
  const muestras = new Uint8Array(analizador.fftSize);
  let hablado = false, ultimoSonido = Date.now();
  const inicio = Date.now();
  const intervalo = setInterval(() => {
    analizador.getByteTimeDomainData(muestras);
    let pico = 0;
    for (const m of muestras) pico = Math.max(pico, Math.abs(m - 128));
    if (pico > 12) { hablado = true; ultimoSonido = Date.now(); }
    else if (hablado && Date.now() - ultimoSonido > SILENCIO_MS) { limpiar(); alTerminar(); }
    else if (!hablado && sinVozMs && alSinVoz && Date.now() - inicio > sinVozMs) { limpiar(); alSinVoz(); }
  }, 100);
  const limpiar = () => { clearInterval(intervalo); fuente.disconnect(); if (propio) void ctx.close().catch(() => undefined); };
  return limpiar;
}

// iOS keeps an AudioContext created without a tap suspended (silent): the conversation creates one in the first tap
let audioCompartido: AudioContext | null = null;
function crearAudio(): AudioContext | null {
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AC ? new AC() : null;
}
export function prepararAudio(): void {
  if (typeof window === 'undefined') return;
  audioCompartido ||= crearAudio();
  void audioCompartido?.resume().catch(() => undefined);
}

function conReconocimiento(SR: new () => Reconocedor, onParcial?: OnParcial): Escucha {
  const r = new SR();
  r.lang = 'es-ES';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let final = '', parcial = '', cancelado = false, alternativa: Escucha | null = null;
  let resolver!: (t: string) => void, rechazar!: (e: Error) => void;
  const texto = new Promise<string>((res, rej) => { resolver = res; rechazar = rej; });

  r.onresult = e => {
    parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const trozo = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += trozo; else parcial += trozo;
    }
    onParcial?.(`${final}${parcial}`.trim(), final.trim(), parcial.trim());
  };
  r.onerror = e => {
    if (e.error === 'service-not-allowed' && puedeGrabar() && !cancelado) {
      // Safari without Siri dictation enabled: fall back to recording
      alternativa = grabarYTranscribir();
      alternativa.texto.then(resolver, rechazar);
      return;
    }
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    rechazar(new Error(e.error === 'not-allowed' ? 'Permite el micrófono para esta app en los ajustes del navegador.'
      : e.error === 'network' ? 'El reconocimiento de voz necesita conexión.' : `No te he podido oír (${e.error}).`));
  };
  r.onend = () => { if (!alternativa) resolver(cancelado ? '' : `${final}${parcial}`.trim()); };
  try { r.start(); } catch (err) { rechazar(err instanceof Error ? err : new Error(String(err))); }
  return {
    texto,
    detener: () => { if (alternativa) alternativa.detener(); else r.stop(); },
    cancelar: () => { cancelado = true; if (alternativa) alternativa.cancelar(); else r.abort(); },
  };
}

function grabarYTranscribir(): Escucha {
  let recorder: MediaRecorder | null = null, cancelado = false, temporizador: ReturnType<typeof setTimeout> | undefined;
  const parar = () => { clearTimeout(temporizador); if (recorder?.state === 'recording') recorder.stop(); };
  const texto = (async () => {
    if (!puedeGrabar()) throw new Error('Este navegador no permite usar el micrófono.');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { throw new Error('Permite el micrófono para esta app en los ajustes del navegador.'); }
    const trozos: Blob[] = [];
    const audio = await new Promise<Blob>((resolve, reject) => {
      try {
        recorder = new MediaRecorder(stream);
      } catch (err) { stream.getTracks().forEach(t => t.stop()); reject(err); return; }
      recorder.ondataavailable = e => { if (e.data.size) trozos.push(e.data); };
      recorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); resolve(new Blob(trozos, { type: recorder?.mimeType || 'audio/webm' })); };
      recorder.start();
      temporizador = setTimeout(parar, MAX_GRABACION_MS);
      if (cancelado) parar();
    });
    if (cancelado || !audio.size) return '';
    const base64 = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result));
      lector.onerror = () => reject(new Error('No se pudo leer el audio'));
      lector.readAsDataURL(audio);
    });
    const res = await fetch('/api/transcribe-audio', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: base64, mimeType: audio.type.split(';')[0] || 'audio/webm' }) });
    const json = await res.json().catch(() => ({}));
    // The endpoint answers with a made-up example sentence when transcription fails: never act on it
    if (!res.ok || json.fallback || !json.transcript || /^No se detectó voz/.test(json.transcript)) {
      throw new Error('No he podido transcribir el audio. Inténtalo otra vez.');
    }
    return String(json.transcript).trim();
  })();
  return { texto, detener: parar, cancelar: () => { cancelado = true; parar(); } };
}
