export type CategoryType = 'Academics' | 'Sports/Karate' | 'Work' | 'Personal' | 'Health';

export interface CategoryMeta {
  id: CategoryType;
  label: string;
  tagColor: string; // e.g. blue, red
  colorClass: string;
  bgClass: string;
  borderClass: string;
  dotColor: string;
}

export interface TaskItem {
  id: string;
  title: string;
  category: CategoryType;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm (hora inicio)
  endTime?: string; // HH:mm (hora fin)
  durationMinutes: number;
  priority: 'alta' | 'media' | 'baja';
  notes?: string;
  sourceType: 'voice' | 'vision' | 'text' | 'manual';
  confidence?: number;
  completed?: boolean;
  detectedSnippet?: string;
  extractedFields?: {
    deadlineLabel?: string;
    detectedTag?: string;
  };
}

export interface ParseResult {
  sourceType: 'voice' | 'vision' | 'text';
  originalInput: string;
  extractedTasks: TaskItem[];
  modelUsed: string;
  processingTimeMs: number;
  imagePreview?: string;
  rawAnalysis?: string;
}

export interface VisionSchedulePreset {
  id: string;
  title: string;
  description: string;
  category: CategoryType;
  imageUrl: string;
  thumbnailBadge: string;
  sampleExtractedTasks: TaskItem[];
}
