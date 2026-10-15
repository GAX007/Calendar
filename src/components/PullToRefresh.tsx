import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { haptic } from '../utils/haptics';

interface PullToRefreshProps {
  enabled: boolean;
  onRefresh: () => Promise<unknown> | void;
}

const THRESHOLD = 64; // px of (damped) pull needed to trigger
const MAX_PULL = 100;

function isInsideScrolledContainer(el: Element | null): boolean {
  while (el && el !== document.body && el !== document.documentElement) {
    if ((el as HTMLElement).scrollTop > 0) return true;
    el = el.parentElement;
  }
  return false;
}

// Pull-down gesture at the top of the page. Owns its own state so the drag never re-renders the app.
export const PullToRefresh: React.FC<PullToRefreshProps> = ({ enabled, onRefresh }) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let current = 0;
    let armed = false;

    const reset = () => {
      tracking = false;
      current = 0;
      armed = false;
      setPull(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1 || window.scrollY > 0) return;
      const target = e.target as Element | null;
      // Ignore overlays (modals, drawer, floating bars) and inner lists that are scrolled
      if (!target || target.closest('.fixed') || isInsideScrolledContainer(target)) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      current = 0;
      armed = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (window.scrollY > 0 || dy <= 0 || Math.abs(dx) > dy) {
        if (current === 0) tracking = false;
        else reset();
        return;
      }
      current = Math.min(MAX_PULL, dy * 0.5);
      if (!armed && current >= THRESHOLD) {
        armed = true;
        haptic(8);
      } else if (armed && current < THRESHOLD) {
        armed = false;
      }
      setPull(current);
    };

    const onTouchEnd = async () => {
      if (!tracking) return;
      const shouldRefresh = current >= THRESHOLD;
      reset();
      if (!shouldRefresh) return;
      refreshingRef.current = true;
      setRefreshing(true);
      const started = Date.now();
      try {
        await onRefreshRef.current();
      } finally {
        const elapsed = Date.now() - started;
        if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
        refreshingRef.current = false;
        setRefreshing(false);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', reset);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', reset);
    };
  }, [enabled]);

  if (!enabled || (pull === 0 && !refreshing)) return null;

  const offset = refreshing ? THRESHOLD : pull;
  const progress = Math.min(1, offset / THRESHOLD);

  return (
    <div
      aria-hidden={!refreshing}
      role="status"
      className="fixed left-1/2 z-30 -translate-x-1/2 pointer-events-none"
      style={{ top: `calc(env(safe-area-inset-top, 0px) + 3.5rem + ${offset * 0.6}px)` }}
    >
      <div
        className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md flex items-center justify-center text-indigo-600 dark:text-indigo-400"
        style={{ opacity: Math.max(0.25, progress) }}
      >
        <RefreshCw
          className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}
        />
      </div>
      <span className="sr-only">{refreshing ? 'Sincronizando…' : 'Desliza para sincronizar'}</span>
    </div>
  );
};
