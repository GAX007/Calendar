import { GymRoutine, ExerciseItem } from '../types';
import { INITIAL_GYM_ROUTINES, GYM_ROUTINES_UPDATED_AT } from '../data/initialGymRoutines';
import { isOwnerEmail } from '../lib/cuenta';

const BASE_GYM_STORAGE_KEY = 'omniagenda_gym_routines';
const GYM_ROUTINES_VERSION = '2026-11-02-fase2-movilidad-visor';
const GYM_VERSION_KEY = 'omniagenda_gym_version';
const GYM_CHANGE_EVENT = 'omniagenda_gym_routines_updated';

// The official routines are Xavier's own: only his signed-in account starts with them
function isOwner(userId?: string, userEmail?: string): boolean {
  return Boolean(userId) && isOwnerEmail(userEmail);
}

function getGymStorageKey(userId?: string, userEmail?: string): string {
  if (userId && userEmail) return `${BASE_GYM_STORAGE_KEY}_${userEmail.toLowerCase().trim()}`;
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

export function canResetToOfficialRoutines(userId?: string, userEmail?: string): boolean {
  return isOwner(userId, userEmail);
}

export function resetToOfficialRoutines(userId?: string, userEmail?: string): GymRoutine[] {
  if (!isOwner(userId, userEmail)) return getLocalGymRoutines(userId, userEmail);
  saveLocalGymRoutines(INITIAL_GYM_ROUTINES, userId, userEmail);
  try {
    localStorage.setItem(GYM_VERSION_KEY, GYM_ROUTINES_VERSION);
  } catch {}
  return INITIAL_GYM_ROUTINES;
}

// Other accounts and the guest only read their own key and start empty. Earlier versions copied
// Xavier's official routines into every account's key: those copies are dropped.
const OFFICIAL_ROUTINE_IDS = new Set(INITIAL_GYM_ROUTINES.map((r) => r.id));
function getOwnGymRoutines(userId?: string, userEmail?: string): GymRoutine[] {
  try {
    const saved = localStorage.getItem(getGymStorageKey(userId, userEmail));
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.filter((r: GymRoutine) => !OFFICIAL_ROUTINE_IDS.has(r.id)) : [];
  } catch (err) {
    console.warn('Error reading gym routines from localStorage:', err);
    return [];
  }
}

// Routines that came from the cloud (rutinas_gym, edited from Claude) win over the built-in ones
const claveNube = (userId?: string, userEmail?: string) => `${getGymStorageKey(userId, userEmail)}_nube`;
function rutinasDeLaNube(userId?: string, userEmail?: string): GymRoutine[] | null {
  try {
    if (!userId || localStorage.getItem(claveNube(userId, userEmail)) !== '1') return null;
    const parsed = JSON.parse(localStorage.getItem(getGymStorageKey(userId, userEmail)) || '[]');
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

export function getLocalGymRoutines(userId?: string, userEmail?: string): GymRoutine[] {
  const nube = rutinasDeLaNube(userId, userEmail);
  if (nube) return nube;
  if (!isOwner(userId, userEmail)) return getOwnGymRoutines(userId, userEmail);
  try {
    const cachedVersion = localStorage.getItem(GYM_VERSION_KEY);
    // If not matching the current updated routine version, force upgrade to Xavier's new official routines
    if (cachedVersion !== GYM_ROUTINES_VERSION) {
      saveLocalGymRoutines(INITIAL_GYM_ROUTINES, userId, userEmail);
      try {
        localStorage.setItem(GYM_VERSION_KEY, GYM_ROUTINES_VERSION);
      } catch {}
      return INITIAL_GYM_ROUTINES;
    }

    const saved = localStorage.getItem(getGymStorageKey(userId, userEmail));
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // If the cached routines are the old generic templates or outdated routines, auto-upgrade
        const isLegacy = parsed.some(
          (r: any) =>
            r.id === 'routine-empuje' ||
            r.id === 'routine-tiron' ||
            r.id === 'routine-pierna' ||
            r.id === 'routine-core' ||
            r.id === 'routine-lunes-pierna-pecho' ||
            r.updatedAt !== GYM_ROUTINES_UPDATED_AT
        );
        if (!isLegacy) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('Error reading gym routines from localStorage:', err);
  }

  // Pre-seed storage with Xavier's official routines
  try {
    localStorage.setItem(getGymStorageKey(userId, userEmail), JSON.stringify(INITIAL_GYM_ROUTINES));
    localStorage.setItem(GYM_VERSION_KEY, GYM_ROUTINES_VERSION);
  } catch {}

  return INITIAL_GYM_ROUTINES;
}

export function saveLocalGymRoutines(
  routines: GymRoutine[],
  userId?: string,
  userEmail?: string
): void {
  try {
    // Only the account's own key: copies under other accounts' keys would show these routines to them
    localStorage.setItem(getGymStorageKey(userId, userEmail), JSON.stringify(routines));
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
  subirRutinasNube(updated, userId, userEmail);
  return updated;
}

export function deleteGymRoutine(routineId: string, userId?: string, userEmail?: string): GymRoutine[] {
  const routines = getLocalGymRoutines(userId, userEmail);
  const updated = routines.filter((r) => r.id !== routineId);
  saveLocalGymRoutines(updated, userId, userEmail);
  subirRutinasNube(updated, userId, userEmail);
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

// Marks one set as done (or not) without toggling: used when a timed set ends by itself
export function setSetCompletion(
  routineId: string,
  exerciseId: string,
  setIndex: number,
  done: boolean,
  userId?: string,
  userEmail?: string
): GymRoutine[] {
  const routines = getLocalGymRoutines(userId, userEmail);
  const updated = routines.map((r) => {
    if (r.id !== routineId) return r;
    const exercises = r.exercises.map((ex) => {
      if (ex.id !== exerciseId) return ex;
      const sets = [...(ex.completedSets || [])];
      sets[setIndex] = done;
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
  subirRutinasNube(updated, userId, userEmail);
  return updated;
}

// ---- Cloud (supabase/migration_fase11_rutinas_gym.sql) ------------------------------------------
// Claude edits the routines through the MCP connector (/api/mcp); the app reads them from rutinas_gym.
// The ticked sets stay on the phone: they are kept by exercise id when a routine changes.
export function conProgresoLocal(nuevas: GymRoutine[], locales: GymRoutine[]): GymRoutine[] {
  const hechas = new Map<string, boolean[]>();
  for (const r of locales) for (const e of r.exercises) if (e.completedSets?.length) hechas.set(`${r.id}/${e.id}`, e.completedSets);
  return nuevas.map((r) => ({
    ...r,
    exercises: r.exercises.map((e) => {
      const sets = hechas.get(`${r.id}/${e.id}`);
      return sets ? { ...e, completedSets: sets } : e;
    }),
  }));
}

export async function sincronizarRutinasNube(userId?: string, userEmail?: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const { supabase } = await import('../lib/supabase');
    if (!supabase) return false;
    const { data, error } = await supabase.from('rutinas_gym').select('datos').eq('user_id', userId).order('orden').order('id');
    if (error || !data?.length) return false; // table missing or still empty: keep the routines of the device
    const nuevas = data.map((f: { datos: GymRoutine }) => f.datos);
    const actuales = getLocalGymRoutines(userId, userEmail);
    localStorage.setItem(claveNube(userId, userEmail), '1');
    saveLocalGymRoutines(conProgresoLocal(nuevas, actuales), userId, userEmail);
    return true;
  } catch (err) {
    console.warn('No se pudieron leer las rutinas de la nube:', err);
    return false;
  }
}

// Live: a change from Claude reaches the open app at once
export async function escucharRutinasNube(userId: string, userEmail?: string): Promise<() => void> {
  const { supabase } = await import('../lib/supabase');
  if (!supabase) return () => undefined;
  const canal = supabase
    .channel(`rutinas_gym_${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rutinas_gym', filter: `user_id=eq.${userId}` },
      () => { void sincronizarRutinasNube(userId, userEmail); })
    .subscribe();
  return () => { void supabase.removeChannel(canal); };
}

// An edit made in the app (new routine, deleted one, reordered exercises) goes back to the cloud,
// so the next sync or Claude does not undo it. Ticked sets are not uploaded.
function subirRutinasNube(rutinas: GymRoutine[], userId?: string, userEmail?: string): void {
  if (!userId || localStorage.getItem(claveNube(userId, userEmail)) !== '1') return;
  void (async () => {
    try {
      const { supabase } = await import('../lib/supabase');
      if (!supabase) return;
      const ahora = new Date().toISOString();
      const filas = rutinas.map((r, orden) => ({
        user_id: userId, id: r.id, orden, actualizado_en: ahora,
        datos: { ...r, exercises: r.exercises.map(({ completedSets: _hechas, ...e }) => e) },
      }));
      if (filas.length) await supabase.from('rutinas_gym').upsert(filas, { onConflict: 'user_id,id' });
      const ids = rutinas.map((r) => r.id);
      let borrar = supabase.from('rutinas_gym').delete().eq('user_id', userId);
      if (ids.length) borrar = borrar.not('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`);
      await borrar;
    } catch (err) {
      console.warn('No se pudieron subir las rutinas a la nube:', err);
    }
  })();
}
