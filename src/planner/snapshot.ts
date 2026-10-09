import type { EntregaItem } from '../services/moodleTypes';

export function entregaSnapshot(entregas: EntregaItem[]) {
  return [...entregas].sort((a, b) => a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0).map(t => ({
    uid: t.uid, titulo: t.titulo, deadline_utc: new Date(t.deadline_utc).toISOString(), estado: t.estado,
    oculta_por_grupo: t.oculta_por_grupo, borrada_en_moodle: t.borrada_en_moodle,
    horas_est: t.horas_est == null ? null : Number(t.horas_est), min_viable_min: t.min_viable_min,
    tipo_trabajo: t.tipo_trabajo || 'profundo', aplazamientos: t.aplazamientos || 0, factor_calibracion: Number(t.factor_calibracion ?? 1),
    plan_no_antes_de: t.plan_no_antes_de?.slice(0, 16) || null, tamano_bloque_min: t.tamano_bloque_min || null,
    hueco_inicio_local: t.hueco_inicio_local?.slice(0, 16) || null, hueco_fin_local: t.hueco_fin_local?.slice(0, 16) || null,
    ...(t.es_examen ? { es_examen: true } : {}),
  }));
}
