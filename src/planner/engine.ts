import type { EntregaItem } from '../services/moodleTypes';
import type { Bloque, Deuda, DiffSocial, Evento, Parametros, Plan, PlanInput, Trabajo } from './types';
import { blockEnd, blockStart, daysBetween, madridLocal, minutes, timeString, validDate, validLocal, weekStart } from './time';
import { examSessions } from './exams';

type Slot = { fecha: string; start: number; end: number };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export const duration = (b: Bloque) => minutes(b.fin_local) - minutes(b.inicio_local);
const sum = (blocks: Bloque[]) => blocks.reduce((total, b) => total + duration(b), 0);
const round = (n: number) => Math.round(n * 1000000) / 1000000;

export function validateParametros(p: Parametros): void {
  if (minutes(p.hora_inicio_dia) >= minutes(p.hora_fin_dia)) throw new Error('El inicio del día debe ser anterior al fin');
  if (minutes(p.franja_profunda_inicio) >= minutes(p.franja_profunda_fin)) throw new Error('La franja profunda debe tener inicio anterior al fin');
  for (const key of ['margen_min', 'max_horas_profundas_dia', 'max_deuda_horas'] as const) {
    if (!Number.isFinite(p[key]) || p[key] < 0) throw new Error(`Parámetro inválido: ${key}`);
  }
  if (!Number.isInteger(p.margen_min) || p.margen_min > 240 || p.max_horas_profundas_dia > 24) throw new Error('Margen o máximo fuera de rango');
  if (p.factor_calibracion_default !== 1) throw new Error('En fase 2 el factor por defecto debe ser 1.0');
}
export function validateEvento(e: Evento): void {
  if (!e.id || !e.titulo.trim() || e.titulo.length > 200) throw new Error('Indica el título del evento (hasta 200 caracteres)');
  if (!validDate(e.fecha_inicio) || (e.fecha_fin && (!validDate(e.fecha_fin) || e.fecha_fin < e.fecha_inicio))) throw new Error('Rango de fechas inválido');
  if (minutes(e.inicio_local) >= minutes(e.fin_local)) throw new Error('El evento debe terminar después del inicio; divide los eventos que cruzan medianoche');
  if (!['fijo', 'flexible', 'social'].includes(e.tipo) || !['clase', 'trabajo', 'clase_particular', 'karate', 'gym', 'social', 'otro'].includes(e.area)) throw new Error('Tipo o área inválidos');
  if (e.dias_semana !== null && (!e.dias_semana.length || e.dias_semana.some(d => !Number.isInteger(d) || d < 1 || d > 7))) throw new Error('Selecciona días semanales entre lunes y domingo');
}
function occurs(e: Evento, day: string): boolean {
  if (day < e.fecha_inicio || (e.fecha_fin && day > e.fecha_fin)) return false;
  return e.dias_semana === null ? day === e.fecha_inicio : e.dias_semana.includes(new Date(`${day}T12:00:00Z`).getUTCDay() || 7);
}
export function expandEventos(eventos: Evento[], desde: string, hasta: string): Bloque[] {
  return daysBetween(desde, hasta).flatMap(fecha => eventos.filter(e => occurs(e, fecha)).map(e => ({
    id: `evento:${e.id}:${fecha}`, fecha, inicio_local: e.inicio_local.slice(0, 5), fin_local: e.fin_local.slice(0, 5),
    task_uid: null, evento_id: e.id, titulo: e.titulo, tipo: e.tipo, version_minima: false, reemplaza_a: null,
  }))).sort(sortBlocks);
}
function subtract(slots: Slot[], fecha: string, start: number, end: number): Slot[] {
  return slots.flatMap(s => s.fecha !== fecha || end <= s.start || start >= s.end ? [s] : [
    ...(start > s.start ? [{ ...s, end: start }] : []),
    ...(end < s.end ? [{ ...s, start: end }] : []),
  ]);
}
export function sortBlocks(a: Bloque, b: Bloque): number {
  return compare(blockStart(a), blockStart(b)) || compare(a.id, b.id);
}
function freeze(input: PlanInput, cut: string): Bloque[] {
  return (input.bloques_previos || []).filter(b => b.fecha >= input.desde && b.fecha <= input.hasta && blockStart(b) < cut);
}
function freeSlots(input: PlanInput, until: string, cut: string, protectedBlocks: Bloque[]): Slot[] {
  const p = input.parametros;
  const first = input.desde < cut.slice(0, 10) ? input.desde : cut.slice(0, 10);
  let slots: Slot[] = daysBetween(first, until).flatMap(fecha => {
    if (fecha < cut.slice(0, 10)) return [];
    const start = Math.max(minutes(p.hora_inicio_dia), fecha === cut.slice(0, 10) ? minutes(cut.slice(11)) : 0);
    const end = minutes(p.hora_fin_dia);
    return start < end ? [{ fecha, start, end }] : [];
  });
  for (const e of input.eventos.filter(e => e.tipo !== 'flexible' || e.bloqueo)) {
    for (const fecha of daysBetween(first, until)) {
      if (occurs(e, fecha)) slots = subtract(slots, fecha, minutes(e.inicio_local) - p.margen_min, minutes(e.fin_local) + p.margen_min);
    }
  }
  for (const b of protectedBlocks) slots = subtract(slots, b.fecha, minutes(b.inicio_local), minutes(b.fin_local));
  return slots;
}
function bounded(slots: Slot[], deadline: string, earliest?: string | null): Slot[] {
  return slots.flatMap(s => {
    if (s.fecha > deadline.slice(0, 10) || (earliest && s.fecha < earliest.slice(0, 10))) return [];
    const start = Math.max(s.start, earliest && s.fecha === earliest.slice(0, 10) ? minutes(earliest.slice(11)) : 0);
    const end = Math.min(s.end, s.fecha === deadline.slice(0, 10) ? minutes(deadline.slice(11)) : 1440);
    return start < end ? [{ ...s, start, end }] : [];
  });
}
function workSlots(slots: Slot[], tipo: Trabajo, p: Parametros, used: Map<string, number>): Slot[] {
  if (tipo === 'ligero') return slots;
  const budget = new Map(used);
  return slots.flatMap(s => {
    const start = Math.max(s.start, minutes(p.franja_profunda_inicio));
    const end = Math.min(s.end, minutes(p.franja_profunda_fin), start + Math.max(0, Math.floor(p.max_horas_profundas_dia * 60) - (budget.get(s.fecha) || 0)));
    if (end <= start) return [];
    budget.set(s.fecha, (budget.get(s.fecha) || 0) + end - start);
    return [{ ...s, start, end }];
  });
}
export function generatePlan(input: PlanInput): Plan {
  validateParametros(input.parametros);
  input.eventos.forEach(validateEvento);
  if (!validDate(input.desde) || !validDate(input.hasta) || input.hasta < input.desde || !validLocal(input.ahora_local)) throw new Error('Rango del plan inválido');
  if (input.corte_local && !validLocal(input.corte_local)) throw new Error('Corte del plan inválido');
  const cut = [input.ahora_local, input.corte_local || input.ahora_local].sort().at(-1)!;
  const preserved = freeze(input, cut);
  const history = (input.bloques_previos || []).filter(b => blockStart(b) < cut);
  const candidates = input.entregas.filter(t => t.estado === 'pendiente' && !t.oculta_por_grupo && !t.borrada_en_moodle && (t.uid.startsWith('uni:') || madridLocal(t.deadline_utc).slice(0, 10) >= input.ahora_local.slice(0, 10)));
  const lastDeadline = candidates.map(t => madridLocal(t.deadline_utc).slice(0, 10)).sort().at(-1) || input.hasta;
  const pressureSlots = freeSlots(input, lastDeadline > input.hasta ? lastDeadline : input.hasta, cut, history);
  let slots = pressureSlots;
  const bloques: Bloque[] = [...preserved, ...expandEventos(input.eventos, input.desde, input.hasta).filter(b => blockStart(b) >= cut)];
  const used = new Map<string, number>();
  for (const b of history.filter(b => b.tipo === 'profundo')) used.set(b.fecha, (used.get(b.fecha) || 0) + duration(b));
  const tasks = candidates.map(t => {
    const deadline = madridLocal(t.deadline_utc);
    const factor = Number(t.factor_calibracion ?? input.parametros.factor_calibracion_default);
    const hours = Number(t.horas_est ?? 2);
    if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(factor) || factor <= 0 ||
      (t.tamano_bloque_min != null && (!Number.isInteger(t.tamano_bloque_min) || t.tamano_bloque_min < 20)) ||
      (t.plan_no_antes_de && !validLocal(t.plan_no_antes_de)) ||
      (t.hueco_inicio_local && (!validLocal(t.hueco_inicio_local) || !t.hueco_fin_local || !validLocal(t.hueco_fin_local) || t.hueco_inicio_local >= t.hueco_fin_local || t.hueco_inicio_local.slice(0, 10) !== t.hueco_fin_local.slice(0, 10)))) throw new Error(`Preferencias de planificación inválidas: ${t.titulo}`);
    const estimate = Math.ceil(hours * factor * 60);
    const available = bounded(pressureSlots, deadline, t.plan_no_antes_de).reduce((n, s) => n + s.end - s.start, 0);
    return { t, deadline, estimate, pressure: available ? estimate / available : Infinity };
  }).sort((a, b) => compare(a.deadline.slice(0, 10), b.deadline.slice(0, 10)) || b.pressure - a.pressure || compare(a.deadline, b.deadline) || compare(a.t.uid, b.t.uid));
  const en_riesgo: Plan['en_riesgo'] = [];
  for (const { t, estimate, deadline } of tasks) {
    const tipo = t.tipo_trabajo || 'profundo';
    const done = sum(history.filter(b => b.task_uid === t.uid));
    const remaining = Math.max(0, estimate - done);
    if (remaining === 0) continue;
    if (!Number.isFinite(estimate) || estimate <= 0 || (t.min_viable_min != null && (!Number.isInteger(t.min_viable_min) || t.min_viable_min <= 0))) throw new Error(`Estimación inválida: ${t.titulo}`);
    let taskSlots = bounded(slots, deadline, t.plan_no_antes_de);
    // Ordinary deliveries keep the selected week's allocation behavior.
    // Exams also project their spaced sessions across following weeks.
    if (!t.es_examen) taskSlots = taskSlots.filter(s => s.fecha >= input.desde && s.fecha <= input.hasta);
    // A user's concrete reservation also protects that slot from other tasks.
    for (const other of candidates.filter(c => c.uid !== t.uid && c.hueco_inicio_local && c.hueco_fin_local)) {
      taskSlots = subtract(taskSlots, other.hueco_inicio_local!.slice(0, 10), minutes(other.hueco_inicio_local!.slice(11)), minutes(other.hueco_fin_local!.slice(11)));
    }
    if (t.hueco_inicio_local && t.hueco_fin_local) {
      const start = t.hueco_inicio_local.slice(0, 16), end = t.hueco_fin_local.slice(0, 16);
      taskSlots = taskSlots.filter(s => s.fecha === start.slice(0, 10)).flatMap(s => {
        const a = Math.max(s.start, minutes(start.slice(11))), b = Math.min(s.end, minutes(end.slice(11)));
        return b > a ? [{ ...s, start: a, end: b }] : [];
      });
    }
    let available = workSlots(taskSlots, tipo, input.parametros, used);
    if (t.es_examen) {
      const sessions = examSessions(available, deadline, estimate, remaining, cut);
      let allocated = 0;
      for (const s of sessions) {
        const length = s.end - s.start;
        bloques.push({ id: `task:${t.uid}:${s.fecha}:${timeString(s.start)}`, fecha: s.fecha,
          inicio_local: timeString(s.start), fin_local: timeString(s.end), task_uid: t.uid, evento_id: null,
          titulo: `${t.titulo} · práctica y repaso activo`, tipo, version_minima: false, reemplaza_a: null });
        slots = subtract(slots, s.fecha, s.start, s.end);
        used.set(s.fecha, (used.get(s.fecha) || 0) + length);
        allocated += length;
      }
      if (allocated < remaining) en_riesgo.push({ task_uid: t.uid, titulo: t.titulo,
        horas_pendientes: round((remaining - allocated) / 60), motivo: 'Faltan huecos para repartir el estudio antes del examen (máximo una hora por día)' });
      continue;
    }
    const capacity = available.reduce((n, s) => n + s.end - s.start, 0);
    const minimum = Math.min(remaining, Math.max(20, t.min_viable_min ?? Math.ceil(estimate * 0.25)));
    const minimal = capacity < remaining;
    // A minimum version must fit in one continuous slot to be useful.
    const minimumSlot = taskSlots.flatMap(s => workSlots([s], tipo, input.parametros, used)).find(s => s.end - s.start >= minimum);
    const target = minimal ? minimumSlot ? minimum : 0 : remaining;
    if (minimal && minimumSlot) available = [minimumSlot];
    let allocated = 0;
    for (const s of available) {
      let start = s.start;
      while (allocated < target && start < s.end) {
        const length = Math.min(target - allocated, s.end - start, t.tamano_bloque_min || Infinity);
        const end = start + length;
        bloques.push({ id: `task:${t.uid}:${s.fecha}:${timeString(start)}`, fecha: s.fecha,
          inicio_local: timeString(start), fin_local: timeString(end), task_uid: t.uid, evento_id: null,
          titulo: t.titulo, tipo, version_minima: minimal, estimacion_por_defecto: t.horas_est == null, reemplaza_a: null });
        slots = subtract(slots, s.fecha, start, end);
        if (tipo === 'profundo') used.set(s.fecha, (used.get(s.fecha) || 0) + length);
        allocated += length;
        start = end;
      }
      if (allocated >= target) break;
    }
    if (allocated < remaining) en_riesgo.push({ task_uid: t.uid, titulo: t.titulo, horas_pendientes: round((remaining - allocated) / 60),
      motivo: allocated ? 'Solo cabe la versión mínima; queda trabajo pendiente' : t.hueco_inicio_local ? 'El hueco fijado no es válido o está ocupado' : deadline < cut ? 'El plazo ya ha vencido' : tipo === 'profundo' ? 'No cabe la versión mínima en la franja profunda y su máximo diario' : 'No cabe la versión mínima antes del plazo' });
  }
  bloques.sort(sortBlocks);
  const visible = bloques.filter(b => b.fecha >= input.desde && b.fecha <= input.hasta);
  return {
    bloques: visible, proyeccion: bloques, en_riesgo,
    criticas: tasks.filter(t => t.pressure > 0.6).map(({ t, pressure }) => ({ task_uid: t.uid, titulo: t.titulo, presion: Number.isFinite(pressure) ? round(pressure) : null })),
    avisos_aplazamiento: candidates.filter(t => (t.aplazamientos || 0) >= 3).map(t => ({ task_uid: t.uid, titulo: t.titulo, aplazamientos: t.aplazamientos! })),
    deuda_total_horas: round((input.deuda || []).reduce((n, d) => n + Number(d.horas_aplazadas), 0)),
    carga: daysBetween(input.desde, input.hasta).map(fecha => ({ fecha,
      profundas: round(sum(bloques.filter(b => b.fecha === fecha && b.tipo === 'profundo')) / 60),
      ligeras: round(sum(bloques.filter(b => b.fecha === fecha && b.tipo === 'ligero')) / 60),
    })),
  };
}

export function previewSocial(input: PlanInput, evento: Evento, baseline: Plan): DiffSocial {
  validateEvento(evento);
  if (evento.tipo !== 'social' || evento.dias_semana !== null) throw new Error('El imprevisto debe ser un evento social puntual');
  const start = `${evento.fecha_inicio}T${evento.inicio_local.slice(0, 5)}`;
  if (start < input.ahora_local || evento.fecha_inicio < input.desde || evento.fecha_inicio > input.hasta) throw new Error('Elige un evento futuro en la semana mostrada');
  if (input.eventos.some(e => (e.tipo !== 'flexible' || e.bloqueo) && occurs(e, evento.fecha_inicio)
    && minutes(e.inicio_local) < minutes(evento.fin_local) && minutes(e.fin_local) > minutes(evento.inicio_local))) {
    throw new Error('El imprevisto coincide con un horario fijo o bloqueado. Elige otro hueco');
  }
  const protectedBlocks = baseline.bloques.filter(b => blockStart(b) < start);
  const marginStart = minutes(evento.inicio_local) - input.parametros.margen_min;
  if (protectedBlocks.some(b => b.fecha === evento.fecha_inicio && minutes(b.fin_local) > marginStart && minutes(b.inicio_local) < minutes(evento.fin_local) + input.parametros.margen_min)) {
    throw new Error('El evento o su margen invaden un bloque anterior. Elige otro inicio: esos bloques se conservan');
  }
  const outsideWeek = (input.bloques_previos || []).filter(b => b.fecha < input.desde || b.fecha > input.hasta);
  const plan = generatePlan({ ...input, eventos: [...input.eventos, evento], bloques_previos: [...outsideWeek, ...baseline.bloques], corte_local: start });
  const before = baseline.bloques.filter(b => b.task_uid && blockStart(b) >= start);
  const after = plan.bloques.filter(b => b.task_uid && blockStart(b) >= start);
  const movimientos: DiffSocial['movimientos'] = [];
  const nueva_deuda: Deuda[] = [];
  const versiones_minimas: string[] = [];
  for (const uid of [...new Set([...before, ...after].map(b => b.task_uid!))].sort()) {
    const de = before.filter(b => b.task_uid === uid), a = after.filter(b => b.task_uid === uid);
    const signature = (bs: Bloque[]) => bs.map(b => `${blockStart(b)}-${b.fin_local}-${b.version_minima}`).join('|');
    if (signature(de) === signature(a)) continue;
    movimientos.push({ task_uid: uid, titulo: (de[0] || a[0]).titulo, de, a });
    if (a.some(b => b.version_minima) && !de.some(b => b.version_minima)) versiones_minimas.push(uid);
    const lost = sum(de) - sum(a);
    if (lost > 0) nueva_deuda.push({ id: `deuda:${evento.id}:${uid}`, task_uid: uid, horas_aplazadas: round(lost / 60), motivo: 'plan_social', fecha: evento.fecha_inicio });
    // Link replacements to actual persisted predecessor IDs for the audit trail.
    for (let i = 0; i < a.length; i++) a[i].reemplaza_a = de[Math.min(i, de.length - 1)]?.id || null;
  }
  const horas_nuevas_deuda = round(nueva_deuda.reduce((n, d) => n + d.horas_aplazadas, 0));
  plan.deuda_total_horas = round(plan.deuda_total_horas + horas_nuevas_deuda);
  return { plan, desde_local: start, hasta: input.hasta, movimientos, versiones_minimas, en_riesgo: plan.en_riesgo,
    nueva_deuda, horas_nuevas_deuda, requiere_confirmacion: plan.deuda_total_horas > input.parametros.max_deuda_horas };
}

export function postponeFields(t: EntregaItem, tomorrow: string) {
  return { aplazamientos: (t.aplazamientos || 0) + 1, plan_no_antes_de: `${tomorrow}T00:00` };
}

// Display a saved plan without moving any of its future blocks on page refresh.
// Reassess shortages from the actual saved allocation, rather than a new allocation.
export function assessSavedPlan(input: PlanInput): Plan {
  const plan = generatePlan(input);
  const bloques = (input.bloques_previos || []).filter(b => b.fecha >= input.desde && b.fecha <= input.hasta).sort(sortBlocks);
  const savedWeeks = new Set([weekStart(input.desde), ...(input.bloques_previos || []).filter(b => b.fecha >= input.ahora_local.slice(0, 10)).map(b => weekStart(b.fecha))]);
  const projection = [...(input.bloques_previos || []), ...(plan.proyeccion || []).filter(b => !savedWeeks.has(weekStart(b.fecha)))].sort(sortBlocks);
  const en_riesgo: Plan['en_riesgo'] = [];
  for (const t of input.entregas.filter(t => t.estado === 'pendiente' && !t.oculta_por_grupo && !t.borrada_en_moodle && (t.uid.startsWith('uni:') || madridLocal(t.deadline_utc).slice(0, 10) >= input.ahora_local.slice(0, 10)))) {
    const valid = projection.filter(b => b.task_uid === t.uid && blockEnd(b) <= madridLocal(t.deadline_utc));
    const missing = Math.ceil(Number(t.horas_est ?? 2) * Number(t.factor_calibracion ?? 1) * 60) - sum(valid);
    if (missing > 0) en_riesgo.push({ task_uid: t.uid, titulo: t.titulo, horas_pendientes: round(missing / 60),
      motivo: valid.some(b => b.version_minima) ? 'Solo está guardada la versión mínima; queda trabajo pendiente' : 'No hay suficientes horas guardadas antes del plazo' });
  }
  return { ...plan, bloques, proyeccion: projection, en_riesgo, carga: daysBetween(input.desde, input.hasta).map(fecha => ({ fecha,
    profundas: round(sum(bloques.filter(b => b.fecha === fecha && b.tipo === 'profundo')) / 60),
    ligeras: round(sum(bloques.filter(b => b.fecha === fecha && b.tipo === 'ligero')) / 60),
  })) };
}
