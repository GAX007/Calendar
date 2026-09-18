import { useSyncExternalStore, useCallback } from 'react';

const HYDRATION_GOAL_KEY = 'omniagenda_hydration_goal_liters';
const HYDRATION_INTAKE_PREFIX = 'omniagenda_hydration_intake_';

type Listener = () => void;
const listeners = new Set<Listener>();

function emitHydrationChange() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.error('Hydration listener error:', err);
    }
  });
}

// Read current goal from localStorage
export function getHydrationGoal(): number {
  try {
    const saved = localStorage.getItem(HYDRATION_GOAL_KEY);
    if (saved) {
      const val = parseFloat(saved);
      if (!isNaN(val) && val > 0) return val;
    }
  } catch {}
  return 3.5;
}

// Update goal in localStorage
export function setHydrationGoal(newGoal: number): void {
  const valid = Math.max(0.5, Math.round(newGoal * 10) / 10);
  try {
    localStorage.setItem(HYDRATION_GOAL_KEY, valid.toString());
  } catch {}
  emitHydrationChange();
}

// Read intake for dateStr from localStorage
export function getHydrationIntake(dateStr: string): number {
  if (!dateStr) return 0;
  try {
    const saved = localStorage.getItem(HYDRATION_INTAKE_PREFIX + dateStr);
    if (saved) {
      const val = parseFloat(saved);
      if (!isNaN(val) && val >= 0) return val;
    }
  } catch {}
  return 0;
}

// Add water exactly once
export function addHydrationWater(dateStr: string, amountLiters = 0.25): number {
  const current = getHydrationIntake(dateStr);
  const next = Math.round((current + amountLiters) * 100) / 100;
  try {
    localStorage.setItem(HYDRATION_INTAKE_PREFIX + dateStr, next.toString());
  } catch {}
  emitHydrationChange();
  return next;
}

// Remove water exactly once
export function removeHydrationWater(dateStr: string, amountLiters = 0.25): number {
  const current = getHydrationIntake(dateStr);
  const next = Math.max(0, Math.round((current - amountLiters) * 100) / 100);
  try {
    localStorage.setItem(HYDRATION_INTAKE_PREFIX + dateStr, next.toString());
  } catch {}
  emitHydrationChange();
  return next;
}

// Reset intake for dateStr
export function resetHydrationToday(dateStr: string): void {
  try {
    localStorage.setItem(HYDRATION_INTAKE_PREFIX + dateStr, '0');
  } catch {}
  emitHydrationChange();
}

// Subscribe to store updates
export function subscribeHydration(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface HydrationState {
  intakeLiters: number;
  goalLiters: number;
  progressPercent: number;
  isCompleted: boolean;
  addWater: (amountLiters?: number) => void;
  removeWater: (amountLiters?: number) => void;
  resetToday: () => void;
  setGoal: (newGoalLiters: number) => void;
}

export function useHydrationTracker(dateStr: string): HydrationState {
  const goalLiters = useSyncExternalStore(
    subscribeHydration,
    getHydrationGoal,
    () => 3.5
  );

  const getSnapshot = useCallback(() => {
    return getHydrationIntake(dateStr);
  }, [dateStr]);

  const intakeLiters = useSyncExternalStore(
    subscribeHydration,
    getSnapshot,
    () => 0
  );

  const addWater = useCallback(
    (amountLiters = 0.25) => {
      addHydrationWater(dateStr, amountLiters);
    },
    [dateStr]
  );

  const removeWater = useCallback(
    (amountLiters = 0.25) => {
      removeHydrationWater(dateStr, amountLiters);
    },
    [dateStr]
  );

  const resetToday = useCallback(() => {
    resetHydrationToday(dateStr);
  }, [dateStr]);

  const setGoal = useCallback((newGoalLiters: number) => {
    setHydrationGoal(newGoalLiters);
  }, []);

  const progressPercent = goalLiters > 0 ? Math.round((intakeLiters / goalLiters) * 100) : 0;
  const isCompleted = intakeLiters >= goalLiters;

  return {
    intakeLiters,
    goalLiters,
    progressPercent,
    isCompleted,
    addWater,
    removeWater,
    resetToday,
    setGoal,
  };
}
