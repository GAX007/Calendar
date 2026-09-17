import { TaskItem } from '../types';
import { INITIAL_TASKS } from '../data/initialTasks';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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

// LocalStorage helpers
export function getLocalTasks(userId?: string): TaskItem[] {
  try {
    const key = getStorageKey(userId);
    const saved = localStorage.getItem(key) || (!userId ? localStorage.getItem(BASE_STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) : null);
    if (saved) return JSON.parse(saved);
  } catch (err) {
    console.warn('Error reading from localStorage:', err);
  }
  return userId ? [] : INITIAL_TASKS;
}

export function saveLocalTasks(tasks: TaskItem[], userId?: string): void {
  try {
    const key = getStorageKey(userId);
    localStorage.setItem(key, JSON.stringify(tasks));
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
      const items = data.map(fromDbRow);
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
