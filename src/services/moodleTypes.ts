export interface AsignaturaItem {
  codigo: string;
  nombre: string;
  cuatrimestre: string | null;
  activa: boolean;
}

export type EntregaTipo = 'entrega' | 'cierre_cuestionario';
export type EntregaEstado = 'pendiente' | 'hecha' | 'descartada';
export type GrupoFamilia = 'T1' | 'T2' | 'F1' | 'F2' | null;

export interface EntregaItem {
  uid: string;
  asignatura_codigo: string;
  titulo_raw: string;
  titulo: string;
  tipo: EntregaTipo;
  grupo: GrupoFamilia;
  oculta_por_grupo: boolean;
  deadline_utc: string; // ISO 8601 UTC
  descripcion: string;
  moodle_modificado_utc: string | null;
  borrada_en_moodle: boolean;
  // Campos propios (la sync nunca los pisa):
  estado: EntregaEstado;
  dificultad: number | null; // 1 - 5
  horas_est: number | null;
  horas_reales: number | null;
  min_viable_min: number | null;
  grupo_confirmado?: boolean;
}

export interface CambioItem {
  id: string;
  uid: string;
  campo: 'deadline_utc' | 'titulo';
  antes: string;
  despues: string;
  fecha: string;
  visto?: boolean;
}

export interface SyncLogItem {
  id: string;
  fecha: string;
  ok: boolean;
  nuevos: number;
  actualizados: number;
  borrados: number;
  error: string | null;
}

export interface MIS_GRUPOS_CONFIG {
  T: string;
  F: string;
}

export const DEFAULT_MIS_GRUPOS: MIS_GRUPOS_CONFIG = {
  T: 'T2',
  F: 'F1',
};

export const INITIAL_ASIGNATURAS: AsignaturaItem[] = [
  { codigo: 'GIA304F', nombre: 'Métodos estadísticos', cuatrimestre: null, activa: true },
  { codigo: 'GIE301F', nombre: 'Redes de comunicaciones I', cuatrimestre: null, activa: true },
  { codigo: 'GIE302F', nombre: 'Azpiegiturak eta sistemak', cuatrimestre: null, activa: true },
  { codigo: 'GIE303F', nombre: 'Komunikazio sareak II', cuatrimestre: null, activa: true },
  { codigo: 'GIF301F', nombre: 'Programazio aurreratua', cuatrimestre: null, activa: true },
  { codigo: 'GIG302F', nombre: 'Industria informatika', cuatrimestre: null, activa: true },
  { codigo: 'GIG303F', nombre: 'Konputagailuen arkitektura I', cuatrimestre: null, activa: true },
  { codigo: 'GIH301F', nombre: 'Datu-baseak', cuatrimestre: null, activa: true },
  { codigo: 'GIH302F', nombre: 'Análisis y diseño del software', cuatrimestre: null, activa: true },
  { codigo: 'H82009-ABCDEFGH', nombre: 'Euskara II', cuatrimestre: 'S2', activa: true },
  { codigo: 'H82014-ABCDEFGH', nombre: 'Euskara I', cuatrimestre: 'S1', activa: true },
  { codigo: 'I3001-F.2', nombre: 'Web ingeniaritza I', cuatrimestre: null, activa: true },
];
