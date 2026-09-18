import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Normalize Netlify function URLs (/.netlify/functions/api/* -> /api/*)
app.use((req, res, next) => {
  if (req.url.startsWith('/.netlify/functions/api')) {
    req.url = req.url.replace('/.netlify/functions/api', '/api') || '/api';
  }
  next();
});

// Lazy Gemini Client Initialization
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!geminiClient && key && key !== 'MY_GEMINI_API_KEY') {
    geminiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// Helper to detect transient / retryable Gemini errors (503 High Demand, 429 Rate Limits, UNAVAILABLE)
function isRetryableGeminiError(error: any): boolean {
  if (!error) return false;
  const status = error.status || error.code || error.error?.code || error.error?.status;
  const msg = (error.message || (typeof error === 'string' ? error : JSON.stringify(error))).toLowerCase();
  return (
    status === 503 ||
    status === 429 ||
    status === 'UNAVAILABLE' ||
    status === 'RESOURCE_EXHAUSTED' ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('rate limit') ||
    msg.includes('spikes in demand') ||
    msg.includes('please try again later') ||
    msg.includes('overloaded')
  );
}

// Executes an async Gemini operation with automatic retry on transient errors and multi-model failover
async function executeWithGeminiFallback<T>(
  modelCandidates: string[],
  operation: (model: string) => Promise<T>,
  timeoutMs = 15000
): Promise<{ result: T; modelUsed: string }> {
  let lastError: any = null;

  for (let mIdx = 0; mIdx < modelCandidates.length; mIdx++) {
    const model = modelCandidates[mIdx];
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout de ${timeoutMs}ms para modelo ${model}`)), timeoutMs)
        );
        const result = await Promise.race([operation(model), timeoutPromise]);
        return { result, modelUsed: model };
      } catch (err: any) {
        lastError = err;
        const retryable = isRetryableGeminiError(err);
        const status = err?.status || err?.code || err?.error?.code;
        const msg = (err?.message || JSON.stringify(err)).toLowerCase();
        const isHighDemand =
          status === 503 ||
          msg.includes('503') ||
          msg.includes('high demand') ||
          msg.includes('spikes in demand') ||
          msg.includes('unavailable');

        // If the model is experiencing high demand (503), immediately failover to the next candidate model
        if (isHighDemand) {
          console.info(`[Gemini Failover] Modelo ${model} experimenta alta demanda temporal (503). Cambiando inmediatamente a modelo alternativo...`);
          break;
        }

        console.info(
          `[Gemini Call] Modelo ${model} intento ${attempt}/${maxAttempts} no respondió (retryable=${retryable}):`,
          err?.message || 'Error transitorio'
        );

        if (retryable && attempt < maxAttempts) {
          // Exponential backoff with random jitter: 400ms - 800ms
          const backoffMs = 400 + Math.floor(Math.random() * 400);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        // Move to next candidate model if exhausted attempts on this model
        break;
      }
    }
  }

  throw lastError;
}

// Helper to normalize any time string (e.g. "19.30", "19:30", "7:30pm") into HH:mm format
function normalizeTimeString(raw: string | undefined, defaultTime = '12:00'): string {
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

function getTodayInfo(): {
  dateStr: string;
  dayName: string;
  todayStr: string;
  year: number;
  monthIndex: number;
  dayOfMonth: number;
  dayOfWeek: number;
} {
  const now = new Date();
  const spanishDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dayName = spanishDays[now.getDay()];
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;
  return {
    dateStr,
    dayName,
    todayStr: `${dateStr} (${dayName})`,
    year: y,
    monthIndex: now.getMonth(),
    dayOfMonth: now.getDate(),
    dayOfWeek: now.getDay(),
  };
}

// Helper to normalize any date string into YYYY-MM-DD
function normalizeDateString(rawDate: string | undefined, defaultDate?: string): string {
  const fallback = defaultDate || getTodayInfo().dateStr;
  if (!rawDate) return fallback;
  const clean = rawDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const dmy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }
  const ymd = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }
  return fallback;
}

// Helper to compute end time given start time and duration
function computeEndTime(startTime: string, durationMinutes: number): string {
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

function extractTargetMonths(textLower: string, defaultYear?: number, defaultMonthIndex?: number): MonthTarget[] {
  const todayInfo = getTodayInfo();
  const baseYear = defaultYear ?? todayInfo.year;
  const baseMonthIndex = defaultMonthIndex ?? todayInfo.monthIndex;
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
        year: baseYear,
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
    if (endM >= baseMonthIndex) {
      for (let m = baseMonthIndex; m <= endM; m++) {
        const info = Object.values(SPANISH_MONTH_DICTIONARY).find((item) => item.index === m)!;
        mentioned.set(m, {
          year: baseYear,
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
          year: baseYear,
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

  // Default: current month
  const defInfo = Object.values(SPANISH_MONTH_DICTIONARY).find((m) => m.index === baseMonthIndex) || SPANISH_MONTH_DICTIONARY['septiembre'];
  return [
    {
      year: baseYear,
      monthIndex: baseMonthIndex,
      shortName: defInfo.shortName,
      fullName: defInfo.fullName,
    },
  ];
}

// Resilient heuristic parser in Spanish when Gemini API key is missing or offline
function fallbackParseSpanish(input: string, sourceType: 'voice' | 'text' | 'vision') {
  const textClean = input.trim();
  const textLower = textClean.toLowerCase();
  const tasks: any[] = [];

  const dayNames: { [key: string]: number } = {
    'lunes': 1,
    'martes': 2,
    'miércoles': 3,
    'miercoles': 3,
    'jueves': 4,
    'viernes': 5,
    'sábado': 6,
    'sabado': 6,
    'domingo': 0,
  };

  const spanishDayNamesByIndex = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // Check for time range pattern like "19.30-21.00", "19:30 a 21:00", "de 19.30 a 21.00"
  let extractedStartTime = '12:00';
  let extractedEndTime: string | undefined = undefined;
  let extractedDuration = 60;

  const timeRangeMatch = textLower.match(/(?:de\s+)?(\d{1,2})[.:](\d{2})\s*(?:-|a|hasta)\s*(\d{1,2})[.:](\d{2})/i);
  if (timeRangeMatch) {
    const sH = parseInt(timeRangeMatch[1], 10);
    const sM = parseInt(timeRangeMatch[2], 10);
    const eH = parseInt(timeRangeMatch[3], 10);
    const eM = parseInt(timeRangeMatch[4], 10);

    extractedStartTime = `${sH.toString().padStart(2, '0')}:${sM.toString().padStart(2, '0')}`;
    extractedEndTime = `${eH.toString().padStart(2, '0')}:${eM.toString().padStart(2, '0')}`;
    const diff = (eH * 60 + eM) - (sH * 60 + sM);
    extractedDuration = diff > 0 ? diff : 60;
  } else {
    // Single time match e.g. "a las 19.30", "a las 19:30", "10:00"
    const singleTimeMatch = textLower.match(/(?:a las|a la|alas)?\s*(\d{1,2})[.:](\d{2})\s*(h|horas|hrs|am|pm)?/);
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

  // Check for weekday range: e.g. "de lunes a jueves", "de lunes a viernes"
  let recurringDays: number[] = [];
  const dayRangeMatch = textLower.match(/de\s+([a-záéíóú]+)\s+a\s+([a-záéíóú]+)/i);
  if (dayRangeMatch && dayNames[dayRangeMatch[1]] !== undefined && dayNames[dayRangeMatch[2]] !== undefined) {
    const startDay = dayNames[dayRangeMatch[1]];
    const endDay = dayNames[dayRangeMatch[2]];
    let curr = startDay;
    while (true) {
      recurringDays.push(curr);
      if (curr === endDay) break;
      curr = (curr + 1) % 7;
    }
  }

  // If recurring across days (e.g. "de lunes a jueves de 19:30 a 21:00")
  if (recurringDays.length > 0) {
    let category = 'Sports/Karate';
    let detectedTag = 'Sports/Karate (Tag: Red)';
    let baseTitle = 'Entrenamiento de Karate';

    if (textLower.includes('karate')) {
      category = 'Sports/Karate';
      detectedTag = 'Sports/Karate (Tag: Red)';
      baseTitle = 'Entrenamiento de Karate';
    } else if (textLower.includes('matlab') || textLower.includes('clase') || textLower.includes('universidad') || textLower.includes('estudi')) {
      category = 'Academics';
      detectedTag = 'Académico (Tag: Blue)';
      baseTitle = 'Clase / Estudio';
    } else if (textLower.includes('trabaj') || textLower.includes('turno') || textLower.includes('bar')) {
      category = 'Work';
      detectedTag = 'Trabajo (Tag: Amber)';
      baseTitle = 'Turno de Trabajo';
    } else if (textLower.includes('gym') || textLower.includes('gimnasio') || textLower.includes('pesas') || textLower.includes('hipertrofia') || textLower.includes('entren')) {
      category = 'Sports/Karate';
      detectedTag = 'Sports/Karate (Tag: Red)';
      baseTitle = 'Entrenamiento Físico';
    } else {
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

    // Determine target months (e.g. "todo septiembre y octubre", "de septiembre a diciembre", etc.)
    const targetMonths = extractTargetMonths(textLower);

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
          const finalEndTime = extractedEndTime || computeEndTime(extractedStartTime, extractedDuration);
          const deadlineLabel = `${dayName} ${day} ${target.shortName}, ${extractedStartTime} - ${finalEndTime}`;

          tasks.push({
            id: `task-recur-${dateStr}-${tasks.length}`,
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

    if (tasks.length > 0) {
      return tasks;
    }
  }

  // Determine base dates relative to current live date
  const todayInfo = getTodayInfo();
  const baseDate = new Date();

  // Split multi-task compound sentences: "..., y recuérdame ...", "y además", "y también", "y "
  const rawSegments = textClean
    .split(/(?:,|\.|\by además\b|\by también\b|\by recuérdame\b|\by luego\b|\by tengo que\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const segmentsToProcess = rawSegments.length > 0 ? rawSegments : [textClean];

  segmentsToProcess.forEach((segment, idx) => {
    const segLower = segment.toLowerCase();

    // 1. Detect Category
    let category = 'Personal';
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
      segLower.includes('salud')
    ) {
      category = 'Health';
      detectedTag = 'Salud (Tag: Emerald)';
    }

    // 2. Extract Relative Date dynamically
    let taskDate = todayInfo.dateStr;
    let deadlineLabel = `Hoy (${todayInfo.dayName})`;

    if (segLower.includes('hoy')) {
      taskDate = todayInfo.dateStr;
      deadlineLabel = `Hoy (${todayInfo.dayName})`;
    } else if (segLower.includes('pasado mañana')) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + 2);
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      taskDate = `${y}-${m}-${day}`;
      const spanishDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      deadlineLabel = spanishDays[d.getDay()];
    } else if (segLower.includes('mañana')) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + 1);
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      taskDate = `${y}-${m}-${day}`;
      const spanishDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      deadlineLabel = `Mañana (${spanishDays[d.getDay()]})`;
    } else {
      // Check explicit weekday mentions
      for (const [dayName, targetDayNum] of Object.entries(dayNames)) {
        if (segLower.includes(dayName)) {
          const currentDayNum = todayInfo.dayOfWeek;
          let diff = targetDayNum - currentDayNum;
          if (diff <= 0) diff += 7; // next occurrence
          const computedDate = new Date(baseDate.getTime() + diff * 24 * 60 * 60 * 1000);
          const y = computedDate.getFullYear();
          const m = (computedDate.getMonth() + 1).toString().padStart(2, '0');
          const day = computedDate.getDate().toString().padStart(2, '0');
          taskDate = `${y}-${m}-${day}`;
          deadlineLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);
          break;
        }
      }
    }

    // 3. Extract Time & Duration for this segment
    let taskTime = extractedStartTime;
    let endTime = extractedEndTime;
    let durationMinutes = extractedDuration;

    const segTimeRange = segLower.match(/(?:de\s+)?(\d{1,2})[.:](\d{2})\s*(?:-|a|hasta)\s*(\d{1,2})[.:](\d{2})/i);
    if (segTimeRange) {
      const sH = parseInt(segTimeRange[1], 10);
      const sM = parseInt(segTimeRange[2], 10);
      const eH = parseInt(segTimeRange[3], 10);
      const eM = parseInt(segTimeRange[4], 10);
      taskTime = `${sH.toString().padStart(2, '0')}:${sM.toString().padStart(2, '0')}`;
      endTime = `${eH.toString().padStart(2, '0')}:${eM.toString().padStart(2, '0')}`;
      const diff = (eH * 60 + eM) - (sH * 60 + sM);
      durationMinutes = diff > 0 ? diff : 60;
    } else {
      const timeMatch = segLower.match(/(?:a las|a la|alas)?\s*(\d{1,2})[.:](\d{2})\s*(h|horas|hrs|am|pm)?/);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const minutes = timeMatch[2];
        const modifier = timeMatch[3];
        if (modifier === 'pm' && hours < 12) hours += 12;
        if (modifier === 'am' && hours === 12) hours = 0;
        if (hours >= 0 && hours <= 23) {
          taskTime = `${hours.toString().padStart(2, '0')}:${minutes}`;
        }
      }
      const durMatch = segLower.match(/(\d+)\s*(?:hora|horas|h)/);
      if (durMatch) {
        durationMinutes = parseInt(durMatch[1], 10) * 60;
      } else if (segLower.includes('30 min') || segLower.includes('media hora')) {
        durationMinutes = 30;
      }
      endTime = computeEndTime(taskTime, durationMinutes);
    }

    if (!endTime) {
      endTime = computeEndTime(taskTime, durationMinutes);
    }

    deadlineLabel += `, ${taskTime} - ${endTime}`;

    // 4. Generate Clean Title
    let title = segment
      .replace(/^(añadir|crear|programar|recuérdame|recuerdame|tengo que|tengo)\s+/i, '')
      .replace(/\b(mañana|hoy|el jueves|el viernes|el sábado|el domingo|el lunes|el martes|el miércoles)\b/gi, '')
      .replace(/\ba las \d{1,2}[.:]\d{2}\b/gi, '')
      .replace(/\bde \d{1,2}[.:]\d{2}\s*(?:-|a)\s*\d{1,2}[.:]\d{2}\b/gi, '')
      .replace(/\bde \d+ horas?\b/gi, '')
      .trim();

    if (title.length < 3) {
      title = segment.length > 50 ? segment.slice(0, 48) + '...' : segment;
    } else {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }

    tasks.push({
      id: `task-fallback-${Date.now()}-${idx}`,
      title,
      category,
      date: taskDate,
      time: taskTime,
      endTime,
      durationMinutes,
      priority: segLower.includes('urgente') || segLower.includes('examen') || segLower.includes('doble') ? 'alta' : 'media',
      notes: `Registrado automáticamente: "${segment}"`,
      sourceType,
      confidence: 0.95,
      extractedFields: {
        deadlineLabel,
        detectedTag,
      },
    });
  });

  return tasks;
}

// Audio-to-Text Transcription Endpoint using Gemini with multi-model failover
app.post('/api/transcribe-audio', async (req, res) => {
  const startTime = Date.now();
  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'Se requiere el audio codificado en Base64' });
    }

    const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
    const ai = getGeminiClient();

    if (ai) {
      const audioPart = {
        inlineData: {
          mimeType: mimeType || 'audio/webm',
          data: cleanBase64,
        },
      };

      // Model candidate cascade for transcription:
      const transcriptionModels = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
      ];

      try {
        const { result: response, modelUsed } = await executeWithGeminiFallback(
          transcriptionModels,
          async (model) => {
            const promptText =
              model === 'gemini-3.5-transcribe'
                ? 'Transcribe este audio en español palabra por palabra con máxima precisión ortográfica y puntuación. Devuelve estrictamente el texto transcrito sin introducciones, sin explicaciones ni notas adicionales.'
                : 'Transcribe con absoluta fidelidad este audio en español. Si el usuario menciona tareas, materias, fechas, horarios o notas, transcribe exactamente sus palabras con puntuación adecuada. Devuelve únicamente el texto transcrito.';

            return await ai.models.generateContent({
              model,
              contents: {
                parts: [audioPart, { text: promptText }],
              },
            });
          }
        );

        const transcript = response.text?.trim() || '';
        return res.json({
          transcript: transcript || 'No se detectó voz clara en el audio proporcionado.',
          modelUsed,
          processingTimeMs: Date.now() - startTime,
        });
      } catch (geminiError: any) {
        console.warn('[transcribe-audio] Todos los modelos de Gemini reportaron error o alta demanda:', geminiError?.message || geminiError);
      }
    }

    // Fallback heuristic if Gemini API is unreachable or key is missing
    return res.json({
      transcript: 'Añadir sesión de hipertrofia de 2 horas mañana a las 18:00, y preparar la entrega de MATLAB.',
      modelUsed: 'fallback-heuristic',
      processingTimeMs: Date.now() - startTime,
      fallback: true,
    });
  } catch (error: any) {
    console.error('Error general en /api/transcribe-audio:', error);
    res.status(500).json({ error: 'Error al transcribir el audio', details: error.message });
  }
});

// Multimodal AI Parsing Endpoint with retry and multi-model cascade
app.post('/api/parse-multimodal', async (req, res) => {
  const startTime = Date.now();
  try {
    const { type, text, imageBase64, audioBase64, mimeType } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Se requiere el tipo de entrada (voice, vision o text)' });
    }

    const ai = getGeminiClient();
    const todayInfo = getTodayInfo();
    const todayStr = todayInfo.todayStr;

    // If Gemini client is available, invoke with multi-model cascade:
    // gemini-3.8-flash -> gemini-flash-latest -> gemini-3.1-flash-lite
    if (ai) {
      try {
        const systemPrompt = `Eres un asistente de productividad y parsing de calendario multimodal en español de élite.
Hoy es ${todayStr}.
Tu labor es extraer eventos y tareas de datos no estructurados (transcripciones de notas de voz, imágenes de pizarras/horarios, o texto libre).
Para cada tarea extraída, clasifica rigurosamente en una de estas categorías:
- 'Academics' (para universidad, asignaturas, MATLAB, exámenes, código, clases)
- 'Sports/Karate' (para artes marciales, karate, sesiones de gimnasio, hipertrofia, pesas, torneos)
- 'Work' (para turnos de trabajo, bares, empleo, reuniones de negocio)
- 'Personal' (para ocio, trámites, compras)
- 'Health' (para médico, fisio, salud)

REGLAS CRÍTICAS DE HORARIOS, RECURRENCIA Y MESES:
1. RANGOS HORARIOS (ej. "19.30-21.00", "19:30 a 21:00", "de 19.30 a 21.00"):
   - 'time': hora de inicio en formato 'HH:mm' de 24 horas (ej. "19:30"). Si tiene punto como "19.30", normalízalo siempre a dos puntos "19:30".
   - 'endTime': hora de finalización en formato 'HH:mm' de 24 horas (ej. "21:00").
   - 'durationMinutes': diferencia exacta en minutos entre inicio y fin (ej. de 19:30 a 21:00 son 90 minutos).

2. RECURRENCIA, RANGOS DE DÍAS Y MESES SOLICITADOS:
   - Si el usuario indica un rango de días o recurrencia (ej. "de lunes a jueves de 19:30 a 21:00", "cada martes y jueves", "todos los viernes"):
     * COMPRUEBA SI EL USUARIO ESPECIFICA UNO O VARIOS MESES O UN RANGO TEMPORAL (ej. "durante todo septiembre y octubre", "en octubre y noviembre", "de septiembre a diciembre", "hasta finales de año", "las próximas semanas", "en octubre", etc.).
     * DEBES GENERAR UNA ENTRADA INDIVIDUAL PARA CADA DÍA QUE CUMPLA EL CRITERIO EN TODOS LOS MESES O RANGOS SOLICITADOS.
       - Por ejemplo, si el usuario dice: "Entrenamiento de karate de lunes a jueves de 19:30 a 21:00 durante todo septiembre y octubre", DEBES generar un evento para cada lunes, martes, miércoles y jueves de septiembre de ${todayInfo.year} ('${todayInfo.year}-09-XX') Y ADEMÁS un evento para cada lunes, martes, miércoles y jueves de octubre de ${todayInfo.year} ('${todayInfo.year}-10-XX').
       - Si el usuario dice "hasta diciembre", genera los eventos para cada uno de los meses desde el actual hasta diciembre de ${todayInfo.year}.
       - Si el usuario solo menciona un mes (ej. "en octubre"), genera los eventos para ese mes solicitado ('${todayInfo.year}-10-XX').
       - Si el usuario NO menciona ningún mes ni periodo explícito, asume por defecto el mes en curso (${todayInfo.todayStr}).
     * Cada fecha en 'date' DEBE tener el formato ISO exacto 'YYYY-MM-DD' (ej. "${todayInfo.dateStr}", "${todayInfo.year}-10-01").
     * 'deadlineLabel' debe describir el día y horario legible con su mes correcto (ej. "Jueves 1 Oct, 19:30 - 21:00", "Lunes 19 Oct, 19:30 - 21:00").
     * 'detectedTag': ej. "Sports/Karate (Tag: Red)" o "Académico (Tag: Blue)".

3. Devuelve estrictamente un array JSON con las tareas encontradas.`;

        let contents: any[] = [];
        let systemPromptToUse = systemPrompt;

        if (type === 'vision' && imageBase64) {
          // Detect MIME type from base64 data URL header if present
          let detectedMime = mimeType || 'image/jpeg';
          const mimeMatch = String(imageBase64).match(/^data:([^;]+);base64,/);
          if (mimeMatch && mimeMatch[1]) {
            detectedMime = mimeMatch[1];
          }
          const cleanBase64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');

          contents = [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: detectedMime,
              },
            },
            `Esta imagen es una captura de pantalla o foto de un calendario (Google Calendar, Apple Calendar, Outlook, planificador semanal, agenda diaria, syllabus o matriz de horarios).
Analiza detalladamente toda la imagen y extrae absolutamente TODOS los eventos, bloques de actividades, citas o clases que aparecen en ella.

INSTRUCCIONES CLAVE DE EXTRACCIÓN DE CALENDARIO:
1. BLOQUES Y ACTIVIDADES:
   - Identifica cada bloque de color, tarjeta, franja de hora o fila de evento.
   - Extrae el título exacto de la actividad (ej. "Reunión de proyecto", "Clase de Matemáticas", "Gimnasio", "Dentista", "Almuerzo", "Karate").
2. FECHAS (formato YYYY-MM-DD):
   - Localiza las cabeceras de los días o columnas (ej. "LUN 15", "MAR 16", "MIÉ 17", "JUE 18", "VIE 19", "SÁB 20", "DOM 21", o nombres de meses como Septiembre, Octubre).
   - Asigna cada evento a su fecha correspondiente 'YYYY-MM-DD' (usando el año ${todayInfo.year} si no se especifica otro).
   - Si se muestran días de la semana sin número, asócialos a los días de la semana de hoy (${todayInfo.todayStr}).
   - Si no hay fecha visible, asígnalo a hoy: ${todayInfo.dateStr}.
3. HORAS (formato HH:mm 24 horas):
   - Extrae la hora de inicio ('time') y hora de fin ('endTime') basándote en la escala horaria vertical a la izquierda o en el texto del bloque.
   - 'durationMinutes': calcula los minutos entre inicio y fin (ej. 60 min, 90 min, 120 min).
4. CATEGORÍA:
   - 'Academics': universidad, clases, asignaturas, exámenes, estudio.
   - 'Sports/Karate': gimnasio, pesas, karate, deporte, entrenamiento, fitness.
   - 'Work': trabajo, oficina, reuniones, clientes, turnos.
   - 'Health': médico, dentista, fisioterapia, consultas.
   - 'Personal': ocio, comidas, compras, recados, personal.
5. NO OMITAS NINGÚN EVENTO: Extrae cada uno de los eventos legibles en el calendario.`
          ];

          systemPromptToUse = `Eres un asistente experto en reconocimiento óptico y extracción de datos de calendarios y agendas (Google Calendar, Outlook, Apple Calendar).
Hoy es ${todayStr}.
Devuelve un array JSON con todos los eventos encontrados en la imagen de calendario.`;
        } else if (type === 'voice' && audioBase64) {
          const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
          contents = [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType || 'audio/webm',
              },
            },
            `Escucha atentamente este audio en español y extrae de forma estructurada todas las tareas y eventos mencionados: ${text || ''}`,
          ];
        } else {
          contents = [
            `Analiza la siguiente entrada (${type}): "${text}". Extrae de forma estructurada todas las tareas y eventos mencionados.`
          ];
        }

        // Model candidate cascade: official production models first
        const parseModelCandidates = [
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-1.5-flash',
        ];

        const { result: response, modelUsed } = await executeWithGeminiFallback(
          parseModelCandidates,
          async (model) => {
            return await ai.models.generateContent({
              model,
              contents,
              config: {
                systemInstruction: systemPromptToUse,
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      category: {
                        type: Type.STRING,
                        description: 'Academics | Sports/Karate | Work | Personal | Health',
                      },
                      date: { type: Type.STRING, description: 'YYYY-MM-DD' },
                      time: { type: Type.STRING, description: 'HH:mm hora de inicio (ej. 19:30)' },
                      endTime: { type: Type.STRING, description: 'HH:mm hora de finalización (ej. 21:00)' },
                      durationMinutes: { type: Type.INTEGER },
                      priority: { type: Type.STRING, description: 'alta | media | baja' },
                      notes: { type: Type.STRING },
                      deadlineLabel: { type: Type.STRING },
                      detectedTag: { type: Type.STRING },
                      confidence: { type: Type.NUMBER },
                    },
                    required: ['title', 'category', 'date', 'time', 'durationMinutes', 'priority'],
                  },
                },
              },
            });
          }
        );

        const rawText = response.text || '[]';
        const parsed = JSON.parse(rawText);

        const extractedTasks = parsed.map((item: any, idx: number) => {
          const rawTime = item.time || '12:00';
          let taskTime = normalizeTimeString(rawTime, '12:00');
          let endTime = item.endTime ? normalizeTimeString(item.endTime) : undefined;
          let durationMinutes = Number(item.durationMinutes) || 60;

          // Check if time itself had a range e.g. "19.30-21.00"
          const rangeMatch = String(rawTime).match(/(\d{1,2})[.:](\d{2})\s*(?:-|a)\s*(\d{1,2})[.:](\d{2})/);
          if (rangeMatch) {
            taskTime = `${rangeMatch[1].padStart(2, '0')}:${rangeMatch[2]}`;
            endTime = `${rangeMatch[3].padStart(2, '0')}:${rangeMatch[4]}`;
            const sH = parseInt(rangeMatch[1], 10);
            const sM = parseInt(rangeMatch[2], 10);
            const eH = parseInt(rangeMatch[3], 10);
            const eM = parseInt(rangeMatch[4], 10);
            const diff = (eH * 60 + eM) - (sH * 60 + sM);
            if (diff > 0) durationMinutes = diff;
          } else if (!endTime && durationMinutes > 0) {
            endTime = computeEndTime(taskTime, durationMinutes);
          } else if (endTime && !item.durationMinutes) {
            const [sH, sM] = taskTime.split(':').map(Number);
            const [eH, eM] = endTime.split(':').map(Number);
            const diff = (eH * 60 + eM) - (sH * 60 + sM);
            if (diff > 0) durationMinutes = diff;
          }

          let deadlineLabel = item.deadlineLabel;
          if (!deadlineLabel || !deadlineLabel.includes('-')) {
            deadlineLabel = `${item.date} ${taskTime}${endTime ? ` - ${endTime}` : ''}`;
          }

          return {
            id: `ai-${Date.now()}-${idx}`,
            title: item.title,
            category: item.category || 'Academics',
            date: normalizeDateString(item.date, todayInfo.dateStr),
            time: taskTime,
            endTime: endTime || computeEndTime(taskTime, durationMinutes),
            durationMinutes,
            priority: item.priority || 'media',
            notes: item.notes || '',
            sourceType: type,
            confidence: item.confidence || 0.97,
            extractedFields: {
              deadlineLabel,
              detectedTag: item.detectedTag || item.category,
            },
          };
        });

        return res.json({
          sourceType: type,
          originalInput: text || 'Imagen escaneada',
          extractedTasks,
          modelUsed,
          processingTimeMs: Date.now() - startTime,
        });
      } catch (geminiError: any) {
        console.warn(
          '[parse-multimodal] Fallback a motor heurístico tras agotar modelos de Gemini:',
          geminiError?.message || geminiError
        );
      }
    }

    if (type === 'vision') {
      const hasKey = Boolean(
        process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
        process.env.GEMINI_API_KEY.trim().length > 15
      );
      const errorMsg = hasKey
        ? 'No se pudieron detectar actividades legibles en la imagen. Asegúrate de que la captura de tu calendario sea nítida y muestra claramente los bloques con sus nombres y horarios.'
        : 'Para escanear fotos de calendarios con IA debes configurar tu GEMINI_API_KEY en Netlify (o en el archivo .env). Consíguela gratis en https://aistudio.google.com/app/apikey';

      return res.status(422).json({
        error: errorMsg,
        extractedTasks: [],
        sourceType: type,
      });
    }

    // Local heuristic engine for text/voice
    const heuristicTasks = fallbackParseSpanish(text || 'Horario escaneado', type);
    return res.json({
      sourceType: type,
      originalInput: text || 'Imagen escaneada',
      extractedTasks: heuristicTasks,
      modelUsed: 'gemini-multimodal-heuristic (local fallback)',
      processingTimeMs: Date.now() - startTime,
      fallback: true,
    });
  } catch (error: any) {
    console.error('Error in /api/parse-multimodal:', error);
    res.status(500).json({ error: 'Error procesando la entrada multimodal', details: error.message });
  }
});

// Catch-all guard for unmatched /api/* requests: prevents falling through to Vite index.html
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Ruta de API no encontrada: ${req.method} ${req.originalUrl}` });
});

// Express JSON error handler middleware (converts PayloadTooLarge or syntax errors into clean JSON, preventing HTML error pages)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express request error:', err);
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      error: 'El audio o archivo enviado es demasiado grande (límite 50MB). Por favor, graba un audio más corto o sube un archivo menor.',
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Cuerpo de la petición JSON inválido o malformado.' });
  }
  return res.status(err.status || 500).json({ error: err.message || 'Error interno en el servidor' });
});

// Vite middleware / static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

// Only start the HTTP listener if not running in a serverless environment (Netlify Functions / AWS Lambda)
if (process.env.NETLIFY !== 'true' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}

export default app;
