import { TaskItem, CategoryType } from '../types';

export function normalizeTimeString(raw: string | undefined, defaultTime = '12:00'): string {
  if (!raw) return defaultTime;
  const clean = raw.trim().replace('.', ':');
  const m = clean.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  const mSingle = clean.match(/^(\d{1,2})$/);
  if (mSingle) {
    return `${mSingle[1].padStart(2, '0')}:00`;
  }
  return defaultTime;
}

export function computeEndTime(startTime: string, durationMinutes: number): string {
  const parts = startTime.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const totalMins = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMins / 60) % 24;
  const endM = totalMins % 60;
  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
}

export function parseInputLocally(
  input: string,
  sourceType: 'voice' | 'vision' | 'text'
): TaskItem[] {
  const textClean = input.trim();
  const textLower = textClean.toLowerCase();
  const tasks: TaskItem[] = [];

  const dayNames: { [key: string]: number } = {
    lunes: 1,
    martes: 2,
    miércoles: 3,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sábado: 6,
    sabado: 6,
    domingo: 0,
  };

  const spanishDayNamesByIndex = [
    'Domingo',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
  ];

  // Check for time range pattern like "19.30-21.00", "19:30 a 21:00", "de 19.30 a 21.00"
  let extractedStartTime = '12:00';
  let extractedEndTime: string | undefined = undefined;
  let extractedDuration = 60;

  const timeRangeMatch = textLower.match(
    /(?:de\s+)?(\d{1,2})[.:](\d{2})\s*(?:-|a|hasta)\s*(\d{1,2})[.:](\d{2})/i
  );
  if (timeRangeMatch) {
    const sH = parseInt(timeRangeMatch[1], 10);
    const sM = parseInt(timeRangeMatch[2], 10);
    const eH = parseInt(timeRangeMatch[3], 10);
    const eM = parseInt(timeRangeMatch[4], 10);

    extractedStartTime = `${sH.toString().padStart(2, '0')}:${sM.toString().padStart(2, '0')}`;
    extractedEndTime = `${eH.toString().padStart(2, '0')}:${eM.toString().padStart(2, '0')}`;
    const diff = eH * 60 + eM - (sH * 60 + sM);
    extractedDuration = diff > 0 ? diff : 60;
  } else {
    const singleTimeMatch = textLower.match(
      /(?:a las|a la|alas)?\s*(\d{1,2})[.:](\d{2})\s*(h|horas|hrs|am|pm)?/
    );
    if (singleTimeMatch) {
      let hours = parseInt(singleTimeMatch[1], 10);
      const minutes = singleTimeMatch[2];
      const modifier = singleTimeMatch[3];
      if (modifier === 'pm' && hours < 12) hours += 12;
      if (modifier === 'am' && hours === 12) hours = 0;
      if (hours >= 0 && hours <= 23) {
        extractedStartTime = `${hours.toString().padStart(2, '0')}:${minutes}`;
      }
    }
    const durationMatch = textLower.match(/(\d+)\s*(?:hora|horas|h)/);
    if (durationMatch) {
      extractedDuration = parseInt(durationMatch[1], 10) * 60;
    } else if (textLower.includes('30 min') || textLower.includes('media hora')) {
      extractedDuration = 30;
    }
    extractedEndTime = computeEndTime(extractedStartTime, extractedDuration);
  }

  // Check recurring days
  const recurringDays: number[] = [];
  const dayRangeMatch = textLower.match(/de\s+([a-záéíóú]+)\s+a\s+([a-záéíóú]+)/i);
  if (
    dayRangeMatch &&
    dayNames[dayRangeMatch[1]] !== undefined &&
    dayNames[dayRangeMatch[2]] !== undefined
  ) {
    const startDay = dayNames[dayRangeMatch[1]];
    const endDay = dayNames[dayRangeMatch[2]];
    let curr = startDay;
    while (true) {
      recurringDays.push(curr);
      if (curr === endDay) break;
      curr = (curr + 1) % 7;
    }
  }

  const isWholeSeptember =
    textLower.includes('mes de septiembre') ||
    textLower.includes('todo el mes') ||
    textLower.includes('durante septiembre') ||
    textLower.includes('en septiembre');

  if (recurringDays.length > 0 && isWholeSeptember) {
    let category: CategoryType = 'Sports/Karate';
    let detectedTag = 'Sports/Karate (Tag: Red)';
    let baseTitle = 'Entrenamiento de Karate';

    if (textLower.includes('karate')) {
      category = 'Sports/Karate';
      detectedTag = 'Sports/Karate (Tag: Red)';
      baseTitle = 'Entrenamiento de Karate';
    } else if (
      textLower.includes('matlab') ||
      textLower.includes('clase') ||
      textLower.includes('universidad')
    ) {
      category = 'Academics';
      detectedTag = 'Académico (Tag: Blue)';
      baseTitle = 'Clase / Estudio';
    } else if (
      textLower.includes('trabaj') ||
      textLower.includes('turno') ||
      textLower.includes('bar')
    ) {
      category = 'Work';
      detectedTag = 'Trabajo (Tag: Amber)';
      baseTitle = 'Turno de Trabajo';
    }

    for (let day = 1; day <= 30; day++) {
      const d = new Date(Date.UTC(2026, 8, day));
      const dayOfWeek = d.getUTCDay();
      if (recurringDays.includes(dayOfWeek)) {
        const dateStr = `2026-09-${day.toString().padStart(2, '0')}`;
        const dayName = spanishDayNamesByIndex[dayOfWeek];
        const finalEndTime =
          extractedEndTime || computeEndTime(extractedStartTime, extractedDuration);
        const deadlineLabel = `${dayName} ${day} Sep, ${extractedStartTime} - ${finalEndTime}`;

        tasks.push({
          id: `task-local-recur-${dateStr}-${tasks.length}`,
          title: baseTitle,
          category,
          date: dateStr,
          time: extractedStartTime,
          endTime: finalEndTime,
          durationMinutes: extractedDuration,
          priority: 'media',
          notes: `Sesión regular: ${extractedStartTime} a ${finalEndTime}`,
          sourceType,
          confidence: 0.98,
          extractedFields: {
            deadlineLabel,
            detectedTag,
          },
        });
      }
    }

    if (tasks.length > 0) return tasks;
  }

  // Single or comma-separated tasks
  let category: CategoryType = 'Personal';
  let detectedTag = 'Personal';
  if (
    textLower.includes('matlab') ||
    textLower.includes('examen') ||
    textLower.includes('estudiar') ||
    textLower.includes('clase')
  ) {
    category = 'Academics';
    detectedTag = 'Académico (Tag: Blue)';
  } else if (
    textLower.includes('karate') ||
    textLower.includes('hipertrofia') ||
    textLower.includes('gym')
  ) {
    category = 'Sports/Karate';
    detectedTag = 'Sports/Karate (Tag: Red)';
  } else if (textLower.includes('trabaj') || textLower.includes('bar')) {
    category = 'Work';
    detectedTag = 'Trabajo (Tag: Amber)';
  }

  // Detect relative date (Today = Thursday Sep 17, 2026)
  let taskDate = '2026-09-17';
  let deadlineDateLabel = 'Jueves 17 Sep';

  if (textLower.includes('pasado mañana')) {
    taskDate = '2026-09-19';
    deadlineDateLabel = 'Sábado 19 Sep';
  } else if (textLower.includes('mañana')) {
    taskDate = '2026-09-18';
    deadlineDateLabel = 'Viernes 18 Sep';
  } else if (textLower.includes('hoy')) {
    taskDate = '2026-09-17';
    deadlineDateLabel = 'Jueves 17 Sep';
  } else {
    // Check weekdays
    for (const [dayKey, dayNum] of Object.entries(dayNames)) {
      if (textLower.includes(dayKey)) {
        const todayDayNum = 4; // Thursday
        let diff = dayNum - todayDayNum;
        if (diff <= 0) diff += 7;
        const d = new Date(Date.UTC(2026, 8, 17 + diff));
        taskDate = `2026-09-${d.getUTCDate().toString().padStart(2, '0')}`;
        deadlineDateLabel = `${spanishDayNamesByIndex[dayNum]} ${d.getUTCDate()} Sep`;
        break;
      }
    }
  }

  const finalEndTime =
    extractedEndTime || computeEndTime(extractedStartTime, extractedDuration);
  tasks.push({
    id: `task-local-${Date.now()}`,
    title: textClean.length > 50 ? textClean.slice(0, 48) + '...' : textClean,
    category,
    date: taskDate,
    time: extractedStartTime,
    endTime: finalEndTime,
    durationMinutes: extractedDuration,
    priority: 'media',
    notes: `Registrado: "${textClean}"`,
    sourceType,
    confidence: 0.95,
    extractedFields: {
      deadlineLabel: `${deadlineDateLabel}, ${extractedStartTime} - ${finalEndTime}`,
      detectedTag,
    },
  });

  return tasks;
}
