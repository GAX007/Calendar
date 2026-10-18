import { it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, previewSocial } from '../src/planner/engine';
import { avisosImprevisto } from '../src/planner/imprevisto';
import { entrega, evento, input } from './fixtures/planificador/inputs';

// Entirely fictional data. 2026-10-05 is a Monday; the fixture plans two 2 h tasks at 17–19 and 19–21,
// due that day at 23:00 Madrid time. The margin around events is 15 minutes.
const social = (inicio: string, fin: string, fecha = '2026-10-05') =>
  evento({ id: 'imprevisto', tipo: 'social', area: 'social', fecha_inicio: fecha, inicio_local: inicio, fin_local: fin });

it('Imprevisto: un bloque futuro que choca se replanifica en vez de rechazar el evento', () => {
  const i = input(), base = generatePlan(i);
  assert.equal(base.bloques[0].inicio_local, '17:00');
  const diff = previewSocial(i, social('18:00', '20:00'), base);
  assert.equal(diff.desde_local, '2026-10-05T17:00'); // the cut moves back to the colliding block
  assert.deepEqual(diff.recortes, []);
  const estudio = diff.plan.bloques.filter(b => b.task_uid);
  assert.ok(estudio.every(b => b.fin_local <= '17:45' || b.inicio_local >= '20:15'), 'nothing inside the event or its margin');
  assert.ok(diff.movimientos.some(m => m.de.some(b => b.inicio_local === '17:00')));
  assert.ok(diff.horas_nuevas_deuda > 0);
});

it('Imprevisto: un bloque en curso se acorta y lo perdido cuenta como deuda', () => {
  const base = generatePlan(input());
  const i = input({ ahora_local: '2026-10-05T17:30', bloques_previos: base.bloques });
  const diff = previewSocial(i, social('18:30', '20:00'), base);
  assert.equal(diff.recortes.length, 1);
  assert.deepEqual({ inicio: diff.recortes[0].inicio_local, fin: diff.recortes[0].fin_local }, { inicio: '17:00', fin: '18:15' });
  const acortado = diff.plan.bloques.find(b => b.id === diff.recortes[0].id)!;
  assert.equal(acortado.fin_local, '18:15');
  assert.equal(diff.desde_local, '2026-10-05T18:30');
  assert.ok(diff.plan.bloques.filter(b => b.task_uid && b.inicio_local >= '18:30').every(b => b.inicio_local >= '20:15'));
  assert.ok(diff.horas_nuevas_deuda > 0);
});

it('Imprevisto: encima de un horario fijo se sigue rechazando', () => {
  const i = input({ eventos: [evento({ inicio_local: '18:00', fin_local: '19:00' })] });
  assert.throws(() => previewSocial(i, social('18:30', '20:00'), generatePlan(i)), /horario fijo o bloqueado/);
});

it('Imprevisto: avisa solo si una entrega cercana se queda sin horas antes del plazo', () => {
  // Due today: no other slot before the deadline → recommendation to find another slot
  const hoy = input(), baseHoy = generatePlan(hoy);
  const diffHoy = previewSocial(hoy, social('17:00', '21:00'), baseHoy);
  const avisos = avisosImprevisto(diffHoy, baseHoy, hoy.entregas, hoy.ahora_local);
  assert.equal(avisos.length, 2);
  assert.match(avisos[0].texto, /^Te recomiendo buscar otro hueco: no te quedan horas para Ejercicio inventado ., que vence hoy a las 11 de la noche/);

  // Due tomorrow with free time tomorrow: the work moves, no warning
  const manana = input({ hasta: '2026-10-06', entregas: [entrega('a', { deadline_utc: '2026-10-06T21:00:00Z' }), entrega('b', { deadline_utc: '2026-10-06T21:00:00Z' })] });
  const baseManana = generatePlan(manana);
  const diffManana = previewSocial(manana, social('17:00', '21:00'), baseManana);
  assert.deepEqual(avisosImprevisto(diffManana, baseManana, manana.entregas, manana.ahora_local), []);

  // Due in more than 48 h: no warning even if it is at risk
  const lejos = input({ entregas: [entrega('a', { deadline_utc: '2026-10-09T21:00:00Z' })] });
  const baseLejos = generatePlan(lejos);
  const diffLejos = previewSocial(lejos, social('17:00', '21:00'), baseLejos);
  assert.deepEqual(avisosImprevisto(diffLejos, baseLejos, lejos.entregas, lejos.ahora_local), []);
});
