import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  accionesDeComando, CAMPOS_ACCION, esquemaInterpretacion, normalizarInterpretacion, validarAccion, type ContextoAsistente,
} from '../src/asistente/interpretar';
import { interpretarComando } from '../src/asistente/comandosVoz';
import { limpiarPalabrasClave } from '../src/asistente/servidor/openai';
import { esAperturaCuestionario, motivoDescarte, normalizarFiltros } from '../src/utils/moodleFiltros';
import { syncMoodleDeliverables, updateEntregaUserFields, updateEntregasEstado } from '../src/services/moodleSyncService';
import { MoodleStore } from '../src/services/moodleStore';

// Entirely fictional data. 2026-10-15 is a Thursday.
const ctx: ContextoAsistente = {
  ahora_local: '2026-10-15T10:15', dia_semana: 'jueves',
  entregas: [
    { uid: 'm1', titulo: 'Praktika 1 inventada', vence_local: '2026-10-17T23:59', horas_est: 3, asignatura: 'PA01' },
    { uid: 'm2', titulo: 'Galdetegia 2', vence_local: '2026-10-20T12:00', horas_est: null, asignatura: 'PA01' },
    { uid: 'm3', titulo: 'Ariketak 3', vence_local: '2026-10-22T23:59', horas_est: 1, asignatura: 'PA01' },
    { uid: 'm4', titulo: 'Ariketak 4', vence_local: '2026-10-23T23:59', horas_est: 1, asignatura: 'PA01' },
    { uid: 'uni:x', titulo: '[FIS] Informe ficticio', vence_local: '2026-10-19T23:59', horas_est: 2, asignatura: 'FIS' },
  ],
  bloques: [], agenda: [],
  asignaturas: [{ id: 'PA01', code: 'PA01', name: 'Programazio Aurreratua' }, { id: 'fis', code: 'FIS', name: 'Física inventada' }],
};
const nula = Object.fromEntries(Object.keys(CAMPOS_ACCION).map(k => [k, null]));
const accion = (campos: Record<string, unknown>) => ({ ...nula, ...campos });

describe('Asistente: acciones nuevas', () => {
  it('«me voy al cine de 18:00 a 23:00» es un fijo de hoy, no "no he entendido"', () => {
    const dicho = 'me voy al cine de 18:00 a 23:00';
    // Strict output with only the hours: the date is today and the title comes from the sentence
    const r = normalizarInterpretacion(JSON.stringify({ respuesta: 'Vale, te lo apunto.', acciones: [
      accion({ tipo: 'anadir_actividad', inicio: '18:00', fin: '23:00', imprevisto: false }),
    ] }), ctx, dicho);
    assert.equal(r.descartadas, 0);
    assert.deepEqual(r.acciones, [{ tipo: 'anadir_actividad', fecha: '2026-10-15', inicio: '18:00', fin: '23:00', titulo: 'Cine', area: 'otro' }]);
    assert.notEqual(r.respuesta, 'No he entendido bien qué cambiar. ¿Me lo dices de otra forma?');
    // The local parser (no network) understands it too
    const local = accionesDeComando(interpretarComando(dicho, ctx.ahora_local));
    assert.equal(local[0]?.tipo, 'anadir_actividad');
    // Only when the user says it is an unforeseen event
    const imprevisto = validarAccion(accion({ tipo: 'anadir_actividad', fecha: '2026-10-16', inicio: '18:00', fin: '20:00', titulo: 'Cine', imprevisto: true }), ctx);
    assert.equal((imprevisto as any).imprevisto, true);
  });

  it('Modificar una entrega: solo campos válidos y de una entrega real', () => {
    assert.deepEqual(validarAccion(accion({ tipo: 'modificar_entrega', uid: 'm1', vence_local: '2026-10-23', horas_est: 5 }), ctx),
      { tipo: 'modificar_entrega', uid: 'm1', titulo: 'Praktika 1 inventada', vence_local: '2026-10-23T23:59', horas_est: 5 });
    assert.deepEqual(validarAccion(accion({ tipo: 'modificar_entrega', uid: 'm1', titulo: 'Praktika 1 berria' }), ctx),
      { tipo: 'modificar_entrega', uid: 'm1', titulo: 'Praktika 1 inventada', nuevo_titulo: 'Praktika 1 berria' });
    assert.equal(validarAccion(accion({ tipo: 'modificar_entrega', uid: 'inventada', horas_est: 2 }), ctx), null);
    assert.equal(validarAccion(accion({ tipo: 'modificar_entrega', uid: 'm1', vence_local: '2026-10-01T10:00' }), ctx), null, 'nada en el pasado');
    assert.equal(validarAccion(accion({ tipo: 'modificar_entrega', uid: 'm1', horas_est: 900 }), ctx), null);
  });

  it('Descartar una entrega o todas las de una asignatura (por código o nombre en euskera)', () => {
    assert.deepEqual(validarAccion(accion({ tipo: 'descartar_entrega', uid: 'm2' }), ctx), { tipo: 'descartar_entrega', uid: 'm2', titulo: 'Galdetegia 2' });
    assert.equal(validarAccion(accion({ tipo: 'descartar_entrega', uid: 'nope' }), ctx), null);
    const porNombre = validarAccion(accion({ tipo: 'descartar_asignatura', asignatura: 'programazio aurreratua' }), ctx);
    assert.deepEqual(porNombre, { tipo: 'descartar_asignatura', asignatura: 'Programazio Aurreratua', uids: ['m1', 'm2', 'm3', 'm4'], confirmado: false });
    const confirmada = validarAccion(accion({ tipo: 'descartar_asignatura', asignatura: 'PA01', confirmado: true }), ctx);
    assert.equal((confirmada as any).confirmado, true);
    assert.deepEqual((validarAccion(accion({ tipo: 'descartar_asignatura', asignatura: 'FIS' }), ctx) as any).uids, ['uni:x']);
    assert.equal(validarAccion(accion({ tipo: 'descartar_asignatura', asignatura: 'XYZ' }), ctx), null);
  });

  it('El esquema estricto de OpenAI exige todos los campos y no admite otros', () => {
    const s = esquemaInterpretacion() as any;
    assert.equal(s.additionalProperties, false);
    assert.deepEqual(s.required, ['respuesta', 'acciones']);
    const item = s.properties.acciones.items;
    assert.equal(item.additionalProperties, false);
    assert.deepEqual(item.required, Object.keys(item.properties));
    assert.ok(item.properties.tipo.enum.includes('descartar_asignatura'));
    assert.deepEqual(limpiarPalabrasClave(['Programazio Aurreratua', 'a', '<x>\nmalo', 'Programazio Aurreratua']), ['Programazio Aurreratua', 'x malo']);
  });
});

describe('Moodle: aperturas de cuestionario y filtros', () => {
  it('Reconoce las aperturas y aplica palabras y asignaturas', () => {
    assert.equal(esAperturaCuestionario('Galdetegia: erakusleak (2)(r)en hasiera-data'), true);
    assert.equal(esAperturaCuestionario('Galdetegia: erakusleak (2)(r)en itxiera-data'), false);
    const f = normalizarFiltros({ palabras: ['  Foroa ', 'Foroa', 'x', 7], asignaturas: ['GIG302F'] });
    assert.deepEqual(f, { palabras: ['Foroa'], asignaturas: ['GIG302F'] });
    assert.equal(motivoDescarte({ titulo: 'Foroa: aurkezpena', asignatura_codigo: 'OTRA' }, f), 'filtro «Foroa»');
    assert.equal(motivoDescarte({ titulo: 'Lo que sea', asignatura_codigo: 'GIG302F' }, f), 'asignatura GIG302F');
    assert.equal(motivoDescarte({ titulo: 'Práctica', asignatura_codigo: 'OTRA' }, f), null);
  });

  const ics = (eventos: { uid: string; resumen: string; cat: string }[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0',
    ...eventos.flatMap(e => ['BEGIN:VEVENT', `UID:${e.uid}`, `SUMMARY:${e.resumen}`, 'DESCRIPTION:', 'LAST-MODIFIED:20261006T114436Z',
      'DTSTART:20271105T113000Z', 'DTEND:20271105T113000Z', `CATEGORIES:${e.cat}`, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

  beforeEach(() => MoodleStore._resetLocalStoreForTesting({ palabras: ['Foroa'], asignaturas: [] }));

  it('La sync descarta sola las aperturas y lo que filtra el usuario; respeta título y plazo editados', async () => {
    const feed = ics([
      { uid: 'q-open', resumen: 'Galdetegia 9(r)en hasiera-data', cat: 'GIG302F' },
      { uid: 'q-close', resumen: 'Galdetegia 9(r)en itxiera-data', cat: 'GIG302F' },
      { uid: 'foro', resumen: 'Foroa: aurkezpena(r)en entregatze-data', cat: 'GIG302F' },
    ]);
    const r = await syncMoodleDeliverables({ icsContentOverride: feed });
    assert.equal(r.ok, true, r.error || '');
    const estado = async (uid: string) => (await MoodleStore.getEntrega(uid))?.estado;
    assert.equal(await estado('q-open'), 'descartada');
    assert.equal(await estado('q-close'), 'pendiente');
    assert.equal(await estado('foro'), 'descartada');

    // Restored by the user: a later sync does not discard it again
    await updateEntregasEstado(['foro'], 'pendiente');
    await updateEntregaUserFields('q-close', { titulo: 'Mi cuestionario', deadline_utc: '2027-11-10T10:00:00.000Z' });
    await syncMoodleDeliverables({ icsContentOverride: feed.replace('Galdetegia 9(r)en itxiera-data', 'Galdetegia 9 berria(r)en itxiera-data') });
    assert.equal(await estado('foro'), 'pendiente');
    const editada = await MoodleStore.getEntrega('q-close');
    assert.equal(editada?.titulo, 'Mi cuestionario');
    assert.equal(editada?.deadline_utc, '2027-11-10T10:00:00.000Z');
    await assert.rejects(updateEntregasEstado(['foro'], 'hecha' as any), /bloque/);
  });
});
