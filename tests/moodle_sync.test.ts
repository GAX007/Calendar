import fs from 'fs';
import path from 'path';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseMoodleICS,
  formatToMadridTime,
  extractGroup,
} from '../src/utils/moodleIcsParser';
import {
  syncMoodleDeliverables,
  createManualEntrega,
  updateEntregaUserFields,
  normalizeMoodleUrl,
} from '../src/services/moodleSyncService';
import { syncMoodleNow, fetchEntregas } from '../src/services/moodleApiClient';
import { MoodleStore } from '../src/services/moodleStore';

describe('Fase 1: Sincronización de entregas de Moodle (ICS)', () => {
  const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/icalexport.ics');
  const fixtureContent = fs.readFileSync(fixturePath, 'utf8');

  beforeEach(() => {
    // Reset test storage to clean slate
    MoodleStore._resetLocalStoreForTesting();
  });

  it('1. Parsea 27 eventos con 27 UIDs distintos', () => {
    const events = parseMoodleICS(fixtureContent);
    assert.equal(events.length, 27, 'Debe haber exactamente 27 eventos parseados');

    const uids = new Set(events.map((e) => e.uid));
    assert.equal(uids.size, 27, 'Debe haber 27 UIDs distintos');
  });

  it('2. Con MIS_GRUPOS = { T: "T2", F: "F1" }: 24 visibles y 3 ocultas (las 3 tareas T1 de GIE301F)', () => {
    const events = parseMoodleICS(fixtureContent, { T: 'T2', F: 'F1' });
    const visibles = events.filter((e) => !e.oculta_por_grupo);
    const ocultas = events.filter((e) => e.oculta_por_grupo);

    assert.equal(visibles.length, 24, 'Debe haber 24 entregas visibles');
    assert.equal(ocultas.length, 3, 'Debe haber 3 entregas ocultas por grupo');

    // Las tres tareas ocultas deben ser T1 y pertenecer a GIE301F
    ocultas.forEach((e) => {
      assert.equal(e.grupo, 'T1', `El grupo debe ser T1, pero es ${e.grupo}`);
      assert.equal(e.asignatura_codigo, 'GIE301F', `La asignatura debe ser GIE301F, pero es ${e.asignatura_codigo}`);
    });
  });

  it('3. Entre el 8 y el 14 de octubre de 2026 quedan 11 entregas visibles', () => {
    const events = parseMoodleICS(fixtureContent, { T: 'T2', F: 'F1' });
    const visibles = events.filter((e) => !e.oculta_por_grupo);

    const oct8to14 = visibles.filter((e) => {
      const madrid = formatToMadridTime(e.deadline_utc);
      return madrid.date >= '2026-10-08' && madrid.date <= '2026-10-14';
    });

    assert.equal(oct8to14.length, 11, 'Deben quedar exactamente 11 entregas visibles entre el 8 y 14 de octubre de 2026');
  });

  it('4. 5626974 y 5626975 (GIG302F) vencen el 16/11/2026 a las 23:59 (Europe/Madrid)', () => {
    const events = parseMoodleICS(fixtureContent);

    const e5626974 = events.find((e) => e.uid.startsWith('5626974'));
    const e5626975 = events.find((e) => e.uid.startsWith('5626975'));

    assert.ok(e5626974, 'Evento 5626974 debe existir');
    assert.ok(e5626975, 'Evento 5626975 debe existir');

    assert.equal(e5626974.asignatura_codigo, 'GIG302F');
    assert.equal(e5626975.asignatura_codigo, 'GIG302F');

    const m74 = formatToMadridTime(e5626974.deadline_utc);
    const m75 = formatToMadridTime(e5626975.deadline_utc);

    assert.equal(m74.formatted, '16/11/2026 23:59', '5626974 debe vencer el 16/11/2026 a las 23:59');
    assert.equal(m75.formatted, '16/11/2026 23:59', '5626975 debe vencer el 16/11/2026 a las 23:59');
  });

  it('5. Un evento con DTSTART:20270109T182500Z se muestra el 09/01/2027 a las 19:25', () => {
    const events = parseMoodleICS(fixtureContent);
    const target = events.find((e) => e.deadline_utc === '2027-01-09T18:25:00Z');

    assert.ok(target, 'Debe existir un evento con deadline UTC 2027-01-09T18:25:00Z');

    const madrid = formatToMadridTime(target.deadline_utc);
    assert.equal(madrid.formatted, '09/01/2027 19:25', 'Debe formatearse como 09/01/2027 a las 19:25 en Europe/Madrid');
  });

  it('6. Ninguna etiqueta I3001-F.2 se interpreta como grupo', () => {
    const detectedInCode = extractGroup('I3001-F.2');
    assert.equal(detectedInCode, null, 'I3001-F.2 no debe extraerse como grupo');

    const detectedInTitle = extractGroup('Entrega de la práctica I3001-F.2 de Web');
    assert.equal(detectedInTitle, null, 'I3001-F.2 en el título no debe extraerse como grupo');
  });

  it('7. Una sincronización repetida sin cambios no crea filas ni registros en cambios', async () => {
    // Primera sincronización
    const sync1 = await syncMoodleDeliverables({ icsContentOverride: fixtureContent });
    assert.equal(sync1.ok, true);
    assert.equal(sync1.nuevos, 27);
    assert.equal(sync1.cambiosCount, 0);

    const entregas1 = await MoodleStore.getAllEntregasRaw();
    assert.equal(entregas1.length, 27);

    const cambios1 = await MoodleStore.getCambios();
    assert.equal(cambios1.length, 0, 'La primera sincronización no debe generar registros en cambios');

    // Segunda sincronización con exactamente el mismo contenido
    const sync2 = await syncMoodleDeliverables({ icsContentOverride: fixtureContent });
    assert.equal(sync2.ok, true);
    assert.equal(sync2.nuevos, 0, 'No debe crear nuevas filas');
    assert.equal(sync2.actualizados, 0, 'No debe actualizar nada si no ha cambiado');
    assert.equal(sync2.cambiosCount, 0, 'No debe detectar cambios');

    const entregas2 = await MoodleStore.getAllEntregasRaw();
    assert.equal(entregas2.length, 27, 'El total de filas debe permanecer constante');

    const cambios2 = await MoodleStore.getCambios();
    assert.equal(cambios2.length, 0, 'No debe crear registros en cambios en sincronización repetida sin cambios');
  });

  it('8. Editar estado o dificultad y volver a sincronizar no los modifica', async () => {
    // Sincronizar primero
    await syncMoodleDeliverables({ icsContentOverride: fixtureContent });

    const targetUid = '1552291@mudle.mondragon.edu/mgep';

    // Modificar campos propios
    await updateEntregaUserFields(targetUid, {
      estado: 'hecha',
      dificultad: 4,
      horas_est: 3.5,
    });

    const beforeSync = await MoodleStore.getEntrega(targetUid);
    assert.equal(beforeSync?.estado, 'hecha');
    assert.equal(beforeSync?.dificultad, 4);
    assert.equal(beforeSync?.horas_est, 3.5);

    // Volver a sincronizar el feed original
    const syncRes = await syncMoodleDeliverables({ icsContentOverride: fixtureContent });
    assert.equal(syncRes.ok, true);

    const afterSync = await MoodleStore.getEntrega(targetUid);
    assert.equal(afterSync?.estado, 'hecha', 'El estado propio debe mantenerse en "hecha"');
    assert.equal(afterSync?.dificultad, 4, 'La dificultad propia debe mantenerse en 4');
    assert.equal(afterSync?.horas_est, 3.5, 'Las horas estimadas deben mantenerse en 3.5');
  });

  it('Los campos propios de fase 2 se conservan cuando Moodle cambia un plazo', async () => {
    await syncMoodleDeliverables({ icsContentOverride: fixtureContent });
    const uid = '1552291@mudle.mondragon.edu/mgep';
    const own = { tipo_trabajo: 'ligero' as const, aplazamientos: 3, factor_calibracion: 1,
      tamano_bloque_min: 30, plan_no_antes_de: '2026-10-06T09:00',
      hueco_inicio_local: '2026-10-09T17:00', hueco_fin_local: '2026-10-09T18:00' };
    await MoodleStore.updateEntrega(uid, own);
    const changed = fixtureContent.replace('DTSTART:20261005T113000Z', 'DTSTART:20261009T150000Z');
    assert.equal((await syncMoodleDeliverables({ icsContentOverride: changed })).ok, true);
    const t = await MoodleStore.getEntrega(uid);
    for (const key of Object.keys(own)) assert.equal(t![key], own[key]);
  });

  it('9. Si en el fixture se modifica una fecha, aparece un aviso en cambios y se guarda antes y despues', async () => {
    // Sincronizar feed inicial
    await syncMoodleDeliverables({ icsContentOverride: fixtureContent });

    // Modificar fecha de un evento en el ICS
    // 1552291 tiene DTSTART:20261005T113000Z. Lo cambiamos a 20261009T150000Z
    const modifiedIcs = fixtureContent.replace(
      'DTSTART:20261005T113000Z\nDTEND:20261005T113000Z',
      'DTSTART:20261009T150000Z\nDTEND:20261009T150000Z'
    );

    const sync2 = await syncMoodleDeliverables({ icsContentOverride: modifiedIcs });
    assert.equal(sync2.ok, true);
    assert.equal(sync2.actualizados, 1);
    assert.equal(sync2.cambiosCount, 1);

    const cambios = await MoodleStore.getCambios();
    assert.equal(cambios.length, 1);
    assert.equal(cambios[0].campo, 'deadline_utc');
    assert.equal(cambios[0].antes, '2026-10-05T11:30:00Z');
    assert.equal(cambios[0].despues, '2026-10-09T15:00:00Z');
  });

  it('10. Entregas manuales llevan prefijo manual- y no se marcan como borradas en moodle', async () => {
    await syncMoodleDeliverables({ icsContentOverride: fixtureContent });

    const manual = await createManualEntrega({
      titulo: 'Memoria de prácticas extra',
      asignatura_codigo: 'GIF301F',
      deadline_madrid: '2026-10-20T18:00',
    });

    assert.ok(manual.uid.startsWith('manual-'), 'UID manual debe empezar por "manual-"');

    // Sincronizar de nuevo con Moodle
    await syncMoodleDeliverables({ icsContentOverride: fixtureContent });

    const manualAfter = await MoodleStore.getEntrega(manual.uid);
    assert.ok(manualAfter, 'La entrega manual no debe ser eliminada');
    assert.equal(manualAfter.borrada_en_moodle, false, 'La entrega manual no debe marcarse como borrada en Moodle');
  });

  it('11. Si un UID deja de aparecer en el feed: borrada_en_moodle = true y la fila no se elimina', async () => {
    await syncMoodleDeliverables({ icsContentOverride: fixtureContent });

    // Eliminar el primer evento del ICS
    const eventIndex = fixtureContent.indexOf('BEGIN:VEVENT');
    const secondEventIndex = fixtureContent.indexOf('BEGIN:VEVENT', eventIndex + 1);
    const icsWithoutFirstEvent = fixtureContent.substring(0, eventIndex) + fixtureContent.substring(secondEventIndex);

    const targetUid = '1552291@mudle.mondragon.edu/mgep';

    const syncResult = await syncMoodleDeliverables({ icsContentOverride: icsWithoutFirstEvent });
    assert.equal(syncResult.ok, true);
    assert.equal(syncResult.borrados, 1);

    const entrega = await MoodleStore.getEntrega(targetUid);
    assert.ok(entrega, 'La fila no debe ser eliminada');
    assert.equal(entrega.borrada_en_moodle, true, 'Debe marcarse con borrada_en_moodle = true');
  });

  it('12. Devuelve estructura de diagnóstico completa en pasos (Paso 3)', async () => {
    const syncRes = await syncMoodleDeliverables({
      icsContentOverride: fixtureContent,
      misGrupos: { T: 'T2', F: 'F1' },
    });

    assert.equal(syncRes.ok, true);
    assert.ok(syncRes.pasos, 'Debe incluir el objeto pasos');
    assert.equal(syncRes.pasos.url_configurada, true);
    assert.equal(syncRes.pasos.descarga.estado_http, 200);
    assert.equal(syncRes.pasos.descarga.empieza_por_vcalendar, true);
    assert.equal(syncRes.pasos.eventos_parseados, 27);
    assert.equal(syncRes.pasos.ocultos_por_grupo, 3);
    assert.equal(syncRes.pasos.upsert.nuevos, 27);
    assert.equal(syncRes.pasos.upsert.errores, 0);
  });

  it('13. Si MOODLE_ICS_URL no está configurada, devuelve ok: false y error: url_no_configurada', async () => {
    const prevUrl = process.env.MOODLE_ICS_URL;
    try {
      delete process.env.MOODLE_ICS_URL;
      const syncRes = await syncMoodleDeliverables();
      assert.equal(syncRes.ok, false);
      assert.equal(syncRes.error, 'url_no_configurada');
      assert.equal(syncRes.pasos.url_configurada, false);
    } finally {
      if (prevUrl) process.env.MOODLE_ICS_URL = prevUrl;
    }
  });

  it('No interpreta formatos equivalentes de Supabase como cambios de fecha', async () => {
    await syncMoodleDeliverables({ icsContentOverride: fixtureContent });
    const first = (await MoodleStore.getAllEntregasRaw())[0];
    await MoodleStore.updateEntrega(first.uid, { deadline_utc: first.deadline_utc.replace('Z', '+00:00') });
    const result = await syncMoodleDeliverables({ icsContentOverride: fixtureContent });
    assert.equal(result.actualizados, 0);
    assert.equal(result.cambiosCount, 0);
  });

  it('Un fallo al guardar se informa y no genera cambios ficticios ni bajas', async (t) => {
    await syncMoodleDeliverables({ icsContentOverride: fixtureContent });
    t.mock.method(MoodleStore, 'upsertEntrega', async () => { throw new Error('RLS denegó la escritura'); });
    const result = await syncMoodleDeliverables({ icsContentOverride: fixtureContent.replace('20261005T113000Z', '20261009T150000Z') });
    assert.equal(result.ok, false);
    assert.equal(result.pasos.upsert.errores, 1);
    assert.equal(result.cambiosCount, 0);
    assert.equal((await MoodleStore.getSyncLogs(1))[0].ok, false);
  });

  it('Rechaza calendarios truncados, HTML y eventos sin fecha sin alterar entregas', async () => {
    await syncMoodleDeliverables({ icsContentOverride: fixtureContent });
    for (const invalid of [fixtureContent.replace('END:VCALENDAR', ''), '<html>Login</html>', 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:missing-date\nEND:VEVENT\nEND:VCALENDAR']) {
      const result = await syncMoodleDeliverables({ icsContentOverride: invalid });
      assert.equal(result.ok, false);
      assert.match(result.error!, /contenido_invalido/);
      assert.equal((await MoodleStore.getAllEntregasRaw()).filter(e => !e.borrada_en_moodle).length, 27);
    }
  });

  it('Crea asignaturas nuevas sin sobrescribir nombres editados', async () => {
    await MoodleStore.updateAsignatura('GIE301F', { nombre: 'Mi nombre personalizado' });
    await syncMoodleDeliverables({ icsContentOverride: fixtureContent.replaceAll('GIG302F', 'NUEVA2026') });
    const subjects = await MoodleStore.getAsignaturas();
    assert.ok(subjects.some(a => a.codigo === 'NUEVA2026'));
    assert.equal(subjects.find(a => a.codigo === 'GIE301F')?.nombre, 'Mi nombre personalizado');
  });

  it('Conserva el error original aunque falle el guardado del diagnóstico', async (t) => {
    t.mock.method(MoodleStore, 'insertSyncLog', async () => { throw new Error('BD desconectada'); });
    const result = await syncMoodleDeliverables({ icsContentOverride: '<html>Login</html>' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'contenido_invalido');
  });

  it('Normaliza enlaces copiados sin exponer tokens en errores', () => {
    assert.equal(normalizeMoodleUrl('"webcal://example.org/calendar?userid=1&amp;authtoken=secret"'), 'https://example.org/calendar?userid=1&authtoken=secret');
    assert.throws(() => normalizeMoodleUrl('ftp://example.org/?authtoken=secret'), error => error instanceof Error && !error.message.includes('secret'));
  });

  it('El cliente explica un fallback HTML de Netlify y no lo confunde con éxito', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('<html>SPA</html>', { status: 200 }));
    await assert.rejects(syncMoodleNow(), /despliegue/);
    await assert.rejects(fetchEntregas(), /despliegue/);
  });
});

