import test from 'node:test';
import assert from 'node:assert/strict';
import { rutinaDeTarea, conDescripcionDeRutina } from '../src/utils/rutinaDeTarea';
import { INITIAL_GYM_ROUTINES } from '../src/data/initialGymRoutines';
import type { TaskItem } from '../src/types';

const tarea = (title: string, date: string, notes = ''): TaskItem => ({
  id: title + date, title, date, time: '18:30', category: 'Sports/Karate', priority: 'alta', notes, sourceType: 'manual', completed: false,
} as TaskItem);

test('cada día de gym enlaza con su rutina', () => {
  assert.equal(rutinaDeTarea(tarea('Gym', '2026-11-02')), 'routine-lunes-pierna-cadera-golpeo');
  assert.equal(rutinaDeTarea(tarea('Gym', '2026-11-04')), 'routine-miercoles-torso-cuello');
  assert.equal(rutinaDeTarea(tarea('Gym', '2026-11-06')), 'routine-viernes-sabado-hibrido-core');
  assert.equal(rutinaDeTarea(tarea('Gimnasio', '2026-11-07')), 'routine-viernes-sabado-hibrido-core');
});

test('el karate no lleva rutina de gym', () => {
  assert.equal(rutinaDeTarea(tarea('Entrenamiento de Karate (Kumite & Físico)', '2026-11-02', 'fuerza y acondicionamiento')), null);
});

test('los eventos de gym llevan el texto completo y es estable', () => {
  const [lunes] = conDescripcionDeRutina([tarea('Gym', '2026-11-02')], INITIAL_GYM_ROUTINES, '2026-11-01');
  assert.match(lunes.notes, /REGLA GENERAL PARA BLOQUES DE CONTRASTE/);
  assert.match(lunes.notes, /115 - 120 kg/);
  assert.match(lunes.notes, /electrolitos/);
  const [otraVez] = conDescripcionDeRutina([lunes], INITIAL_GYM_ROUTINES, '2026-11-01');
  assert.equal(otraVez, lunes);
  const [mie] = conDescripcionDeRutina([tarea('Gym', '2026-11-04')], INITIAL_GYM_ROUTINES, '2026-11-01');
  assert.equal(rutinaDeTarea(mie), 'routine-miercoles-torso-cuello');
  const [pasado] = conDescripcionDeRutina([tarea('Gym', '2026-10-26', 'antigua')], INITIAL_GYM_ROUTINES, '2026-11-01');
  assert.equal(pasado.notes, 'antigua');
});

test('los eventos de gym empiezan con el calentamiento y duran lo que la rutina', () => {
  const [lunes, mie, vie] = conDescripcionDeRutina(
    [tarea('Gym', '2026-11-02'), tarea('Gym', '2026-11-04'), tarea('Gym', '2026-11-07')],
    INITIAL_GYM_ROUTINES, '2026-11-01');
  assert.ok(lunes.notes!.startsWith('[Calentamiento y Aproximaciones - 15 min]'));
  assert.equal(lunes.endTime, '19:35');
  assert.equal(mie.durationMinutes, 55);
  assert.ok(mie.notes!.startsWith('[Calentamiento y Aproximaciones - 14 min]'));
  assert.equal(vie.endTime, '19:20');
});

test('movilidad, descompresión y pesajes del 2 al 29 de noviembre', async () => {
  const { eventosRecuperacionFase2 } = await import('../src/data/fase2Recuperacion');
  const karate = { ...tarea('Karate Kyokushin', '2026-11-03'), time: '19:30', endTime: '21:00' };
  const clase = { ...tarea('Clase', '2026-11-04'), category: 'Academics', time: '08:00', endTime: '10:00' } as TaskItem;
  const ev = eventosRecuperacionFase2([karate, clase]);
  const de = (tipo: string) => ev.filter((e) => e.id.includes(tipo));
  assert.equal(de('movilidad').length, 12); // 4 martes, 4 jueves, 4 domingos
  assert.equal(de('descompresion').length, 20);
  assert.equal(de('pesaje').length, 8);
  assert.equal(de('descompresion').find((e) => e.date === '2026-11-03')!.time, '22:00');
  assert.equal(de('pesaje').find((e) => e.date === '2026-11-04')!.time, '07:30');
  assert.ok(ev.every((e) => rutinaDeTarea(e) === null));
  assert.ok(ev.every((e) => e.date >= '2026-11-02' && e.date <= '2026-11-29'));
});
