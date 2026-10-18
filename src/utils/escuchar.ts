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
export function escuchar(onParcial?: OnParcial): Escucha {
  const SR = constructorReconocimiento();
  if (SR) return conReconocimiento(SR, onParcial);
  return grabarYTranscribir();
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
