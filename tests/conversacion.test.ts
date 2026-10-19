import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { respuestaSiNo, seguirEscuchando, terminaEnPregunta, MAX_TURNOS_SEGUIDOS } from '../src/asistente/conversacion';
import { deshacerCon, ejecutarAccionCon, type BackendAsistente } from '../src/asistente/acciones';
import { assemblePlannerData } from '../src/planner/data';
import { generarToken, hashToken, PREFIJO_TOKEN } from '../src/asistente/servidor/atajo';
import { madridLocal, addDays } from '../src/planner/time';

describe('Conversación: turnos', () => {
  it('Lee un «sí» o un «no» corto (también en euskera) y deja lo demás al modelo', () => {
    for (const t of ['Sí', 'sí, todas', 'vale', 'Vale, hazlo.', 'claro que sí'.replace(' que', ''), 'bai', 'ok', 'adelante']) assert.equal(respuestaSiNo(t), 'si', t);
    for (const t of ['No', 'no, déjalo', 'mejor no', 'ez', 'cancela']) assert.equal(respuestaSiNo(t), 'no', t);
    for (const t of ['solo dos', 'sí pero solo las de mañana y no las otras', 'la de Física', '']) assert.equal(respuestaSiNo(t), null, t);
  });

  it('Sigue escuchando tras una pregunta, una confirmación o una aclaración; no si ya hubo muchos turnos', () => {
    assert.equal(terminaEnPregunta(['Son 4 entregas de PA.', '¿Las descarto todas?']), true);
    assert.equal(terminaEnPregunta(['Hecho.']), false);
    assert.equal(seguirEscuchando({ frases: ['Hecho.'], pendiente: false, aclaracion: false, turnos: 0 }), false);
    assert.equal(seguirEscuchando({ frases: ['Hecho.'], pendiente: true, aclaracion: false, turnos: 0 }), true);
    assert.equal(seguirEscuchando({ frases: ['¿De qué asignatura?'], pendiente: false, aclaracion: false, turnos: 1 }), true);
    assert.equal(seguirEscuchando({ frases: ['¿De qué asignatura?'], pendiente: false, aclaracion: true, turnos: MAX_TURNOS_SEGUIDOS }), false);
  });

  it('Tokens del atajo: largos, con prefijo, y solo se guarda su SHA-256', () => {
    const a = generarToken(), b = generarToken();
    assert.ok(a.startsWith(PREFIJO_TOKEN) && a.length >= 45);
    assert.notEqual(a, b);
    assert.match(hashToken(a), /^[0-9a-f]{64}$/);
    assert.equal(hashToken(` ${a} `), hashToken(a));
  });
});

// A backend in memory: records what the shared actions ask for
function backendFalso() {
  const llamadas: { tipo: string; datos?: unknown }[] = [];
  const ahora = madridLocal(new Date());
  const entregas = [1, 2, 3, 4].map(i => ({ uid: `m${i}`, asignatura_codigo: 'PA01', titulo: `Ariketak ${i}`, tipo: 'entrega', grupo: null,
    oculta_por_grupo: false, deadline_utc: `${addDays(ahora.slice(0, 10), 3 + i)}T20:00:00.000Z`, descripcion: '', moodle_modificado_utc: null,
    borrada_en_moodle: false, estado: 'pendiente', dificultad: null, horas_est: 1, horas_reales: null, min_viable_min: 30, titulo_raw: '' }));
  const data = assemblePlannerData([{ clave: '_revision', valor: 'r1' }], entregas, [], [], [], []);
  const b: BackendAsistente = {
    cargar: async () => ({ ahora, hoy: ahora.slice(0, 10), data }),
    mutar: async (_d, accion, datos) => { llamadas.push({ tipo: `mutar:${accion}`, datos }); },
    estadosMoodle: async (uids, estado) => { llamadas.push({ tipo: `moodle:${estado}`, datos: uids }); },
    editarMoodle: async (uid, campos) => { llamadas.push({ tipo: 'moodle:editar', datos: { uid, ...campos } }); },
    trabajosUni: async () => [],
    guardarTrabajo: async () => { llamadas.push({ tipo: 'uni:guardar' }); },
    asignaturasUni: async () => [],
    asignaturasMoodle: async () => [{ codigo: 'PA01', nombre: 'Programazio Aurreratua' }],
    avisar: () => { llamadas.push({ tipo: 'avisar' }); },
  };
  return { b, llamadas };
}

describe('Acciones compartidas (app y atajo) con un backend en memoria', () => {
  it('Descartar una asignatura con más de 3 entregas pide un «sí»; con él descarta y se puede deshacer', async () => {
    const { b, llamadas } = backendFalso();
    const accion = { tipo: 'descartar_asignatura' as const, asignatura: 'Programazio Aurreratua', uids: ['m1', 'm2', 'm3', 'm4'], confirmado: false };
    const primero = await ejecutarAccionCon(b, accion, [], false);
    assert.equal(primero.confirmar, true);
    assert.match(primero.frases[0], /¿Las descarto todas\?/);
    assert.equal(llamadas.length, 0, 'nada cambia antes del sí');
    const r = await ejecutarAccionCon(b, accion, [], true);
    assert.deepEqual(llamadas.find(l => l.tipo === 'moodle:descartada')?.datos, ['m1', 'm2', 'm3', 'm4']);
    assert.ok(llamadas.some(l => l.tipo === 'mutar:plan'), 'replanifica');
    assert.equal(r.deshacer?.tipo, 'estados');
    llamadas.length = 0;
    await deshacerCon(b, r.deshacer!);
    assert.deepEqual(llamadas.find(l => l.tipo === 'moodle:pendiente')?.datos, ['m1', 'm2', 'm3', 'm4']);
  });

  it('«Me voy al cine» guarda un evento fijo de ese día y replanifica', async () => {
    const { b, llamadas } = backendFalso();
    const manana = addDays(madridLocal(new Date()).slice(0, 10), 1);
    const r = await ejecutarAccionCon(b, { tipo: 'anadir_actividad', fecha: manana, inicio: '18:00', fin: '23:00', titulo: 'Cine', area: 'otro' }, [], false);
    const evento = llamadas.find(l => l.tipo === 'mutar:evento')?.datos as any;
    assert.equal(evento.tipo, 'fijo');
    assert.equal(evento.fecha_inicio, manana);
    assert.equal(evento.dias_semana, null);
    assert.ok(llamadas.some(l => l.tipo === 'mutar:plan'));
    assert.equal(r.tareaNueva?.title, 'Cine');
    assert.equal(r.deshacer?.tipo, 'eventos');
  });
});
