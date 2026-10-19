import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getLocalTasks, saveLocalTasks, loadTasks, upsertTasks } from '../src/services/taskService';
import { getEffectiveCalendarUrl, GOOGLE_CALENDAR_CONFIG } from '../src/services/googleCalendarService';
import { getLocalGymRoutines, saveLocalGymRoutines } from '../src/services/gymService';
import { getUniversitySubjects, saveUniversitySubjects, INITIAL_SUBJECTS } from '../src/services/universityService';
import { getHydrationGoal, setHydrationGoal } from '../src/hooks/useHydrationTracker';
import { setCuentaActual, OWNER_EMAIL } from '../src/lib/cuenta';
import { respuestaMoodleAjena } from '../src/asistente/servidor/supabase';
import type { TaskItem } from '../src/types';

function storage(t: any) {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete (globalThis as any).localStorage; setCuentaActual(); });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
  return values;
}

const task = (id: string): TaskItem => ({ id, title: 'Clase', category: 'Academics', date: '2026-10-20', time: '09:00', durationMinutes: 60, priority: 'media', sourceType: 'manual', completed: false });

describe('Privacidad entre cuentas', () => {
  it('Una cuenta nueva y el invitado empiezan sin tareas: ni de ejemplo ni de otra cuenta del dispositivo', (t) => {
    const values = storage(t);
    saveLocalTasks([task('de-xavier')], 'xavier');
    values.set('calendarasist_tasks', JSON.stringify([task('legado')]));
    values.set('omniagenda_tasks', JSON.stringify([task('legado-2')]));
    assert.deepEqual(getLocalTasks('nueva'), []);
    assert.deepEqual(getLocalTasks(undefined), []);
    assert.deepEqual(getLocalTasks('xavier').map(x => x.id), ['de-xavier']);
  });

  it('Las tareas de ejemplo guardadas antes se descartan', (t) => {
    storage(t);
    saveLocalTasks([task('task-init-today-1'), task('mia')], undefined);
    assert.deepEqual(getLocalTasks(undefined).map(x => x.id), ['mia']);
  });

  it('El invitado nunca lee ni escribe tareas en la nube', async (t) => {
    storage(t);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('no debe llamar a la red'); });
    saveLocalTasks([task('local')], undefined);
    const { tasks, isCloud } = await loadTasks(undefined);
    assert.equal(isCloud, false);
    assert.deepEqual(tasks.map(x => x.id), ['local']);
    await upsertTasks([task('local')], undefined);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  it('El horario universitario por defecto es solo de la cuenta de Xavier', () => {
    assert.equal(getEffectiveCalendarUrl(undefined, undefined), '');
    assert.equal(getEffectiveCalendarUrl('otra', 'otra@example.com'), '');
    assert.equal(getEffectiveCalendarUrl(undefined, OWNER_EMAIL), '');
    assert.equal(getEffectiveCalendarUrl('xavier', OWNER_EMAIL), GOOGLE_CALENDAR_CONFIG.icalUrl);
  });

  it('Las rutinas oficiales del gimnasio son solo de Xavier y cada cuenta lee su clave', (t) => {
    storage(t);
    assert.ok(getLocalGymRoutines('xavier', OWNER_EMAIL).length > 0);
    assert.deepEqual(getLocalGymRoutines('otra', 'otra@example.com'), []);
    assert.deepEqual(getLocalGymRoutines(undefined, undefined), []);
    // Copies of the official routines saved by earlier versions under another account are not shown
    saveLocalGymRoutines(getLocalGymRoutines('xavier', OWNER_EMAIL), 'otra', 'otra@example.com');
    assert.deepEqual(getLocalGymRoutines('otra', 'otra@example.com'), []);
    saveLocalGymRoutines([{ id: 'r1', title: 'Mía', exercises: [] } as any], 'otra', 'otra@example.com');
    assert.deepEqual(getLocalGymRoutines('otra', 'otra@example.com').map(r => r.id), ['r1']);
    assert.deepEqual(getLocalGymRoutines(undefined, undefined), []);
  });

  it('Asignaturas y agua se guardan por cuenta; lo anterior sin cuenta solo lo hereda Xavier', (t) => {
    const values = storage(t);
    values.set('calendarasist_uni_subjects', JSON.stringify([{ id: 'antigua', name: 'De Xavier' }]));
    values.set('omniagenda_hydration_goal_liters', '2.5');
    setCuentaActual('otra', 'otra@example.com');
    assert.deepEqual(getUniversitySubjects(), []);
    assert.equal(getHydrationGoal(), 3.5);
    saveUniversitySubjects([{ id: 'suya' } as any]);
    setHydrationGoal(1);
    setCuentaActual(undefined, undefined);
    assert.deepEqual(getUniversitySubjects(), []);
    assert.equal(getHydrationGoal(), 3.5);
    setCuentaActual('xavier', OWNER_EMAIL);
    assert.deepEqual(getUniversitySubjects().map(s => s.id), ['antigua']);
    assert.equal(getHydrationGoal(), 2.5);
    values.delete('calendarasist_uni_subjects');
    assert.deepEqual(getUniversitySubjects(), INITIAL_SUBJECTS);
    setCuentaActual('otra', 'otra@example.com');
    assert.deepEqual(getUniversitySubjects().map(s => s.id), ['suya']);
    assert.equal(getHydrationGoal(), 1);
  });

  it('La API de Moodle: sin sesión 401, otra cuenta ve un Moodle vacío y no puede escribir', () => {
    assert.equal(respuestaMoodleAjena({ tipo: 'anonimo' }, 'GET', '/api/moodle/entregas').status, 401);
    const ajeno = { tipo: 'ajeno', userId: 'otra' } as const;
    assert.deepEqual(respuestaMoodleAjena(ajeno, 'GET', '/api/moodle/entregas').body, { ok: true, entregas: [] });
    assert.deepEqual(respuestaMoodleAjena(ajeno, 'GET', '/moodle/asignaturas/').body, { ok: true, asignaturas: [] });
    assert.deepEqual(respuestaMoodleAjena(ajeno, 'GET', '/cambios').body, { ok: true, cambios: [] });
    assert.deepEqual(respuestaMoodleAjena(ajeno, 'GET', '/api/moodle/sync-log').body, { ok: true, logs: [] });
    for (const [method, ruta] of [['POST', '/api/moodle/sync-now'], ['GET', '/api/sync-now'], ['PATCH', '/api/moodle/entregas/e1'], ['POST', '/api/moodle/entregas'], ['PUT', '/api/moodle/asignaturas/X']]) {
      assert.equal(respuestaMoodleAjena(ajeno, method, ruta).status, 403, `${method} ${ruta}`);
    }
  });
});
