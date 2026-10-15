// Short vibration for touch feedback (no-op where unsupported, e.g. iOS Safari)
export function haptic(pattern: number | number[] = 10): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore
  }
}
