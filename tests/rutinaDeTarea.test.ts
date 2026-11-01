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
