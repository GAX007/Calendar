import { it } from 'node:test';
import assert from 'node:assert/strict';
import { duration, generatePlan, postponeFields, previewSocial } from '../src/planner/engine';
import { blockStart, madridLocal, minutes } from '../src/planner/time';
import { entrega, evento, input } from './fixtures/planificador/inputs';

it('1. Día libre: dos tareas de 2 h, sin solapes y dentro del día', () => {
  const p = generatePlan(input());
  assert.equal(p.bloques.length, 2);
  assert.equal(p.en_riesgo.length, 0);
  assert.deepEqual(p.bloques.map(duration), [120, 120]);
  for (const b of p.bloques) { assert.ok(b.inicio_local >= '09:00'); assert.ok(b.fin_local <= '23:00'); }
  assert.ok(p.bloques[0].fin_local <= p.bloques[1].inicio_local);
});
it('2. Fijo 10–12: respeta los 15 minutos antes y después', () => {
  const p = generatePlan(input({ eventos: [evento()], entregas: [entrega('a', { tipo_trabajo: 'ligero', horas_est: 3 })] }));
  for (const b of p.bloques.filter(b => b.task_uid)) assert.ok(b.fin_local <= '09:45' || b.inicio_local >= '12:15');
  assert.ok(p.bloques.some(b => b.evento_id === 'fijo-inventado'));
  assert.equal(p.bloques.filter(b => b.task_uid).reduce((n, b) => n + duration(b), 0), 180);
});
it('3. Social a mitad de semana: diff, sin alterar ningún bloque anterior', () => {
  const i = input({ hasta: '2026-10-11', entregas: Array.from({ length: 6 }, (_, n) => entrega(`demo-${n}`, { deadline_utc: '2026-10-11T21:00:00Z' })) });
  const base = generatePlan(i);
  const social = evento({ id: 'social-inventado', tipo: 'social', area: 'social', fecha_inicio: '2026-10-07', inicio_local: '17:00', fin_local: '21:00' });
  const diff = previewSocial(i, social, base);
  assert.deepEqual(diff.plan.bloques.filter(b => blockStart(b) < diff.desde_local), base.bloques.filter(b => blockStart(b) < diff.desde_local));
  assert.equal(diff.movimientos.length, 2);
  assert.equal(diff.movimientos[0].de[0].fecha, '2026-10-07');
  assert.equal(diff.movimientos[0].a[0].fecha, '2026-10-08');
  assert.equal(diff.horas_nuevas_deuda, 0);
});
it('4. Una tarea que no cabe usa mínimo; una imposible permanece en riesgo', () => {
  const minimum = generatePlan(input({ entregas: [entrega('larga', { horas_est: 8 })] }));
  assert.equal(minimum.bloques[0].version_minima, true);
  assert.equal(duration(minimum.bloques[0]), 120);
  assert.equal(minimum.en_riesgo[0].horas_pendientes, 6);
  const impossible = generatePlan(input({ eventos: [evento({ inicio_local: '09:00', fin_local: '23:00' })] }));
  assert.equal(impossible.bloques.filter(b => b.task_uid).length, 0);
  assert.deepEqual(impossible.en_riesgo.map(r => r.task_uid), ['a', 'b']);
});
it('5. Mismo input: salida idéntica e input inmutable', () => {
  const i = input(), before = structuredClone(i);
  assert.deepEqual(generatePlan(i), generatePlan(i));
  assert.deepEqual(i, before);
  assert.deepEqual(generatePlan(i), generatePlan({ ...i, entregas: [...i.entregas].reverse() }));
});
it('6. Tres aplazamientos generan aviso; aplazar incrementa y bloquea hasta mañana', () => {
  const t = entrega('a', { aplazamientos: 3 });
  assert.equal(generatePlan(input({ entregas: [t] })).avisos_aplazamiento[0].aplazamientos, 3);
  assert.deepEqual(postponeFields(t, '2026-10-06'), { aplazamientos: 4, plan_no_antes_de: '2026-10-06T00:00' });
  const p = generatePlan(input({ entregas: [{ ...t, ...postponeFields(t, '2026-10-06') }] }));
  assert.equal(p.bloques.length, 0);
  assert.equal(p.en_riesgo.length, 1);
});
it('7. Ocultas por grupo, borradas, hechas y descartadas no generan bloques', () => {
  const p = generatePlan(input({ entregas: [entrega('oculta', { oculta_por_grupo: true }), entrega('borrada', { borrada_en_moodle: true }), entrega('hecha', { estado: 'hecha' }), entrega('descartada', { estado: 'descartada' })] }));
  assert.equal(p.bloques.length, 0);
  assert.equal(p.en_riesgo.length, 0);
});
it('8. Recurrencia lunes y miércoles, con rango de validez', () => {
  const p = generatePlan(input({ hasta: '2026-10-11', entregas: [], eventos: [evento({ dias_semana: [1, 3] })] }));
  assert.deepEqual(p.bloques.map(b => b.fecha), ['2026-10-05', '2026-10-07']);
  const bounded = generatePlan(input({ hasta: '2026-10-11', entregas: [], eventos: [evento({ dias_semana: [1, 3], fecha_fin: '2026-10-06' })] }));
  assert.deepEqual(bounded.bloques.map(b => b.fecha), ['2026-10-05']);
});
it('Deadline exacto Madrid: nunca asigna después del vencimiento; DST solo afecta UTC', () => {
  assert.equal(madridLocal('2026-10-05T15:30:00Z'), '2026-10-05T17:30');
  assert.equal(madridLocal('2026-10-25T16:00:00Z'), '2026-10-25T17:00');
  const p = generatePlan(input({ entregas: [entrega('temprana', { deadline_utc: '2026-10-05T15:30:00Z' })] }));
  assert.equal(p.bloques[0].fin_local, '17:30');
  assert.ok(p.bloques[0].version_minima);
  const expired = generatePlan(input({ ahora_local: '2026-10-05T20:00', entregas: [entrega('vencida', { deadline_utc: '2026-10-05T15:00:00Z' })] }));
  assert.equal(expired.en_riesgo.length, 1);
});
it('Presión > 0.6, fecha antes que presión, estimación provisional y límite profundo', () => {
  const p = generatePlan(input({ entregas: [entrega('nula', { horas_est: null }), entrega('critica', { horas_est: 10 })] }));
  assert.equal(p.criticas[0].task_uid, 'critica');
  assert.ok(p.bloques.find(b => b.task_uid === 'nula')!.estimacion_por_defecto);
  assert.ok(p.carga[0].profundas <= 4);
});
it('Social pierde horas: deuda plan_social, mínima y confirmación sobre el máximo', () => {
  const i = input({ entregas: [entrega('a', { horas_est: 4 })], deuda: [{ id: 'deuda-antigua', task_uid: 'a', horas_aplazadas: 5, motivo: 'plan_social', fecha: '2026-10-04' }] });
  const base = generatePlan(i);
  const diff = previewSocial(i, evento({ id: 'social', tipo: 'social', area: 'social', inicio_local: '17:00', fin_local: '19:00' }), base);
  assert.equal(diff.horas_nuevas_deuda, 3);
  assert.equal(diff.nueva_deuda[0].motivo, 'plan_social');
  assert.equal(diff.plan.deuda_total_horas, 8);
  assert.equal(diff.requiere_confirmacion, true);
  assert.deepEqual(diff.versiones_minimas, ['a']);
});
it('El social rechaza invadir un bloque anterior y una fecha pasada', () => {
  const i = input(), base = generatePlan(i);
  assert.throws(() => previewSocial(i, evento({ tipo: 'social', inicio_local: '18:00', fin_local: '20:00' }), base), /bloque anterior/);
  assert.throws(() => previewSocial(i, evento({ tipo: 'social', fecha_inicio: '2026-10-04' }), base), /futuro/);
});
it('Historial inmutable y capacidad profunda ya utilizada no se duplican', () => {
  const i = input(), base = generatePlan(i);
  const p = generatePlan({ ...i, ahora_local: '2026-10-05T19:00', bloques_previos: base.bloques });
  assert.deepEqual(p.bloques[0], base.bloques[0]);
  assert.equal(p.carga[0].profundas, 4);
  assert.equal(p.en_riesgo.length, 0);
});
it('Dividir y fijar un hueco son preferencias ejecutadas por el algoritmo', () => {
  const split = generatePlan(input({ entregas: [entrega('a', { tamano_bloque_min: 30 })] }));
  assert.equal(split.bloques.length, 4);
  const pinned = generatePlan(input({ entregas: [entrega('a', { hueco_inicio_local: '2026-10-05T18:00', hueco_fin_local: '2026-10-05T20:00' })] }));
  assert.equal(pinned.bloques[0].inicio_local, '18:00');
  assert.equal(pinned.bloques[0].fin_local, '20:00');
});
it('Flexibles bloqueantes restan hueco; los no bloqueantes permiten estudio', () => {
  for (const bloqueo of [true, false]) {
    const p = generatePlan(input({ eventos: [evento({ tipo: 'flexible', inicio_local: '17:00', fin_local: '21:00', bloqueo })] }));
    assert.equal(p.bloques.filter(b => b.task_uid).length, bloqueo ? 0 : 2);
  }
});
it('Un hueco fijado se respeta incluso con un máximo profundo menor que la franja', () => {
  const i = input({ parametros: { ...input().parametros, max_horas_profundas_dia: 2 }, entregas: [entrega('pin', {
    hueco_inicio_local: '2026-10-05T19:00', hueco_fin_local: '2026-10-05T21:00',
  })] });
  const p = generatePlan(i);
  assert.equal(p.bloques[0].inicio_local, '19:00');
  assert.equal(p.carga[0].profundas, 2);
});
it('Las otras tareas respetan una reserva concreta, aunque venzan antes', () => {
  const p = generatePlan(input({ entregas: [entrega('urgente', { deadline_utc: '2026-10-05T18:00:00Z' }), entrega('pin', {
    hueco_inicio_local: '2026-10-05T17:00', hueco_fin_local: '2026-10-05T19:00',
  })] }));
  assert.equal(p.bloques.find(b => b.task_uid === 'pin')!.inicio_local, '17:00');
  assert.ok(p.bloques.filter(b => b.task_uid === 'urgente').every(b => b.inicio_local >= '19:00'));
});
it('Un social no puede pisar un evento bloqueado que empieza después de él', () => {
  const i = input({ entregas: [], eventos: [evento({ inicio_local: '18:00', fin_local: '20:00' })] });
  assert.throws(() => previewSocial(i, evento({ id: 'social', tipo: 'social', inicio_local: '17:00', fin_local: '19:00' }), generatePlan(i)), /horario fijo o bloqueado/);
});
