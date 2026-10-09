import assert from 'node:assert/strict';
import test from 'node:test';
import { needsTodayCheckin, parseRealHours, validateCheckin } from '../src/planner/records';
import { madridLocal } from '../src/planner/time';
import { demoCheckin } from './fixtures/planificador/records';

test('Hoy avisa sin check-in y el aviso desaparece con el de hoy', () => {
  assert.equal(needsTodayCheckin(demoCheckin.fecha, null), true);
  assert.equal(needsTodayCheckin(demoCheckin.fecha, demoCheckin), false);
  assert.equal(needsTodayCheckin('2040-02-07', demoCheckin), true);
});
test('Horas reales opcionales: vacío no registra; 1,5 se interpreta sin cambiar estimaciones', () => {
  assert.equal(parseRealHours(''), null); assert.equal(parseRealHours('  '), null);
  assert.equal(parseRealHours('1.5'), 1.5); assert.equal(parseRealHours('1,5'), 1.5);
  for (const value of ['0', '-1', '24.25', '1.1', 'NaN', 'Infinity', 'texto']) assert.throws(() => parseRealHours(value));
});
test('Check-in admite extremos y valida pasos de sueño, energía y fatiga', () => {
  for (const sueno_h of [0, 0.5, 16]) assert.doesNotThrow(() => validateCheckin(demoCheckin.fecha, { ...demoCheckin, sueno_h }));
  for (const values of [{energia:0}, {energia:6}, {fatiga:0}, {fatiga:6}, {sueno_h:-0.5}, {sueno_h:16.5}, {sueno_h:7.25}]) {
    assert.throws(() => validateCheckin(demoCheckin.fecha, { ...demoCheckin, ...values }));
  }
  assert.throws(() => validateCheckin('2040-02-31', demoCheckin));
});
test('El día del check-in usa Madrid incluso alrededor de medianoche y DST', () => {
  assert.equal(madridLocal('2040-02-06T23:30:00Z').slice(0,10), '2040-02-07');
  assert.equal(madridLocal('2040-07-06T22:30:00Z').slice(0,10), '2040-07-07');
});
