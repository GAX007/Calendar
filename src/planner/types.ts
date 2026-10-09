import type { EntregaItem } from '../services/moodleTypes';

export type Trabajo = 'profundo' | 'ligero';
export interface Evento {
  id: string;
  titulo: string;
  inicio_local: string; // HH:mm, never UTC
  fin_local: string;
  dias_semana: number[] | null; // ISO: Monday=1, Sunday=7
  fecha_inicio: string;
  fecha_fin: string | null;
  tipo: 'fijo' | 'flexible' | 'social';
  bloqueo: boolean;
  area: 'clase' | 'trabajo' | 'clase_particular' | 'karate' | 'gym' | 'social' | 'otro';
}
export interface Parametros {
  hora_inicio_dia: string;
  hora_fin_dia: string;
  margen_min: number;
  max_horas_profundas_dia: number;
  franja_profunda_inicio: string;
  franja_profunda_fin: string;
  max_deuda_horas: number;
  factor_calibracion_default: number;
}
export const DEFAULT_PARAMETROS: Parametros = {
  hora_inicio_dia: '09:00', hora_fin_dia: '23:00', margen_min: 15,
  max_horas_profundas_dia: 4, franja_profunda_inicio: '17:00', franja_profunda_fin: '21:00',
  max_deuda_horas: 6, factor_calibracion_default: 1,
};
export interface Bloque {
  id: string;
  fecha: string;
  inicio_local: string;
  fin_local: string;
  task_uid: string | null;
  evento_id: string | null;
  version_minima: boolean;
  creado_en?: string;
  reemplaza_a: string | null;
  titulo: string;
  tipo: Trabajo | Evento['tipo'];
  estimacion_por_defecto?: boolean;
}
export interface Deuda {
  id: string;
  task_uid: string;
  horas_aplazadas: number;
  motivo: string;
  fecha: string;
}
export interface Riesgo { task_uid: string; titulo: string; motivo: string; horas_pendientes: number }
export interface Plan {
  bloques: Bloque[];
  proyeccion?: Bloque[]; // Asignación hasta los plazos para evaluar exámenes entre semanas.
  en_riesgo: Riesgo[];
  criticas: { task_uid: string; titulo: string; presion: number | null }[];
  avisos_aplazamiento: { task_uid: string; titulo: string; aplazamientos: number }[];
  deuda_total_horas: number;
  carga: { fecha: string; profundas: number; ligeras: number }[];
}
export interface PlanInput {
  desde: string;
  hasta: string;
  ahora_local: string;
  entregas: EntregaItem[];
  eventos: Evento[];
  parametros: Parametros;
  bloques_previos?: Bloque[];
  deuda?: Deuda[];
  corte_local?: string;
}
export interface DiffSocial {
  plan: Plan;
  desde_local: string;
  hasta: string;
  movimientos: { task_uid: string; titulo: string; de: Bloque[]; a: Bloque[] }[];
  versiones_minimas: string[];
  en_riesgo: Riesgo[];
  nueva_deuda: Deuda[];
  horas_nuevas_deuda: number;
  requiere_confirmacion: boolean;
}
