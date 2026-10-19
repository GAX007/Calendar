// Agenda task <-> Supabase row. Pure: shared by the app and the server (iPhone shortcut).
import type { TaskItem } from '../types';

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
