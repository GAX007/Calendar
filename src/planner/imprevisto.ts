// Warnings after an unplanned event: deliverables due soon that are left without hours. Pure, so it can be tested.
import type { EntregaItem } from '../services/moodleTypes';
import type { DiffSocial, Plan } from './types';
import { madridLocal } from './time';
import { addMinutesLocal } from '../asistente/logica';
import { cuandoHablado, duracionHablada } from '../asistente/voz';

export interface AvisoImprevisto {
  task_uid: string;
  titulo: string;
  vence_local: string;
  horas_sin_hueco: number;
  texto: string;
}

// Only deliverables that lose hours because of the event, that no longer fit before their deadline
// (the plan already tried every free slot up to it) and that are due within `horas` hours.
export function avisosImprevisto(diff: DiffSocial, baseline: Plan, entregas: EntregaItem[], ahoraLocal: string, horas = 48): AvisoImprevisto[] {
  const antes = new Map(baseline.en_riesgo.map(r => [r.task_uid, r.horas_pendientes]));
  const limite = addMinutesLocal(ahoraLocal, horas * 60), hoy = ahoraLocal.slice(0, 10);
  return diff.en_riesgo.flatMap(r => {
    const sinHueco = Math.round((r.horas_pendientes - (antes.get(r.task_uid) ?? 0)) * 100) / 100;
    const t = entregas.find(e => e.uid === r.task_uid);
    if (!t || sinHueco <= 0) return [];
    const vence = madridLocal(t.deadline_utc);
    if (vence <= ahoraLocal || vence > limite) return [];
    return [{ task_uid: r.task_uid, titulo: r.titulo, vence_local: vence, horas_sin_hueco: sinHueco,
      texto: `Te recomiendo buscar otro hueco: no te quedan horas para ${r.titulo}, que vence ${cuandoHablado(vence, hoy)}. Le faltan ${duracionHablada(r.horas_pendientes)}.` }];
  });
}
