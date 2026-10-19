import { TaskItem } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { cuentaActual } from '../lib/cuenta';
import { isGoogleCalendarTask, mergeGoogleCalendarSnapshot } from '../utils/googleCalendarSnapshot';

const BASE_STORAGE_KEY = 'calendarasist_tasks';

function getStorageKey(userId?: string): string {
  return userId ? `${BASE_STORAGE_KEY}_${userId}` : `${BASE_STORAGE_KEY}_guest`;
}

// Only a signed-in account writes to Supabase; the guest stays on this device.
function cloudUser(userId?: string): string | null {
  return isSupabaseConfigured() && supabase && userId ? userId : null;
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

// LocalStorage helpers: each account (and the guest) has its own key and nothing is seeded,
// so no sample or foreign tasks appear as the user's own.
export function getLocalTasks(userId?: string): TaskItem[] {
  try {
    const saved = localStorage.getItem(getStorageKey(userId));
    if (saved) {
      const parsed: TaskItem[] = JSON.parse(saved);
      const filtered = parsed.filter((t) => !isHydrationTask(t) && !t.id.startsWith('task-init-'));
      if (filtered.length !== parsed.length) {
        saveLocalTasks(filtered, userId);
      }
      return filtered;
    }
  } catch (err) {
    console.warn('Error reading from localStorage:', err);
  }
  return [];
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

// Load tasks from Supabase with fallback to localStorage. The guest never reads the cloud.
export async function loadTasks(userId?: string): Promise<{ tasks: TaskItem[]; isCloud: boolean }> {
  const owner = cloudUser(userId);
  if (!owner || !supabase) {
    return { tasks: getLocalTasks(userId), isCloud: false };
  }

  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', owner)
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.warn('Error fetching from Supabase, using local fallback:', error.message);
      return { tasks: getLocalTasks(userId), isCloud: false };
    }

    // Defensive scoping: a row of another account is never shown
    const own = (data || []).filter((row: any) => row.user_id === owner);
    if (own.length > 0) {
      const allItems = own.map(fromDbRow);
      const items = allItems.filter((t) => !isHydrationTask(t));
      const removed = allItems.filter((t) => isHydrationTask(t));
      if (removed.length > 0) {
        removed.forEach((r) => deleteTaskFromDb(r.id, owner));
      }
      saveLocalTasks(items, userId);
      return { tasks: items, isCloud: true };
    }

    return { tasks: getLocalTasks(userId), isCloud: true };
  } catch (err) {
    console.warn('Supabase request failed, defaulting to local tasks:', err);
    return { tasks: getLocalTasks(userId), isCloud: false };
  }
}

// Add or update tasks
export async function upsertTasks(tasks: TaskItem[], userId?: string): Promise<void> {
  const owner = cloudUser(userId);
  if (owner && supabase && tasks.length) {
    try {
      const rows = tasks.map((t) => toDbRow(t, owner));
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
  if (!userId) client = null; // The guest keeps its calendar on this device only
  const local = getLocalTasks(userId);
  let existing = local;
  if (client) {
    const rows: TaskItem[] = [];
    for (let offset = 0; ; offset += 1000) {
      const query = client.from('tasks').select('*').order('id').range(offset, offset + 999).eq('user_id', userId!);
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
      const query = client.from('tasks').delete().in('id', obsolete.slice(offset, offset + 100)).eq('user_id', userId!);
      const { error } = await query;
      if (error) throw new Error('No se pudieron retirar los eventos antiguos. Vuelve a sincronizar.');
    }
  }
  saveLocalTasks(merged, userId);
  return imported;
}

// Delete task by ID (only rows of the signed-in account)
export async function deleteTaskFromDb(taskId: string, userId = cuentaActual().userId): Promise<void> {
  const owner = cloudUser(userId);
  if (owner && supabase) {
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId).eq('user_id', owner);
      if (error) {
        console.warn('Error deleting from Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Failed to delete from Supabase:', err);
    }
  }
}

// Toggle completion
export async function toggleTaskCompleteInDb(taskId: string, completed: boolean, userId = cuentaActual().userId): Promise<void> {
  const owner = cloudUser(userId);
  if (owner && supabase) {
    try {
      const { error } = await supabase.from('tasks').update({ completed }).eq('id', taskId).eq('user_id', owner);
      if (error) {
        console.warn('Error updating completion in Supabase:', error.message);
      }
    } catch (err) {
      console.warn('Failed to update completion in Supabase:', err);
    }
  }
}

// Realtime subscription: delivers row-level changes instead of forcing a full reload
export type TaskChange =
  | { type: 'upsert'; task: TaskItem }
  | { type: 'delete'; id: string };

export function subscribeToTaskChanges(
  userId: string | undefined,
  onChange: (change: TaskChange) => void
): () => void {
  const owner = cloudUser(userId);
  if (!owner || !supabase) {
    return () => {};
  }

  const handleRow = (payload: any) => {
    if (payload.eventType === 'DELETE') {
      const id = payload.old?.id;
      if (id) onChange({ type: 'delete', id });
      return;
    }
    const row = payload.new;
    if (!row?.id) return;
    // Defensive scoping: only rows that belong to this session
    if (row.user_id !== owner) return;
    const task = fromDbRow(row);
    if (isHydrationTask(task)) return;
    onChange({ type: 'upsert', task });
  };

  const rowFilter = { filter: `user_id=eq.${owner}` };
  const channel = supabase
    .channel(`tasks-sync-${owner}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks', ...rowFilter }, handleRow)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks', ...rowFilter }, handleRow)
    // DELETE events can't be filtered by column; unknown ids are ignored by the consumer
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, handleRow)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Apply one realtime change to the in-memory list, keeping identity when nothing changed
export function applyTaskChange(tasks: TaskItem[], change: TaskChange): TaskItem[] {
  if (change.type === 'delete') {
    return tasks.some((t) => t.id === change.id) ? tasks.filter((t) => t.id !== change.id) : tasks;
  }
  const idx = tasks.findIndex((t) => t.id === change.task.id);
  if (idx === -1) return [...tasks, change.task];
  if (JSON.stringify(toDbRow(tasks[idx])) === JSON.stringify(toDbRow(change.task))) return tasks;
  const next = tasks.slice();
  next[idx] = change.task;
  return next;
}
