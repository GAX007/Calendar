import type { TaskItem } from '../types';

export function isGoogleCalendarTask(task: TaskItem): boolean {
  return task.id.startsWith('gcal-') || task.extractedFields?.calendarSource === 'google-calendar';
}

/** Replace the linked calendar snapshot while retaining personal tasks and completion state. */
export function mergeGoogleCalendarSnapshot(existing: TaskItem[], incoming: TaskItem[]): TaskItem[] {
  const previous = new Map(existing.map(task => [task.id, task]));
  const imported = new Map<string, TaskItem>();
  for (const task of incoming) {
    const old = previous.get(task.id) || previous.get(task.extractedFields?.calendarLegacyId || '');
    imported.set(task.id, { ...task, completed: old?.completed ?? task.completed });
  }
  return [...existing.filter(task => !isGoogleCalendarTask(task)), ...imported.values()];
}
