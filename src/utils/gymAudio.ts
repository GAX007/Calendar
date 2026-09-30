// Audio, voice countdown engine and background keep-alive for Gym Rest Timer
export type GymSoundMode = 'both' | 'beeps' | 'voice' | 'muted';

const GYM_SOUND_STORAGE_KEY = 'omniagenda_gym_timer_sound_mode';
export const GYM_TIMER_TARGET_STORAGE_KEY = 'omniagenda_gym_timer_target_end';

// 1-second silent WAV base64 audio loop to keep mobile audio session & timers active in background
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
let silentAudioElement: HTMLAudioElement | null = null;

class GymAudioEngine {
  private static audioCtx: AudioContext | null = null;

  public static getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.audioCtx) {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    } catch (err) {
      console.warn('GymAudioEngine: Could not initialize AudioContext', err);
      return null;
    }
  }

  // Play short countdown beep (5, 4, 3, 2, 1)
  public static playShortBeep(second: number) {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Slightly ascending frequencies as countdown nears 0
      const freqs: Record<number, number> = {
        5: 750,
        4: 800,
        3: 860,
        2: 920,
        1: 990,
      };
      const freq = freqs[second] || 880;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      const now = ctx.currentTime;
      const duration = 0.16;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.02);
      gain.gain.setValueAtTime(0.35, now + duration - 0.04);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch (err) {
      console.warn('GymAudioEngine: Error playing short beep', err);
    }
  }

  // Play continuous long buzzer tone "PIIIIIII" when time is up
  public static playFinishedBeep() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Sharp, distinct buzzer tone (1046.5 Hz - High C)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);

      const now = ctx.currentTime;
      const duration = 1.2; // 1.2s long "piiii" tone

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.45, now + 0.04);
      gain.gain.setValueAtTime(0.45, now + duration - 0.15);
      gain.gain.linearRampToValueAtTime(0, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch (err) {
      console.warn('GymAudioEngine: Error playing finished beep', err);
    }
  }

  // Voice speech synthesis
  public static speak(text: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'es-ES';
      utter.rate = 1.15;
      utter.pitch = 1.05;
      window.speechSynthesis.speak(utter);
    } catch (err) {
      console.warn('GymAudioEngine: Speech synthesis error', err);
    }
  }

  // Countdown tick handler for 5, 4, 3, 2, 1
  public static playCountdown(second: number, mode: GymSoundMode) {
    if (mode === 'muted') return;

    if (mode === 'both' || mode === 'beeps') {
      this.playShortBeep(second);
    }

    if (mode === 'both' || mode === 'voice') {
      const words: Record<number, string> = {
        5: 'cinco',
        4: 'cuatro',
        3: 'tres',
        2: 'dos',
        1: 'uno',
      };
      this.speak(words[second] || String(second));
    }
  }

  // Finished handler for 0s
  public static playFinished(mode: GymSoundMode) {
    if (mode === 'muted') return;

    if (mode === 'both' || mode === 'beeps') {
      this.playFinishedBeep();
    }

    if (mode === 'both' || mode === 'voice') {
      const delay = mode === 'both' ? 250 : 0;
      setTimeout(() => {
        this.speak('¡Tiempo!');
      }, delay);
    }
  }

  // Test sound function for preview
  public static testPreview(mode: GymSoundMode) {
    if (mode === 'muted') return;
    this.playCountdown(3, mode);
    setTimeout(() => {
      this.playFinished(mode);
    }, 500);
  }
}

// Keep-alive silent audio loop for iOS / Android background audio preservation
export function enableBackgroundAudioKeepAlive(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!silentAudioElement) {
      silentAudioElement = new Audio(SILENT_WAV_BASE64);
      silentAudioElement.loop = true;
      // Low volume non-zero required by mobile Safari to keep audio session awake
      silentAudioElement.volume = 0.01;
    }
    silentAudioElement.play().catch(() => {});
  } catch (err) {
    console.warn('GymAudioEngine: Background audio keep alive error', err);
  }
}

export function disableBackgroundAudioKeepAlive(): void {
  if (typeof window === 'undefined') return;
  try {
    if (silentAudioElement) {
      silentAudioElement.pause();
      silentAudioElement.currentTime = 0;
    }
  } catch {
    // ignore
  }
}

// Media Session API for lock screen and notification shade display
export function updateMediaSession(remainingSeconds: number, isRunning: boolean): void {
  if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    if (isRunning && remainingSeconds > 0) {
      const m = Math.floor(remainingSeconds / 60);
      const s = remainingSeconds % 60;
      const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `⏱️ Descanso: ${timeStr}`,
        artist: 'OmniAgenda AI - Gimnasio',
        album: 'Descanso entre series',
      });
      navigator.mediaSession.playbackState = 'playing';
    } else {
      navigator.mediaSession.playbackState = 'paused';
    }
  } catch {
    // ignore
  }
}

// Request Notification permission gracefully on timer start
export function requestNotificationPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  try {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch {
    // ignore
  }
}

// Fire system notification + vibration when timer finishes in background
export function sendTimerFinishedNotification(): void {
  if (typeof window === 'undefined') return;

  // Vibrate mobile device (haptic pattern: buzz, pause, buzz, pause, long buzz)
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 150, 300, 150, 600]);
    }
  } catch {}

  // If tab is in background or phone locked, show system notification
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('⏱️ ¡Tiempo de descanso terminado!', {
        body: 'Ha finalizado tu descanso. ¡A por la siguiente serie!',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'gym-timer-finish',
      });
    }
  } catch {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then((reg) => {
          reg.showNotification('⏱️ ¡Tiempo de descanso terminado!', {
            body: 'Ha finalizado tu descanso. ¡A por la siguiente serie!',
            icon: '/pwa-192x192.png',
            tag: 'gym-timer-finish',
          });
        })
        .catch(() => {});
    }
  }
}

// Background Web Worker to prevent browser throttling when switching to WhatsApp / other apps
export interface BackgroundTimerController {
  start: () => void;
  stop: () => void;
  destroy: () => void;
}

export function createBackgroundTimerWorker(onTick: () => void): BackgroundTimerController {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    let intervalId: any = null;
    return {
      start: () => {
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(onTick, 250);
      },
      stop: () => {
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
      },
      destroy: () => {
        if (intervalId) clearInterval(intervalId);
      },
    };
  }

  try {
    const workerScript = `
      let timerId = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (timerId) clearInterval(timerId);
          timerId = setInterval(function() {
            self.postMessage('tick');
          }, 250);
        } else if (e.data === 'stop') {
          if (timerId) clearInterval(timerId);
          timerId = null;
        }
      };
    `;
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    worker.onmessage = () => {
      onTick();
    };

    return {
      start: () => worker.postMessage('start'),
      stop: () => worker.postMessage('stop'),
      destroy: () => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      },
    };
  } catch (err) {
    console.warn('Worker creation fallback to setInterval', err);
    let intervalId: any = null;
    return {
      start: () => {
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(onTick, 250);
      },
      stop: () => {
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
      },
      destroy: () => {
        if (intervalId) clearInterval(intervalId);
      },
    };
  }
}

export function getSavedGymSoundMode(): GymSoundMode {
  if (typeof window === 'undefined') return 'both';
  try {
    const saved = localStorage.getItem(GYM_SOUND_STORAGE_KEY);
    if (saved === 'both' || saved === 'beeps' || saved === 'voice' || saved === 'muted') {
      return saved;
    }
  } catch {
    // fallback
  }
  return 'both';
}

export function saveGymSoundMode(mode: GymSoundMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GYM_SOUND_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export default GymAudioEngine;
