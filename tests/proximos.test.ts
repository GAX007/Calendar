import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { proximos } from '../src/asistente/proximos';
import { planActual } from '../src/asistente/logica';
import type { PlannerData } from '../src/planner/data';
import { DEFAULT_PARAMETROS } from '../src/planner/types';
import type { TaskItem } from '../src/types';
import { entrega, evento } from './fixtures/planificador/inputs';

// Entirely fictional data
const data: PlannerData = {
  revision: 'r1', plan_revision: '', parametros: { ...DEFAULT_PARAMETROS }, bloques: [], deuda: [],
  eventos: [
    evento({ id: 'ya', titulo: 'Clase que ya acabó', inicio_local: '08:00', fin_local: '09:00' }),
    evento({ id: 'clase', titulo: 'Clase ficticia', inicio_local: '11:00', fin_local: '12:00', area: 'clase' }),
    evento({ id: 'sem', titulo: 'Entreno inventado', inicio_local: '19:00', fin_local: '20:30', dias_semana: [1, 2, 3, 4, 5],
      fecha_inicio: '2026-10-01', area: 'karate' }),
  ],
  entregas: [
    entrega('a', { titulo: 'Práctica inventada', deadline_utc: '2026-10-06T21:59:00Z' }),          // mañana 23:59
    entrega('lejos', { titulo: 'Proyecto lejano', deadline_utc: '2026-10-20T21:59:00Z' }),          // fuera del rango
    entrega('hecha', { titulo: 'Ya entregada', deadline_utc: '2026-10-06T10:00:00Z', estado: 'hecha' as any }),
  ],
};
const tareas: TaskItem[] = [
  { id: 't1', title: 'Dentista', category: 'Personal', date: '2026-10-06', time: '17:00', endTime: '18:00', durationMinutes: 60,
    priority: 'media', sourceType: 'manual' } as TaskItem,
  { id: 't2', title: 'Sin hora', category: 'Personal', date: '2026-10-05', time: '', durationMinutes: 30, priority: 'baja',
    sourceType: 'manual' } as TaskItem,
];

describe('Lo próximo para Jarvis', () => {
  const ahora = '2026-10-05T09:30'; // lunes
  const r = proximos({ data, tareas, ahoraLocal: ahora, dias: 2, planDe: f => planActual(data, f, ahora) });

  it('Actividades de hoy y mañana en orden, sin lo ya acabado ni lo que no tiene hora', () => {
    const fijas = r.actividades.filter(a => a.clase !== 'estudio').map(a => `${a.fecha} ${a.inicio} ${a.titulo}`);
    assert.deepEqual(fijas, [
      '2026-10-05 11:00 Clase ficticia',
      '2026-10-05 19:00 Entreno inventado',
      '2026-10-06 17:00 Dentista',
      '2026-10-06 19:00 Entreno inventado',
    ]);
    assert.equal(r.actividades.find(a => a.titulo === 'Clase ficticia')?.area, 'clase');
  });

  it('Ids estables por cada vez que ocurre', () => {
    const entrenos = r.actividades.filter(a => a.titulo === 'Entreno inventado').map(a => a.id);
    assert.deepEqual(entrenos, ['evento:sem:2026-10-05T19:00', 'evento:sem:2026-10-06T19:00']);
    assert.ok(r.actividades.find(a => a.titulo === 'Dentista')?.id.startsWith('tarea:t1:'));
  });

  it('Solo entregas pendientes dentro del rango, con la hora de Madrid', () => {
    assert.deepEqual(r.entregas.map(e => [e.uid, e.vence]), [['a', '2026-10-06T23:59']]);
  });

  it('Trae también el resumen hablado de hoy', () => {
    assert.match(r.resumen_hoy, /Hoy/);
    assert.equal(r.zona, 'Europe/Madrid');
  });

  it('El rango va de 1 a 7 días', () => {
    const uno = proximos({ data, tareas, ahoraLocal: ahora, dias: 0.2, planDe: f => planActual(data, f, ahora) });
    assert.ok(uno.actividades.every(a => a.fecha === '2026-10-05'));
  });
});
