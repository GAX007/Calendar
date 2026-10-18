import { it } from 'node:test';
import assert from 'node:assert/strict';
import { cuandoHablado, duracionHablada, guionDelDia, guionEntregas, horaHablada } from '../src/asistente/voz';
import { planActual } from '../src/asistente/logica';
import type { PlannerData } from '../src/planner/data';
import { DEFAULT_PARAMETROS } from '../src/planner/types';
import type { TaskItem } from '../src/types';
import { entrega, evento } from './fixtures/planificador/inputs';

// Entirely fictional data. 2026-10-05 is a Monday; Madrid is UTC+2 in October.
function datos(fields: Partial<PlannerData> = {}): PlannerData {
  return { revision: 'r1', plan_revision: '', entregas: [], eventos: [], parametros: { ...DEFAULT_PARAMETROS }, bloques: [], deuda: [], ...fields };
}
function tarea(fields: Partial<TaskItem>): TaskItem {
  return { id: 't', title: 'Tarea inventada', category: 'Personal', date: '2026-10-05', time: '18:00', durationMinutes: 60,
    priority: 'media', sourceType: 'manual', ...fields };
}

it('Horas en lenguaje hablado', () => {
  assert.equal(horaHablada('09:00'), 'las 9 de la mañana');
  assert.equal(horaHablada('13:00'), 'la 1 de la tarde');
  assert.equal(horaHablada('16:30'), 'las 4 y media de la tarde');
  assert.equal(horaHablada('08:45'), 'las 9 menos cuarto de la mañana');
  assert.equal(horaHablada('12:00'), 'mediodía');
  assert.equal(horaHablada('12:15'), 'las 12 y cuarto del mediodía');
  assert.equal(horaHablada('21:10'), 'las 9 y 10 de la noche');
  assert.equal(horaHablada('23:59'), 'medianoche');
  assert.equal(horaHablada('00:00'), 'medianoche');
});

it('Duraciones y fechas en lenguaje hablado', () => {
  assert.equal(duracionHablada(2.5), '2 horas y media');
  assert.equal(duracionHablada(1), '1 hora');
  assert.equal(duracionHablada(0.75), '45 minutos');
  assert.equal(duracionHablada(1.25), '1 hora y 15 minutos');
  assert.equal(cuandoHablado('2026-10-05T14:00', '2026-10-05'), 'hoy a las 2 de la tarde');
  assert.equal(cuandoHablado('2026-10-06T23:59', '2026-10-05'), 'mañana antes de medianoche');
  assert.equal(cuandoHablado('2026-10-08T10:00', '2026-10-05'), 'el jueves a las 10 de la mañana');
  assert.equal(cuandoHablado('2026-10-14T10:00', '2026-10-05'), 'el miércoles 14 a las 10 de la mañana');
});

it('Guion del día: solo hoy, otro día y entregas de la semana', () => {
  const d = datos({
    eventos: [evento({ titulo: 'Clase ficticia', inicio_local: '10:00', fin_local: '12:00' })],
    entregas: [
      entrega('a', { titulo: 'Práctica inventada', deadline_utc: '2026-10-06T21:59:00Z', horas_est: 2 }),
      entrega('b', { titulo: 'Informe ficticio', deadline_utc: '2026-10-09T08:00:00Z', horas_est: 1 }),
      entrega('c', { titulo: 'Ya hecha', estado: 'hecha', deadline_utc: '2026-10-06T21:00:00Z' }),
      entrega('d', { titulo: 'Muy lejana', deadline_utc: '2026-10-30T21:00:00Z' }),
    ],
  });
  const ahora = '2026-10-05T08:30';
  const tareas = [tarea({ title: 'Karate', time: '19:00' }), tarea({ title: 'Completada', completed: true }),
    tarea({ title: 'Otro día', date: '2026-10-06' })];
  const { frases, entregas } = guionDelDia({ data: d, plan: planActual(d, '2026-10-05', ahora), tareas, ahoraLocal: ahora });
  assert.equal(frases[0], 'Buenos días. Hoy es lunes, 5 de octubre.');
  assert.equal(frases[1], 'En la agenda te quedan 2 cosas: a las 10 de la mañana, Clase ficticia; y a las 7 de la tarde, Karate.');
  assert.match(frases[2], /^Te quedan? .* de estudio\. El primer bloque empieza a /);
  assert.equal(entregas, 0);
  assert.equal(frases[3], 'Hoy no vence ninguna entrega. La próxima es Práctica inventada, mañana antes de medianoche.');
  assert.equal(frases.length, 4);

  // Tomorrow: the whole day counts and the deliverable due that day is read
  const manana = guionDelDia({ data: d, plan: planActual(d, '2026-10-06', ahora), tareas, ahoraLocal: ahora, fecha: '2026-10-06' });
  assert.equal(manana.frases[0], 'Mañana, martes, 6 de octubre.');
  assert.equal(manana.frases[1], 'En la agenda tienes una cosa: a las 6 de la tarde, Otro día.');
  assert.equal(manana.entregas, 1);
  assert.match(manana.frases.at(-1)!, /^Vence una entrega: Práctica inventada, mañana antes de medianoche/);
  assert.ok(!manana.frases.join(' ').includes('Informe ficticio'));

  // The week only when asked for deliverables
  const semana = guionEntregas(d, planActual(d, '2026-10-05', ahora), ahora);
  assert.match(semana[0], /^Entregas en los próximos 7 días: 2\. Práctica inventada, mañana antes de medianoche.*; y Informe ficticio, el viernes a las 10 de la mañana/);
  assert.ok(!semana.join(' ').includes('Muy lejana'));
  assert.ok(!frases.join(' ').includes('Ya hecha'));
  assert.ok(!frases.join(' ').includes('Muy lejana'));
  assert.ok(!frases.join(' ').includes('Completada'));
});

it('Guion del día: día vacío, de noche y con cierre', () => {
  const d = datos();
  const ahora = '2026-10-05T22:00';
  const cierre = [{ bloque_id: 'x', task_uid: 'a', titulo: 'X', inicio_local: '17:00', fin_local: '18:00' }];
  const { frases } = guionDelDia({ data: d, plan: planActual(d, '2026-10-05', ahora), tareas: [tarea({ time: '18:00' })], ahoraLocal: ahora, cierre });
  assert.deepEqual(frases, [
    'Buenas noches. Hoy es lunes, 5 de octubre.',
    'No te queda nada fijo en la agenda para hoy.',
    'Hoy no te queda estudio planificado.',
    'Hoy no vence ninguna entrega.',
    'Anoche moví un bloque que no marcaste como hecho. Si lo hiciste, puedes deshacerlo en Tu día.',
  ]);
});
