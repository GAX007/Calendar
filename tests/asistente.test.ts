import { it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMinutesLocal, avisosDeAhora, bloquesSinHacer, calibrar, cambiosDeFactor, checkinBajo, cuandoVence, entregasSinEstimar,
  avisosVisibles, horaDeAvisos, limitesPorCheckin, normalizarEstimacion, planActual, planDelCierre, repasoSemanal, resumenManana, type EstadoBloque,
} from '../src/asistente/logica';
import { duration, generatePlan } from '../src/planner/engine';
import type { PlannerData } from '../src/planner/data';
import { DEFAULT_PARAMETROS, type Bloque } from '../src/planner/types';
import { entrega, evento, input } from './fixtures/planificador/inputs';

// Entirely fictional data. 2026-10-05 is a Monday; Madrid is UTC+2 in October.
function datos(fields: Partial<PlannerData> = {}): PlannerData {
  return { revision: 'r1', plan_revision: '', entregas: [entrega('a')], eventos: [], parametros: { ...DEFAULT_PARAMETROS },
    bloques: [], deuda: [], ...fields };
}
function bloque(id: string, fecha: string, inicio: string, fin: string, task_uid: string | null = 'a'): Bloque {
  return { id, fecha, inicio_local: inicio, fin_local: fin, task_uid, evento_id: task_uid ? null : 'ev', version_minima: false,
    reemplaza_a: null, titulo: task_uid ? `Ejercicio inventado ${task_uid}` : 'Taller ficticio', tipo: task_uid ? 'profundo' : 'fijo' };
}
const utc = (local: string) => new Date(`${local}:00+02:00`);

it('Cierre: solo bloques de estudio terminados, pendientes y no marcados como hechos', () => {
  const d = datos({
    entregas: [entrega('a'), entrega('b', { estado: 'hecha' })],
    bloques: [bloque('x1', '2026-10-05', '17:00', '19:00'), bloque('x2', '2026-10-05', '19:15', '20:00'),
      bloque('x3', '2026-10-05', '23:00', '23:30'), bloque('x4', '2026-10-05', '10:00', '11:00', 'b'),
      bloque('ev', '2026-10-05', '09:00', '10:00', null), bloque('x5', '2026-10-04', '17:00', '18:00')],
  });
  const estados = new Map<string, EstadoBloque>([['x2', 'hecho']]);
  assert.deepEqual(bloquesSinHacer(d, '2026-10-05', estados, '2026-10-05T22:00').map(b => b.id), ['x1']);
  estados.set('x1', 'no_hecho');
  assert.deepEqual(bloquesSinHacer(d, '2026-10-05', estados, '2026-10-05T22:00').map(b => b.id), ['x1']);
});

it('Cierre: quitar un bloque no hecho del historial devuelve sus horas al plan de mañana', () => {
  const tarea = entrega('a', { horas_est: 4, deadline_utc: '2026-10-09T21:00:00Z' });
  const hecho = bloque('x1', '2026-10-05', '17:00', '19:00');
  const conBloque = planDelCierre(datos({ entregas: [tarea], bloques: [hecho] }), '2026-10-05T23:31');
  const sinBloque = planDelCierre(datos({ entregas: [{ ...tarea, plan_no_antes_de: '2026-10-06T00:00' }], bloques: [] }), '2026-10-05T23:31');
  const minutos = (p: typeof conBloque) => p.plan.bloques.filter(b => b.task_uid === 'a' && b.fecha > '2026-10-05').reduce((n, b) => n + duration(b), 0);
  assert.equal(minutos(conBloque), 120);
  assert.equal(minutos(sinBloque), 240);
  assert.equal(sinBloque.desde, '2026-10-05');
  assert.equal(sinBloque.hasta, '2026-10-11');
  // Sunday night plans next week
  assert.equal(planDelCierre(datos({ entregas: [] }), '2026-10-11T23:31').desde, '2026-10-12');
});

it('Avisos de entrega a 48 h y 24 h, con el tiempo planificado', () => {
  const d = datos({ entregas: [entrega('a', { deadline_utc: '2026-10-06T21:00:00Z' }), entrega('b', { deadline_utc: '2026-10-07T08:00:00Z' })] });
  const ahora = '2026-10-05T09:00';
  const avisos = avisosDeAhora(d, planActual(d, '2026-10-05', ahora), ahora, utc(ahora));
  const a24 = avisos.find(a => a.clave === 'entrega48:a');
  assert.ok(a24, 'a vence en 36 h: aviso de 2 días');
  assert.match(a24.cuerpo, /mañana a las 23:00/);
  assert.ok(!avisos.some(a => a.clave.startsWith('entrega24:')));
  const tarde = '2026-10-06T08:00';
  const luego = avisosDeAhora(d, planActual(d, '2026-10-06', tarde), tarde, utc(tarde));
  assert.ok(luego.some(a => a.clave === 'entrega24:a'));
  assert.ok(luego.some(a => a.clave === 'entrega48:b'));
});

it('Aviso "es para mañana y no la has hecho": su hueco pasó y no hay nada más programado', () => {
  const tarea = entrega('a', { deadline_utc: '2026-10-06T21:00:00Z' });
  const ahora = '2026-10-05T19:30';
  // The saved plan only has today's block, already over
  const d = datos({ entregas: [tarea], bloques: [bloque('x1', '2026-10-05', '17:00', '19:00')] });
  const plan = { ...planActual(d, '2026-10-05', ahora), proyeccion: d.bloques, bloques: d.bloques };
  const aviso = avisosDeAhora(d, plan, ahora, utc(ahora)).find(a => a.tipo === 'sin_hacer');
  assert.ok(aviso);
  assert.equal(aviso.titulo, 'Oye, «Ejercicio inventado a» es para mañana');
  assert.match(aviso.cuerpo, /no la has marcado como hecha/);
  assert.equal(aviso.clave, 'sin_hacer:a:2026-10-05');
  // Rescheduled for tomorrow: no reminder
  const conFuturo = { ...plan, proyeccion: [...d.bloques, bloque('x2', '2026-10-06', '17:00', '19:00')] };
  assert.ok(!avisosDeAhora(d, conFuturo, ahora, utc(ahora)).some(a => a.tipo === 'sin_hacer'));
  // Block still running: no reminder yet
  const enCurso = '2026-10-05T18:00';
  assert.ok(!avisosDeAhora(d, plan, enCurso, utc(enCurso)).some(a => a.tipo === 'sin_hacer'));
});

it('Sin bloques hoy, el aviso de tarea pendiente para mañana llega a partir de las 20:00', () => {
  const d = datos({ entregas: [entrega('a', { deadline_utc: '2026-10-06T10:00:00Z' })] });
  const vacio = { ...generatePlan(input({ entregas: [] })), proyeccion: [] };
  assert.ok(!avisosDeAhora(d, vacio, '2026-10-05T15:00', utc('2026-10-05T15:00')).some(a => a.tipo === 'sin_hacer'));
  const aviso = avisosDeAhora(d, vacio, '2026-10-05T20:30', utc('2026-10-05T20:30')).find(a => a.tipo === 'sin_hacer');
  assert.match(aviso!.cuerpo, /Vence mañana a las 12:00/);
});

it('Aviso de bloque que empieza en los próximos 20 minutos', () => {
  const d = datos({ bloques: [bloque('x1', '2026-10-05', '17:00', '19:00'), bloque('x2', '2026-10-05', '18:00', '18:30')] });
  const ahora = '2026-10-05T16:45';
  const avisos = avisosDeAhora(d, planActual(d, '2026-10-05', ahora), ahora, utc(ahora)).filter(a => a.tipo === 'bloque');
  assert.deepEqual(avisos.map(a => a.clave), ['bloque:x1']);
  assert.equal(avisos[0].titulo, 'A las 17:00: Ejercicio inventado a');
});

it('Horario de avisos: nada de noche', () => {
  assert.equal(horaDeAvisos('2026-10-05T07:59'), false);
  assert.equal(horaDeAvisos('2026-10-05T08:00'), true);
  assert.equal(horaDeAvisos('2026-10-05T22:29'), true);
  assert.equal(horaDeAvisos('2026-10-05T22:30'), false);
});

it('Calibración por asignatura: necesita 2 entregas medidas y tiende a 1 con pocas muestras', () => {
  const entregas = [
    entrega('p1', { estado: 'hecha', horas_est: 2 }), entrega('p2', { estado: 'hecha', horas_est: 4 }),
    entrega('q1', { asignatura_codigo: 'OTRA', estado: 'hecha', horas_est: 2 }),
    entrega('pend', { factor_calibracion: 1 }), entrega('uni:x', { estado: 'hecha', horas_est: 1 }),
  ];
  const logs = [{ uid: 'p1', horas_reales: 3 }, { uid: 'p2', horas_reales: 4 }, { uid: 'p2', horas_reales: 2 }, { uid: 'q1', horas_reales: 1 }, { uid: 'uni:x', horas_reales: 5 }];
  const c = calibrar(entregas, logs);
  assert.deepEqual(c, [{ asignatura: 'DEMO', factor: 1.25, muestras: 2 }]);
  assert.deepEqual(cambiosDeFactor(entregas, c), [{ uid: 'pend', factor: 1.25 }]);
  const extremo = calibrar([entrega('r1', { estado: 'hecha', horas_est: 1 }), entrega('r2', { estado: 'hecha', horas_est: 1 })],
    [{ uid: 'r1', horas_reales: 20 }, { uid: 'r2', horas_reales: 20 }]);
  assert.equal(extremo[0].factor, 2.5);
});

it('Estimación de la IA: se valida, se redondea a 15 min y solo para entregas sin estimar', () => {
  assert.deepEqual(normalizarEstimacion({ horas_est: 3.1, tipo_trabajo: 'ligero', dificultad: 9, min_viable_min: 5, nota: 'Lectura' }),
    { horas_est: 3, tipo_trabajo: 'ligero', dificultad: 5, min_viable_min: 20, nota: 'Lectura' });
  assert.equal(normalizarEstimacion({ horas_est: 100, tipo_trabajo: 'x' }).horas_est, 40);
  assert.equal(normalizarEstimacion({ horas_est: 100, tipo_trabajo: 'x' }).tipo_trabajo, 'profundo');
  assert.throws(() => normalizarEstimacion({ horas_est: 0 }));
  assert.throws(() => normalizarEstimacion(null));
  const now = utc('2026-10-05T09:00');
  const lista = [entrega('n1', { horas_est: null }), entrega('n2', { horas_est: 3 }), entrega('n3', { horas_est: null, estimado_ia_en: '2026-10-04T00:00:00Z' }),
    entrega('uni:n4', { horas_est: null }), entrega('n5', { horas_est: null, deadline_utc: '2026-10-01T00:00:00Z' })];
  assert.deepEqual(entregasSinEstimar(lista, now).map(t => t.uid), ['n1']);
});

it('Día ligero tras un check-in malo: limita el trabajo profundo de ese día', () => {
  assert.equal(checkinBajo({ energia: 3, sueno_h: 5.5, fatiga: 2 }), true);
  assert.equal(checkinBajo({ energia: 2, sueno_h: 8, fatiga: 2 }), true);
  assert.equal(checkinBajo({ energia: 3, sueno_h: 7, fatiga: 4 }), true);
  assert.equal(checkinBajo({ energia: 3, sueno_h: 7, fatiga: 3 }), false);
  const limites = limitesPorCheckin([{ fecha: '2026-10-05', plan_ligero: true }, { fecha: '2026-10-06', plan_ligero: false }], 4);
  assert.deepEqual(limites, { '2026-10-05': 2 });
  assert.equal(limitesPorCheckin([{ fecha: '2026-10-05', plan_ligero: null }], 4), undefined);
  const i = input({ hasta: '2026-10-06', entregas: [entrega('a', { horas_est: 4, deadline_utc: '2026-10-06T21:00:00Z' })] });
  const profundo = (p: ReturnType<typeof generatePlan>, fecha: string) => p.bloques.filter(b => b.fecha === fecha && b.task_uid).reduce((n, b) => n + duration(b), 0);
  assert.equal(profundo(generatePlan(i), '2026-10-05'), 240);
  const ligero = generatePlan({ ...i, max_profundas_por_dia: limites });
  assert.equal(profundo(ligero, '2026-10-05'), 120);
  assert.equal(profundo(ligero, '2026-10-06'), 120);
});

it('Parte de la mañana: clases, estudio, entregas en 72 h y el cierre de anoche', () => {
  const d = datos({ eventos: [evento({ titulo: 'Clase ficticia', inicio_local: '10:00', fin_local: '12:00' })],
    entregas: [entrega('a', { deadline_utc: '2026-10-06T21:00:00Z' }), entrega('lejos', { deadline_utc: '2026-10-20T21:00:00Z' })] });
  const ahora = '2026-10-05T07:00';
  const r = resumenManana(d, planActual(d, '2026-10-05', ahora), ahora,
    [{ bloque_id: 'x', task_uid: 'a', titulo: 'Ejercicio inventado a', inicio_local: '17:00', fin_local: '19:00' }], false);
  assert.deepEqual(r.clases, [{ titulo: 'Clase ficticia', inicio: '10:00', fin: '12:00' }]);
  assert.deepEqual(r.entregas.map(e => e.uid), ['a']);
  assert.ok(r.bloques.length > 0);
  assert.match(r.texto, /^1 clase o evento \(desde las 10:00\)/);
  assert.match(r.texto, /1 entrega en 72 h: Ejercicio inventado a \(mañana a las 23:00\)/);
  assert.match(r.texto, /anoche moví 1 bloque no hecho\.$/);
});

it('Repaso semanal: horas confirmadas, no hechas, check-ins y semana siguiente', () => {
  const d = datos({
    entregas: [entrega('a', { deadline_utc: '2026-10-14T21:00:00Z', aplazamientos: 2 })],
    bloques: [bloque('h1', '2026-10-06', '17:00', '19:00'), bloque('h2', '2026-10-07', '17:00', '18:00'), bloque('h3', '2026-10-08', '17:00', '18:00')],
  });
  const ahora = '2026-10-11T21:00';
  const r = repasoSemanal({
    data: d, desde: '2026-10-05', hasta: '2026-10-11', ahoraLocal: ahora,
    estados: new Map<string, EstadoBloque>([['h1', 'hecho'], ['h2', 'no_hecho']]),
    cierres: [{ fecha: '2026-10-09', estado: 'aplicado', items: [{ bloque_id: 'c1', task_uid: 'a', titulo: 'x', inicio_local: '17:00', fin_local: '18:30' }] }],
    logs: [{ uid: 'a', fecha: '2026-10-07', horas_reales: 1.5 }, { uid: 'a', fecha: '2026-09-01', horas_reales: 9 }],
    checkins: [{ fecha: '2026-10-05', energia: 2, sueno_h: 6, fatiga: 3 }, { fecha: '2026-10-06', energia: 4, sueno_h: 8, fatiga: 1 }],
    calibracion: [], siguiente: planActual(d, '2026-10-12', ahora),
  });
  assert.equal(r.horas_planificadas, 5.5);
  assert.equal(r.horas_hechas, 2);
  assert.equal(r.horas_no_hechas, 2.5);
  assert.equal(r.horas_sin_confirmar, 1);
  assert.equal(r.horas_reales_registradas, 1.5);
  assert.deepEqual(r.checkins, { dias: 2, energia: 3, sueno_h: 7, fatiga: 2 });
  assert.deepEqual(r.aplazadas, [{ titulo: 'Ejercicio inventado a', aplazamientos: 2 }]);
  assert.deepEqual(r.proxima.entregas.map(e => e.vence_local), ['2026-10-14T23:00']);
  assert.match(r.texto, /^Tu semana: 2 h confirmadas de 5,5 h planificadas · 2 bloques sin hacer/);
});

it('Fechas locales: medianoche y textos de vencimiento', () => {
  assert.equal(addMinutesLocal('2026-10-05T23:50', 20), '2026-10-06T00:10');
  assert.equal(addMinutesLocal('2026-10-05T00:10', -20), '2026-10-04T23:50');
  assert.equal(cuandoVence('2026-10-05T14:00', '2026-10-05'), 'hoy a las 14:00');
  assert.equal(cuandoVence('2026-10-06T23:59', '2026-10-05'), 'mañana a las 23:59');
  assert.equal(cuandoVence('2026-10-08T10:00', '2026-10-05'), 'el jueves a las 10:00');
});

it('Avisos visibles: el más concreto por entrega y los de bloque solo durante una hora', () => {
  const a = (clave: string, tipo: any, creado: string) => ({ clave, tipo, titulo: clave, cuerpo: '', url: '/', creado_en: creado });
  const ahora = Date.parse('2026-10-05T18:40:00+02:00');
  const lista = [
    a('entrega48:uni:x', 'entrega_48h', '2026-10-05T08:00:00+02:00'), a('sin_hacer:uni:x:2026-10-05', 'sin_hacer', '2026-10-05T18:30:00+02:00'),
    a('entrega48:b', 'entrega_48h', '2026-10-05T08:00:00+02:00'), a('entrega24:b', 'entrega_24h', '2026-10-05T12:00:00+02:00'),
    a('entrega48:c', 'entrega_48h', '2026-10-05T09:00:00+02:00'),
    a('bloque:1', 'bloque', '2026-10-05T16:45:00+02:00'), a('bloque:2', 'bloque', '2026-10-05T18:15:00+02:00'),
  ];
  assert.deepEqual(avisosVisibles(lista, ahora).map(x => x.clave), ['sin_hacer:uni:x:2026-10-05', 'entrega24:b', 'entrega48:c', 'bloque:2']);
});
