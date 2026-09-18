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

interface MonthTarget {
  year: number;
  monthIndex: number;
  shortName: string;
  fullName: string;
}

const SPANISH_MONTH_DICTIONARY: Record<string, { index: number; shortName: string; fullName: string }> = {
  enero: { index: 0, shortName: 'Ene', fullName: 'Enero' },
  febrero: { index: 1, shortName: 'Feb', fullName: 'Febrero' },
  marzo: { index: 2, shortName: 'Mar', fullName: 'Marzo' },
  abril: { index: 3, shortName: 'Abr', fullName: 'Abril' },
  mayo: { index: 4, shortName: 'May', fullName: 'Mayo' },
  junio: { index: 5, shortName: 'Jun', fullName: 'Junio' },
  julio: { index: 6, shortName: 'Jul', fullName: 'Julio' },
  agosto: { index: 7, shortName: 'Ago', fullName: 'Agosto' },
  septiembre: { index: 8, shortName: 'Sep', fullName: 'Septiembre' },
  setiembre: { index: 8, shortName: 'Sep', fullName: 'Septiembre' },
  octubre: { index: 9, shortName: 'Oct', fullName: 'Octubre' },
  noviembre: { index: 10, shortName: 'Nov', fullName: 'Noviembre' },
  diciembre: { index: 11, shortName: 'Dic', fullName: 'Diciembre' },
};

function extractTargetMonths(textLower: string, defaultYear = new Date().getFullYear(), defaultMonthIndex = new Date().getMonth()): MonthTarget[] {
  const mentioned = new Map<number, MonthTarget>();

  // Check explicit range: "de [mes1] a [mes2]" e.g. "de septiembre a diciembre"
  const rangeMatch = textLower.match(/de\s+([a-záéíóú]+)\s+a\s+([a-záéíóú]+)/i);
  if (
    rangeMatch &&
    SPANISH_MONTH_DICTIONARY[rangeMatch[1].toLowerCase()] &&
    SPANISH_MONTH_DICTIONARY[rangeMatch[2].toLowerCase()]
  ) {
    const startM = SPANISH_MONTH_DICTIONARY[rangeMatch[1].toLowerCase()].index;
    const endM = SPANISH_MONTH_DICTIONARY[rangeMatch[2].toLowerCase()].index;
    let cur = startM;
    while (true) {
      const info = Object.values(SPANISH_MONTH_DICTIONARY).find((m) => m.index === cur)!;
      mentioned.set(cur, {
        year: defaultYear,
        monthIndex: cur,
        shortName: info.shortName,
        fullName: info.fullName,
      });
      if (cur === endM) break;
      cur = (cur + 1) % 12;
    }
  }

  // Check "hasta [mes]" e.g. "hasta diciembre", "hasta finales de octubre"
  const hastaMatch = textLower.match(/hasta\s+(?:finales\s+de\s+|mediados\s+de\s+|principios\s+de\s+|el\s+mes\s+de\s+)?([a-záéíóú]+)/i);
  if (hastaMatch && SPANISH_MONTH_DICTIONARY[hastaMatch[1].toLowerCase()]) {
    const endM = SPANISH_MONTH_DICTIONARY[hastaMatch[1].toLowerCase()].index;
    if (endM >= defaultMonthIndex) {
      for (let m = defaultMonthIndex; m <= endM; m++) {
        const info = Object.values(SPANISH_MONTH_DICTIONARY).find((item) => item.index === m)!;
        mentioned.set(m, {
          year: defaultYear,
          monthIndex: m,
          shortName: info.shortName,
          fullName: info.fullName,
        });
      }
    }
  }

  // Check individual mentioned months e.g. "septiembre y octubre", "en octubre"
  for (const [name, meta] of Object.entries(SPANISH_MONTH_DICTIONARY)) {
    const regex = new RegExp(`\\b${name}\\b`, 'i');
    if (regex.test(textLower)) {
      if (!mentioned.has(meta.index)) {
        mentioned.set(meta.index, {
          year: defaultYear,
          monthIndex: meta.index,
          shortName: meta.shortName,
          fullName: meta.fullName,
        });
      }
    }
  }

  if (mentioned.size > 0) {
    return Array.from(mentioned.values()).sort((a, b) => a.monthIndex - b.monthIndex);
  }

  // Default: current month (September)
  const defInfo = Object.values(SPANISH_MONTH_DICTIONARY).find((m) => m.index === defaultMonthIndex)!;
  return [
    {
      year: defaultYear,
      monthIndex: defaultMonthIndex,
      shortName: defInfo.shortName,
      fullName: defInfo.fullName,
    },
  ];
}

// Automatically expands daily routines or recurring tasks across all days of the target period (month/range)
function expandRecurrenceTasks(
  tasks: TaskItem[],
  input: string
): TaskItem[] {
  if (!tasks || tasks.length === 0) return tasks;

  const textLower = (input || '').toLowerCase();
  const now = new Date();
  const todayInfo = {
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
    dayOfMonth: now.getDate(),
    dateStr: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`,
    dayOfWeek: now.getDay(),
  };

  const spanishDayNamesFull = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const dayMap: Record<string, number> = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miércoles: 3,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sábado: 6,
    sabado: 6,
  };

  const isDaily = /(?:todos\s+los\s+d[ií]as|cada\s+d[ií]a|diariamente|a\s+diario|rutina\s+diaria|rutina\s+de\s+todos\s+los\s+d[ií]as|rutina\s+de\s+hidrataci[oó]n|todas\s+las\s+mañanas|todas\s+las\s+tardes|todas\s+las\s+noches)/i.test(textLower);
  const isWeekly = /(?:todas\s+las\s+semanas|cada\s+semana|semanalmente|plan\s+semanal|rutina\s+semanal|plan\s+de\s+comidas)/i.test(textLower);

  const uniqueDates = new Set(tasks.map((t) => t.date).filter(Boolean));

  // If already expanded across many dates (e.g. > 14 dates across multiple weeks), no need to expand again
  if (uniqueDates.size > 14) {
    return tasks;
  }

  // If not weekly and already has multiple distinct dates, return as is
  if (!isWeekly && uniqueDates.size > 1) {
    return tasks;
  }

  // Weekly plan expansion across the month:
  if (isWeekly) {
    const targetMonths = extractTargetMonths(textLower, todayInfo.year, todayInfo.monthIndex);
    const templatesByDOW = new Map<number, TaskItem[]>();

    for (const t of tasks) {
      let dow = (t as any).dayOfWeek;
      if (dow === undefined && t.date) {
        const [y, m, d] = t.date.split('-').map(Number);
        const dObj = new Date(Date.UTC(y, m - 1, d));
        dow = dObj.getUTCDay();
      }
      if (dow !== undefined) {
        if (!templatesByDOW.has(dow)) {
          templatesByDOW.set(dow, []);
        }
        templatesByDOW.get(dow)!.push(t);
      }
    }

    if (templatesByDOW.size > 0) {
      const expandedWeekly: TaskItem[] = [];
      for (const target of targetMonths) {
        const daysInMonth = new Date(Date.UTC(target.year, target.monthIndex + 1, 0)).getUTCDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const d = new Date(Date.UTC(target.year, target.monthIndex, day));
          const dayDOW = d.getUTCDay();
          const dayName = spanishDayNamesFull[dayDOW];
          const monthNum = (target.monthIndex + 1).toString().padStart(2, '0');
          const dayNum = day.toString().padStart(2, '0');
          const dateStr = `${target.year}-${monthNum}-${dayNum}`;

          const dayTemplates = templatesByDOW.get(dayDOW) || [];
          dayTemplates.forEach((tmpl, tmplIdx) => {
            const timeClean = tmpl.time || '12:00';
            const endTimeClean = tmpl.endTime || computeEndTime(timeClean, tmpl.durationMinutes || 30);
            const deadlineLabel = `${dayName} ${day} ${target.shortName}, ${timeClean} - ${endTimeClean}`;

            expandedWeekly.push({
              ...tmpl,
              id: `task-recur-${dateStr}-${timeClean.replace(':', '')}-${tmplIdx}`,
              date: dateStr,
              time: timeClean,
              endTime: endTimeClean,
              extractedFields: {
                ...(tmpl.extractedFields || {}),
                deadlineLabel,
                detectedTag: tmpl.extractedFields?.detectedTag || tmpl.category,
              },
            });
          });
        }
      }
      if (expandedWeekly.length > 0) {
        return expandedWeekly;
      }
    }
  }

  // Check weekday range e.g. "de lunes a jueves", "de lunes a viernes"
  let weekdayRange: number[] | null = null;
  const dayRangeMatch = textLower.match(/de\s+([a-záéíóú]+)\s+a\s+([a-záéíóú]+)/i);
  if (
    dayRangeMatch &&
    dayMap[dayRangeMatch[1].toLowerCase()] !== undefined &&
    dayMap[dayRangeMatch[2].toLowerCase()] !== undefined
  ) {
    const sDay = dayMap[dayRangeMatch[1].toLowerCase()];
    const eDay = dayMap[dayRangeMatch[2].toLowerCase()];
    weekdayRange = [];
    let cur = sDay;
    while (true) {
      weekdayRange.push(cur);
      if (cur === eDay) break;
      cur = (cur + 1) % 7;
    }
  }

  // Check weekend / workdays
  const isWeekend = /(?:los\s+)?fines?\s+de\s+semana/i.test(textLower);
  const isWorkday = /(?:d[ií]as\s+laborables|entre\s+semana)/i.test(textLower);

  // Check specific days: e.g. "cada martes y jueves", "los lunes y miércoles", "todos los viernes"
  const specificDays = new Set<number>();
  const cadaDayRegex = /(?:cada|todos\s+los|los)\s+([a-záéíóú]+(?:\s*(?:,|y)\s*[a-záéíóú]+)*)/gi;
  let match: RegExpExecArray | null;
  while ((match = cadaDayRegex.exec(textLower)) !== null) {
    const matchedPart = match[1].toLowerCase();
    for (const [name, dNum] of Object.entries(dayMap)) {
      const regex = new RegExp(`\\b${name}s?\\b`, 'i');
      if (regex.test(matchedPart)) {
        specificDays.add(dNum);
      }
    }
  }

  // Determine eligible days of the week
  let eligibleDays: Set<number> | null = null;
  if (weekdayRange && weekdayRange.length > 0) {
    eligibleDays = new Set(weekdayRange);
  } else if (isWeekend) {
    eligibleDays = new Set([0, 6]);
  } else if (isWorkday) {
    eligibleDays = new Set([1, 2, 3, 4, 5]);
  } else if (specificDays.size > 0) {
    eligibleDays = specificDays;
  } else if (isDaily) {
    eligibleDays = new Set([0, 1, 2, 3, 4, 5, 6]);
  }

  // If no recurrence pattern was matched, return tasks as-is
  if (!eligibleDays) {
    return tasks;
  }

  // 2. Determine target months
  const targetMonths = extractTargetMonths(textLower, todayInfo.year, todayInfo.monthIndex);

  // 3. Determine start day within current month
  const isStartingFromToday = /(?:desde\s+hoy|a\s+partir\s+de\s+hoy|el\s+resto\s+del\s+mes|lo\s+que\s+queda\s+de\s+mes)/i.test(textLower);
  const isStartingFromTomorrow = /(?:desde\s+mañana|a\s+partir\s+de\s+mañana)/i.test(textLower);

  const expanded: TaskItem[] = [];

  for (const target of targetMonths) {
    const daysInMonth = new Date(Date.UTC(target.year, target.monthIndex + 1, 0)).getUTCDate();
    const isCurrentMonth = target.year === todayInfo.year && target.monthIndex === todayInfo.monthIndex;

    let startDay = 1;
    if (isCurrentMonth) {
      if (isStartingFromTomorrow) {
        startDay = Math.min(todayInfo.dayOfMonth + 1, daysInMonth);
      } else if (isStartingFromToday) {
        startDay = todayInfo.dayOfMonth;
      } else {
        startDay = 1;
      }
    }

    for (let day = startDay; day <= daysInMonth; day++) {
      const d = new Date(Date.UTC(target.year, target.monthIndex, day));
      const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
      if (!eligibleDays.has(dayOfWeek)) continue;

      const monthNum = (target.monthIndex + 1).toString().padStart(2, '0');
      const dayNum = day.toString().padStart(2, '0');
      const dateStr = `${target.year}-${monthNum}-${dayNum}`;
      const dayName = spanishDayNamesFull[dayOfWeek];

      tasks.forEach((tmpl, tmplIdx) => {
        const timeClean = tmpl.time || '12:00';
        const endTimeClean = tmpl.endTime || computeEndTime(timeClean, tmpl.durationMinutes || 30);
        const deadlineLabel = `${dayName} ${day} ${target.shortName}, ${timeClean} - ${endTimeClean}`;

        expanded.push({
          ...tmpl,
          id: `task-recur-${dateStr}-${timeClean.replace(':', '')}-${tmplIdx}`,
          date: dateStr,
          time: timeClean,
          endTime: endTimeClean,
          extractedFields: {
            ...(tmpl.extractedFields || {}),
            deadlineLabel,
            detectedTag: tmpl.extractedFields?.detectedTag || tmpl.category,
          },
        });
      });
    }
  }

  return expanded.length > 0 ? expanded : tasks;
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

  if (recurringDays.length > 0 && !textClean.includes(';') && !routineTheme) {
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
      textLower.includes('universidad') ||
      textLower.includes('estudi')
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
    } else if (
      textLower.includes('gym') ||
      textLower.includes('gimnasio') ||
      textLower.includes('pesas') ||
      textLower.includes('hipertrofia') ||
      textLower.includes('entren')
    ) {
      category = 'Sports/Karate';
      detectedTag = 'Sports/Karate (Tag: Red)';
      baseTitle = 'Entrenamiento Físico';
    } else {
      // Dynamic title extraction
      const cleanTitle = textClean
        .replace(/de\s+[a-záéíóú]+\s+a\s+[a-záéíóú]+/gi, '')
        .replace(/(?:de\s+)?\d{1,2}[.:]\d{2}\s*(?:a|-|hasta)\s*\d{1,2}[.:]\d{2}/gi, '')
        .replace(/(?:a las|a la)\s+\d{1,2}[.:]\d{2}/gi, '')
        .replace(/durante\s+(?:todo\s+)?(?:el\s+mes(?:\s+de\s+[a-z]+)?|[a-záéíóú]+(?:\s+y\s+[a-záéíóú]+)?)/gi, '')
        .replace(/\b(?:hasta|desde|durante|todo|todos|toda|todas)\s+(?:el\s+)?(?:mes\s+de\s+)?[a-záéíóú]+\b/gi, '')
        .trim();
      if (cleanTitle.length > 2) {
        baseTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      }
    }

    // Determine target months
    const nowTarget = new Date();
    const targetMonths = extractTargetMonths(textLower, nowTarget.getFullYear(), nowTarget.getMonth());

    for (const target of targetMonths) {
      const daysInMonth = new Date(Date.UTC(target.year, target.monthIndex + 1, 0)).getUTCDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(Date.UTC(target.year, target.monthIndex, day));
        const dayOfWeek = d.getUTCDay();
        if (recurringDays.includes(dayOfWeek)) {
          const monthNum = (target.monthIndex + 1).toString().padStart(2, '0');
          const dayNum = day.toString().padStart(2, '0');
          const dateStr = `${target.year}-${monthNum}-${dayNum}`;
          const dayName = spanishDayNamesByIndex[dayOfWeek];
          const finalEndTime =
            extractedEndTime || computeEndTime(extractedStartTime, extractedDuration);
          const deadlineLabel = `${dayName} ${day} ${target.shortName}, ${extractedStartTime} - ${finalEndTime}`;

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
    }

    if (tasks.length > 0) return tasks;
  }

  // Single or multi-task compound sentences (e.g. routines separated by ";", ".", "y finalmente", etc.)
  let routineTheme = '';
  const headerMatch = textClean.match(/^([^:\n]+):\s*(.+)$/s);
  let contentToSplit = textClean;
  if (headerMatch && /(?:de\s+\d{1,2}|a\s+las\s+\d{1,2}|\d{1,2}[.:]\d{2})/i.test(headerMatch[2])) {
    const rawHeader = headerMatch[1].trim();
    contentToSplit = headerMatch[2];
    if (/hidrataci[oó]n|agua|beber/i.test(rawHeader)) {
      routineTheme = 'Hidratación';
    } else if (/estudio|clases|universidad/i.test(rawHeader)) {
      routineTheme = 'Estudio';
    } else if (/entrenamiento|gimnasio|ejercicio/i.test(rawHeader)) {
      routineTheme = 'Entrenamiento';
    }
  }

  const rawSegments = contentToSplit
    .split(/(?:;|\.|\by además\b|\by también\b|\by recuérdame\b|\by luego\b|\by tengo que\b|\by finalmente\b|\by por último\b|\by por ultimo\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);

  const segmentsToProcess = rawSegments.length > 0 ? rawSegments : [textClean];

  // Detect relative date dynamically based on current date
  const now = new Date();
  const spanishDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const spanishMonthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const formatDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const formatDeadline = (d: Date) => {
    return `${spanishDays[d.getDay()]} ${d.getDate()} ${spanishMonthsShort[d.getMonth()]}`;
  };

  // Current week's Monday-anchored dates (e.g. Monday Sep 14 to Sunday Sep 20 for Friday Sep 18)
  const currentDOW = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday
  const diffToMonday = currentDOW === 0 ? -6 : 1 - currentDOW;
  const mondayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);

  const referenceWeekDates: Record<number, string> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate() + i);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const dow = d.getDay(); // 1=Mon, ..., 6=Sat, 0=Sun
    referenceWeekDates[dow] = `${y}-${m}-${day}`;
  }

  let activeDayNum: number | null = null;
  let activeDayName = '';

  segmentsToProcess.forEach((segment, idx) => {
    const segLower = segment.toLowerCase();

    // Skip pure non-actionable introductory header (e.g. "Debo seguir este plan de comidas todas las semanas")
    const hasAnyTime = /(?:\d{1,2}[.:]\d{2}|a\s+las\s+\d{1,2}|de\s+\d{1,2})/i.test(segLower);
    if (!hasAnyTime && /^(?:debo seguir|plan de|rutina de|este plan|mi rutina)/i.test(segLower)) {
      return;
    }

    // Check if segment introduces or changes the active day of the week
    for (const [dName, dNum] of Object.entries(dayNames)) {
      const dRegex = new RegExp(`\\b(?:el\\s+)?${dName}\\b`, 'i');
      if (dRegex.test(segLower)) {
        activeDayNum = dNum;
        activeDayName = spanishDays[dNum];
        break;
      }
    }

    let category: CategoryType = 'Personal';
    let detectedTag = 'Personal';
    if (
      segLower.includes('matlab') ||
      segLower.includes('examen') ||
      segLower.includes('estudiar') ||
      segLower.includes('clase') ||
      segLower.includes('código') ||
      segLower.includes('codigo') ||
      segLower.includes('proyecto') ||
      segLower.includes('álgebra') ||
      segLower.includes('algebra') ||
      segLower.includes('universidad') ||
      segLower.includes('asignatura')
    ) {
      category = 'Academics';
      detectedTag = 'Académico (Tag: Blue)';
    } else if (
      segLower.includes('hipertrofia') ||
      segLower.includes('gym') ||
      segLower.includes('gimnasio') ||
      segLower.includes('karate') ||
      segLower.includes('kumite') ||
      segLower.includes('kata') ||
      segLower.includes('entren') ||
      segLower.includes('pesas') ||
      segLower.includes('fuerza') ||
      segLower.includes('correr')
    ) {
      category = 'Sports/Karate';
      detectedTag = 'Sports/Karate (Tag: Red)';
    } else if (
      segLower.includes('bar') ||
      segLower.includes('turno') ||
      segLower.includes('trabaj') ||
      segLower.includes('cliente') ||
      segLower.includes('reunión') ||
      segLower.includes('reunion') ||
      segLower.includes('oficina')
    ) {
      category = 'Work';
      detectedTag = 'Trabajo (Tag: Amber)';
    } else if (
      segLower.includes('médico') ||
      segLower.includes('medico') ||
      segLower.includes('doctor') ||
      segLower.includes('fisio') ||
      segLower.includes('salud') ||
      segLower.includes('hidratac') ||
      segLower.includes('agua') ||
      segLower.includes('beber') ||
      segLower.includes('tomaré') ||
      segLower.includes('tomare') ||
      segLower.includes('ml') ||
      segLower.includes('litro') ||
      segLower.includes('desayun') ||
      segLower.includes('cena') ||
      segLower.includes('merienda') ||
      segLower.includes('comida') ||
      segLower.includes('almuerzo') ||
      segLower.includes('comer') ||
      segLower.includes('batido') ||
      segLower.includes('proteína') ||
      segLower.includes('proteina') ||
      segLower.includes('avena') ||
      segLower.includes('plátano') ||
      segLower.includes('platano') ||
      segLower.includes('creatina') ||
      segLower.includes('arroz') ||
      segLower.includes('pollo') ||
      segLower.includes('carne') ||
      segLower.includes('pasta') ||
      segLower.includes('macarrones') ||
      segLower.includes('patata') ||
      segLower.includes('chocolate') ||
      segLower.includes('tortilla') ||
      segLower.includes('salmón') ||
      segLower.includes('salmon') ||
      segLower.includes('pescado') ||
      segLower.includes('huevo') ||
      segLower.includes('sándwich') ||
      segLower.includes('sandwich') ||
      segLower.includes('pan') ||
      segLower.includes('fruta') ||
      segLower.includes('manzana') ||
      routineTheme === 'Hidratación'
    ) {
      category = 'Health';
      detectedTag = 'Salud (Tag: Emerald)';
    }

    let taskDate = formatDateStr(now);
    let deadlineDateLabel = formatDeadline(now);
    let dayOfWeekForTask = activeDayNum !== null ? activeDayNum : now.getDay();

    if (activeDayNum !== null) {
      taskDate = referenceWeekDates[activeDayNum] || formatDateStr(now);
      deadlineDateLabel = activeDayName;
    } else if (segLower.includes('hoy')) {
      taskDate = formatDateStr(now);
      deadlineDateLabel = `Hoy (${spanishDays[now.getDay()]})`;
      dayOfWeekForTask = now.getDay();
    } else if (segLower.includes('pasado mañana')) {
      const d = new Date(now);
      d.setDate(d.getDate() + 2);
      taskDate = formatDateStr(d);
      deadlineDateLabel = spanishDays[d.getDay()];
      dayOfWeekForTask = d.getDay();
    } else if (segLower.includes('mañana')) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      taskDate = formatDateStr(d);
      deadlineDateLabel = `Mañana (${spanishDays[d.getDay()]})`;
      dayOfWeekForTask = d.getDay();
    }

    let taskTime = '12:00';
    let endTime: string | undefined = undefined;
    let durationMinutes = 30;

    const segTimeRange = segLower.match(/(?:de\s+)?(\d{1,2})[.:](\d{2})\s*(?:-|a|hasta)\s*(\d{1,2})[.:](\d{2})/i);
    if (segTimeRange) {
      const sH = parseInt(segTimeRange[1], 10);
      const sM = parseInt(segTimeRange[2], 10);
      const eH = parseInt(segTimeRange[3], 10);
      const eM = parseInt(segTimeRange[4], 10);
      taskTime = `${sH.toString().padStart(2, '0')}:${sM.toString().padStart(2, '0')}`;
      endTime = `${eH.toString().padStart(2, '0')}:${eM.toString().padStart(2, '0')}`;
      const diff = (eH * 60 + eM) - (sH * 60 + sM);
      durationMinutes = diff > 0 ? diff : 30;
    } else {
      const timeMatch = segLower.match(/(?:a las|a la|alas|de|a)?\s*(\d{1,2})[.:](\d{2})\s*(h|horas|hrs|am|pm)?/);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const minutes = timeMatch[2];
        const modifier = timeMatch[3];
        if (modifier === 'pm' && hours < 12) hours += 12;
        if (modifier === 'am' && hours === 12) hours = 0;
        if (hours >= 0 && hours <= 23) {
          taskTime = `${hours.toString().padStart(2, '0')}:${minutes}`;
        }
      } else {
        taskTime = extractedStartTime;
      }
      const durMatch = segLower.match(/(\d+)\s*(?:hora|horas|h)/);
      if (durMatch) {
        durationMinutes = parseInt(durMatch[1], 10) * 60;
      } else if (segLower.includes('30 min') || segLower.includes('media hora')) {
        durationMinutes = 30;
      } else {
        durationMinutes = 30;
      }
      endTime = computeEndTime(taskTime, durationMinutes);
    }

    if (!endTime) {
      endTime = computeEndTime(taskTime, durationMinutes);
    }

    let title = segment
      .replace(/^(?:debo seguir[^\n:;]+:?|rutina de[^\n:;]+:?|este plan[^\n:;]+:?)\s*/gi, '')
      .replace(/^(?:el\s+)?(?:lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\s+/gi, '')
      .replace(/^(?:añadir|crear|programar|recuérdame|recuerdame|tengo que|tengo)\s+/gi, '')
      .replace(/\b(?:a las|a la|alas)\s+\d{1,2}[.:]\d{2}(?:\s*hrs?|\s*horas)?\b/gi, '')
      .replace(/\bde\s+\d{1,2}[.:]\d{2}\s*(?:-|a|hasta)\s*\d{1,2}[.:]\d{2}\b/gi, '')
      .replace(/\bde \d+ horas?\b/gi, '')
      .replace(/^(?:,\s*)+/, '')
      .trim();

    if (title.length < 3) {
      title = segment.length > 50 ? segment.slice(0, 48) + '...' : segment;
    } else {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    if (routineTheme && !title.toLowerCase().includes(routineTheme.toLowerCase())) {
      title = `${routineTheme}: ${title}`;
    }

    tasks.push({
      id: `task-local-${Date.now()}-${idx}`,
      title,
      category,
      date: taskDate,
      time: taskTime,
      endTime,
      durationMinutes,
      priority: segLower.includes('urgente') || segLower.includes('examen') || segLower.includes('doble') ? 'alta' : 'media',
      notes: `Registrado: "${segment}"`,
      sourceType,
      confidence: 0.95,
      extractedFields: {
        deadlineLabel: `${deadlineDateLabel}, ${taskTime} - ${endTime}`,
        detectedTag,
      },
      ...({ dayOfWeek: dayOfWeekForTask } as any),
    });
  });

  return expandRecurrenceTasks(tasks, input);
}
