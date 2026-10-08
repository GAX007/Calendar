import { TaskItem } from '../types';
import { replaceGoogleCalendarTasks } from './taskService';
import { mergeGoogleCalendarSnapshot } from '../utils/googleCalendarSnapshot';

const pendingSyncs = new Map<string, Promise<SyncLiveResult>>();
const lastSnapshots = new Map<string, TaskItem[]>();

export function applyLatestGoogleCalendarSnapshot(tasks: TaskItem[], userId?: string): TaskItem[] {
  const snapshot = lastSnapshots.get(userId || 'guest');
  return snapshot ? mergeGoogleCalendarSnapshot(tasks, snapshot) : tasks;
}

export const AUTHORIZED_CALENDAR_OWNER_EMAIL = 'xaviervarteniuc@gmail.com';

export const GOOGLE_CALENDAR_CONFIG = {
  calName: '(Ordutegia)-M2GI12E',
  embedUrl:
    'https://calendar.google.com/calendar/embed?src=c_188e38oiac67aguujcmmlujtorkrq%40resource.calendar.google.com&ctz=Europe%2FMadrid',
  icalUrl:
    'https://calendar.google.com/calendar/ical/c_188e38oiac67aguujcmmlujtorkrq%40resource.calendar.google.com/public/basic.ics',
};

export interface SyncLiveResult {
  success: boolean;
  calName: string;
  count: number;
  tasks: TaskItem[];
  embedUrl: string;
  syncedAt?: string;
  error?: string;
}

/**
 * Storage key helper for per-user custom calendar iCal URL.
 */
function getStorageKey(userId?: string): string {
  return `calendarasist_user_ical_${userId || 'guest'}`;
}

/**
 * Get user's custom iCal URL from local storage.
 */
export function getUserCustomCalendarUrl(userId?: string): string {
  try {
    return localStorage.getItem(getStorageKey(userId)) || '';
  } catch {
    return '';
  }
}

/**
 * Save or clear user's custom iCal URL in local storage.
 */
export function setUserCustomCalendarUrl(url: string, userId?: string): void {
  try {
    const key = getStorageKey(userId);
    if (url.trim()) {
      localStorage.setItem(key, url.trim());
    } else {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('Could not save custom calendar URL:', err);
  }
}

/**
 * Resolves the effective calendar URL for a given user.
 * - If user has configured their own custom iCal URL, that takes priority.
 * - For Xavier's account or unauthenticated local dev testing, falls back to the official university schedule.
 * - For other users without a custom URL, returns empty string to preserve privacy.
 */
export function getEffectiveCalendarUrl(userId?: string, userEmail?: string): string {
  const customUrl = getUserCustomCalendarUrl(userId);
  if (customUrl) {
    return customUrl;
  }

  const cleanEmail = (userEmail || '').toLowerCase().trim();
  const isXavier = cleanEmail === AUTHORIZED_CALENDAR_OWNER_EMAIL;
  const isDevGuest = !userId && !userEmail;

  if (isXavier || isDevGuest) {
    return GOOGLE_CALENDAR_CONFIG.icalUrl;
  }

  return '';
}

/**
 * Fetch and sync all tasks in real time from Google Calendar.
 * Supports per-user custom iCal URLs as well as Xavier's default university schedule.
 */
export async function syncLiveGoogleCalendar(
  userId?: string,
  userEmail?: string,
  overrideUrl?: string
): Promise<SyncLiveResult> {
  // One persistence operation per user at a time; focus and timer cannot overwrite newer changes.
  const key = userId || 'guest';
  const previous = pendingSyncs.get(key);
  const pending = (async () => {
    if (previous) await previous;
    return performSync(userId, userEmail, overrideUrl);
  })();
  pendingSyncs.set(key, pending);
  try { return await pending; }
  finally { if (pendingSyncs.get(key) === pending) pendingSyncs.delete(key); }
}

async function performSync(userId?: string, userEmail?: string, overrideUrl?: string): Promise<SyncLiveResult> {
  try {
    const cleanEmail = (userEmail || '').toLowerCase().trim();
    const effectiveUrl =
      overrideUrl !== undefined ? overrideUrl : getEffectiveCalendarUrl(userId, cleanEmail);

    const isXavier = cleanEmail === AUTHORIZED_CALENDAR_OWNER_EMAIL;
    const isDevGuest = !userId && !cleanEmail;

    // If no custom URL is configured and user is not authorized for the default schedule:
    if (!effectiveUrl && !isXavier && !isDevGuest) {
      return {
        success: false,
        calName: '',
        embedUrl: '',
        count: 0,
        tasks: [],
        error: 'No tienes un calendario vinculado. Haz clic en "Vincular Google Calendar" para añadir tu enlace iCal.',
      };
    }

    const params = new URLSearchParams();
    if (cleanEmail) params.set('email', cleanEmail);
    if (effectiveUrl) params.set('url', effectiveUrl);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/google-calendar/sync-live${queryString}`, { cache: 'no-store' });

    if (res.status === 403) {
      return {
        success: false,
        calName: '',
        embedUrl: '',
        count: 0,
        tasks: [],
        error: 'Esta cuenta no tiene un calendario universitario vinculado.',
      };
    }

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }

    const data: SyncLiveResult = await res.json();
    if (data.success && Array.isArray(data.tasks)) {
      if (data.tasks.some(task => !task.id?.startsWith('gcal-') || !task.date || !task.time)) throw new Error('El servidor ha devuelto eventos inválidos.');
      const scoped = data.tasks.map(task => ({ ...task, id: userId ? `gcal-user:${userId}:${task.id.slice(5)}` : task.id }));
      data.tasks = await replaceGoogleCalendarTasks(scoped, userId);
      data.count = data.tasks.length;
      lastSnapshots.set(userId || 'guest', data.tasks);
      localStorage.setItem(`calendarasist_gcal_last_sync_${userId || 'guest'}`, new Date().toISOString());
      return data;
    }
    throw new Error(data.error || 'Respuesta inválida del servidor');
  } catch (err: any) {
    console.error('Error fetching live Google Calendar:', err);
    return {
      success: false,
      calName: GOOGLE_CALENDAR_CONFIG.calName,
      embedUrl: GOOGLE_CALENDAR_CONFIG.embedUrl,
      count: 0,
      tasks: [],
      error: err.message || 'Error de conexión con Google Calendar',
    };
  }
}
