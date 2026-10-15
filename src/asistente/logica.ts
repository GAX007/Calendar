// Pure logic of the nightly assistant: no network or database access, so it can be tested.
import type { PlannerData } from '../planner/data';
import type { EntregaItem } from '../services/moodleTypes';
import type { Bloque, Plan, PlanInput } from '../planner/types';
import { assessSavedPlan, duration, expandEventos, generatePlan } from '../planner/engine';
import { addDays, blockEnd, blockStart, madridLocal, minutes, timeString, weekStart } from '../planner/time';
import type { DailyCheckin } from '../planner/records';

export type EstadoBloque = 'hecho' | 'no_hecho';
export type TipoAviso = 'entrega_48h' | 'entrega_24h' | 'bloque' | 'sin_hacer' | 'manana' | 'semanal';

export interface Aviso {
  clave: string;
  tipo: TipoAviso;
  titulo: string;
  cuerpo: string;
  url: string;
}

export interface ItemCierre {
  bloque_id: string;
  task_uid: string;
  titulo: string;
  inicio_local: string;
  fin_local: string;
}

export interface ResumenManana {
  fecha: string;
  generado_local: string;
  clases: { titulo: string; inicio: string; fin: string }[];
  bloques: { titulo: string; inicio: string; fin: string; tipo: string; task_uid: string }[];
  entregas: { uid: string; titulo: string; vence_local: string; horas_planificadas: number }[];
  en_riesgo: { titulo: string; horas_pendientes: number; motivo: string }[];
  deuda_horas: number;
  cierre: ItemCierre[];
  dia_ligero: boolean;
  texto: string;
}

export interface Calibracion {
  asignatura: string;
  factor: number;
  muestras: number;
}

export interface RepasoSemanal {
  desde: string;
  hasta: string;
  horas_planificadas: number;
  horas_hechas: number;
  horas_sin_confirmar: number;
  horas_no_hechas: number;
  horas_reales_registradas: number;
  entregas_con_horas: number;
  deuda_horas: number;
  checkins: { dias: number; energia: number | null; sueno_h: number | null; fatiga: number | null };
  aplazadas: { titulo: string; aplazamientos: number }[];
  calibracion: Calibracion[];
  proxima: { desde: string; horas_profundas: number; horas_ligeras: number; entregas: { titulo: string; vence_local: string }[]; en_riesgo: number };
  texto: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const hoursOf = (blocks: Bloque[]) => round2(blocks.reduce((n, b) => n + duration(b), 0) / 60);
const fmtHours = (n: number) => `${Number(n.toFixed(2)).toLocaleString('es-ES')} h`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Madrid wall time of an instant, as 'YYYY-MM-DDTHH:mm'
export function ahoraMadrid(now: Date = new Date()): string {
  return madridLocal(now);
}

// Minute of the Madrid day, used to decide which nightly task is due
export function minutoDelDia(local: string): number {
  return minutes(local.slice(11, 16));
}

export function esDomingo(fecha: string): boolean {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay() === 0;
}

export function addMinutesLocal(local: string, delta: number): string {
  let fecha = local.slice(0, 10);
  let total = minutoDelDia(local) + delta;
  while (total >= 1440) { total -= 1440; fecha = addDays(fecha, 1); }
  while (total < 0) { total += 1440; fecha = addDays(fecha, -1); }
  return `${fecha}T${timeString(total)}`;
}

// "mañana a las 23:59", "hoy a las 14:00", "el jueves a las 10:00"
export function cuandoVence(venceLocal: string, hoy: string): string {
  const fecha = venceLocal.slice(0, 10), hora = venceLocal.slice(11, 16);
  if (fecha === hoy) return `hoy a las ${hora}`;
  if (fecha === addDays(hoy, 1)) return `mañana a las ${hora}`;
  return `el ${DAY_NAMES[new Date(`${fecha}T12:00:00Z`).getUTCDay()]} a las ${hora}`;
}

export function esCandidata(t: EntregaItem): boolean {
  return t.estado === 'pendiente' && !t.oculta_por_grupo && !t.borrada_en_moodle;
}

// D3: a light day is offered after a poor check-in
export function checkinBajo(c: Pick<DailyCheckin, 'energia' | 'sueno_h' | 'fatiga'>): boolean {
  return c.energia <= 2 || Number(c.sueno_h) < 6 || c.fatiga >= 4;
}
export function limiteDiaLigero(maxProfundas: number): number {
  return Math.min(2, Math.round(maxProfundas) / 2);
}
export function limitesPorCheckin(checkins: Pick<DailyCheckin, 'fecha' | 'plan_ligero'>[], maxProfundas: number): Record<string, number> | undefined {
  const ligeros = checkins.filter(c => c.plan_ligero);
  if (!ligeros.length) return undefined;
  return Object.fromEntries(ligeros.map(c => [c.fecha, limiteDiaLigero(maxProfundas)]));
}

export function planVigente(data: PlannerData, desde: string, hasta: string): boolean {
  return Boolean(data.plan_revision && data.plan_revision === data.revision && data.bloques.some(b => b.fecha >= desde && b.fecha <= hasta));
}

export function entradaSemana(data: PlannerData, fecha: string, ahoraLocal: string, limites?: Record<string, number>): PlanInput {
  const desde = weekStart(fecha);
  return { desde, hasta: addDays(desde, 6), ahora_local: ahoraLocal, entregas: data.entregas, eventos: data.eventos,
    parametros: data.parametros, bloques_previos: data.bloques, deuda: data.deuda, max_profundas_por_dia: limites };
}

// The plan the app would show now for the week containing `fecha` (same rule as PlannerView)
export function planActual(data: PlannerData, fecha: string, ahoraLocal: string, limites?: Record<string, number>): Plan {
  const input = entradaSemana(data, fecha, ahoraLocal, limites);
  return planVigente(data, input.desde, input.hasta) ? assessSavedPlan(input) : generatePlan(input);
}

// N1: study blocks of `fecha` that already ended, whose task is still pending and were not marked as done
export function bloquesSinHacer(data: PlannerData, fecha: string, estados: Map<string, EstadoBloque>, ahoraLocal: string): Bloque[] {
  const pendientes = new Set(data.entregas.filter(esCandidata).map(t => t.uid));
  return data.bloques.filter(b => b.fecha === fecha && b.task_uid && pendientes.has(b.task_uid)
    && blockEnd(b) <= ahoraLocal && estados.get(b.id) !== 'hecho');
}

// N1: plan to save after the nightly close, for the week that contains tomorrow
export function planDelCierre(data: PlannerData, ahoraLocal: string, limites?: Record<string, number>) {
  const manana = addDays(ahoraLocal.slice(0, 10), 1);
  const input = entradaSemana(data, manana, ahoraLocal, limites);
  return { plan: generatePlan(input), desde: input.desde, hasta: input.hasta };
}

// N2: morning summary
export function resumenManana(data: PlannerData, plan: Plan, ahoraLocal: string, cierre: ItemCierre[], diaLigero: boolean): ResumenManana {
  const hoy = ahoraLocal.slice(0, 10);
  const limite = addMinutesLocal(ahoraLocal, 72 * 60);
  const proyeccion = plan.proyeccion || plan.bloques;
  const clases = expandEventos(data.eventos, hoy, hoy).map(b => ({ titulo: b.titulo, inicio: b.inicio_local, fin: b.fin_local }));
  const bloques = plan.bloques.filter(b => b.fecha === hoy && b.task_uid && blockEnd(b) > ahoraLocal)
    .map(b => ({ titulo: b.titulo, inicio: b.inicio_local, fin: b.fin_local, tipo: String(b.tipo), task_uid: b.task_uid! }));
  const entregas = data.entregas.filter(esCandidata)
    .map(t => ({ t, vence: madridLocal(t.deadline_utc) }))
    .filter(({ vence }) => vence > ahoraLocal && vence <= limite)
    .sort((a, b) => a.vence.localeCompare(b.vence))
    .map(({ t, vence }) => ({ uid: t.uid, titulo: t.titulo, vence_local: vence,
      horas_planificadas: hoursOf(proyeccion.filter(b => b.task_uid === t.uid && blockStart(b) >= ahoraLocal && blockEnd(b) <= vence)) }));
  const en_riesgo = plan.en_riesgo.map(r => ({ titulo: r.titulo, horas_pendientes: r.horas_pendientes, motivo: r.motivo }));
  const horasEstudio = round2(bloques.reduce((n, b) => n + minutes(b.fin) - minutes(b.inicio), 0) / 60);
  const partes: string[] = [];
  if (clases.length) partes.push(`${plural(clases.length, 'clase o evento', 'clases o eventos')} (desde las ${clases[0].inicio})`);
  partes.push(bloques.length ? `${fmtHours(horasEstudio)} de estudio, primer bloque a las ${bloques[0].inicio}` : 'sin bloques de estudio');
  if (entregas.length) partes.push(`${plural(entregas.length, 'entrega', 'entregas')} en 72 h: ${entregas[0].titulo} (${cuandoVence(entregas[0].vence_local, hoy)})`);
  if (en_riesgo.length) partes.push(`${en_riesgo.length} en riesgo`);
  if (cierre.length) partes.push(`anoche moví ${plural(cierre.length, 'bloque no hecho', 'bloques no hechos')}`);
  return { fecha: hoy, generado_local: ahoraLocal, clases, bloques, entregas, en_riesgo, deuda_horas: plan.deuda_total_horas,
    cierre, dia_ligero: diaLigero, texto: `${partes.join(' · ')}.` };
}

// N7 and the "not done" reminder. `plan` is the plan the app shows for this week.
export function avisosDeAhora(data: PlannerData, plan: Plan, ahoraLocal: string, nowUtc: Date): Aviso[] {
  const hoy = ahoraLocal.slice(0, 10);
  const avisos: Aviso[] = [];
  const proyeccion = plan.proyeccion || plan.bloques;
  for (const t of data.entregas.filter(esCandidata)) {
    const vence = madridLocal(t.deadline_utc);
    const horas = (Date.parse(t.deadline_utc) - nowUtc.getTime()) / 3600000;
    if (horas <= 0) continue;
    const futuros = proyeccion.filter(b => b.task_uid === t.uid && blockStart(b) >= ahoraLocal && blockEnd(b) <= vence);
    const planificado = hoursOf(futuros);
    const detalle = planificado > 0
      ? `Tienes ${fmtHours(planificado)} planificadas antes del plazo; la próxima, ${cuandoVence(blockStart(futuros[0]), hoy)}.`
      : 'No tienes tiempo planificado antes del plazo.';
    if (horas <= 24) avisos.push({ clave: `entrega24:${t.uid}`, tipo: 'entrega_24h', titulo: `Quedan menos de 24 h: ${t.titulo}`,
      cuerpo: `Vence ${cuandoVence(vence, hoy)}. ${detalle}`, url: '/?tab=planner' });
    else if (horas <= 48) avisos.push({ clave: `entrega48:${t.uid}`, tipo: 'entrega_48h', titulo: `Quedan menos de 48 h: ${t.titulo}`,
      cuerpo: `Vence ${cuandoVence(vence, hoy)}. ${detalle}`, url: '/?tab=planner' });

    // Due today or tomorrow, its time slot has passed without "hecha", and nothing else is scheduled before the deadline
    if (futuros.length || ![hoy, addDays(hoy, 1)].includes(vence.slice(0, 10))) continue;
    const hoyTask = proyeccion.filter(b => b.task_uid === t.uid && b.fecha === hoy);
    const tocaba = hoyTask.length ? hoyTask.every(b => blockEnd(b) <= ahoraLocal) : minutoDelDia(ahoraLocal) >= 20 * 60;
    if (!tocaba) continue;
    const cuando = vence.slice(0, 10) === hoy ? 'hoy' : 'mañana';
    avisos.push({ clave: `sin_hacer:${t.uid}:${hoy}`, tipo: 'sin_hacer', titulo: `Oye, «${t.titulo}» es para ${cuando}`,
      cuerpo: `Vence ${cuandoVence(vence, hoy)} y no la has marcado como hecha. No tiene más tiempo programado antes del plazo.`, url: '/?tab=planner' });
  }
  const pronto = addMinutesLocal(ahoraLocal, 20);
  for (const b of data.bloques.filter(b => b.task_uid && blockStart(b) > ahoraLocal && blockStart(b) <= pronto)) {
    avisos.push({ clave: `bloque:${b.id}`, tipo: 'bloque', titulo: `A las ${b.inicio_local}: ${b.titulo}`,
      cuerpo: `Bloque de ${fmtHours(duration(b) / 60)} (${b.tipo}) hasta las ${b.fin_local}.`, url: '/?tab=planner' });
  }
  return avisos;
}

// Notices worth showing: a block reminder only during the hour after it is sent, and per deliverable only
// the most specific one ("not done" over 24 h over 48 h)
export function avisosVisibles<T extends Aviso & { creado_en: string }>(avisos: T[], nowMs: number): T[] {
  const rango: Partial<Record<TipoAviso, number>> = { entrega_48h: 1, entrega_24h: 2, sin_hacer: 3 };
  const uid = (a: Aviso) => a.tipo === 'sin_hacer' ? a.clave.slice(a.clave.indexOf(':') + 1, a.clave.lastIndexOf(':')) : a.clave.slice(a.clave.indexOf(':') + 1);
  const mejor = new Map<string, number>();
  for (const a of avisos) if (rango[a.tipo]) mejor.set(uid(a), Math.max(mejor.get(uid(a)) || 0, rango[a.tipo]!));
  return avisos.filter(a => a.tipo === 'bloque' ? nowMs - Date.parse(a.creado_en) < 60 * 60000
    : !rango[a.tipo] || rango[a.tipo] === mejor.get(uid(a)));
}

// Push hours: no reminders at night; the nightly close is shown in the morning summary
export function horaDeAvisos(ahoraLocal: string): boolean {
  const m = minutoDelDia(ahoraLocal);
  return m >= 8 * 60 && m < 22 * 60 + 30;
}

// N4: per subject, real hours vs estimate of finished Moodle deliverables. Shrinks towards 1 with few samples.
export function calibrar(entregas: EntregaItem[], logs: { uid: string; horas_reales: number }[]): Calibracion[] {
  const reales = new Map<string, number>();
  for (const l of logs) reales.set(l.uid, (reales.get(l.uid) || 0) + Number(l.horas_reales));
  const ratios = new Map<string, number[]>();
  for (const t of entregas) {
    const real = reales.get(t.uid), est = Number(t.horas_est);
    if (t.uid.startsWith('uni:') || t.estado !== 'hecha' || !real || !(est > 0) || !t.asignatura_codigo) continue;
    ratios.set(t.asignatura_codigo, [...(ratios.get(t.asignatura_codigo) || []), real / est]);
  }
  const PRIOR = 2;
  return [...ratios.entries()].filter(([, r]) => r.length >= 2).map(([asignatura, r]) => {
    const raw = (r.reduce((a, b) => a + b, 0) + PRIOR) / (r.length + PRIOR);
    const factor = Math.min(2.5, Math.max(0.5, Math.round(raw * 20) / 20));
    return { asignatura, factor, muestras: r.length };
  }).sort((a, b) => a.asignatura.localeCompare(b.asignatura));
}

// Pending Moodle deliverables whose factor must change after a calibration
export function cambiosDeFactor(entregas: EntregaItem[], calibracion: Calibracion[]): { uid: string; factor: number }[] {
  const porAsignatura = new Map(calibracion.map(c => [c.asignatura, c.factor]));
  return entregas.filter(t => !t.uid.startsWith('uni:') && t.estado === 'pendiente' && porAsignatura.has(t.asignatura_codigo))
    .filter(t => Number(t.factor_calibracion ?? 1) !== porAsignatura.get(t.asignatura_codigo))
    .map(t => ({ uid: t.uid, factor: porAsignatura.get(t.asignatura_codigo)! }));
}

// N3: Moodle deliverables that still use the provisional 2 h and were never estimated
export function entregasSinEstimar(entregas: EntregaItem[], nowUtc: Date): EntregaItem[] {
  return entregas.filter(t => !t.uid.startsWith('uni:') && esCandidata(t) && t.horas_est == null
    && t.estimado_ia_en == null && Date.parse(t.deadline_utc) > nowUtc.getTime())
    .sort((a, b) => a.deadline_utc.localeCompare(b.deadline_utc));
}

export interface EstimacionIA { horas_est: number; tipo_trabajo: 'profundo' | 'ligero'; dificultad: number; min_viable_min: number; nota: string }

// Validates and clamps Gemini's answer so the planner never receives invalid values
export function normalizarEstimacion(raw: unknown): EstimacionIA {
  const r = (raw || {}) as Record<string, unknown>;
  const horas = Number(r.horas_est ?? r.horas);
  if (!Number.isFinite(horas) || horas <= 0) throw new Error('Estimación sin horas válidas');
  const horas_est = Math.min(40, Math.max(0.25, Math.round(horas * 4) / 4));
  const tipo_trabajo = r.tipo_trabajo === 'ligero' ? 'ligero' : 'profundo';
  const dificultad = Math.min(5, Math.max(1, Math.round(Number(r.dificultad) || 3)));
  const minimo = Math.round(Number(r.min_viable_min) || horas_est * 60 * 0.25);
  const min_viable_min = Math.min(Math.max(20, Math.round(horas_est * 60)), Math.max(20, minimo));
  const nota = String(r.nota || r.motivo || '').trim().slice(0, 280);
  return { horas_est, tipo_trabajo, dificultad, min_viable_min, nota };
}

// N5: weekly review of the week [desde, hasta]
export function repasoSemanal(args: {
  data: PlannerData; desde: string; hasta: string; ahoraLocal: string;
  estados: Map<string, EstadoBloque>; cierres: { items: ItemCierre[]; estado: string; fecha: string }[];
  logs: { uid: string; fecha: string; horas_reales: number }[];
  checkins: Pick<DailyCheckin, 'fecha' | 'energia' | 'sueno_h' | 'fatiga'>[];
  calibracion: Calibracion[]; siguiente: Plan;
}): RepasoSemanal {
  const { data, desde, hasta, ahoraLocal, estados, cierres, logs, checkins, calibracion, siguiente } = args;
  const estudio = data.bloques.filter(b => b.task_uid && b.fecha >= desde && b.fecha <= hasta && blockEnd(b) <= ahoraLocal);
  const noHechosCierre = cierres.filter(c => c.estado === 'aplicado' && c.fecha >= desde && c.fecha <= hasta).flatMap(c => c.items);
  const minutosCierre = noHechosCierre.reduce((n, i) => n + minutes(i.fin_local) - minutes(i.inicio_local), 0);
  const hechos = estudio.filter(b => estados.get(b.id) === 'hecho');
  const noHechos = estudio.filter(b => estados.get(b.id) === 'no_hecho');
  const sinConfirmar = estudio.filter(b => !estados.has(b.id));
  const semanaLogs = logs.filter(l => l.fecha >= desde && l.fecha <= hasta);
  const semanaCheckins = checkins.filter(c => c.fecha >= desde && c.fecha <= hasta);
  const media = (k: 'energia' | 'sueno_h' | 'fatiga') => semanaCheckins.length
    ? round2(semanaCheckins.reduce((n, c) => n + Number(c[k]), 0) / semanaCheckins.length) : null;
  const sigDesde = addDays(hasta, 1), sigHasta = addDays(sigDesde, 6);
  const proximas = data.entregas.filter(esCandidata).map(t => ({ titulo: t.titulo, vence_local: madridLocal(t.deadline_utc) }))
    .filter(e => e.vence_local.slice(0, 10) >= sigDesde && e.vence_local.slice(0, 10) <= sigHasta)
    .sort((a, b) => a.vence_local.localeCompare(b.vence_local));
  const horasHechas = hoursOf(hechos);
  const horasPlan = round2(hoursOf(estudio) + minutosCierre / 60);
  const proxima = { desde: sigDesde,
    horas_profundas: round2(siguiente.carga.reduce((n, c) => n + c.profundas, 0)),
    horas_ligeras: round2(siguiente.carga.reduce((n, c) => n + c.ligeras, 0)),
    entregas: proximas, en_riesgo: siguiente.en_riesgo.length };
  const partes = [`${fmtHours(horasHechas)} confirmadas de ${fmtHours(horasPlan)} planificadas`];
  if (noHechosCierre.length + noHechos.length) partes.push(`${plural(noHechosCierre.length + noHechos.length, 'bloque sin hacer', 'bloques sin hacer')}`);
  partes.push(`la próxima semana: ${fmtHours(proxima.horas_profundas + proxima.horas_ligeras)} y ${plural(proximas.length, 'entrega', 'entregas')}`);
  return {
    desde, hasta, horas_planificadas: horasPlan, horas_hechas: horasHechas,
    horas_sin_confirmar: hoursOf(sinConfirmar), horas_no_hechas: round2(hoursOf(noHechos) + minutosCierre / 60),
    horas_reales_registradas: round2(semanaLogs.reduce((n, l) => n + Number(l.horas_reales), 0)),
    entregas_con_horas: new Set(semanaLogs.map(l => l.uid)).size,
    deuda_horas: round2(data.deuda.reduce((n, d) => n + Number(d.horas_aplazadas), 0)),
    checkins: { dias: semanaCheckins.length, energia: media('energia'), sueno_h: media('sueno_h'), fatiga: media('fatiga') },
    aplazadas: data.entregas.filter(t => esCandidata(t) && (t.aplazamientos || 0) >= 2)
      .map(t => ({ titulo: t.titulo, aplazamientos: t.aplazamientos || 0 })).sort((a, b) => b.aplazamientos - a.aplazamientos),
    calibracion, proxima, texto: `Tu semana: ${partes.join(' · ')}.`,
  };
}
