import { GymRoutine, ExerciseItem } from '../types';
import { INITIAL_GYM_ROUTINES } from '../data/initialGymRoutines';

const BASE_GYM_STORAGE_KEY = 'omniagenda_gym_routines';
const GYM_CHANGE_EVENT = 'omniagenda_gym_routines_updated';

function getGymStorageKey(userId?: string, userEmail?: string): string {
  if (userEmail) return `${BASE_GYM_STORAGE_KEY}_${userEmail.toLowerCase().trim()}`;
  if (userId) return `${BASE_GYM_STORAGE_KEY}_${userId}`;
  return `${BASE_GYM_STORAGE_KEY}_guest`;
}

type GymListener = () => void;
const listeners = new Set<GymListener>();

function emitGymChange() {
  listeners.forEach((l) => {
    try {
      l();
    } catch (err) {
      console.error('Error in gym listener:', err);
    }
  });
  try {
    window.dispatchEvent(new CustomEvent(GYM_CHANGE_EVENT));
  } catch {}
}

export function subscribeToGymChanges(listener: GymListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLocalGymRoutines(userId?: string, userEmail?: string): GymRoutine[] {
  try {
    const candidateKeys = [
      userEmail ? `${BASE_GYM_STORAGE_KEY}_${userEmail.toLowerCase().trim()}` : null,
      userId ? `${BASE_GYM_STORAGE_KEY}_${userId}` : null,
      `${BASE_GYM_STORAGE_KEY}_xaviervarteniuc@gmail.com`,
      BASE_GYM_STORAGE_KEY,
      `${BASE_GYM_STORAGE_KEY}_guest`,
    ].filter(Boolean) as string[];

    for (const key of candidateKeys) {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // If the cached routines are the old generic templates, auto-upgrade to Xavier's routines
          const isLegacy = parsed.some(
            (r: any) =>
              r.id === 'routine-empuje' ||
              r.id === 'routine-tiron' ||
              r.id === 'routine-pierna' ||
              r.id === 'routine-core'
          );
          if (!isLegacy) {
            return parsed;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error reading gym routines from localStorage:', err);
  }

  // Pre-seed storage with Xavier's official routines
  try {
    const targetKey = getGymStorageKey(userId, userEmail);
    localStorage.setItem(targetKey, JSON.stringify(INITIAL_GYM_ROUTINES));
    localStorage.setItem(`${BASE_GYM_STORAGE_KEY}_xaviervarteniuc@gmail.com`, JSON.stringify(INITIAL_GYM_ROUTINES));
    localStorage.setItem(BASE_GYM_STORAGE_KEY, JSON.stringify(INITIAL_GYM_ROUTINES));
  } catch {}

  return INITIAL_GYM_ROUTINES;
}

export function saveLocalGymRoutines(
  routines: GymRoutine[],
  userId?: string,
  userEmail?: string
): void {
  try {
    const key = getGymStorageKey(userId, userEmail);
    localStorage.setItem(key, JSON.stringify(routines));
    if (userEmail) {
      localStorage.setItem(`${BASE_GYM_STORAGE_KEY}_${userEmail.toLowerCase().trim()}`, JSON.stringify(routines));
    }
    localStorage.setItem(`${BASE_GYM_STORAGE_KEY}_xaviervarteniuc@gmail.com`, JSON.stringify(routines));
    localStorage.setItem(BASE_GYM_STORAGE_KEY, JSON.stringify(routines));
    emitGymChange();
  } catch (err) {
    console.warn('Error saving gym routines to localStorage:', err);
  }
}

export function saveGymRoutine(routine: GymRoutine, userId?: string, userEmail?: string): GymRoutine[] {
  const routines = getLocalGymRoutines(userId, userEmail);
  const index = routines.findIndex((r) => r.id === routine.id);
  let updated: GymRoutine[];
  if (index >= 0) {
    updated = routines.map((r) => (r.id === routine.id ? { ...routine, updatedAt: new Date().toISOString() } : r));
  } else {
    updated = [{ ...routine, updatedAt: new Date().toISOString() }, ...routines];
  }
  saveLocalGymRoutines(updated, userId, userEmail);
  return updated;
}

export function deleteGymRoutine(routineId: string, userId?: string, userEmail?: string): GymRoutine[] {
  const routines = getLocalGymRoutines(userId, userEmail);
  const updated = routines.filter((r) => r.id !== routineId);
  saveLocalGymRoutines(updated, userId, userEmail);
  return updated;
}

export function toggleSetCompletion(
  routineId: string,
  exerciseId: string,
  setIndex: number,
  userId?: string,
  userEmail?: string
): GymRoutine[] {
  const routines = getLocalGymRoutines(userId, userEmail);
  const updated = routines.map((r) => {
    if (r.id !== routineId) return r;
    const exercises = r.exercises.map((ex) => {
      if (ex.id !== exerciseId) return ex;
      const sets = [...(ex.completedSets || [])];
      sets[setIndex] = !sets[setIndex];
      return { ...ex, completedSets: sets };
    });
    return { ...r, exercises };
  });
  saveLocalGymRoutines(updated, userId, userEmail);
  return updated;
}

export function resetWorkoutSession(routineId: string, userId?: string, userEmail?: string): GymRoutine[] {
  const routines = getLocalGymRoutines(userId, userEmail);
  const updated = routines.map((r) => {
    if (r.id !== routineId) return r;
    const exercises = r.exercises.map((ex) => {
      const totalSets = ex.completedSets?.length || 3;
      return {
        ...ex,
        completedSets: new Array(totalSets).fill(false),
      };
    });
    return { ...r, exercises };
  });
  saveLocalGymRoutines(updated, userId, userEmail);
  return updated;
}

export function reorderExercise(
  routineId: string,
  fromIndex: number,
  toIndex: number,
  userId?: string,
  userEmail?: string
): GymRoutine[] {
  const routines = getLocalGymRoutines(userId, userEmail);
  const updated = routines.map((r) => {
    if (r.id !== routineId) return r;
    if (
      fromIndex < 0 ||
      fromIndex >= r.exercises.length ||
      toIndex < 0 ||
      toIndex >= r.exercises.length ||
      fromIndex === toIndex
    ) {
      return r;
    }
    const newExercises = [...r.exercises];
    const [moved] = newExercises.splice(fromIndex, 1);
    newExercises.splice(toIndex, 0, moved);
    return { ...r, exercises: newExercises, updatedAt: new Date().toISOString() };
  });
  saveLocalGymRoutines(updated, userId, userEmail);
  return updated;
}
