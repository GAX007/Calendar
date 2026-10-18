import { it } from 'node:test';
import assert from 'node:assert/strict';
import { accionesDeComando, normalizarInterpretacion, validarAccion, type ContextoAsistente } from '../src/asistente/interpretar';
import { interpretarComando } from '../src/asistente/comandosVoz';

// Entirely fictional data. 2026-10-15 is a Thursday.
const ctx: ContextoAsistente = {
  ahora_local: '2026-10-15T10:15', dia_semana: 'jueves',
  entregas: [{ uid: 'moodle:1', titulo: 'Labs inventados', vence_local: '2026-10-17T23:59', horas_est: 3 }],
  bloques: [{ task_uid: 'moodle:1', titulo: 'Labs inventados', fecha: '2026-10-15', inicio: '11:00', fin: '13:00' }],
  agenda: [{ tarea_id: 't1', titulo: 'Gym', fecha: '2026-10-15', inicio: '19:00', fin: '20:30' },
    { titulo: 'Clase ficticia', fecha: '2026-10-15', inicio: '15:00', fin: '17:00' }],
  asignaturas: [{ id: 'fis', code: 'FIS', name: 'Física inventada' }],
};

it('Asistente: respuesta de Gemini con franja ocupada y aplazamiento', () => {
  const r = normalizarInterpretacion(JSON.stringify({
    respuesta: 'Vale, te libero la mañana.',
    acciones: [
      { tipo: 'bloquear_franja', fecha: '2026-10-15', inicio: '10:15', fin: '14:00', motivo: 'mañana ocupada' },
      { tipo: 'aplazar_entrega', uid: 'moodle:1' },
    ],
  }), ctx);
  assert.equal(r.respuesta, 'Vale, te libero la mañana.');
  assert.equal(r.descartadas, 0);
  assert.deepEqual(r.acciones, [
    { tipo: 'bloquear_franja', fecha: '2026-10-15', inicio: '10:15', fin: '14:00', titulo: 'Ocupado: mañana ocupada', area: 'otro' },
    { tipo: 'aplazar_entrega', uid: 'moodle:1', titulo: 'Labs inventados' },
  ]);
});

it('Asistente: descarta acciones inventadas o en el pasado', () => {
  const r = normalizarInterpretacion('```json\n' + JSON.stringify({ respuesta: 'Hecho', acciones: [
    { tipo: 'aplazar_entrega', uid: 'no-existe' },
    { tipo: 'bloquear_franja', fecha: '2026-10-15', inicio: '08:00', fin: '09:00' },
    { tipo: 'anadir_actividad', fecha: '2026-10-14', inicio: '18:00', fin: '19:00', titulo: 'Ayer' },
    { tipo: 'anadir_actividad', fecha: '2026-10-15', inicio: '19:00', fin: '18:00', titulo: 'Al revés' },
    { tipo: 'mover_tarea', tarea_id: 'inventada', fecha: '2026-10-16' },
    { tipo: 'borrar_todo' },
  ] }) + '\n```', ctx);
  assert.equal(r.acciones.length, 0);
  assert.equal(r.descartadas, 5); // only the first five are read
  assert.deepEqual(normalizarInterpretacion('esto no es json', ctx), { respuesta: '', acciones: [], descartadas: 0 });
});

it('Asistente: deberes, mover tareas, consultas y aclaraciones', () => {
  assert.deepEqual(validarAccion({ tipo: 'anadir_deber', titulo: 'ejercicios tema 3', asignatura_id: 'fis', vence_local: '2026-10-16', horas_est: 1.6, tipo_deber: 'ejercicios' }, ctx),
    { tipo: 'anadir_deber', titulo: 'Ejercicios tema 3', asignatura_id: 'fis', vence_local: '2026-10-16T23:59', horas_est: 1.5, tipo_deber: 'ejercicios' });
  assert.deepEqual(validarAccion({ tipo: 'anadir_deber', titulo: 'Memoria', asignatura_id: 'otra', vence_local: '2026-10-20T10:00', horas_est: 0, tipo_deber: 'raro' }, ctx),
    { tipo: 'anadir_deber', titulo: 'Memoria', asignatura_id: null, vence_local: '2026-10-20T10:00', horas_est: 2, tipo_deber: 'practica' });
  assert.deepEqual(validarAccion({ tipo: 'mover_tarea', tarea_id: 't1', fecha: '2026-10-16' }, ctx),
    { tipo: 'mover_tarea', tarea_id: 't1', titulo: 'Gym', fecha: '2026-10-16', inicio: '19:00', fin: '20:30' });
  assert.deepEqual(validarAccion({ tipo: 'anadir_actividad', fecha: '2026-10-15', inicio: '11:30', fin: '13:30', titulo: 'vender una app a bares' }, ctx),
    { tipo: 'anadir_actividad', fecha: '2026-10-15', inicio: '11:30', fin: '13:30', titulo: 'Vender una app a bares', area: 'trabajo' });
  assert.deepEqual(validarAccion({ tipo: 'bloquear_franja', fecha: '2026-10-15', inicio: '10:50' }, ctx),
    { tipo: 'bloquear_franja', fecha: '2026-10-15', inicio: '10:50', fin: '14:00', titulo: 'Ocupado', area: 'otro' });
  assert.equal(validarAccion({ tipo: 'mover_tarea', tarea_id: 't1' }, ctx), null);
  const movida = validarAccion({ tipo: 'mover_tarea', tarea_id: 't1', vence_local: '2026-10-16T20:30' }, ctx);
  assert.equal(movida?.tipo === 'mover_tarea' && `${movida.fecha} ${movida.inicio}`, '2026-10-16 19:00');
  const deber = validarAccion({ tipo: 'anadir_deber', titulo: 'Práctica', vence_local: '2026-10-20' }, ctx, 'me han mandado una práctica de física inventada');
  assert.equal(deber?.tipo === 'anadir_deber' && deber.asignatura_id, 'fis');
  const conHoras = validarAccion({ tipo: 'anadir_deber', titulo: 'Práctica', vence_local: '2026-10-20' }, ctx, 'para el martes, unas 3 horas');
  assert.equal(conHoras?.tipo === 'anadir_deber' && conHoras.horas_est, 3);
  assert.equal(normalizarInterpretacion({ respuesta: 'Te muevo el gym', acciones: [{ tipo: 'mover_tarea', tarea_id: 't1' }] }, ctx).respuesta,
    'No he entendido bien qué cambiar. ¿Me lo dices de otra forma?');
  assert.deepEqual(validarAccion({ tipo: 'resumen', fecha: '2026-10-16' }, ctx), { tipo: 'resumen', fecha: '2026-10-16' });
  assert.deepEqual(validarAccion({ tipo: 'resumen' }, ctx), { tipo: 'resumen', fecha: '2026-10-15' });
  assert.deepEqual(validarAccion({ tipo: 'entregas', dias: 90 }, ctx), { tipo: 'entregas', dias: 30 });
  assert.deepEqual(validarAccion({ tipo: 'pedir_aclaracion', pregunta: '¿De qué asignatura?' }, ctx), { tipo: 'pedir_aclaracion', pregunta: '¿De qué asignatura?' });
  assert.equal(validarAccion({ tipo: 'pedir_aclaracion', pregunta: ' ' }, ctx), null);
});

it('Asistente: sin Gemini usa el intérprete local', () => {
  assert.deepEqual(accionesDeComando(interpretarComando('¿y mañana?', ctx.ahora_local)), [{ tipo: 'resumen', fecha: '2026-10-16' }]);
  assert.deepEqual(accionesDeComando(interpretarComando('hoy de 11.30 a 13.30 voy a vender una aplicación a bares', ctx.ahora_local)),
    [{ tipo: 'anadir_actividad', fecha: '2026-10-15', inicio: '11:30', fin: '13:30', titulo: 'Vender una aplicación a bares', area: 'trabajo' }]);
  assert.deepEqual(accionesDeComando(interpretarComando('hola qué tal', ctx.ahora_local)), []);
});
