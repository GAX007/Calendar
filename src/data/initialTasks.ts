import { TaskItem } from '../types';

export function getRelativeDateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDynamicInitialTasks(): TaskItem[] {
  const today = getRelativeDateStr(0);
  const yesterday = getRelativeDateStr(-1);
  const tomorrow = getRelativeDateStr(1);
  const in2Days = getRelativeDateStr(2);
  const in3Days = getRelativeDateStr(3);

  return [
    // AYER
    {
      id: 'task-init-yest-1',
      title: 'Repaso de Katas & Estiramientos',
      category: 'Sports/Karate',
      date: yesterday,
      time: '19:30',
      endTime: '20:30',
      durationMinutes: 60,
      priority: 'media',
      notes: 'Movilidad articular y respiración para la competición.',
      sourceType: 'voice',
      completed: true,
      confidence: 0.96,
    },

    // HOY
    {
      id: 'task-init-today-1',
      title: 'Planificación del Día & Café de Arranque',
      category: 'Personal',
      date: today,
      time: '08:30',
      endTime: '09:15',
      durationMinutes: 45,
      priority: 'baja',
      notes: 'Revisar entregas universitarias y estructurar bloques de estudio.',
      sourceType: 'manual',
      completed: true,
    },
    {
      id: 'task-init-today-2',
      title: 'Clase Universitaria: Arquitectura de Computadores',
      category: 'Academics',
      date: today,
      time: '10:00',
      endTime: '12:00',
      durationMinutes: 120,
      priority: 'alta',
      notes: 'Microprocesadores RISC-V y jerarquía de memoria caché.',
      sourceType: 'manual',
      completed: false,
    },
    {
      id: 'task-init-today-3',
      title: 'Almuerzo & Pausa de Recuperación',
      category: 'Health',
      date: today,
      time: '13:30',
      endTime: '14:30',
      durationMinutes: 60,
      priority: 'baja',
      notes: 'Comida equilibrada e hidratación antes de la sesión de estudio.',
      sourceType: 'manual',
      completed: false,
    },
    {
      id: 'task-init-today-4',
      title: 'Estudio Universidad: Práctica de Algoritmos',
      category: 'Academics',
      date: today,
      time: '16:00',
      endTime: '17:30',
      durationMinutes: 90,
      priority: 'alta',
      notes: 'Avanzar código de la práctica de Dijkstra y pruebas de grafos.',
      sourceType: 'text',
      completed: false,
    },
    {
      id: 'task-init-today-5',
      title: 'Entrenamiento de Karate (Kumite & Físico)',
      category: 'Sports/Karate',
      date: today,
      time: '19:30',
      endTime: '21:00',
      durationMinutes: 90,
      priority: 'alta',
      notes: 'Trabajo de distancia, combinaciones rápidas de kizami-tsuki y acondicionamiento.',
      sourceType: 'voice',
      completed: false,
      confidence: 0.98,
    },

    // MAÑANA
    {
      id: 'task-init-tom-1',
      title: 'Laboratorio de Algoritmos y Grafos',
      category: 'Academics',
      date: tomorrow,
      time: '09:30',
      endTime: '11:30',
      durationMinutes: 120,
      priority: 'alta',
      notes: 'Prueba de compilación en el laboratorio de la facultad.',
      sourceType: 'manual',
      completed: false,
    },
    {
      id: 'task-init-tom-2',
      title: 'Entrega de Deberes: Cuestionario de Memoria Caché',
      category: 'Academics',
      date: tomorrow,
      time: '12:30',
      endTime: '13:15',
      durationMinutes: 45,
      priority: 'alta',
      notes: 'Subir PDF al campus virtual antes de la hora límite.',
      sourceType: 'text',
      completed: false,
    },
    {
      id: 'task-init-tom-3',
      title: 'Gimnasio: Foco Pierna & Potencia de Golpeo',
      category: 'Sports/Karate',
      date: tomorrow,
      time: '18:30',
      endTime: '19:45',
      durationMinutes: 75,
      priority: 'alta',
      notes: 'Sentadilla pesada (100-105kg), Hip Thrust y activación con balón medicinal.',
      sourceType: 'manual',
      completed: false,
    },

    // PASADO MAÑANA (+2 DÍAS)
    {
      id: 'task-init-plus2-1',
      title: 'Clase Magistral: Señales y Sistemas Lineales',
      category: 'Academics',
      date: in2Days,
      time: '10:00',
      endTime: '12:00',
      durationMinutes: 120,
      priority: 'alta',
      notes: 'Transformada de Fourier y respuesta en frecuencia.',
      sourceType: 'manual',
      completed: false,
    },
    {
      id: 'task-init-plus2-2',
      title: 'Gym: Foco Torso (Fuerza) + Blindaje Cervical',
      category: 'Sports/Karate',
      date: in2Days,
      time: '18:30',
      endTime: '19:30',
      durationMinutes: 60,
      priority: 'alta',
      notes: 'Press Banca (55-60kg), Press Militar y ejercicios cervicales.',
      sourceType: 'manual',
      completed: false,
    },

    // EN 3 DÍAS
    {
      id: 'task-init-plus3-1',
      title: 'Turno de Tarde o Trabajo de Apoyo',
      category: 'Work',
      date: in3Days,
      time: '17:00',
      endTime: '21:00',
      durationMinutes: 240,
      priority: 'media',
      notes: 'Organizar stock y atender clientes en el turno de tarde.',
      sourceType: 'manual',
      completed: false,
    },
  ];
}

export const INITIAL_TASKS: TaskItem[] = getDynamicInitialTasks();
