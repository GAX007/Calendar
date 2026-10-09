import { UniversitySubject, UniversityHomework, TaskItem } from '../types';
import { getRelativeDateStr } from '../data/initialTasks';
import { upsertTasks, deleteTaskFromDb } from './taskService';

const SUBJECTS_STORAGE_KEY = 'calendarasist_uni_subjects';
const HOMEWORK_STORAGE_KEY = 'calendarasist_uni_homework';

export const INITIAL_SUBJECTS: UniversitySubject[] = [
  {
    id: 'subj-pa',
    name: 'Programazio Aurreratua',
    code: 'PA',
    color: 'indigo',
    professor: 'Irakasle Taldea',
    classroom: 'Aula 11115 / 11117 (M2GI12E)',
    credits: 6,
    semester: '1. Seihilekoa',
    notes: 'Programazio Aurreratua, ariketak eta laborategiak.',
  },
  {
    id: 'subj-ka',
    name: 'Konputagailuen Arkitektura',
    code: 'KA',
    color: 'blue',
    professor: 'Irakasle Taldea',
    classroom: 'Aula 11115 / 11117 (M2GI12E)',
    credits: 6,
    semester: '1. Seihilekoa',
    notes: 'Arkitektura, pildorak eta PBL defentsak.',
  },
  {
    id: 'subj-ks',
    name: 'Komunikazio Sareak',
    code: 'KS',
    color: 'purple',
    professor: 'Irakasle Taldea',
    classroom: 'Aula 11310 / 11317 (M2GI12E)',
    credits: 6,
    semester: '1. Seihilekoa',
    notes: 'Sareak I & II, protokoloak eta konfigurazioak.',
  },
  {
    id: 'subj-ii',
    name: 'Industria Informatika',
    code: 'II',
    color: 'amber',
    professor: 'Irakasle Taldea',
    classroom: 'Aula 11310 / 11316 (M2GI12E)',
    credits: 6,
    semester: '1. Seihilekoa',
    notes: 'Automatizazioa, SCADA eta sistema industrialak.',
  },
  {
    id: 'subj-as',
    name: 'Azpiegitura eta Sistemak',
    code: 'AS',
    color: 'cyan',
    professor: 'Irakasle Taldea',
    classroom: 'Aula 11115 / 11117 (M2GI12E)',
    credits: 6,
    semester: '1. Seihilekoa',
    notes: 'Sistemak, hodeia eta azpiegitura teknologikoak.',
  },
  {
    id: 'subj-pbl',
    name: 'PBL - Ingeniaritza Proiektuak',
    code: 'PBL',
    color: 'rose',
    professor: 'Tutore Taldea',
    classroom: 'Gelak & Mintegiak (M2GI12E)',
    credits: 6,
    semester: '1. Seihilekoa',
    notes: 'Proiektuaren hitoak, txostenak eta defentsak.',
  },
];

export function getInitialHomework(): UniversityHomework[] {
  const today = getRelativeDateStr(0);
  const tomorrow = getRelativeDateStr(1);
  const in3Days = getRelativeDateStr(3);
  const in5Days = getRelativeDateStr(5);
  const in10Days = getRelativeDateStr(10);
  const yesterday = getRelativeDateStr(-1);

  return [
    {
      id: 'hw-1',
      subjectId: 'subj-pa',
      title: 'Laborategia 2: Errekurtsioa eta Objektuetara Bideratutako Diseinua',
      dueDate: today,
      dueTime: '23:59',
      type: 'practica',
      priority: 'alta',
      status: 'en_progreso',
      description: 'Programazio Aurreratuko ariketak eta laborategiko kodea osatu. Subir código compilable.',
      weightPercentage: 15,
      estimatedHours: 4,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'hw-2',
      subjectId: 'subj-ka',
      title: 'Pildora & Txostena: Memoria Katxearen Simulazioa (11117)',
      dueDate: tomorrow,
      dueTime: '18:00',
      type: 'practica',
      priority: 'alta',
      status: 'pendiente',
      description: 'Katxe politika desberdinen simulazioa eta hutsegite tasa aztertu. Grafikoak PDFan txertatu.',
      weightPercentage: 10,
      estimatedHours: 3,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'hw-3',
      subjectId: 'subj-ks',
      title: 'Sare Protokoloak: Wireshark Pakete Captura eta Azterketa',
      dueDate: in3Days,
      dueTime: '23:59',
      type: 'ejercicios',
      priority: 'media',
      status: 'pendiente',
      description: 'TCP/IP geruzak eta bideratze taulen konfigurazioa egiaztatu.',
      weightPercentage: 10,
      estimatedHours: 2,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'hw-4',
      subjectId: 'subj-pbl',
      title: 'PBL: 1. Hitoaren Txostena eta Aurkezpen Demoa',
      dueDate: in5Days,
      dueTime: '20:00',
      type: 'proyecto',
      priority: 'alta',
      status: 'pendiente',
      description: 'Proiektuaren lehenengo hitoaren dokumentazioa, aurkezpena eta aplikazioaren lehen demoa.',
      weightPercentage: 25,
      estimatedHours: 6,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'hw-5',
      subjectId: 'subj-bd',
      title: 'Examen Parcial: Consultas SQL Complejas y Álgebra Relacional',
      dueDate: in10Days,
      dueTime: '11:00',
      type: 'examen',
      priority: 'alta',
      status: 'pendiente',
      description: 'Examen presencial en el aula magna. Entran los temas 1 al 4 (modelo entidad-relación, SQL DDL/DML, GROUP BY y subconsultas).',
      weightPercentage: 35,
      estimatedHours: 12,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'hw-6',
      subjectId: 'subj-arq',
      title: 'Cuestionario Tema 1: Formatos de Instrucción RISC-V',
      dueDate: yesterday,
      dueTime: '23:59',
      type: 'ejercicios',
      priority: 'baja',
      status: 'entregado',
      description: 'Cuestionario tipo test sobre tipos R, I, S, B, U, J completado a través del campus virtual.',
      weightPercentage: 5,
      grade: '9.6 / 10',
      completedAt: yesterday,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function isUniversityExample(homework: UniversityHomework): boolean {
  return getInitialHomework().some(example => example.id === homework.id && example.title === homework.title
    && example.subjectId === homework.subjectId && example.description === homework.description
    && example.estimatedHours === homework.estimatedHours && example.type === homework.type);
}

// -------------------------------------------------------------
// SUBJECTS CRUD
// -------------------------------------------------------------

export function getUniversitySubjects(): UniversitySubject[] {
  try {
    const raw = localStorage.getItem(SUBJECTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading university subjects from storage:', err);
  }
  return INITIAL_SUBJECTS;
}

export function saveUniversitySubjects(subjects: UniversitySubject[]): void {
  try {
    localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjects));
  } catch (err) {
    console.warn('Error saving university subjects:', err);
  }
}

export function addSubject(subjectData: Omit<UniversitySubject, 'id'>): UniversitySubject {
  const subjects = getUniversitySubjects();
  const newSubject: UniversitySubject = {
    ...subjectData,
    id: `subj-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
  };
  const updated = [...subjects, newSubject];
  saveUniversitySubjects(updated);
  return newSubject;
}

export function updateSubject(updatedSubject: UniversitySubject): void {
  const subjects = getUniversitySubjects();
  const next = subjects.map((s) => (s.id === updatedSubject.id ? updatedSubject : s));
  saveUniversitySubjects(next);
}

export function deleteSubject(subjectId: string): void {
  const subjects = getUniversitySubjects();
  const next = subjects.filter((s) => s.id !== subjectId);
  saveUniversitySubjects(next);

  // Also remove homework for that subject
  const homework = getUniversityHomework();
  const remainingHw = homework.filter((h) => h.subjectId !== subjectId);
  saveUniversityHomework(remainingHw);
}

// -------------------------------------------------------------
// HOMEWORK CRUD
// -------------------------------------------------------------

export function getUniversityHomework(): UniversityHomework[] {
  try {
    const raw = localStorage.getItem(HOMEWORK_STORAGE_KEY);
    if (raw) {
      const parsed: UniversityHomework[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading university homework from storage:', err);
  }
  return [];
}

export function getUniversityHomeworkForUser(userId?: string): UniversityHomework[] {
  const owner = localStorage.getItem('calendarasist_uni_import_owner');
  return owner && owner !== userId ? [] : getUniversityHomework();
}

export function saveUniversityHomework(homework: UniversityHomework[]): void {
  try {
    localStorage.setItem(HOMEWORK_STORAGE_KEY, JSON.stringify(homework));
  } catch (err) {
    console.warn('Error saving university homework:', err);
  }
}

export function addHomework(homeworkData: Omit<UniversityHomework, 'id' | 'createdAt'>): UniversityHomework {
  const homework = getUniversityHomework();
  const newItem: UniversityHomework = {
    ...homeworkData,
    id: `hw-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    createdAt: new Date().toISOString(),
  };
  const updated = [newItem, ...homework];
  saveUniversityHomework(updated);
  return newItem;
}

export function updateHomework(updatedItem: UniversityHomework): void {
  const homework = getUniversityHomework();
  const next = homework.map((h) => (h.id === updatedItem.id ? updatedItem : h));
  saveUniversityHomework(next);
}

export function deleteHomework(homeworkId: string): void {
  const homework = getUniversityHomework();
  const itemToDelete = homework.find((h) => h.id === homeworkId);
  if (itemToDelete?.calendarTaskId) {
    deleteTaskFromDb(itemToDelete.calendarTaskId);
  }
  const next = homework.filter((h) => h.id !== homeworkId);
  saveUniversityHomework(next);
}

export function toggleHomeworkStatus(homeworkId: string): UniversityHomework | null {
  const homework = getUniversityHomework();
  let target: UniversityHomework | null = null;
  const next = homework.map((h) => {
    if (h.id === homeworkId) {
      const isNowComplete = h.status !== 'entregado';
      target = {
        ...h,
        status: isNowComplete ? 'entregado' : 'pendiente',
        completedAt: isNowComplete ? new Date().toISOString() : undefined,
      };
      return target;
    }
    return h;
  });
  saveUniversityHomework(next);
  return target;
}

// -------------------------------------------------------------
// SYNC HOMEWORK WITH MAIN DAILY CALENDAR
// -------------------------------------------------------------

export function syncHomeworkToCalendar(
  item: UniversityHomework,
  subjects: UniversitySubject[],
  userId?: string
): { task: TaskItem; updatedHomework: UniversityHomework } {
  const subject = subjects.find((s) => s.id === item.subjectId);
  const subjectName = subject ? `[${subject.code}] ${subject.name}` : 'Universidad';

  // Calculate task time
  let time = '17:00';
  let endTime = '18:30';
  if (item.dueTime) {
    time = item.dueTime;
    const [h, m] = time.split(':').map(Number);
    const endH = (h + 1) % 24;
    endTime = `${endH.toString().padStart(2, '0')}:${(m || 0).toString().padStart(2, '0')}`;
  }

  const taskId = item.calendarTaskId || `task-uni-hw-${item.id}`;

  const task: TaskItem = {
    id: taskId,
    title: `Entrega: ${item.title} (${subject?.code || 'UNI'})`,
    category: 'Academics',
    date: item.dueDate,
    time,
    endTime,
    durationMinutes: 60,
    priority: item.priority,
    notes: `${subjectName} • ${item.type.toUpperCase()}: ${item.description || 'Entrega universitaria programada'}${item.weightPercentage ? ` • Peso nota: ${item.weightPercentage}%` : ''}`,
    sourceType: 'manual',
    completed: item.status === 'entregado',
    extractedFields: {
      deadlineLabel: `${item.dueDate} ${item.dueTime || ''}`.trim(),
      detectedTag: 'Academics (Tag: Blue)',
    },
  };

  upsertTasks([task], userId);

  const updatedHomework: UniversityHomework = {
    ...item,
    calendarTaskId: taskId,
  };
  updateHomework(updatedHomework);

  return { task, updatedHomework };
}
