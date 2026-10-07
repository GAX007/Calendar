import { TaskItem, CategoryType } from '../types';

/**
 * Format a Date object into iCalendar UTC/Local format: YYYYMMDDTHHmmss
 */
function formatDateToICS(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split('-');
  const [hours, minutes] = (timeStr || '12:00').split(':');
  const pad = (val: string | number) => val.toString().padStart(2, '0');
  return `${year}${pad(month)}${pad(day)}T${pad(hours)}${pad(minutes)}00`;
}

/**
 * Parse an iCal date string (e.g. 20261006T093000 or 20261006)
 */
function parseICSDate(icsDateStr: string): { date: string; time: string } {
  const clean = icsDateStr.replace(/[^0-9T]/g, '');
  if (clean.includes('T')) {
    const [d, t] = clean.split('T');
    const year = d.substring(0, 4);
    const month = d.substring(4, 6);
    const day = d.substring(6, 8);
    const hours = t.substring(0, 2);
    const minutes = t.substring(2, 4);
    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${minutes}`,
    };
  } else {
    const year = clean.substring(0, 4);
    const month = clean.substring(4, 6);
    const day = clean.substring(6, 8);
    return {
      date: `${year}-${month}-${day}`,
      time: '09:00',
    };
  }
}

/**
 * Categorize imported event title/description into CategoryType
 */
function guessCategory(title: string, desc: string): CategoryType {
  const text = `${title} ${desc}`.toLowerCase();
  if (text.includes('exam') || text.includes('clase') || text.includes('uni') || text.includes('deber') || text.includes('practic') || text.includes('estudio')) {
    return 'Academics';
  }
  if (text.includes('gym') || text.includes('karate') || text.includes('entreno') || text.includes('pesas') || text.includes('deporte') || text.includes('kumite')) {
    return 'Sports/Karate';
  }
  if (text.includes('trabaj') || text.includes('turno') || text.includes('reunion') || text.includes('work') || text.includes('shift')) {
    return 'Work';
  }
  if (text.includes('medic') || text.includes('salud') || text.includes('dentista') || text.includes('fisio')) {
    return 'Health';
  }
  return 'Personal';
}

/**
 * Generate iCalendar RFC 5545 content from TaskItem list
 */
export function exportTasksToICS(tasks: TaskItem[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CalendarAsist//OmniAgenda AI//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:CalendarAsist OmniAgenda',
    'X-WR-TIMEZONE:Europe/Madrid',
  ];

  tasks.forEach((task) => {
    const dtStart = formatDateToICS(task.date, task.time);
    const endTime = task.endTime || '23:59';
    const dtEnd = formatDateToICS(task.date, endTime);
    const createdTimestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${task.id}@calendarasist.local`);
    lines.push(`DTSTAMP:${createdTimestamp}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${task.title.replace(/[\n\r]/g, ' ')}`);
    lines.push(`CATEGORIES:${task.category}`);
    if (task.notes) {
      lines.push(`DESCRIPTION:${task.notes.replace(/[\n\r]/g, '\\n')}`);
    }
    if (task.completed) {
      lines.push('STATUS:COMPLETED');
    } else {
      lines.push('STATUS:CONFIRMED');
    }
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Triggers client-side download of an .ics file
 */
export function downloadICSFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.ics') ? filename : `${filename}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse an .ics file content string into an array of TaskItems
 */
export function parseICSToTasks(icsContent: string): TaskItem[] {
  const tasks: TaskItem[] = [];
  const veventBlocks = icsContent.split('BEGIN:VEVENT');

  // Skip the first chunk before the first BEGIN:VEVENT
  for (let i = 1; i < veventBlocks.length; i++) {
    const block = veventBlocks[i].split('END:VEVENT')[0];
    const lines = block.split(/\r\n|\n|\r/);

    let summary = 'Evento Importado';
    let dtStartRaw = '';
    let dtEndRaw = '';
    let description = '';
    let category: CategoryType | null = null;
    let uid = `import-${Date.now()}-${i}`;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('SUMMARY:')) {
        summary = line.substring('SUMMARY:'.length).replace(/\\n/g, ' ').trim();
      } else if (line.startsWith('DTSTART') || line.startsWith('DTSTART:')) {
        const parts = line.split(':');
        dtStartRaw = parts[parts.length - 1];
      } else if (line.startsWith('DTEND') || line.startsWith('DTEND:')) {
        const parts = line.split(':');
        dtEndRaw = parts[parts.length - 1];
      } else if (line.startsWith('DESCRIPTION:')) {
        description = line.substring('DESCRIPTION:'.length).replace(/\\n/g, '\n').trim();
      } else if (line.startsWith('UID:')) {
        uid = line.substring('UID:'.length).trim();
      } else if (line.startsWith('CATEGORIES:')) {
        const catVal = line.substring('CATEGORIES:'.length).trim();
        if (catVal.includes('Academic') || catVal.includes('Sport') || catVal.includes('Work') || catVal.includes('Health') || catVal.includes('Personal')) {
          category = catVal as CategoryType;
        }
      }
    }

    if (dtStartRaw) {
      const parsedStart = parseICSDate(dtStartRaw);
      let endTime = '';
      let durationMinutes = 60;

      if (dtEndRaw) {
        const parsedEnd = parseICSDate(dtEndRaw);
        endTime = parsedEnd.time;
        const [sH, sM] = parsedStart.time.split(':').map(Number);
        const [eH, eM] = parsedEnd.time.split(':').map(Number);
        const diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff > 0) durationMinutes = diff;
      } else {
        const [sH, sM] = parsedStart.time.split(':').map(Number);
        const endHour = (sH + 1) % 24;
        endTime = `${endHour.toString().padStart(2, '0')}:${sM.toString().padStart(2, '0')}`;
      }

      tasks.push({
        id: uid,
        title: summary,
        category: category || guessCategory(summary, description),
        date: parsedStart.date,
        time: parsedStart.time,
        endTime,
        durationMinutes,
        priority: 'media',
        notes: description || 'Importado desde Google Calendar / iCal',
        sourceType: 'manual',
        completed: false,
      });
    }
  }

  return tasks;
}

/**
 * Generates a direct web URL to add an event to Google Calendar in one click
 */
export function generateGoogleCalendarUrl(task: TaskItem): string {
  const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const title = encodeURIComponent(task.title);
  const details = encodeURIComponent(task.notes || 'Evento de CalendarAsist');

  const dtStart = formatDateToICS(task.date, task.time);
  const dtEnd = formatDateToICS(task.date, task.endTime || '23:59');
  const dates = `${dtStart}/${dtEnd}`;

  return `${baseUrl}&text=${title}&dates=${dates}&details=${details}`;
}
