import type { GymRoutine, TaskItem } from '../types';
import { descripcionRutina } from '../data/initialGymRoutines';

const LUNES = 'routine-lunes-pierna-cadera-golpeo';
const MIERCOLES = 'routine-miercoles-torso-cuello';
const VIERNES_SABADO = 'routine-viernes-sabado-hibrido-core';

function rutinaPorTexto(texto: string): string | null {
  if (['torso', 'cuello', 'cervical', 'miercoles', 'miércoles', 'banca', 'empuje', 'puño'].some((k) => texto.includes(k))) {
    return MIERCOLES;
  }
  if (['híbrido', 'hibrido', 'posterior', 'core', 'viernes', 'sabado', 'sábado', 'muerto', 'unilateral'].some((k) => texto.includes(k))) {
    return VIERNES_SABADO;
  }
  if (['pierna', 'cadera', 'golpeo', 'lunes', 'sentadilla', 'láctica', 'lactica'].some((k) => texto.includes(k))) {
    return LUNES;
  }
  return null;
}

// Gym day of the week: Monday, Wednesday and Friday/Saturday each have their own routine
function rutinaPorDia(fecha: string): string | null {
  const d = new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const dia = d.getDay();
  if (dia === 1) return LUNES;
  if (dia === 3) return MIERCOLES;
  if (dia === 5 || dia === 6) return VIERNES_SABADO;
  return null;
}

// Gym routine that matches an agenda task, or null when the task is not a gym session
export function rutinaDeTarea(task: TaskItem): string | null {
  const titulo = (task.title || '').toLowerCase();
  const notas = (task.notes || '').toLowerCase();
  const esGym =
    task.category === 'Sports/Karate' ||
    ['gym', 'gimnasio', 'pesas', 'rutina', 'entreno', 'fuerza', 'pierna', 'pecho', 'espalda'].some(
      (k) => titulo.includes(k) || notas.includes(k)
    );
  if (!esGym) return null;
  if (/karate|kumite|kata|dojo/.test(titulo) && !/gym|gimnasio/.test(titulo)) return null;
  const texto = `${titulo} ${notas}`;
  if (!['gym', 'gimnasio', 'pesas', 'rutina', 'fuerza', 'pierna', 'cadera', 'golpeo', 'lunes', 'sentadilla', 'torso', 'cuello', 'cervical', 'banca', 'híbrido', 'hibrido', 'posterior', 'muerto', 'contraste'].some((k) => texto.includes(k))) {
    // Karate and other sports sessions have no gym routine
    return null;
  }
  // The title names the routine first, then the weekday, then the notes
  return rutinaPorTexto(titulo) || rutinaPorDia(task.date) || rutinaPorTexto(notas) || LUNES;
}

// Gym sessions from `desde` on carry their routine's full text as description
export function conDescripcionDeRutina(tasks: TaskItem[], routines: GymRoutine[], desde: string): TaskItem[] {
  if (!routines.length) return tasks;
  return tasks.map((t) => {
    if (t.date < desde) return t;
    const id = rutinaDeTarea(t);
    const routine = id ? routines.find((r) => r.id === id) : undefined;
    if (!routine) return t;
    const notes = descripcionRutina(routine);
    return t.notes === notes ? t : { ...t, notes };
  });
}
