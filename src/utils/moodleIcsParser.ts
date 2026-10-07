import {
  EntregaTipo,
  GrupoFamilia,
  MIS_GRUPOS_CONFIG,
  DEFAULT_MIS_GRUPOS,
} from '../services/moodleTypes';

export interface ParsedMoodleEvent {
  uid: string;
  asignatura_codigo: string;
  titulo_raw: string;
  titulo: string;
  tipo: EntregaTipo;
  grupo: GrupoFamilia;
  oculta_por_grupo: boolean;
  deadline_utc: string; // ISO 8601 UTC string (e.g. 2026-10-05T11:30:00Z)
  descripcion: string;
  moodle_modificado_utc: string | null;
}

/**
 * Líneas plegadas en RFC 5545:
 * Unir las líneas que empiezan por espacio o tabulador.
 * Pueden aparecer líneas plegadas vacías (por ejemplo solo '\t' o ' ').
 */
export function unfoldICS(rawContent: string): string[] {
  const rawLines = rawContent.split(/\r\n|\n|\r/);
  const lines: string[] = [];

  for (const raw of rawLines) {
    if (raw.startsWith(' ') || raw.startsWith('\t')) {
      if (lines.length > 0) {
        // En RFC 5545 se elimina el primer caracter de plegado (espacio o tab) y se concatena el resto
        lines[lines.length - 1] += raw.slice(1);
      }
    } else {
      lines.push(raw);
    }
  }

  return lines;
}

/**
 * Desescapar \n, \,, \;, y &amp; en SUMMARY y DESCRIPTION
 */
export function unescapeICSText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/&amp;/g, '&')
    .replace(/\\\\/g, '\\');
}

/**
 * Convierte un formato de fecha iCalendar (ej: 20261005T113000Z o 20261005T113000)
 * a una cadena ISO 8601 UTC estricta (ej: 2026-10-05T11:30:00Z).
 */
export function parseICSDateToISO(icsDate: string): string {
  const clean = (icsDate || '').trim();
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) {
    // Si ya viene como ISO o timestamp, intentar Date
    try {
      const d = new Date(clean);
      if (!isNaN(d.getTime())) {
        return d.toISOString().replace('.000Z', 'Z');
      }
    } catch {
      // Ignorar fallback
    }
    return clean;
  }
  const [, y, m, d, hh, mm, ss] = match;
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
}

/**
 * Convierte una fecha UTC a hora local de Europa/Madrid usando IANA TimeZone.
 * No resta ni suma horas a mano: calcula automáticamente el huso horario correspondiente
 * (CET UTC+1 en invierno, CEST UTC+2 en verano).
 */
export function formatToMadridTime(isoUtc: string): {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  formatted: string; // DD/MM/YYYY HH:mm
  day: number;
  month: number;
  year: number;
  hours: number;
  minutes: number;
} {
  const dateObj = new Date(isoUtc);

  const dtf = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = dtf.formatToParts(dateObj);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const dayStr = getPart('day');
  const monthStr = getPart('month');
  const yearStr = getPart('year');
  const hourStr = getPart('hour');
  const minuteStr = getPart('minute');

  return {
    date: `${yearStr}-${monthStr}-${dayStr}`,
    time: `${hourStr}:${minuteStr}`,
    formatted: `${dayStr}/${monthStr}/${yearStr} ${hourStr}:${minuteStr}`,
    day: parseInt(dayStr, 10),
    month: parseInt(monthStr, 10),
    year: parseInt(yearStr, 10),
    hours: parseInt(hourStr, 10),
    minutes: parseInt(minuteStr, 10),
  };
}

/**
 * Detectar etiquetas T1, T2, F1, F2 solo en SUMMARY, como token aislado
 * (no precedido ni seguido de letras, dígitos o punto).
 * Ejemplo: I3001-F.2 NO es una etiqueta de grupo.
 */
export function extractGroup(summary: string): GrupoFamilia {
  const regex = /(?<![a-zA-Z0-9.])([TF][12])(?![a-zA-Z0-9.])/;
  const match = summary.match(regex);
  if (match) {
    return match[1] as GrupoFamilia;
  }
  return null;
}

/**
 * Título limpio (guardar también titulo_raw):
 * - quitar el sufijo '(r)en entregatze-data' o '(r)en itxiera-data:' al final
 * - quitar el prefijo 'Vencimiento de ' y el prefijo '[ENTREGATZEKO] '
 * - quitar la etiqueta de grupo y recortar espacios
 */
export function cleanTitle(rawSummary: string, detectedGroup: string | null): string {
  let title = rawSummary;

  // 1. Quitar sufijo al final:
  // '(r)en entregatze-data' o '(r)en itxiera-data:'
  title = title.replace(/\(r\)en\s+entregatze-data\s*$/i, '');
  title = title.replace(/\(r\)en\s+itxiera-data:?\s*$/i, '');

  // 2. Quitar prefijo al principio:
  // 'Vencimiento de ' y '[ENTREGATZEKO] '
  title = title.replace(/^Vencimiento\s+de\s+/i, '');
  title = title.replace(/^\[ENTREGATZEKO\]\s+/i, '');

  // 3. Quitar la etiqueta de grupo y recortar espacios
  if (detectedGroup) {
    // Si viene acompañada de separador inmediato posterior (ej. 'T1: ' o 'T1 - ')
    const groupRegexWithSep = new RegExp(
      `(?<![a-zA-Z0-9.])${detectedGroup}(?![a-zA-Z0-9.])\\s*[:\\-]?\\s*`,
      'g'
    );
    title = title.replace(groupRegexWithSep, '');
  }

  // Normalizar espacios múltiples y recortar bordes
  return title.replace(/\s+/g, ' ').trim();
}

/**
 * Parsea un feed ICS de Moodle y extrae los eventos estructurados
 */
export function parseMoodleICS(
  icsContent: string,
  misGrupos: MIS_GRUPOS_CONFIG = DEFAULT_MIS_GRUPOS
): ParsedMoodleEvent[] {
  const lines = unfoldICS(icsContent);
  const events: ParsedMoodleEvent[] = [];

  let inEvent = false;
  let rawEventProps: Record<string, string> = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      rawEventProps = {};
    } else if (line === 'END:VEVENT') {
      if (inEvent) {
        const uid = rawEventProps['UID']?.trim();
        if (uid) {
          const rawSummary = unescapeICSText(rawEventProps['SUMMARY'] || '').trim();
          const rawDescription = unescapeICSText(rawEventProps['DESCRIPTION'] || '').trim();
          const dtStart = rawEventProps['DTSTART'] || '';
          const lastModified = rawEventProps['LAST-MODIFIED'] || '';
          const categories = rawEventProps['CATEGORIES']?.trim() || '';

          // Tipo de evento:
          // SUMMARY contiene 'itxiera-data' -> cierre_cuestionario
          // cualquier otro caso -> entrega
          const tipo: EntregaTipo = rawSummary.includes('itxiera-data')
            ? 'cierre_cuestionario'
            : 'entrega';

          // Detección de grupo y visibilidad:
          const grupo = extractGroup(rawSummary);
          let ocultaPorGrupo = false;
          if (grupo) {
            const family = grupo[0] as 'T' | 'F';
            const userGroupForFamily = misGrupos[family];
            // Si el evento lleva una etiqueta de una familia que no coincide con la mía, se oculta
            if (userGroupForFamily && grupo !== userGroupForFamily) {
              ocultaPorGrupo = true;
            }
          }

          // Título limpio
          const tituloLimpio = cleanTitle(rawSummary, grupo);

          // Fechas
          const deadlineUtc = parseICSDateToISO(dtStart);
          const moodleModificadoUtc = lastModified ? parseICSDateToISO(lastModified) : null;

          events.push({
            uid,
            asignatura_codigo: categories,
            titulo_raw: rawSummary,
            titulo: tituloLimpio,
            tipo,
            grupo,
            oculta_por_grupo: ocultaPorGrupo,
            deadline_utc: deadlineUtc,
            descripcion: rawDescription,
            moodle_modificado_utc: moodleModificadoUtc,
          });
        }
      }
      inEvent = false;
    } else if (inEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const propPart = line.slice(0, colonIdx);
        const val = line.slice(colonIdx + 1);
        const propName = propPart.split(';')[0].toUpperCase().trim();
        rawEventProps[propName] = val;
      }
    }
  }

  return events;
}
