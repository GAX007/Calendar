import ICAL from 'ical.js';
import type { TaskItem } from '../types';

const madridZone = `BEGIN:VTIMEZONE
TZID:Europe/Madrid
BEGIN:DAYLIGHT
DTSTART:19700329T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
DTSTART:19701025T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;

function madridParts(time: ICAL.Time): { date: string; time: string } {
  if (time.isDate || time.zone === ICAL.Timezone.localTimezone) {
    return { date: time.toString().slice(0, 10), time: time.isDate ? '09:00' : time.toString().slice(11, 16) };
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(time.toJSDate());
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

/** Expand the source calendar, applying its recurrence exceptions before creating tasks. */
export function parseGoogleCalendarFeed(content: string, isCustom = false, now = new Date()): TaskItem[] {
  const text = content.trim();
  if (!text.startsWith('BEGIN:VCALENDAR') || !text.endsWith('END:VCALENDAR')) {
    throw new Error('Google Calendar no ha devuelto un calendario completo. Vuelve a intentarlo.');
  }
  const calendar = new ICAL.Component(ICAL.parse(text));
  ICAL.TimezoneService.register(new ICAL.Component(ICAL.parse(madridZone)));
  for (const zone of calendar.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(zone);
  const grouped = new Map<string, ICAL.Component[]>();
  for (const component of calendar.getAllSubcomponents('vevent')) {
    const uid = String(component.getFirstPropertyValue('uid') || '');
    if (!uid) throw new Error('El calendario contiene un evento sin identificador.');
    const group = grouped.get(uid) || [];
    group.push(component);
    grouped.set(uid, group);
  }
  const from = `${now.getFullYear()}-01-01`;
  const until = `${now.getFullYear() + 2}-01-01`;
  const tasks = new Map<string, TaskItem>();

  for (const [uid, components] of grouped) {
    // A feed can contain several revisions. Use the latest revision of each occurrence.
    const versions = new Map<string, ICAL.Event>();
    for (const component of components) {
      const event = new ICAL.Event(component, { exceptions: [] });
      const key = event.isRecurrenceException() ? event.recurrenceId.toString() : 'master';
      const previous = versions.get(key);
      const stamp = (e: ICAL.Event) => String(e.component.getFirstPropertyValue('last-modified') || e.component.getFirstPropertyValue('dtstamp') || '');
      if (!previous || event.sequence > previous.sequence || (event.sequence === previous.sequence && stamp(event) >= stamp(previous))) versions.set(key, event);
    }
    const master = versions.get('master');
    const exceptions = [...versions.entries()].filter(([key]) => key !== 'master').map(([,event]) => event);
    const cancelled = (event: ICAL.Event) => event.component.getFirstPropertyValue('status') === 'CANCELLED';
    if (master && cancelled(master)) continue;
    for (const exception of exceptions) {
      // A cancellation is allowed to contain only UID and RECURRENCE-ID.
      if (cancelled(exception) && !exception.startDate) exception.startDate = exception.recurrenceId.clone();
    }
    if (master) for (const exception of exceptions) master.relateException(exception);

    const add = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time, recurrence?: ICAL.Time) => {
      const id = `gcal-${uid}${recurrence ? `_rec-${recurrence.toUnixTime()}` : ''}`;
      // Remove an occurrence if its explicit revision cancels it or moves it outside the range.
      tasks.delete(id);
      if (cancelled(event)) return;
      if (!start) throw new Error('El calendario contiene un evento incompleto.');
      const startParts = madridParts(start);
      if (startParts.date < from || startParts.date >= until) return;
      const endParts = madridParts(end);
      const duration = Math.max(1, (end.toUnixTime() - start.toUnixTime()) / 60) || 60;
      const location = event.location || '';
      tasks.set(id, {
        id, title: event.summary?.trim() || 'Evento de Google Calendar', date: startParts.date, time: startParts.time,
        endTime: endParts.time, durationMinutes: duration, category: 'Academics', priority: 'media',
        notes: location ? `${isCustom ? 'Ubicación' : 'Aula'}: ${location}${isCustom ? '' : ' • Horario Oficial M2GI12E'}`
          : (isCustom ? event.description || 'Google Calendar' : 'Horario Oficial M2GI12E'),
        sourceType: 'manual', completed: false,
        extractedFields: {
          calendarSource: 'google-calendar', calendarUid: uid,
          calendarRecurrenceId: recurrence?.toString(),
          calendarLegacyId: `gcal-${uid}${recurrence ? `_${madridParts(recurrence).date}` : ''}`,
        },
      });
    };

    if (master) {
      if (!master.startDate) throw new Error('El calendario contiene un evento sin fecha.');
      if (master.isRecurring()) {
        const iterator = master.iterator();
        let finished = false;
        for (let i = 0; i < 20000; i++) {
          const occurrence = iterator.next();
          if (!occurrence || madridParts(occurrence).date >= until) { finished = true; break; }
          const details = master.getOccurrenceDetails(occurrence);
          add(details.item, details.startDate, details.endDate, occurrence);
        }
        if (!finished) throw new Error('El calendario contiene demasiadas repeticiones para sincronizarlo completo.');
      } else add(master, master.startDate, master.endDate);
    }
    // Include detached/moved exceptions even if their original date was excluded with EXDATE.
    for (const exception of exceptions) add(exception, exception.startDate, exception.endDate, exception.recurrenceId);
  }
  return [...tasks.values()].sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}
