import { it } from 'node:test';
import assert from 'node:assert/strict';

it('Netlify sin WebSocket: REST funciona, no repite diagnósticos por entrega y propaga errores de escritura', async (t) => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, netlify: process.env.NETLIFY, owner: process.env.MOODLE_OWNER_USER_ID };
  const websocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  process.env.SUPABASE_URL = 'https://moodle-tests.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.NETLIFY = 'true';
  process.env.MOODLE_OWNER_USER_ID = 'owner-uuid';
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: undefined });
  const calls: { method: string; path: string; query: string; body?: string }[] = [];
  let fail = false;
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method || 'GET', path: new URL(url).pathname, query: decodeURIComponent(new URL(url).search), body: init?.body as string | undefined });
    return new Response(fail ? JSON.stringify({ message: 'permission denied', code: '42501' }) : '[]', {
      status: fail ? 403 : 200, headers: { 'Content-Type': 'application/json' },
    });
  });
  try {
    const { MoodleStore, getSupabaseDiagnostics } = await import('../src/services/moodleStore');
    assert.equal((await getSupabaseDiagnostics()).conectado, true);
    assert.equal(calls.length, 4);
    calls.length = 0;
    await MoodleStore.ensureInitialAsignaturas(['NEW']);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    // Every Moodle row is written and read for the owner of the feed only
    assert.ok(JSON.parse(calls[0].body!).every((a: any) => a.user_id === 'owner-uuid'));
    assert.deepEqual(await MoodleStore.getAllEntregasRaw(), []);
    assert.match(calls[1].query, /user_id=eq.owner-uuid/);
    fail = true;
    await assert.rejects(MoodleStore.updateEntrega('missing', { estado: 'hecha' }), /permission denied/);
    await assert.rejects(MoodleStore.getAllEntregasRaw(), /permission denied/);
    // Without the owner variable nothing is read (fail closed)
    fail = false;
    delete process.env.MOODLE_OWNER_USER_ID;
    await assert.rejects(MoodleStore.getAllEntregasRaw(), /MOODLE_OWNER_USER_ID/);
  } finally {
    if (websocket) Object.defineProperty(globalThis, 'WebSocket', websocket);
    for (const [key, value] of Object.entries({ SUPABASE_URL: previous.url, SUPABASE_SERVICE_ROLE_KEY: previous.key, NETLIFY: previous.netlify, MOODLE_OWNER_USER_ID: previous.owner })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
