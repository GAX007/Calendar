import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { quitarEco, ultimaPregunta } from '../src/asistente/conversacion';
import { validarAccion, type ContextoAsistente } from '../src/asistente/interpretar';
import { deshacerCon, ejecutarAccionCon, type BackendAsistente } from '../src/asistente/acciones';
import { guionBreve } from '../src/asistente/voz';
import { planActual } from '../src/asistente/logica';
import { assemblePlannerData, type PlannerData } from '../src/planner/data';
import { DEFAULT_PARAMETROS } from '../src/planner/types';
import { addDays, madridLocal } from '../src/planner/time';
import type { TaskItem } from '../src/types';
import { entrega, evento } from './fixtures/planificador/inputs';

// Entirely fictional data
describe('Eco del propio asistente', () => {
  it('Quita lo que repite la última respuesta y deja la del usuario', () => {
    const dicho = 'Son 4 entregas pendientes de Programazio Aurreratua. ¿Las descarto todas?';
    assert.equal(quitarEco('¿Las descarto todas? Sí', dicho), 'Sí');
    assert.equal(quitarEco('pendientes de Programazio Aurreratua las descarto todas', dicho), '');
    assert.equal(quitarEco('Sí', dicho), 'Sí');
    assert.equal(quitarEco('todas', dicho), 'todas', 'una palabra de la pregunta puede ser la respuesta');
    assert.equal(quitarEco('solo dos', dicho), 'solo dos');
    assert.equal(quitarEco('qué tengo mañana', ''), 'qué tengo mañana');
    assert.equal(ultimaPregunta(dicho), '¿Las descarto todas?');
    assert.equal(ultimaPregunta('Hecho.'), '¿Me lo repites?');
  });
});

const hoy = '2026-10-15';
const ctx: ContextoAsistente = {
  ahora_local: `${hoy}T10:00`, dia_semana: 'jueves', bloques: [], asignaturas: [],
  entregas: [
    { uid: 'm1', titulo: 'Praktika 1', vence_local: '2026-10-20T23:59', horas_est: 3, asignatura: 'PA' },
    { uid: 'uni:e1', titulo: '[FIS] Examen parcial', vence_local: '2026-10-22T10:00', horas_est: 6, asignatura: 'FIS', examen: true },
  ],
  agenda: [{ tarea_id: 't1', titulo: 'Dentista', fecha: '2026-10-17', inicio: '17:00', fin: '18:00' }],
  eventos: [
    { evento_id: 'ev-sem', titulo: 'Clase de inglés', tipo: 'fijo', dias: [2, 4], fecha: null, inicio: '18:00', fin: '19:30' },
    { evento_id: 'ev-uno', titulo: 'Cena', tipo: 'fijo', dias: null, fecha: '2026-10-16', inicio: '21:00', fin: '23:00' },
  ],
};

describe('Acciones nuevas: validación', () => {
  it('Cambiar la hora de un horario conserva su duración; un puntual puede cambiar de día', () => {
    assert.deepEqual(validarAccion({ tipo: 'modificar_evento', evento_id: 'ev-sem', inicio: '17:00' }, ctx),
      { tipo: 'modificar_evento', evento_id: 'ev-sem', titulo: 'Clase de inglés', inicio: '17:00', fin: '18:30' });
    assert.deepEqual(validarAccion({ tipo: 'modificar_evento', evento_id: 'ev-uno', fecha: '2026-10-17' }, ctx),
      { tipo: 'modificar_evento', evento_id: 'ev-uno', titulo: 'Cena', fecha: '2026-10-17' });
    assert.equal(validarAccion({ tipo: 'modificar_evento', evento_id: 'ev-sem', fecha: '2026-10-17' }, ctx), null, 'un semanal no cambia de día');
    assert.equal(validarAccion({ tipo: 'modificar_evento', evento_id: 'no-existe', inicio: '10:00' }, ctx), null);
  });

  it('Quitar un horario semanal o borrar un deber piden confirmación; tareas y entregas reales', () => {
    assert.deepEqual(validarAccion({ tipo: 'eliminar_evento', evento_id: 'ev-sem' }, ctx),
      { tipo: 'eliminar_evento', evento_id: 'ev-sem', titulo: 'Clase de inglés', semanal: true, confirmado: false });
    assert.equal((validarAccion({ tipo: 'eliminar_evento', evento_id: 'ev-uno' }, ctx) as any).semanal, false);
    assert.equal(validarAccion({ tipo: 'borrar_deber', uid: 'm1' }, ctx), null, 'solo deberes de Universidad');
    assert.deepEqual(validarAccion({ tipo: 'borrar_deber', uid: 'uni:e1', confirmado: true }, ctx),
      { tipo: 'borrar_deber', uid: 'uni:e1', titulo: '[FIS] Examen parcial', confirmado: true });
    assert.deepEqual(validarAccion({ tipo: 'completar_tarea', tarea_id: 't1' }, ctx), { tipo: 'completar_tarea', tarea_id: 't1', titulo: 'Dentista' });
    assert.equal(validarAccion({ tipo: 'borrar_tarea', tarea_id: 'x' }, ctx), null);
    assert.deepEqual(validarAccion({ tipo: 'completar_entrega', uid: 'm1' }, ctx), { tipo: 'completar_entrega', uid: 'm1', titulo: 'Praktika 1' });
    // The hour of an exam is its deadline
    assert.deepEqual(validarAccion({ tipo: 'modificar_entrega', uid: 'uni:e1', vence_local: '2026-10-22T12:00' }, ctx),
      { tipo: 'modificar_entrega', uid: 'uni:e1', titulo: '[FIS] Examen parcial', vence_local: '2026-10-22T12:00' });
    assert.equal((validarAccion({ tipo: 'resumen', detalle: true }, ctx) as any).detalle, true);
  });
});

function backend(data: PlannerData) {
  const llamadas: { tipo: string; datos?: any }[] = [];
  const ahora = madridLocal(new Date());
  const b: BackendAsistente = {
    cargar: async () => ({ ahora, hoy: ahora.slice(0, 10), data }),
    mutar: async (_d, accion, datos) => { llamadas.push({ tipo: accion, datos }); },
    estadosMoodle: async (uids, estado) => { llamadas.push({ tipo: `moodle:${estado}`, datos: uids }); },
    editarMoodle: async () => undefined, trabajosUni: async () => [], guardarTrabajo: async () => undefined,
    asignaturasUni: async () => [], asignaturasMoodle: async () => [], avisar: () => undefined,
  };
  return { b, llamadas };
}

describe('Acciones nuevas: ejecución y deshacer', () => {
  const manana = addDays(madridLocal(new Date()).slice(0, 10), 1);
  const semanal = { ...evento({ id: 'ev-sem', titulo: 'Clase de inglés', dias_semana: [1, 2, 3, 4, 5], fecha_inicio: '2026-09-01', inicio_local: '18:00:00', fin_local: '19:30:00' }), activo: true, user_id: 'u' };
  const data = assemblePlannerData([{ clave: '_revision', valor: 'r1' }], [entrega('m1', { deadline_utc: `${addDays(manana, 3)}T20:00:00Z` })], [], [semanal], [], []);

  it('Quitar un horario semanal pide un «sí»; con él lo quita y deshacer lo vuelve a poner igual', async () => {
    const { b, llamadas } = backend(data);
    const accion = { tipo: 'eliminar_evento' as const, evento_id: 'ev-sem', titulo: 'Clase de inglés', semanal: true, confirmado: false };
    assert.equal((await ejecutarAccionCon(b, accion, [])).confirmar, true);
    assert.equal(llamadas.length, 0);
    const r = await ejecutarAccionCon(b, accion, [], true);
    assert.deepEqual(llamadas[0], { tipo: 'eliminar_evento', datos: { id: 'ev-sem' } });
    assert.ok(llamadas.some(l => l.tipo === 'plan'));
    llamadas.length = 0;
    await deshacerCon(b, r.deshacer!);
    const repuesto = llamadas.find(l => l.tipo === 'evento')?.datos;
    // Back exactly as it was, without the row's extra columns and with HH:mm times
    assert.deepEqual(repuesto, { id: 'ev-sem', titulo: 'Clase de inglés', inicio_local: '18:00', fin_local: '19:30', dias_semana: [1, 2, 3, 4, 5],
      fecha_inicio: '2026-09-01', fecha_fin: null, tipo: 'fijo', bloqueo: true, area: 'otro' });
  });

  it('Cambiar la hora de una clase la guarda y replanifica; completar entrega y borrar tarea', async () => {
    const { b, llamadas } = backend(data);
    await ejecutarAccionCon(b, { tipo: 'modificar_evento', evento_id: 'ev-sem', titulo: 'Clase de inglés', inicio: '17:00', fin: '18:30' }, []);
    assert.equal(llamadas[0].tipo, 'evento');
    assert.equal(llamadas[0].datos.inicio_local, '17:00');
    assert.ok(llamadas.some(l => l.tipo === 'plan'));
    llamadas.length = 0;
    const hecha = await ejecutarAccionCon(b, { tipo: 'completar_entrega', uid: 'm1', titulo: 'Ejercicio' }, []);
    assert.deepEqual(llamadas[0], { tipo: 'entrega', datos: { uid: 'm1', estado: 'hecha' } });
    assert.equal(hecha.deshacer?.tipo, 'estados');
    const t: TaskItem = { id: 't1', title: 'Dentista', category: 'Personal', date: manana, time: '17:00', durationMinutes: 60, priority: 'media', sourceType: 'manual' };
    const borrada = await ejecutarAccionCon(b, { tipo: 'borrar_tarea', tarea_id: 't1', titulo: 'Dentista' }, [t]);
    assert.equal(borrada.tareaBorrada, 't1');
    assert.equal((await deshacerCon(b, borrada.deshacer!)).restaurarTarea?.id, 't1');
  });
});

describe('Resumen corto del día', () => {
  it('Como mucho 4 frases y títulos cortos; el detallado solo si se pide', () => {
    const d: PlannerData = { revision: 'r1', plan_revision: '', parametros: { ...DEFAULT_PARAMETROS }, bloques: [], deuda: [],
      eventos: [evento({ titulo: 'Clase ficticia', inicio_local: '10:00', fin_local: '12:00' }), evento({ id: 'e2', titulo: 'Taller', inicio_local: '13:00', fin_local: '14:00' }),
        evento({ id: 'e3', titulo: 'Tutoría', inicio_local: '15:00', fin_local: '16:00' })],
      entregas: [entrega('a', { titulo: '[GIG302F] Praktika 2: Herentzia eta polimorfismoa', deadline_utc: '2026-10-06T21:59:00Z', horas_est: 2 })] };
    const ahora = '2026-10-05T08:30';
    const { frases } = guionBreve({ data: d, plan: planActual(d, '2026-10-05', ahora), tareas: [], ahoraLocal: ahora });
    assert.ok(frases.length <= 4, frases.join(' | '));
    assert.equal(frases[0], 'Hoy te quedan 3 cosas: a las 10 de la mañana, Clase ficticia; a la 1 de la tarde, Taller; y una más.');
    assert.ok(frases.some(f => f.includes('Praktika 2') && !f.includes('Herentzia')), frases.join(' | '));
  });
});
