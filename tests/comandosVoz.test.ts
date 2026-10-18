import { it } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarComando } from '../src/asistente/comandosVoz';

// 2026-10-15 is a Thursday
const ahora = '2026-10-15T10:15';
const leer = (s: string) => interpretarComando(s, ahora);

it('Voz: añadir actividades con rango de horas', () => {
  assert.deepEqual(leer('hoy de 11.30 a 13.30 voy a vender una aplicación a bares'),
    { tipo: 'anadir', fecha: '2026-10-15', inicio: '11:30', fin: '13:30', titulo: 'Vender una aplicación a bares', area: 'trabajo', finSupuesto: false });
  assert.deepEqual(leer('Hoy de 11:30 a 13:30 voy a vender una aplicación a bares.'),
    { tipo: 'anadir', fecha: '2026-10-15', inicio: '11:30', fin: '13:30', titulo: 'Vender una aplicación a bares', area: 'trabajo', finSupuesto: false });
  assert.deepEqual(leer('mañana de 10 a 12 voy al dentista'),
    { tipo: 'anadir', fecha: '2026-10-16', inicio: '10:00', fin: '12:00', titulo: 'Dentista', area: 'otro', finSupuesto: false });
  assert.deepEqual(leer('el viernes entre las 5 y las 7 tengo clase particular'),
    { tipo: 'anadir', fecha: '2026-10-16', inicio: '17:00', fin: '19:00', titulo: 'Clase particular', area: 'clase_particular', finSupuesto: false });
  assert.deepEqual(leer('pasado mañana a las 9 de la mañana reunión con el cliente hasta las 11'),
    { tipo: 'anadir', fecha: '2026-10-17', inicio: '09:00', fin: '11:00', titulo: 'Reunión con el cliente', area: 'trabajo', finSupuesto: false });
});

it('Voz: añadir con solo la hora de inicio (tarde por defecto y duración supuesta)', () => {
  assert.deepEqual(leer('hoy voy al gym a las 7 añádelo como fijo'),
    { tipo: 'anadir', fecha: '2026-10-15', inicio: '19:00', fin: '20:30', titulo: 'Gym', area: 'gym', finSupuesto: true });
  assert.deepEqual(leer('hoy salgo a la calle a las 8 de la tarde'),
    { tipo: 'anadir', fecha: '2026-10-15', inicio: '20:00', fin: '21:00', titulo: 'Salir a la calle', area: 'social', finSupuesto: true });
  assert.deepEqual(leer('esta tarde a las 6 voy al gimnasio una hora y media'),
    { tipo: 'anadir', fecha: '2026-10-15', inicio: '18:00', fin: '19:30', titulo: 'Gym', area: 'gym', finSupuesto: true });
  const cena = leer('a las siete y media voy a cenar con amigos');
  assert.equal(cena.tipo === 'anadir' && `${cena.inicio}-${cena.fin} ${cena.titulo}`, '19:30-20:30 Cenar con amigos');
  const gym = leer('hoy a las 4 y media voy al gym');
  assert.equal(gym.tipo === 'anadir' && `${gym.inicio}-${gym.fin} ${gym.titulo}`, '16:30-18:00 Gym');
  const medico = leer('el lunes a las 9 menos cuarto tengo médico');
  assert.equal(medico.tipo === 'anadir' && `${medico.fecha} ${medico.inicio} ${medico.titulo}`, '2026-10-19 08:45 Médico');
  const correr = leer('mañana por la mañana a las 10 voy a correr');
  assert.equal(correr.tipo === 'anadir' && `${correr.fecha} ${correr.inicio} ${correr.titulo}`, '2026-10-16 10:00 Correr');
});

it('Voz: preguntas, entregas y órdenes', () => {
  assert.deepEqual(leer('¿Y mañana?'), { tipo: 'consulta', fecha: '2026-10-16' });
  assert.deepEqual(leer('dime más sobre el día siguiente'), { tipo: 'consulta', fecha: '2026-10-16' });
  assert.deepEqual(leer('¿Qué tengo el lunes?'), { tipo: 'consulta', fecha: '2026-10-19' });
  assert.deepEqual(leer('¿qué tengo hoy?'), { tipo: 'consulta', fecha: '2026-10-15' });
  assert.deepEqual(leer('¿qué tengo mañana a las 10?'), { tipo: 'consulta', fecha: '2026-10-16' });
  assert.deepEqual(leer('¿qué entregas tengo?'), { tipo: 'entregas' });
  assert.deepEqual(leer('deshazlo'), { tipo: 'deshacer' });
  assert.deepEqual(leer('quítalo'), { tipo: 'deshacer' });
  assert.deepEqual(leer('para'), { tipo: 'parar' });
  assert.deepEqual(leer('hola qué tal'), { tipo: 'desconocido' });
});
