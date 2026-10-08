import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleCalendarFeed } from '../src/utils/googleCalendarParser';
import { mergeGoogleCalendarSnapshot } from '../src/utils/googleCalendarSnapshot';
import { replaceGoogleCalendarTasks, toDbRow } from '../src/services/taskService';
import { syncLiveGoogleCalendar } from '../src/services/googleCalendarService';
import type { TaskItem } from '../src/types';

const now = new Date('2026-10-08T10:00:00Z');
const feed = (...events: string[]) => `BEGIN:VCALENDAR\nVERSION:2.0\n${events.map(event => `BEGIN:VEVENT\n${event}\nEND:VEVENT`).join('\n')}\nEND:VCALENDAR`;
const series = 'UID:class\nSUMMARY:Clase\nDTSTART;TZID=Europe/Madrid:20261008T163000\nDTEND;TZID=Europe/Madrid:20261008T183000\nRRULE:FREQ=WEEKLY;COUNT=4;BYDAY=TH';
const parse = (content: string) => parseGoogleCalendarFeed(content, false, now);
function storage(t: any) {
  const values = new Map<string,string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete (globalThis as any).localStorage; });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
  return values;
}

describe('Google Calendar: cambios de horario y sustitución de eventos', () => {
  it('Una excepción sustituye la clase original y conserva su ID al cambiar de día', () => {
    const original = parse(feed(series));
    const changed = parse(feed(series, 'UID:class\nRECURRENCE-ID;TZID=Europe/Madrid:20261008T163000\nSUMMARY:Clase modificada\nDTSTART;TZID=Europe/Madrid:20261009T100000\nDTEND;TZID=Europe/Madrid:20261009T120000'));
    assert.equal(changed.length, 4);
    assert.equal(changed.filter(task => task.date === '2026-10-08').length, 0);
    assert.equal(changed.find(task => task.date === '2026-10-09')?.id, original[0].id);
    assert.equal(changed.find(task => task.date === '2026-10-09')?.time, '10:00');
  });

  it('Respeta EXDATE, cancelaciones y excepciones movidas fuera del patrón', () => {
    const tasks = parse(feed(`${series}\nEXDATE;TZID=Europe/Madrid:20261015T163000`,
      'UID:class\nRECURRENCE-ID;TZID=Europe/Madrid:20261022T163000\nSTATUS:CANCELLED',
      'UID:class\nRECURRENCE-ID;TZID=Europe/Madrid:20261015T163000\nSUMMARY:Clase movida\nDTSTART;TZID=Europe/Madrid:20261016T163000\nDTEND;TZID=Europe/Madrid:20261016T183000'));
    assert.deepEqual(tasks.map(task => task.date), ['2026-10-08', '2026-10-16', '2026-10-29']);
  });

  it('Expande BYDAY, INTERVAL y COUNT en lugar de sumar siete días', () => {
    const tasks = parse(feed(series.replace('COUNT=4;BYDAY=TH', 'INTERVAL=2;COUNT=4;BYDAY=TH,FR')));
    assert.deepEqual(tasks.map(task => task.date), ['2026-10-08', '2026-10-09', '2026-10-22', '2026-10-23']);
  });

  it('Convierte UTC a Madrid y respeta el cambio de hora en una serie local', () => {
    const tasks = parse(feed(series, 'UID:utc\nSUMMARY:UTC\nDTSTART:20261008T083000Z\nDTEND:20261008T093000Z'));
    assert.equal(tasks.find(task => task.id === 'gcal-utc')?.time, '10:30');
    assert.ok(tasks.filter(task => task.id !== 'gcal-utc').every(task => task.time === '16:30' && task.durationMinutes === 120));
  });

  it('No relaciona excepciones de otras asignaturas ni utiliza revisiones antiguas', () => {
    const tasks = parse(feed(series, series.replace('UID:class', 'UID:other'),
      'UID:class\nRECURRENCE-ID;TZID=Europe/Madrid:20261008T163000\nSEQUENCE:2\nSUMMARY:Última revisión\nDTSTART;TZID=Europe/Madrid:20261008T140000\nDTEND;TZID=Europe/Madrid:20261008T160000',
      'UID:class\nRECURRENCE-ID;TZID=Europe/Madrid:20261008T163000\nSEQUENCE:1\nSUMMARY:Antigua\nDTSTART;TZID=Europe/Madrid:20261008T120000\nDTEND;TZID=Europe/Madrid:20261008T130000'));
    assert.equal(tasks.length, 8);
    assert.equal(tasks.find(task => task.title === 'Última revisión')?.time, '14:00');
    assert.equal(tasks.filter(task => task.id.startsWith('gcal-other')).find(task => task.date === '2026-10-08')?.time, '16:30');
  });

  it('Incluye 2027 y rechaza respuestas incompletas antes de retirar eventos', () => {
    assert.equal(parse(feed('UID:future\nSUMMARY:Futura\nDTSTART:20270109T182500Z\nDTEND:20270109T192500Z'))[0].time, '19:25');
    assert.throws(() => parse('<html>Login</html>'), /calendario completo/);
    assert.throws(() => parse(feed(series).replace('END:VCALENDAR', '')), /calendario completo/);
  });

  it('Limpia IDs antiguos y duplicados, conserva tareas propias y el estado completado', () => {
    const incoming = parse(feed(series));
    const legacy = { ...incoming[0], id: incoming[0].extractedFields!.calendarLegacyId!, completed: true };
    const personal: TaskItem = { ...incoming[0], id: 'personal', extractedFields: undefined };
    const stale = { ...incoming[0], id: 'gcal-old' };
    const merged = mergeGoogleCalendarSnapshot([legacy, personal, stale], [...incoming, incoming[0]]);
    assert.equal(merged.length, 5);
    assert.equal(merged.find(task => task.id === incoming[0].id)?.completed, true);
    assert.equal(mergeGoogleCalendarSnapshot(merged, []).length, 1);
    assert.equal(mergeGoogleCalendarSnapshot(merged, [])[0].id, 'personal');
  });

  it('Sustituye el almacenamiento del invitado y funciona con calendarios vacíos', async (t) => {
    const values = storage(t);
    const tasks = parse(feed(series));
    values.set('calendarasist_tasks_guest', JSON.stringify([{ ...tasks[0], id: 'manual', extractedFields: undefined }, { ...tasks[0], id: 'gcal-old' }]));
    await replaceGoogleCalendarTasks(tasks, undefined, null);
    assert.equal(JSON.parse(values.get('calendarasist_tasks_guest')!).length, 5);
    await replaceGoogleCalendarTasks([], undefined, null);
    assert.deepEqual(JSON.parse(values.get('calendarasist_tasks_guest')!).map((task: TaskItem) => task.id), ['manual']);
  });

  it('Guarda antes de retirar registros antiguos y limita las bajas al usuario conectado', async (t) => {
    storage(t);
    const incoming = parse(feed(series)).slice(0,1);
    const old = { ...incoming[0], id: 'gcal-old' };
    const operations: string[] = [];
    let failing = false;
    const client = { from: () => ({
      select: () => ({ order: () => ({ range: () => ({ eq: async (field: string, user: string) => {
        assert.equal(field, 'user_id'); assert.equal(user, 'user');
        return { data: [toDbRow(old, 'user')], error: null };
      } }) }) }),
      upsert: async () => { operations.push('upsert'); return { error: failing ? { message: 'denied' } : null }; },
      delete: () => ({ in: (field: string, ids: string[]) => ({ eq: async (field: string, user: string) => {
        assert.deepEqual(ids, ['gcal-old']); assert.equal(field, 'user_id'); assert.equal(user, 'user');
        operations.push('delete'); return { error: null };
      } }) }),
    }) };
    await replaceGoogleCalendarTasks(incoming, 'user', client as any);
    assert.deepEqual(operations, ['upsert', 'delete']);
    operations.length = 0; failing = true;
    await assert.rejects(replaceGoogleCalendarTasks([{ ...incoming[0], title: 'Cambio' }], 'user', client as any), /guardar/);
    assert.deepEqual(operations, ['upsert']);
  });

  it('Una descarga fallida conserva el calendario anterior y no reutiliza caché', async (t) => {
    const values = storage(t);
    values.set('calendarasist_tasks_user-failure', JSON.stringify(parse(feed(series))));
    const before = values.get('calendarasist_tasks_user-failure');
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      assert.equal(init.cache, 'no-store');
      return new Response(JSON.stringify({ success: false, error: 'Fallo' }), { status: 500 });
    });
    assert.equal((await syncLiveGoogleCalendar('user-failure', 'user@example.org', 'https://example.org/calendar.ics')).success, false);
    assert.equal(values.get('calendarasist_tasks_user-failure'), before);
  });

  it('Dos refrescos simultáneos se aplican en orden y dejan solo la versión más reciente', async (t) => {
    const values = storage(t);
    values.set('calendarasist_tasks_queue', '[]');
    const tasks = parse(feed(series)).slice(0,1);
    let unblock!: () => void;
    let started!: () => void;
    const firstStarted = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { unblock = resolve; });
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      if (calls === 1) { started(); await gate; }
      return new Response(JSON.stringify({ success: true, tasks: [{ ...tasks[0], title: calls === 1 ? 'Primera' : 'Última' }] }));
    });
    const first = syncLiveGoogleCalendar('queue', 'user@example.org', 'https://example.org/calendar.ics');
    await firstStarted;
    const second = syncLiveGoogleCalendar('queue', 'user@example.org', 'https://example.org/calendar.ics');
    assert.equal(calls, 1);
    unblock();
    await Promise.all([first,second]);
    const stored = JSON.parse(values.get('calendarasist_tasks_queue')!);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].title, 'Última');
    assert.match(stored[0].id, /^gcal-user:queue:/);
  });
});
