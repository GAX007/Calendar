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

export interface ExerciseItem {
  id: string;
  name: string; // 1. Ejercicio (ej. Press de Banca Plano con Barra)
  muscleGroup: string; // Grupo muscular (ej. Pecho, Espalda, Pierna, Hombro, Bíceps, Tríceps, Core)
  setsReps: string; // 2. Series x Repes (ej. 4 x 8-10)
  weight: string; // 3. Peso (ej. 80 kg)
  transfer: string; // 4. Transferencia (ej. Potencia en golpeo tsuki / empuje de cadera)
  execution: string; // 5. Ejecución (ej. Tempo excéntrico 3-0-1, escápulas retraídas, pausa 1s en esternón)
  completedSets?: boolean[]; // Checkbox interactivo por serie para modo entrenamiento
  notes?: string;
  restSeconds?: number;
}

export interface GymRoutine {
  id: string;
  title: string; // ej. "Día A: Empuje & Potencia de Golpeo"
  subtitle?: string; // ej. "Pecho, Hombro y Tríceps"
  targetDays?: string[]; // ej. ["Lunes", "Jueves"]
  estimatedMinutes?: number; // ej. 60
  focus?: string; // ej. "Hipertrofia & Transferencia a Karate"
  exercises: ExerciseItem[];
  updatedAt?: string;
}

