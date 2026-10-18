import React, { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

// Same key as GYM_TIMER_TARGET_STORAGE_KEY in utils/gymAudio (not imported to keep the gym code out of the main chunk)
const GYM_TIMER_TARGET_STORAGE_KEY = 'omniagenda_gym_timer_target_end';

interface PwaUpdatePromptProps {
  onManualCheckReady?: (checkFn: () => Promise<boolean>) => void;
}

// The user is in the middle of something a reload would lose: typing, a dialog/drawer open, or a rest timer running
function isUserBusy(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return true;
  if (document.querySelector('.fixed.inset-0, [aria-modal="true"]')) return true;
  try {
    const timerEnd = Number(localStorage.getItem(GYM_TIMER_TARGET_STORAGE_KEY) || 0);
    if (timerEnd > Date.now()) return true;
  } catch {
    // ignore
  }
  return false;
}

export function PwaUpdatePrompt({ onManualCheckReady }: PwaUpdatePromptProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (!r) return;
      registrationRef.current = r;

      // 1. Periodic check every 3 minutes
      const intervalId = setInterval(() => {
        r.update().catch(() => {});
      }, 3 * 60 * 1000);

      // 2. Crucial for iPhone / iOS WebClip: check every time user returns to the app
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          r.update().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // 3. Check when regaining internet connectivity
      const handleOnline = () => {
        r.update().catch(() => {});
      };
      window.addEventListener('online', handleOnline);

      return () => {
        clearInterval(intervalId);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('online', handleOnline);
      };
    },
    onRegisterError(error) {
      console.warn('PWA service worker registration error:', error);
    },
  });

  // Expose manual update check function to parent if needed
  useEffect(() => {
    if (onManualCheckReady && registrationRef.current) {
      onManualCheckReady(async () => {
        try {
          if (registrationRef.current) {
            await registrationRef.current.update();
            return needRefresh;
          }
          return false;
        } catch {
          return false;
        }
      });
    }
  }, [onManualCheckReady, needRefresh]);

  // Listen to controllerchange: when the new service worker takes over, reload to apply clean state.
  // If the user is busy (editing, dialog open, rest timer running) the reload waits until the app
  // goes to background or the user is idle, so no input is lost mid-task.
  useEffect(() => {
    let refreshing = false;
    let pending = false;
    let idleCheck: ReturnType<typeof setInterval> | null = null;

    const reloadNow = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const tryReload = () => {
      if (!pending) return;
      if (document.visibilityState === 'hidden' || !isUserBusy()) reloadNow();
    };

    const handleControllerChange = () => {
      if (refreshing) return;
      pending = true;
      tryReload();
      if (!refreshing && !idleCheck) {
        idleCheck = setInterval(tryReload, 5000);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }
    document.addEventListener('visibilitychange', tryReload);

    return () => {
      if (idleCheck) clearInterval(idleCheck);
      document.removeEventListener('visibilitychange', tryReload);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, []);

  const handleApplyUpdate = async () => {
    setIsUpdating(true);
    try {
      await updateServiceWorker(true);
      // Fallback reload if updateServiceWorker does not trigger controllerchange immediately
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch {
      window.location.reload();
    }
  };

  if (!needRefresh) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[94%] max-w-md bg-white text-ink px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-2xl shadow-2xl border border-line-2 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-ink-2 animate-pulse" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-ink truncate">Nueva versión disponible</p>
          <p className="text-[10px] text-ink-2 truncate">Actualiza para aplicar los últimos cambios</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleApplyUpdate}
          disabled={isUpdating}
          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition cursor-pointer active:scale-95 flex items-center gap-1.5 disabled:opacity-70"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
          <span>{isUpdating ? 'Actualizando...' : 'Actualizar'}</span>
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="p-1.5 text-slate-400 hover:text-ink rounded-lg transition cursor-pointer"
          title="Descartar por ahora"
          aria-label="Cerrar notificación de actualización"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}

export default PwaUpdatePrompt;
