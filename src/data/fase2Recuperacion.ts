import type { TaskItem } from '../types';
import { sumarMinutos } from '../utils/rutinaDeTarea';

// Fase 2 (2 al 29 de noviembre de 2026): movilidad, descompresión nocturna y pesajes de control
export const FASE2_DESDE = '2026-11-02';
export const FASE2_HASTA = '2026-11-29';
export const FASE2_RECUPERACION_PREFIX = 'fase2-rec-';

const MOVILIDAD = {
  title: 'Movilidad Activa y Apertura de Cadera',
  minutes: 20,
  notes: [
    '* Transiciones 90/90 de cadera con extensión: 3 min continuos.',
    '* Postura de la Rana (Frog Stretch) dinámica: 3 min (empujar cadera atrás 4s y volver).',
    '* Cossack Squats (Sentadillas laterales profundas): 3 series x 6 reps por lado para aductores.',
    '* Estiramiento del Psoas ("Caballero") con rotación torácica: 2 min por lado apretando glúteo trasero.',
    '* Apertura Torácica ("Libro abierto" en suelo): 2 min por lado.',
  ].join('\n'),
};

const DESCOMPRESION = {
  title: 'Descompresión Nocturna y Apagado Nervioso',
  minutes: 10,
  notes: [
    '* Regla: Estiramientos pasivos sin rebote (tensión suave 5/10) con respiración nasal 4s inhalar / 6s exhalar.',
    '* 1. Postura de la Paloma Pasiva (Glúteo/Piramidal): 2 min por pierna tumbado sobre la pierna delantera.',
    '* 2. Postura del Niño con alcance lateral (Descompresión lumbar y dorsal): 3 min (1 min al centro, 1 min izquierda, 1 min derecha).',
    '* 3. Piernas en vertical apoyadas en la pared (Drenaje láctico e isquios suaves): 3 min tumbado boca arriba relajando pulsaciones.',
  ].join('\n'),
};

const PESAJE = {
  title: 'Pesaje de Control en Ayunas',
  minutes: 5,
  notes: 'Pesarse después de ir al baño. Límite estricto: mantener entre 71.0 kg y 72.0 kg.',
};

const MOVILIDAD_DESDE = '10:00';
const DESCOMPRESION_SIN_KARATE = '22:30';
const PESAJE_HORA = '08:00';
const PESAJE_MAS_TEMPRANO = '06:30';

const minutos = (hora: string) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + (m || 0);
};
const hora = (min: number) => sumarMinutos('00:00', min);
const finDe = (t: TaskItem) => t.endTime || sumarMinutos(t.time, t.durationMinutes || 60);
const esKarate = (t: TaskItem) => /karate|kumite|kyokushin|dojo/i.test(t.title || '') && !/gym|gimnasio/i.test(t.title || '');

function fechasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const d = new Date(`${desde}T12:00:00`);
  const fin = new Date(`${hasta}T12:00:00`);
  while (d <= fin) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// First slot from `desde` that does not overlap the day's other events
function huecoLibre(delDia: TaskItem[], desde: string, duracion: number): string {
  const ocupado = delDia.map((t) => [minutos(t.time), minutos(finDe(t))] as const);
  for (let ini = minutos(desde); ini + duracion <= 22 * 60; ini += 15) {
    if (!ocupado.some(([a, b]) => ini < b && ini + duracion > a)) return hora(ini);
  }
  return desde;
}

function evento(id: string, fecha: string, inicio: string, base: { title: string; minutes: number; notes: string }): TaskItem {
  return {
    id: `${FASE2_RECUPERACION_PREFIX}${id}-${fecha}`,
    title: base.title,
    category: 'Health',
    date: fecha,
    time: inicio,
    endTime: sumarMinutos(inicio, base.minutes),
    durationMinutes: base.minutes,
    priority: 'media',
    notes: base.notes,
    sourceType: 'manual',
    completed: false,
  };
}

// Events of the recovery block, placed around the existing agenda (karate, classes, gym)
export function eventosRecuperacionFase2(tareas: TaskItem[]): TaskItem[] {
  const out: TaskItem[] = [];
  for (const fecha of fechasEntre(FASE2_DESDE, FASE2_HASTA)) {
    const dia = new Date(`${fecha}T12:00:00`).getDay(); // 0 = domingo
    const delDia = tareas.filter((t) => t.date === fecha && !t.id.startsWith(FASE2_RECUPERACION_PREFIX));

    if (dia === 0 || dia === 2 || dia === 4) {
      out.push(evento('movilidad', fecha, huecoLibre(delDia, MOVILIDAD_DESDE, MOVILIDAD.minutes), MOVILIDAD));
    }
    if (dia >= 1 && dia <= 5) {
      const karate = delDia.filter(esKarate).map(finDe).sort().at(-1);
      // One hour after karate ends, before going to bed
      const inicio = karate ? hora(Math.min(minutos(karate) + 60, 23 * 60 + 45)) : DESCOMPRESION_SIN_KARATE;
      out.push(evento('descompresion', fecha, inicio, DESCOMPRESION));
    }
    if (dia === 3 || dia === 6) {
      // First thing after waking up: before the first event of the day
      const primera = delDia.map((t) => minutos(t.time)).sort((a, b) => a - b)[0];
      const inicio = primera !== undefined ? Math.max(Math.min(minutos(PESAJE_HORA), primera - 30), minutos(PESAJE_MAS_TEMPRANO)) : minutos(PESAJE_HORA);
      out.push(evento('pesaje', fecha, hora(inicio), PESAJE));
    }
  }
  return out;
}
