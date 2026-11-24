import test from 'node:test';
import assert from 'node:assert/strict';
import { atenderMcp, llamarHerramienta, validarRutina, RutinaInvalida, type RutinasStore } from '../src/asistente/mcpGym';
import { INITIAL_GYM_ROUTINES } from '../src/data/initialGymRoutines';
import type { GymRoutine } from '../src/types';

// In-memory store with the same ordering rules as servidor/rutinasGym.ts
function memoria(inicial: GymRoutine[] = []): RutinasStore & { lista: GymRoutine[] } {
  const s = {
    lista: [...inicial],
    async listar() { return s.lista; },
    async guardar(r: GymRoutine, posicion?: number) {
      const antes = s.lista.findIndex(x => x.id === r.id);
      const resto = s.lista.filter(x => x.id !== r.id);
      resto.splice(posicion ?? (antes >= 0 ? antes : resto.length), 0, r);
      s.lista = resto;
    },
    async borrar(id: string) { const n = s.lista.length; s.lista = s.lista.filter(x => x.id !== id); return s.lista.length < n; },
    async reemplazar(r: GymRoutine[]) { s.lista = r; },
  };
  return s;
}

const rutina = (extra: Record<string, unknown> = {}) => ({
  title: 'LUNES: Pierna',
  targetDays: ['lunes'],
  exercises: [{ name: 'A1. Sentadilla', setsReps: '4 series x 3 reps', weight: '120 kg', restSeconds: 25 }],
  ...extra,
});

test('las rutinas actuales de la web pasan la validación tal cual', () => {
  for (const r of INITIAL_GYM_ROUTINES) {
    const v = validarRutina(r);
    assert.equal(v.id, r.id);
    assert.equal(v.exercises.length, r.exercises.length);
    assert.ok(v.exercises.every(e => !('completedSets' in e)), 'el progreso no se guarda en la rutina');
  }
});

test('completa ids y normaliza los días', () => {
  const v = validarRutina(rutina());
  assert.equal(v.id, 'rutina-lunes-pierna');
  assert.equal(v.exercises[0].id, 'a1-sentadilla-1');
  assert.deepEqual(v.targetDays, ['Lunes']);
  assert.equal(v.type, 'workout_session');
});

test('rechaza lo que rompería el diseño de la app', () => {
  assert.throws(() => validarRutina(rutina({ exercises: [] })), RutinaInvalida);
  assert.throws(() => validarRutina(rutina({ exercises: [{ name: 'X', setsReps: 'tres series' }] })), /número de series/);
  assert.throws(() => validarRutina(rutina({ exercises: [{ name: 'X', setsReps: '20 series' }] })), /12 series/);
  assert.throws(() => validarRutina(rutina({ targetDays: ['Funday'] })), /no es un día/);
  assert.throws(() => validarRutina(rutina({ exercises: [{ name: 'X', setsReps: '3 x 5', restSeconds: 5000 }] })), /restSeconds/);
  assert.throws(() => validarRutina(rutina({ id: 'Con Espacios' })), /id/);
});

test('descarta campos desconocidos', () => {
  const v = validarRutina(rutina({ color: 'rojo', exercises: [{ name: 'X', setsReps: '3 x 5', html: '<b>' }] })) as any;
  assert.equal(v.color, undefined);
  assert.equal(v.exercises[0].html, undefined);
});

test('guardar crea, reemplaza por id y respeta la posición', async () => {
  const s = memoria(INITIAL_GYM_ROUTINES.slice(0, 2));
  await llamarHerramienta(s, 'guardar_rutina', { rutina: rutina({ id: 'nueva' }) });
  assert.equal(s.lista.at(-1)!.id, 'nueva');
  await llamarHerramienta(s, 'guardar_rutina', { rutina: rutina({ id: 'nueva', title: 'LUNES: Otra' }), posicion: 0 });
  assert.equal(s.lista[0].title, 'LUNES: Otra');
  assert.equal(s.lista.length, 3);
});

test('reemplazar pone el plan de la semana y borrar quita una', async () => {
  const s = memoria(INITIAL_GYM_ROUTINES);
  const r = await llamarHerramienta(s, 'reemplazar_rutinas', { rutinas: [rutina({ id: 'a' }), rutina({ id: 'b', title: 'MARTES: Torso' })] });
  assert.ok(!('isError' in r));
  assert.deepEqual(s.lista.map(x => x.id), ['a', 'b']);
  assert.ok(!('isError' in await llamarHerramienta(s, 'borrar_rutina', { id: 'a' })));
  assert.equal((await llamarHerramienta(s, 'borrar_rutina', { id: 'zzz' }) as any).isError, true);
});

test('un error de formato vuelve a Claude como mensaje, sin tocar nada', async () => {
  const s = memoria(INITIAL_GYM_ROUTINES);
  const r = await llamarHerramienta(s, 'guardar_rutina', { rutina: { title: 'Sin ejercicios', exercises: [] } }) as any;
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /al menos un ejercicio/);
  assert.equal(s.lista.length, INITIAL_GYM_ROUTINES.length);
});

test('habla MCP: initialize, tools/list, tools/call y notificaciones', async () => {
  const s = memoria(INITIAL_GYM_ROUTINES);
  const init = await atenderMcp(s, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }) as any;
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.ok(init.result.capabilities.tools);
  assert.equal(await atenderMcp(s, { jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const lista = await atenderMcp(s, { jsonrpc: '2.0', id: 2, method: 'tools/list' }) as any;
  assert.deepEqual(lista.result.tools.map((t: any) => t.name), ['ver_rutinas', 'guardar_rutina', 'reemplazar_rutinas', 'borrar_rutina']);
  const ver = await atenderMcp(s, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ver_rutinas', arguments: {} } }) as any;
  assert.equal(ver.result.structuredContent.rutinas.length, INITIAL_GYM_ROUTINES.length);
  const raro = await atenderMcp(s, { jsonrpc: '2.0', id: 4, method: 'resources/list' }) as any;
  assert.equal(raro.error.code, -32601);
});

import { conProgresoLocal } from '../src/services/gymService';
test('las rutinas de la nube conservan las series tachadas en el móvil', () => {
  const local: GymRoutine[] = [{ id: 'r', title: 'LUNES: Pierna', type: 'workout_session', updatedAt: '', exercises: [
    { id: 'a', name: 'A', muscleGroup: '', setsReps: '3 series', weight: '', transfer: '', execution: '', completedSets: [true, false, false] },
  ] }];
  const nube = validarRutina({ id: 'r', title: 'LUNES: Pierna', exercises: [
    { id: 'a', name: 'A', setsReps: '3 series', weight: '125 kg' }, { id: 'b', name: 'B', setsReps: '2 series' },
  ] });
  const r = conProgresoLocal([nube], local)[0];
  assert.deepEqual(r.exercises[0].completedSets, [true, false, false]);
  assert.equal(r.exercises[0].weight, '125 kg');
  assert.equal(r.exercises[1].completedSets, undefined);
});
