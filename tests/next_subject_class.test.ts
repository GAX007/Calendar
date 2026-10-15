import assert from 'node:assert/strict';
import test from 'node:test';
import type { TaskItem, UniversitySubject } from '../src/types';
import { findNextSubjectClass } from '../src/utils/nextSubjectClass';

// Materia y clases inventadas; no son los horarios del usuario.
const subject: UniversitySubject = { id: 'algebra-ficticia', name: 'Álgebra Imaginaria', code: 'ALG', color: 'indigo' };
const today = '2040-02-06';
function lesson(id: string, date: string, time = '16:30', fields: Partial<TaskItem> = {}): TaskItem {
  return { id:`gcal-${id}`, title:'Álgebra imaginaria (aula inventada)', date, time, durationMinutes:60,
    category:'Academics', priority:'media', sourceType:'manual', extractedFields:{calendarSource:'google-calendar'}, ...fields };
}
test('Siguiente clase: ignora todas las de hoy, incluidas las que aún no han empezado', () => {
  const next = lesson('siguiente','2040-02-09');
  assert.equal(findNextSubjectClass([lesson('hoy',today,'23:00'), next],subject,today),next);
});
test('Elige la primera clase posterior por fecha y hora, aunque llegue desordenada', () => {
  const first = lesson('primera','2040-02-09','16:30');
  const tasks = [lesson('lejana','2040-02-16'),lesson('segunda','2040-02-09','18:30'),first,lesson('pasada','2040-02-05')];
  const before = structuredClone(tasks);
  assert.equal(findNextSubjectClass(tasks,subject,today),first);
  assert.deepEqual(tasks,before);
});
test('Busca desde mañana: puede ser esta semana o una posterior, sin inventar una recurrencia', () => {
  const tomorrow = lesson('manana','2040-02-07','09:00');
  assert.equal(findNextSubjectClass([lesson('semana-siguiente','2040-02-16'),tomorrow],subject,today),tomorrow);
});
test('Reconoce nombre sin diferencias de tildes, mayúsculas o espacios y etiquetas completas', () => {
  for (const title of ['ALGEBRA   IMAGINARIA (Aula 999)', '[ALG] Clase', 'ALG - Laboratorio', 'ALG', 'Clase ALG']) {
    const next = lesson('nombre','2040-02-09','16:30',{title});
    assert.equal(findNextSubjectClass([next],subject,today),next);
  }
  assert.equal(findNextSubjectClass([lesson('otra','2040-02-09','16:30',{title:'Algoritmos imaginarios'})],subject,today),null);
});
test('No confunde otra asignatura, deberes manuales o actividades personales con una clase', () => {
  const tasks = [lesson('otra','2040-02-07','10:00',{title:'Geometría ficticia'}),
    lesson('personal','2040-02-07','11:00',{category:'Personal'}),
    lesson('deber','2040-02-07','12:00',{id:'deber-manual',extractedFields:undefined}),
    lesson('correcta','2040-02-09')];
  assert.equal(findNextSubjectClass(tasks,subject,today)?.id,'gcal-correcta');
});
test('Usa el horario actualizado de Calendar; no reutiliza la clase que se movió o se retiró', () => {
  const old = lesson('movida','2040-02-09');
  const changed = { ...old, date:'2040-02-10',time:'10:00' };
  assert.equal(findNextSubjectClass([changed],subject,today),changed);
  assert.equal(findNextSubjectClass([],subject,today),null);
});
test('Sin clase coincidente o con fecha/hora inválida devuelve null', () => {
  assert.equal(findNextSubjectClass([],subject,today),null);
  assert.equal(findNextSubjectClass([lesson('sin-asignatura','2040-02-09')],undefined,today),null);
  assert.equal(findNextSubjectClass([lesson('fecha','2040-02-31'),lesson('hora','2040-02-09','25:00')],subject,today),null);
  assert.equal(findNextSubjectClass([lesson('correcta','2040-02-09')],subject,'2040-02-31'),null);
});
test('Con el mismo calendario devuelve lo mismo y los empates se resuelven por ID', () => {
  const a = lesson('a','2040-02-09'), b = lesson('b','2040-02-09');
  assert.equal(findNextSubjectClass([b,a],subject,today),a);
  assert.equal(findNextSubjectClass([a,b],subject,today),a);
});
