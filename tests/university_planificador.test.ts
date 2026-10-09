import { it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, duration, previewSocial, assessSavedPlan } from '../src/planner/engine';
import { examCountdown, localDeadlineUtc, universityTask } from '../src/planner/university';
import { entregaSnapshot } from '../src/planner/snapshot';
import { universityWork, subject } from './fixtures/planificador/university';
import { evento, input } from './fixtures/planificador/inputs';

it('Examen de 6 h: seis sesiones de 1 h en días distintos, próximas y con último repaso', () => {
  const task = universityTask(universityWork());
  const i = input({ entregas: [task], hasta: '2026-10-26' });
  const p = generatePlan(i);
  const sessions = p.bloques.filter(b => b.task_uid === task.uid);
  assert.equal(sessions.length, 6);
  assert.deepEqual(sessions.map(duration), [60,60,60,60,60,60]);
  assert.equal(new Set(sessions.map(s => s.fecha)).size, 6);
  assert.ok(sessions[0].fecha >= '2026-10-14');
  assert.equal(sessions.at(-1)!.fecha, '2026-10-25');
  for (let n = 1; n < sessions.length; n++) assert.ok(Date.parse(sessions[n].fecha) - Date.parse(sessions[n-1].fecha) <= 3 * 86400000);
  assert.equal(p.en_riesgo.length, 0);
  assert.deepEqual(p, generatePlan(i));
});
it('Examen lejano: ninguna sesión aislada tres semanas antes; proyección entre semanas', () => {
  const i = input({ entregas: [universityTask(universityWork())], hasta: '2026-10-11' });
  const p = generatePlan(i);
  assert.equal(p.bloques.length, 0);
  assert.equal(p.proyeccion!.length, 6);
  assert.equal(p.en_riesgo.length, 0);
  const next = generatePlan({ ...i, desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(next.bloques, p.proyeccion!.filter(b => b.fecha <= '2026-10-18'));
});
it('Deberes entran en el plan, consumen capacidad y respetan fijos, márgenes y plazos', () => {
  const work = universityTask(universityWork({ id: 'deber-demo', type: 'ejercicios', dueDate: '2026-10-05', dueTime: '23:59', estimatedHours: 2 }));
  const i = input({ entregas: [work], eventos: [evento({ inicio_local: '17:00', fin_local: '18:00' })] });
  const p = generatePlan(i);
  const blocks = p.bloques.filter(b => b.task_uid === work.uid);
  assert.equal(blocks.reduce((n,b) => n + duration(b), 0), 120);
  assert.equal(blocks[0].inicio_local, '18:15');
  assert.equal(generatePlan({ ...i, entregas: [{ ...work, estado: 'hecha' }] }).bloques.filter(b => b.task_uid).length, 0);
});
it('Estudio urgente insuficiente y deber vencido permanecen en riesgo', () => {
  const exam = universityTask(universityWork({ dueDate: '2026-10-05', dueTime: '21:00' }));
  const overdue = universityTask(universityWork({ id: 'vencido', type: 'practica', dueDate: '2026-10-04' }));
  const p = generatePlan(input({ entregas: [exam, overdue] }));
  assert.equal(p.bloques.filter(b => b.task_uid === exam.uid).reduce((n,b) => n + duration(b), 0), 60);
  assert.equal(p.en_riesgo.find(r => r.task_uid === exam.uid)!.horas_pendientes, 5);
  assert.ok(p.en_riesgo.some(r => r.task_uid === overdue.uid));
});
it('Varios exámenes no solapan sesiones ni superan el máximo profundo diario', () => {
  const tasks = ['a','b','c'].map(id => universityTask(universityWork({ id })));
  const i = input({ hasta: '2026-10-26', entregas: tasks, parametros: { ...input().parametros, max_horas_profundas_dia: 2 } });
  const p = generatePlan(i);
  assert.ok(p.carga.every(c => c.profundas <= 2));
  for (let n = 1; n < p.bloques.length; n++) if (p.bloques[n].fecha === p.bloques[n-1].fecha)
    assert.ok(p.bloques[n-1].fin_local <= p.bloques[n].inicio_local);
});
it('Horas pasadas de otra semana no vuelven a asignarse; deuda social conserva el pasado', () => {
  const task = universityTask(universityWork());
  const original = generatePlan(input({ entregas: [task], hasta: '2026-10-26' }));
  const later = input({ entregas: [task], desde: '2026-10-19', hasta: '2026-10-26', ahora_local: '2026-10-19T09:00', bloques_previos: original.bloques });
  const p = generatePlan(later);
  const done = original.bloques.filter(b => b.fecha < '2026-10-19').reduce((n,b) => n + duration(b), 0);
  assert.equal(p.bloques.reduce((n,b) => n + duration(b), 0), 360 - done);
  const social = evento({ id: 'social-demo', tipo: 'social', area: 'social', fecha_inicio: '2026-10-22', inicio_local: '17:00', fin_local: '19:00' });
  const diff = previewSocial(later, social, p);
  assert.deepEqual(diff.plan.bloques.filter(b => `${b.fecha}T${b.inicio_local}` < diff.desde_local), p.bloques.filter(b => `${b.fecha}T${b.inicio_local}` < diff.desde_local));
  assert.equal((diff.plan.proyeccion || []).filter(b => b.task_uid === task.uid).reduce((n,b) => n + duration(b), 0) + done, 360);
});
it('Plan guardado de una semana conserva sesiones y cuenta las previstas en la siguiente', () => {
  const i = input({ desde: '2026-10-12', hasta: '2026-10-18', entregas: [universityTask(universityWork())] });
  const base = generatePlan(i);
  const saved = assessSavedPlan({ ...i, bloques_previos: base.bloques });
  assert.deepEqual(saved.bloques, base.bloques);
  assert.equal(saved.proyeccion!.filter(b => b.task_uid).reduce((n,b) => n + duration(b), 0), 360);
  assert.equal(saved.en_riesgo.length, 0);
});
it('Countdown discreto por asignatura, sin contar exámenes completados', () => {
  const work = universityWork().datos;
  assert.equal(examCountdown([work], subject.id, '2026-10-20'), 'Examen en 6 días · 6 h de estudio');
  assert.equal(examCountdown([{ ...work, status: 'entregado' }], subject.id, '2026-10-20'), null);
  assert.equal(examCountdown([work], 'otra', '2026-10-20'), null);
});
it('Madrid en invierno/verano y hora inexistente; snapshot distingue deber de examen', () => {
  assert.equal(localDeadlineUtc('2026-10-26T10:00'), '2026-10-26T09:00:00.000Z');
  assert.equal(localDeadlineUtc('2026-10-05T10:00'), '2026-10-05T08:00:00.000Z');
  assert.equal(localDeadlineUtc('2026-10-25T02:30'), '2026-10-25T01:30:00.000Z');
  assert.throws(() => localDeadlineUtc('2026-03-29T02:30'), /no existe/);
  assert.notDeepEqual(entregaSnapshot([universityTask(universityWork())]), entregaSnapshot([universityTask(universityWork({ type: 'practica' }))]));
});
