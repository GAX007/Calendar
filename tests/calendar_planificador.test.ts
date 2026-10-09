import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarAllocationKey, calendarOccupancy, refreshCalendarBlocks } from '../src/planner/calendar';
import { generatePlan } from '../src/planner/engine';
import { syncCalendarPlanner } from '../src/services/calendarPlannerService';
import { calendarEvento, calendarInput } from './fixtures/planificador/calendar';

test('Calendar: cambiar el nombre conserva la asignación y actualiza la clase mostrada', () => {
  const before = calendarInput();
  const plan = generatePlan(before);
  const after = { ...before, eventos: [calendarEvento('clase-demo', { titulo: 'Otra asignatura inventada' })] };
  assert.equal(calendarAllocationKey(before, false), calendarAllocationKey(after, false));
  const refreshed = refreshCalendarBlocks(plan, after);
  assert.equal(refreshed.bloques.find(b => b.evento_id)?.titulo, 'Otra asignatura inventada');
  assert.deepEqual(refreshed.bloques.filter(b => b.task_uid), plan.bloques.filter(b => b.task_uid));
});
test('Calendar: sustituir o dividir clases en las mismas horas no cambia los huecos', () => {
  const before = calendarInput();
  const after = { ...before, eventos: [calendarEvento('nueva-a', { fin_local: '14:30' }), calendarEvento('nueva-b', { inicio_local: '14:30' })] };
  assert.deepEqual(calendarOccupancy(before), calendarOccupancy(after));
  assert.equal(calendarAllocationKey(before, true), calendarAllocationKey(after, true));
  assert.equal(refreshCalendarBlocks(generatePlan(before), after).bloques.filter(b => b.evento_id).length, 2);
});
test('Calendar: mover o cancelar una clase sí invalida la asignación', () => {
  const before = calendarInput();
  for (const eventos of [[], [calendarEvento('clase-demo', { inicio_local: '16:00', fin_local: '18:00' })]]) {
    assert.notEqual(calendarAllocationKey(before, false), calendarAllocationKey({ ...before, eventos }, false));
  }
});
test('Calendar: un cambio de Moodle o de parámetros sigue invalidando la asignación', () => {
  const before = calendarInput();
  const nameOnly = [calendarEvento('clase-demo', { titulo: 'Nombre actualizado' })];
  assert.notEqual(calendarAllocationKey(before, false), calendarAllocationKey({ ...before, eventos: nameOnly,
    entregas: before.entregas.map(t => ({ ...t, horas_est: 8 })) }, false));
  assert.notEqual(calendarAllocationKey(before, false), calendarAllocationKey({ ...before, eventos: nameOnly,
    parametros: { ...before.parametros, margen_min: 30 } }, false));
});
test('Calendar: respeta márgenes, día de trabajo y horas disponibles hasta plazos futuros', () => {
  const before = calendarInput();
  assert.deepEqual(calendarOccupancy(before), [['2026-10-06', 13 * 60 + 15, 15 * 60 + 45]]);
  const outside = { ...before, eventos: [calendarEvento('fuera', { inicio_local: '07:00', fin_local: '08:00' })] };
  assert.deepEqual(calendarOccupancy(outside), []);
  assert.notEqual(calendarAllocationKey(before, false), calendarAllocationKey({ ...before, eventos: [...before.eventos, calendarEvento('futura', { fecha_inicio: '2026-11-01' })] }, false));
});
test('Calendar: el historial pasado no cambia al actualizar nombres o cancelaciones', () => {
  const before = calendarInput();
  const plan = generatePlan(before);
  const old = { ...plan.bloques.find(b => b.evento_id)!, fecha: '2026-10-04', id: 'historico', titulo: 'Nombre histórico' };
  plan.bloques.push(old);
  const after = refreshCalendarBlocks(plan, { ...before, eventos: [] });
  assert.deepEqual(after.bloques.find(b => b.id === 'historico'), old);
  assert.equal(after.bloques.filter(b => b.evento_id && b.id !== 'historico').length, 0);
});
test('Calendar: no envía propietario al RPC y solo notifica cambios reales', async () => {
  let calls = 0; const notices: unknown[] = [];
  const client = { rpc: async (...args: unknown[]) => {
    assert.deepEqual(args, ['sincronizar_fijos_calendar']); calls++;
    return { data: { actualizados: calls === 1 ? 1 : 0, desactivados: 0, horarios_cambiados: false }, error: null };
  } } as any;
  await syncCalendarPlanner('usuario-inventado', client, change => notices.push(change));
  await syncCalendarPlanner('usuario-inventado', client, change => notices.push(change));
  assert.equal(notices.length, 1);
  await syncCalendarPlanner(undefined, client);
  assert.equal(calls, 2);
});
test('Calendar: un fallo de guardado no notifica éxito al planificador', async () => {
  let notified = false;
  await assert.rejects(syncCalendarPlanner('demo', { rpc: async () => ({ error: { message: 'Fallo inventado' } }) } as any, () => { notified = true; }), /No se pudieron actualizar/);
  assert.equal(notified, false);
});
