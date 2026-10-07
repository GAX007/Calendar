import { it } from 'node:test';
import assert from 'node:assert/strict';

it('Netlify sin WebSocket: REST funciona, no repite diagnósticos por entrega y propaga errores de escritura', async (t) => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, netlify: process.env.NETLIFY };
  const websocket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  process.env.SUPABASE_URL = 'https://moodle-tests.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.NETLIFY = 'true';
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: undefined });
  const calls: { method: string; path: string }[] = [];
  let fail = false;
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method || 'GET', path: new URL(url).pathname });
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
    assert.deepEqual(await MoodleStore.getAllEntregasRaw(), []);
    fail = true;
    await assert.rejects(MoodleStore.updateEntrega('missing', { estado: 'hecha' }), /permission denied/);
    await assert.rejects(MoodleStore.getAllEntregasRaw(), /permission denied/);
  } finally {
    if (websocket) Object.defineProperty(globalThis, 'WebSocket', websocket);
    for (const [key, value] of Object.entries({ SUPABASE_URL: previous.url, SUPABASE_SERVICE_ROLE_KEY: previous.key, NETLIFY: previous.netlify })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
