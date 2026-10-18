import type { TaskItem } from '../types';

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
  const texto = `${titulo} ${notas}`;
  if (['torso', 'cuello', 'cervical', 'miercoles', 'miércoles', 'banca'].some((k) => texto.includes(k))) {
    return 'routine-miercoles-torso-cuello';
  }
  if (['híbrido', 'hibrido', 'posterior', 'core', 'viernes', 'sabado', 'sábado', 'muerto'].some((k) => texto.includes(k))) {
    return 'routine-viernes-sabado-hibrido-core';
  }
  if (!['gym', 'gimnasio', 'pesas', 'rutina', 'fuerza', 'pierna', 'cadera', 'golpeo', 'lunes', 'sentadilla'].some((k) => texto.includes(k))) {
    // Karate and other sports sessions have no gym routine
    return null;
  }
  return 'routine-lunes-pierna-cadera-golpeo';
}
