import { TaskItem } from '../types';
import { INITIAL_TASKS } from '../data/initialTasks';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isGoogleCalendarTask, mergeGoogleCalendarSnapshot } from '../utils/googleCalendarSnapshot';

const BASE_STORAGE_KEY = 'calendarasist_tasks';
const LEGACY_KEY = 'omniagenda_tasks';

function getStorageKey(userId?: string): string {
  return userId ? `${BASE_STORAGE_KEY}_${userId}` : `${BASE_STORAGE_KEY}_guest`;
}

// Convert frontend TaskItem to database row
export function toDbRow(task: TaskItem, userId?: string) {
  return {
    id: task.id,
    user_id: userId || null,
    title: task.title,
    category: task.category,
    date: task.date,
    time: task.time,
    end_time: task.endTime || null,
    duration_minutes: task.durationMinutes || 60,
    priority: task.priority || 'media',
    notes: task.notes || null,
    source_type: task.sourceType || 'manual',
    confidence: task.confidence !== undefined ? task.confidence : null,
    completed: Boolean(task.completed),
    detected_snippet: task.detectedSnippet || null,
    extracted_fields: task.extractedFields || null,
  };
}

// Convert database row to frontend TaskItem
export function fromDbRow(row: any): TaskItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    date: row.date,
    time: row.time,
    endTime: row.end_time || undefined,
    durationMinutes: row.duration_minutes || 60,
    priority: row.priority || 'media',
    notes: row.notes || undefined,
    sourceType: row.source_type || 'manual',
    confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : undefined,
    completed: Boolean(row.completed),
    detectedSnippet: row.detected_snippet || undefined,
    extractedFields: row.extracted_fields || undefined,
  };
}

// Hydration task detection filter
export function isHydrationTask(task: TaskItem): boolean {
  if (!task) return false;
  const title = (task.title || '').toLowerCase();
  const notes = (task.notes || '').toLowerCase();
  if (title.includes('hidratac') || notes.includes('hidratac')) return true;
  if (title.includes('agua a sorbos') || title.includes('sorbos constantes')) return true;
  if (/(?:tomar[eé]|beber[eé]|beber).*(?:ml|litro|agua)/i.test(title)) return true;
  if (/(?:ml|litro).*agua/i.test(title)) return true;
  if (/^tomar[eé]\s+\d+\s*ml/i.test(title)) return true;
  if (/^beber[eé]\s+/i.test(title)) return true;
  return false;
}

// LocalStorage helpers
export function getLocalTasks(userId?: string): TaskItem[] {
  try {
    const key = getStorageKey(userId);
    const saved = localStorage.getItem(key) || (!userId ? localStorage.getItem(BASE_STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) : null);
    if (saved) {
      const parsed: TaskItem[] = JSON.parse(saved);
      const filtered = parsed.filter((t) => !isHydrationTask(t));

      // Check if stored tasks are exclusively stale sample mock tasks from September 2026
      const hasOnlyStaleSeptemberMocks = filtered.length > 0 &&
        filtered.every((t) => t.date && t.date.startsWith('2026-09')) &&
        filtered.some((t) => t.id.startsWith('task-init-') || t.id.startsWith('task-gym-'));

      if (hasOnlyStaleSeptemberMocks) {
        const fresh = INITIAL_TASKS.filter((t) => !isHydrationTask(t));
        saveLocalTasks(fresh, userId);
        return fresh;
      }

      if (filtered.length !== parsed.length) {
        saveLocalTasks(filtered, userId);
      }
      return filtered;
    }
  } catch (err) {
    console.warn('Error reading from localStorage:', err);
  }
  return userId ? [] : INITIAL_TASKS.filter((t) => !isHydrationTask(t));
}

export function saveLocalTasks(tasks: TaskItem[], userId?: string): void {
  try {
    const key = getStorageKey(userId);
    const filtered = tasks.filter((t) => !isHydrationTask(t));
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Error saving to localStorage:', err);
  }
}

// Load tasks from Supabase with fallback to localStorage
export async function loadTasks(userId?: string): Promise<{ tasks: TaskItem[]; isCloud: boolean }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { tasks: getLocalTasks(userId), isCloud: false };
  }

  try {
    let query = supabase
      .from('tasks')
      .select('*')
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (userId) {
      query = query.eq('user_id', userId);
    } else {
      query = query.is('user_id', null);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Error fetching from Supabase, using local fallback:', error.message);
      return { tasks: getLocalTasks(userId), isCloud: false };
    }

    if (data && data.length > 0) {
      const allItems = data.map(fromDbRow);
      const items = allItems.filter((t) => !isHydrationTask(t));
      const removed = allItems.filter((t) => isHydrationTask(t));
      if (removed.length > 0) {
        removed.forEach((r) => deleteTaskFromDb(r.id));
      }
      saveLocalTasks(items, userId);
      return { tasks: items, isCloud: true };
    }

    // If database has 0 items for this query
    const localTasks = getLocalTasks(userId);
    // If it's a guest with initial tasks, seed them to DB if desired
    if (!userId && localTasks.length > 0) {
      try {
        const rows = localTasks.map((t) => toDbRow(t, undefined));
        await supabase.from('tasks').upsert(rows);
      } catch (_) {}
    }

    return { tasks: localTasks, isCloud: true };
  } catch (err) {
    console.warn('Supabase request failed, defaulting to local tasks:', err);
    return { tasks: getLocalTasks(userId), isCloud: false };
  }
}

// Add or update tasks
export async function upsertTasks(tasks: TaskItem[], userId?: string): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const rows = tasks.map((t) => toDbRow(t, userId));
      const { error } = await supabase.from('tasks').upsert(rows);
      if (error) {
        console.warn('Error upserting to Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Failed to upsert to Supabase:', err);
    }
  }
}

// Google Calendar is a complete snapshot: await writes and remove only obsolete imported rows.
export async function replaceGoogleCalendarTasks(
  incoming: TaskItem[], userId?: string, client = supabase
): Promise<TaskItem[]> {
  const local = getLocalTasks(userId);
  let existing = local;
  if (client) {
    const rows: TaskItem[] = [];
    for (let offset = 0; ; offset += 1000) {
      let query = client.from('tasks').select('*').order('id').range(offset, offset + 999);
      query = userId ? query.eq('user_id', userId) : query.is('user_id', null);
      const { data, error } = await query;
      if (error) throw new Error('No se pudo cargar el calendario guardado. Tus eventos se han conservado.');
      rows.push(...(data || []).map(fromDbRow));
      if (!data || data.length < 1000) break;
    }
    existing = [...new Map([...local, ...rows].map(task => [task.id, task])).values()];
  }
  const merged = mergeGoogleCalendarSnapshot(existing, incoming);
  const imported = merged.filter(isGoogleCalendarTask);
  if (client) {
    const current = new Map(existing.map(task => [task.id, JSON.stringify(toDbRow(task, userId))]));
    const changed = imported.map(task => toDbRow(task, userId)).filter(row => current.get(row.id) !== JSON.stringify(row));
    if (changed.length) {
      const { error } = await client.from('tasks').upsert(changed);
      if (error) throw new Error('No se pudieron guardar los cambios de Google Calendar. Vuelve a sincronizar.');
    }
    const keep = new Set(imported.map(task => task.id));
    const obsolete = existing.filter(task => isGoogleCalendarTask(task) && !keep.has(task.id)).map(task => task.id);
    for (let offset = 0; offset < obsolete.length; offset += 100) {
      let query = client.from('tasks').delete().in('id', obsolete.slice(offset, offset + 100));
      query = userId ? query.eq('user_id', userId) : query.is('user_id', null);
      const { error } = await query;
      if (error) throw new Error('No se pudieron retirar los eventos antiguos. Vuelve a sincronizar.');
    }
  }
  saveLocalTasks(merged, userId);
  return imported;
}

// Delete task by ID
export async function deleteTaskFromDb(taskId: string): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) {
        console.warn('Error deleting from Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Failed to delete from Supabase:', err);
    }
  }
}

// Toggle completion
export async function toggleTaskCompleteInDb(taskId: string, completed: boolean): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    try {
      const { error } = await supabase.from('tasks').update({ completed }).eq('id', taskId);
      if (error) {
        console.warn('Error updating completion in Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Failed to update completion in Supabase:', err);
    }
  }
}

// Realtime subscription
export function subscribeToTaskChanges(onSync: () => void): () => void {
  if (!isSupabaseConfigured() || !supabase) {
    return () => {};
  }

  const channel = supabase
    .channel('tasks-sync-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
      onSync();
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
