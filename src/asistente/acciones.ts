// What the voice assistant does with each checked action. Shared by the app (user session) and the server
// (iPhone shortcut, service role acting as the user): both only differ in the backend they pass in.
import { MAX_DESCARTE_SIN_CONFIRMAR, type Accion, type ContextoAsistente } from './interpretar';
import { cuandoHablado, duracionHablada, horaHablada } from './voz';
import { entradaSemana, esCandidata, planActual } from './logica';
import { expandEventos, generatePlan, previewSocial } from '../planner/engine';
import { avisosImprevisto } from '../planner/imprevisto';
import { addDays, blockStart, madridLocal, minutes, timeString } from '../planner/time';
import { localDeadlineUtc, type UniversityWorkRow } from '../planner/university';
import { datosPlan, guardarEvento, guardarSocial } from '../planner/mutaciones';
import type { PlannerData } from '../planner/data';
import type { Evento, Plan } from '../planner/types';
import type { TaskItem, UniversityHomework, UniversitySubject } from '../types';
import { newId } from '../utils/uuid';

export interface EstadoPlan { ahora: string; hoy: string; data: PlannerData; limites?: Record<string, number> }

// Everything the actions need from outside, so they run the same in the app and on the server
export interface BackendAsistente {
  cargar(): Promise<EstadoPlan>;
  mutar(data: PlannerData, accion: string, datos: unknown): Promise<void>;
  estadosMoodle(uids: string[], estado: 'pendiente' | 'descartada'): Promise<void>;
  editarMoodle(uid: string, campos: { titulo?: string; deadline_utc?: string; horas_est?: number | null }): Promise<void>;
  trabajosUni(): Promise<UniversityWorkRow[]>;
  guardarTrabajo(trabajo: UniversityHomework, asignatura: UniversitySubject, eliminar?: boolean): Promise<void>;
  asignaturasUni(): Promise<UniversitySubject[]>;
  asignaturasMoodle(): Promise<{ codigo: string; nombre: string }[]>;
  // The plan or the agenda changed (the app refreshes its views)
  avisar(): void;
}

export type Deshacer =
  | { tipo: 'eventos'; ids: string[]; tareaId?: string; titulo: string }
  | { tipo: 'deber'; deber: UniversityHomework; asignatura: UniversitySubject; titulo: string }
  | { tipo: 'tarea'; anterior: TaskItem; titulo: string }
  // Deliverables whose state changed (discarded): undo puts each one back
  | { tipo: 'estados'; cambios: { uid: string; estado: 'pendiente' | 'descartada' }[]; titulo: string }
  | { tipo: 'entrega_moodle'; uid: string; anterior: { titulo?: string; deadline_utc?: string; horas_est?: number | null }; titulo: string }
  | { tipo: 'deber_previo'; deber: UniversityHomework; asignatura: UniversitySubject; titulo: string }
  // A fixed schedule changed or removed: undo saves the previous version again
  | { tipo: 'evento_previo'; evento: Evento; titulo: string };

export interface Resultado {
  frases: string[];
  deshacer?: Deshacer;
  // Needs a "sí" first (postponed-hours limit, or many deliverables): run the same action again with confirmar
  confirmar?: boolean;
  tareaNueva?: TaskItem;
  tareaCambiada?: TaskItem;
  // Agenda task removed (the app and the server delete it)
  tareaBorrada?: string;
}

// The planner row of an event, as the RPC expects it (rows carry extra columns and HH:mm:ss times)
function eventoLimpio(e: Evento): Evento {
  return { id: e.id, titulo: e.titulo, inicio_local: e.inicio_local.slice(0, 5), fin_local: e.fin_local.slice(0, 5),
    dias_semana: e.dias_semana && e.dias_semana.length ? e.dias_semana.map(Number) : null, fecha_inicio: e.fecha_inicio,
    fecha_fin: e.fecha_fin || null, tipo: e.tipo, bloqueo: e.bloqueo, area: e.area };
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const capital = (s: string) => s.replace(/^./, c => c.toUpperCase());
const weekOf = (fecha: string) => addDays(fecha, 1 - (new Date(`${fecha}T12:00:00Z`).getUTCDay() || 7));

// Replans the current week and saves it
export async function recalcular(b: BackendAsistente, limites?: Record<string, number>): Promise<Plan> {
  const { ahora, hoy, data } = await b.cargar();
  const input = entradaSemana(data, hoy, ahora, limites);
  const plan = generatePlan(input);
  await b.mutar(data, 'plan', datosPlan(data, plan, input.hasta, ahora));
  b.avisar();
  return plan;
}

// What the model gets to know: compact, only what it may act on
export async function construirContextoCon(b: BackendAsistente, tareas: TaskItem[]): Promise<ContextoAsistente> {
  const { ahora, hoy, data, limites } = await b.cargar();
  const manana = addDays(hoy, 1);
  const plan = planActual(data, hoy, ahora, limites);
  const planManana = weekOf(manana) === weekOf(hoy) ? plan : planActual(data, manana, ahora, limites);
  const bloques = [...plan.bloques, ...(planManana === plan ? [] : planManana.bloques)]
    .filter(bl => bl.task_uid && (bl.fecha === hoy || bl.fecha === manana) && `${bl.fecha}T${bl.fin_local}` > ahora)
    .map(bl => ({ task_uid: bl.task_uid!, titulo: bl.titulo, fecha: bl.fecha, inicio: bl.inicio_local, fin: bl.fin_local }));
  // Classes and events of today and tomorrow, plus the agenda tasks of the next week (they can be moved or removed)
  const semana = addDays(hoy, 7);
  const agenda = [
    ...expandEventos(data.eventos, hoy, manana).map(bl => ({ titulo: bl.titulo, fecha: bl.fecha, inicio: bl.inicio_local, fin: bl.fin_local })),
    ...tareas.filter(t => t.date >= hoy && t.date <= semana && !t.completed && t.time)
      .map(t => ({ tarea_id: t.id, titulo: t.title, fecha: t.date, inicio: t.time.slice(0, 5), fin: (t.endTime || t.time).slice(0, 5) })),
  ].sort((x, y) => `${x.fecha}${x.inicio}`.localeCompare(`${y.fecha}${y.inicio}`)).slice(0, 60);
  // Fixed schedules still in force (weekly or upcoming one-off) that can be changed or removed
  const eventos = data.eventos.filter(e => e.dias_semana && e.dias_semana.length ? !e.fecha_fin || e.fecha_fin >= hoy : e.fecha_inicio >= hoy)
    .slice(0, 40).map(e => ({ evento_id: e.id, titulo: e.titulo, tipo: e.tipo, dias: e.dias_semana && e.dias_semana.length ? e.dias_semana.map(Number) : null,
      fecha: e.dias_semana && e.dias_semana.length ? null : e.fecha_inicio, inicio: e.inicio_local.slice(0, 5), fin: e.fin_local.slice(0, 5) }));
  // Two months of pending deliverables with their subject code, so "descarta las de X" and Basque names can be matched
  const limite = addDays(hoy, 60);
  const entregas = data.entregas.filter(esCandidata).map(t => ({ uid: t.uid, titulo: t.titulo, vence_local: madridLocal(t.deadline_utc),
    horas_est: t.horas_est ?? null, asignatura: t.asignatura_codigo || undefined, ...(t.es_examen ? { examen: true } : {}) }))
    .filter(e => e.vence_local > ahora && e.vence_local.slice(0, 10) <= limite)
    .sort((x, y) => x.vence_local.localeCompare(y.vence_local)).slice(0, 60);
  // University subjects plus the Moodle ones (code + name in Basque or Spanish); Moodle is empty for other accounts
  const [uni, moodle] = await Promise.all([b.asignaturasUni().catch(() => []), b.asignaturasMoodle().catch(() => [])]);
  const asignaturas = [
    ...uni.map(s => ({ id: s.id, code: s.code, name: s.name })),
    ...moodle.filter(a => entregas.some(e => e.asignatura === a.codigo)).map(a => ({ id: a.codigo, code: a.codigo, name: a.nombre })),
  ];
  return { ahora_local: ahora, dia_semana: DIAS[new Date(`${hoy}T12:00:00Z`).getUTCDay()], entregas, bloques, agenda, asignaturas, eventos };
}

interface Franja { fecha: string; inicio: string; fin: string; titulo: string; area: Evento['area'] }

// A start that already passed moves to now (rounded up to 5 minutes)
function inicioDesdeAhora(act: Franja, ahora: string): string {
  if (`${act.fecha}T${act.fin}` <= ahora) throw new Error('Esa hora ya ha pasado.');
  if (`${act.fecha}T${act.inicio}` >= ahora) return act.inicio;
  const m = Math.ceil((minutes(ahora.slice(11, 16)) + 1) / 5) * 5;
  if (m >= minutes(act.fin)) throw new Error('Eso ya casi ha terminado; no cambio el plan.');
  return timeString(m);
}

// One-off blocking event + replanning from its start, in one RPC (same flow as "Añadir plan imprevisto" in the planner)
async function guardarImprevisto(b: BackendAsistente, act: Franja, confirmarDeuda: boolean) {
  const { ahora, hoy, data, limites } = await b.cargar();
  const inicio = inicioDesdeAhora(act, ahora);
  const frases: string[] = [];
  const evento: Evento = { id: `voz:${newId()}`, titulo: act.titulo, inicio_local: inicio, fin_local: act.fin,
    dias_semana: null, fecha_inicio: act.fecha, fecha_fin: act.fecha, tipo: 'social', bloqueo: true, area: act.area };
  const baseline = planActual(data, act.fecha, ahora, limites);
  const diff = previewSocial(entradaSemana(data, act.fecha, ahora, limites), evento, baseline);
  for (const r of diff.recortes) frases.push(`Acorto el bloque de estudio que empezó a ${horaHablada(r.inicio_local)}: termina a ${horaHablada(r.fin_local)}.`);
  for (const m of diff.movimientos.slice(0, 3)) {
    frases.push(m.a.length ? `Muevo ${m.titulo} a ${cuandoHablado(blockStart(m.a[0]), hoy)}.` : `${m.titulo} se queda sin hueco esta semana.`);
  }
  if (diff.movimientos.length > 3) frases.push(`Y muevo ${diff.movimientos.length - 3} bloques más.`);
  if (diff.horas_nuevas_deuda > 0) frases.push(`Quedan ${duracionHablada(diff.horas_nuevas_deuda)} aplazadas.`);
  // Deliverables due within 48 h left without hours: the clear recommendation; other new risks, a short note
  const avisos = avisosImprevisto(diff, baseline, data.entregas, ahora);
  frases.push(...avisos.map(a => a.texto));
  const riesgoAntes = new Set([...baseline.en_riesgo.map(r => r.task_uid), ...avisos.map(a => a.task_uid)]);
  for (const r of diff.en_riesgo.filter(r => !riesgoAntes.has(r.task_uid)).slice(0, 2)) frases.push(`Ojo: ${r.titulo} queda en riesgo.`);
  if (diff.requiere_confirmacion && !confirmarDeuda) return { evento, frases, confirmar: true, movidos: diff.movimientos.length };
  await guardarSocial((d, a, p) => b.mutar(d, a, p), data, evento, diff, baseline, confirmarDeuda);
  return { evento, frases, confirmar: false, movidos: diff.movimientos.length };
}

// A fixed one-off event ("me voy al cine de 18:00 a 23:00"): saved as a fixed schedule for that day and the week replanned around it
async function guardarFijo(b: BackendAsistente, act: Franja) {
  const { ahora, hoy, data, limites } = await b.cargar();
  const inicio = inicioDesdeAhora(act, ahora);
  const evento: Evento = { id: `voz:${newId()}`, titulo: act.titulo, inicio_local: inicio, fin_local: act.fin,
    dias_semana: null, fecha_inicio: act.fecha, fecha_fin: act.fecha, tipo: 'fijo', bloqueo: true, area: act.area };
  // Study blocks the event overlaps, to say where they went
  const choca = (bl: { fecha: string; inicio_local: string; fin_local: string }) => bl.fecha === act.fecha
    && minutes(bl.inicio_local) < minutes(act.fin) && minutes(bl.fin_local) > minutes(inicio);
  const antes = planActual(data, act.fecha, ahora, limites).bloques.filter(bl => bl.task_uid && choca(bl));
  await guardarEvento((d, a, p) => b.mutar(d, a, p), data, evento);
  const plan = await recalcular(b, limites);
  const frases: string[] = [];
  for (const bl of antes.slice(0, 3)) {
    const nuevo = plan.bloques.find(n => n.task_uid === bl.task_uid && `${n.fecha}T${n.inicio_local}` >= ahora && !choca(n));
    frases.push(nuevo ? `Muevo ${bl.titulo} a ${cuandoHablado(blockStart(nuevo), hoy)}.` : `${bl.titulo} se queda sin hueco esta semana.`);
  }
  if (antes.length > 3) frases.push(`Y muevo ${antes.length - 3} bloques más.`);
  for (const r of plan.en_riesgo.filter(r => antes.some(bl => bl.task_uid === r.task_uid)).slice(0, 2)) frases.push(`Ojo: ${r.titulo} queda en riesgo.`);
  return { evento, frases, movidos: antes.length };
}

// Discards or restores deliverables: Moodle ones through the Moodle store, University ones through the planner RPC
async function cambiarEstados(b: BackendAsistente, cambios: { uid: string; estado: 'pendiente' | 'descartada' }[]) {
  for (const estado of ['pendiente', 'descartada'] as const) {
    const moodle = cambios.filter(c => c.estado === estado && !c.uid.startsWith('uni:')).map(c => c.uid);
    if (moodle.length) await b.estadosMoodle(moodle, estado);
  }
  for (const c of cambios.filter(c => c.uid.startsWith('uni:'))) {
    const { data } = await b.cargar();
    const e = data.entregas.find(t => t.uid === c.uid);
    if (!e) continue;
    await b.mutar(data, 'entrega', { uid: e.uid, estado: c.estado, horas_est: Number(e.horas_est) > 0 ? Number(e.horas_est) : 2,
      min_viable_min: Math.max(20, e.min_viable_min || 60), tamano_bloque_min: e.tamano_bloque_min || null,
      hueco_inicio_local: e.hueco_inicio_local || null, hueco_fin_local: e.hueco_fin_local || null });
  }
  const { limites } = await b.cargar();
  await recalcular(b, limites);
}

// Free stretches of [inicio, fin] once fixed classes and events are taken out
async function huecosLibres(b: BackendAsistente, fecha: string, inicio: string, fin: string): Promise<[string, string][]> {
  const { data } = await b.cargar();
  let libres: [number, number][] = [[minutes(inicio), minutes(fin)]];
  const ocupados = expandEventos(data.eventos.filter(e => e.tipo !== 'flexible' || e.bloqueo), fecha, fecha);
  for (const o of ocupados) {
    const s = minutes(o.inicio_local), e = minutes(o.fin_local);
    libres = libres.flatMap(([x, y]) => e <= x || s >= y ? [[x, y] as [number, number]] : [
      ...(s > x ? [[x, s] as [number, number]] : []), ...(e < y ? [[e, y] as [number, number]] : []),
    ]);
  }
  return libres.filter(([x, y]) => y - x >= 15).map(([x, y]) => [timeString(x), timeString(y)]);
}

const franja = (fecha: string, inicio: string, fin: string, hoy: string) =>
  `${cuandoHablado(`${fecha}T${inicio}`, hoy)} hasta ${horaHablada(fin)}`;

export async function ejecutarAccionCon(b: BackendAsistente, accion: Accion, tareas: TaskItem[], confirmar = false): Promise<Resultado> {
  const hoy = madridLocal(new Date()).slice(0, 10);
  switch (accion.tipo) {
    case 'anadir_actividad': {
      if (!accion.imprevisto) {
        const r = await guardarFijo(b, accion);
        const cuando = franja(accion.fecha, r.evento.inicio_local, accion.fin, hoy);
        const tarea = tareaDeEvento(r.evento);
        return { frases: [`Añadido como fijo: ${accion.titulo}, ${cuando}.`, ...(r.movidos ? r.frases : ['No choca con tu estudio.'])],
          tareaNueva: tarea, deshacer: { tipo: 'eventos', ids: [r.evento.id], tareaId: tarea.id, titulo: accion.titulo } };
      }
      const r = await guardarImprevisto(b, accion, confirmar);
      const cuando = franja(accion.fecha, r.evento.inicio_local, accion.fin, hoy);
      if (r.confirmar) return { confirmar: true, frases: [`${capital(cuando)}: ${accion.titulo}. Si lo añado superas tu máximo de horas aplazadas. ¿Lo añado igualmente?`] };
      b.avisar();
      const tarea = tareaDeEvento(r.evento);
      return { frases: [`Añadido: ${accion.titulo}, ${cuando}.`, ...(r.movidos ? r.frases : ['No choca con tu estudio.', ...r.frases])],
        tareaNueva: tarea, deshacer: { tipo: 'eventos', ids: [r.evento.id], tareaId: tarea.id, titulo: accion.titulo } };
    }
    case 'bloquear_franja': {
      const tramos = await huecosLibres(b, accion.fecha, accion.inicio, accion.fin);
      if (!tramos.length) return { frases: ['En esa franja ya tienes horarios fijos; no había estudio que mover.'] };
      const ids: string[] = [], frases: string[] = [];
      let movidos = 0;
      for (const [inicio, fin] of tramos) {
        if (`${accion.fecha}T${fin}` <= madridLocal(new Date())) continue;
        const r = await guardarImprevisto(b, { ...accion, inicio, fin }, confirmar);
        if (r.confirmar) {
          return { confirmar: true, frases: ['Si libero esa franja superas tu máximo de horas aplazadas. ¿La libero igualmente?'],
            deshacer: ids.length ? { tipo: 'eventos', ids, titulo: accion.titulo } : undefined };
        }
        ids.push(r.evento.id); frases.push(...r.frases); movidos += r.movidos;
      }
      if (!ids.length) return { frases: ['Esa franja ya ha pasado.'] };
      b.avisar();
      return { frases: [`Hecho: ${franja(accion.fecha, accion.inicio, accion.fin, hoy)} queda ocupado.`, ...(movidos ? frases : ['No tenías estudio en esa franja.'])],
        deshacer: { tipo: 'eventos', ids, titulo: 'la franja ocupada' } };
    }
    case 'aplazar_entrega': {
      const { data, limites } = await b.cargar();
      await b.mutar(data, 'aplazar', { uid: accion.uid });
      const plan = await recalcular(b, limites);
      const siguiente = plan.bloques.find(bl => bl.task_uid === accion.uid && bl.fecha > hoy);
      const riesgo = plan.en_riesgo.some(r => r.task_uid === accion.uid);
      return { frases: [`He pasado ${accion.titulo} a partir de mañana.`,
        siguiente ? `El siguiente bloque es ${cuandoHablado(blockStart(siguiente), hoy)}.` : 'Esta semana no le queda hueco; míralo en el plan.',
        ...(riesgo ? [`Ojo: queda en riesgo.`] : [])] };
    }
    case 'mover_tarea': {
      const anterior = tareas.find(t => t.id === accion.tarea_id);
      if (!anterior) throw new Error(`No encuentro ${accion.titulo} en tu agenda.`);
      const cambiada: TaskItem = { ...anterior, date: accion.fecha, time: accion.inicio, endTime: accion.fin,
        durationMinutes: minutes(accion.fin) - minutes(accion.inicio) };
      return { frases: [`He movido ${accion.titulo} a ${franja(accion.fecha, accion.inicio, accion.fin, hoy)}.`],
        tareaCambiada: cambiada, deshacer: { tipo: 'tarea', anterior, titulo: accion.titulo } };
    }
    case 'anadir_deber': {
      const asignaturas = await b.asignaturasUni();
      const asignatura = asignaturas.find(s => s.id === accion.asignatura_id) || (asignaturas.length === 1 ? asignaturas[0] : null);
      if (!asignatura) {
        return { frases: [`¿De qué asignatura es ${accion.titulo}? Dímelo junto con el deber, por ejemplo: «${accion.titulo} de ${asignaturas[0]?.name || 'Física'}».`] };
      }
      const deber: UniversityHomework = { id: newId(), createdAt: new Date().toISOString(), subjectId: asignatura.id, title: accion.titulo,
        dueDate: accion.vence_local.slice(0, 10), dueTime: accion.vence_local.slice(11, 16), type: accion.tipo_deber, priority: 'alta',
        status: 'pendiente', estimatedHours: accion.horas_est, description: 'Añadido por voz' };
      await b.guardarTrabajo(deber, asignatura);
      const { limites } = await b.cargar();
      const plan = await recalcular(b, limites);
      const primero = plan.bloques.find(bl => bl.task_uid === `uni:${deber.id}`);
      return { frases: [`Apuntado: ${accion.titulo}, de ${asignatura.name}, para ${cuandoHablado(accion.vence_local, hoy)}, con ${duracionHablada(accion.horas_est)} de trabajo.`,
        primero ? `Empiezas ${cuandoHablado(blockStart(primero), hoy)}.` : 'Esta semana no hay bloques para él; lo verás en el plan.'],
        deshacer: { tipo: 'deber', deber, asignatura, titulo: accion.titulo } };
    }
    case 'descartar_entrega': {
      await cambiarEstados(b, [{ uid: accion.uid, estado: 'descartada' }]);
      return { frases: [`He descartado ${accion.titulo}; ya no cuenta en tu plan.`],
        deshacer: { tipo: 'estados', cambios: [{ uid: accion.uid, estado: 'pendiente' }], titulo: accion.titulo } };
    }
    case 'descartar_asignatura': {
      const n = accion.uids.length;
      if (n > MAX_DESCARTE_SIN_CONFIRMAR && !accion.confirmado && !confirmar) {
        return { confirmar: true, frases: [`Son ${n} entregas pendientes de ${accion.asignatura}. ¿Las descarto todas?`] };
      }
      await cambiarEstados(b, accion.uids.map(uid => ({ uid, estado: 'descartada' as const })));
      return { frases: [`He descartado ${n === 1 ? 'la entrega pendiente' : `las ${n} entregas pendientes`} de ${accion.asignatura}.`],
        deshacer: { tipo: 'estados', cambios: accion.uids.map(uid => ({ uid, estado: 'pendiente' as const })), titulo: `las entregas de ${accion.asignatura}` } };
    }
    case 'modificar_entrega': {
      const { data } = await b.cargar();
      const e = data.entregas.find(t => t.uid === accion.uid);
      if (!e) throw new Error(`No encuentro ${accion.titulo}.`);
      const dicho: string[] = [];
      if (accion.nuevo_titulo) dicho.push(`se llama «${accion.nuevo_titulo}»`);
      if (accion.vence_local) dicho.push(`vence ${cuandoHablado(accion.vence_local, hoy)}`);
      if (accion.horas_est) dicho.push(`le calculo ${duracionHablada(accion.horas_est)}`);
      let deshacer: Deshacer;
      if (e.uid.startsWith('uni:')) {
        const row = (await b.trabajosUni()).find(r => `uni:${r.id}` === e.uid);
        if (!row) throw new Error(`No encuentro ${accion.titulo}.`);
        const anterior = deberDeFila(row);
        const titulo = accion.nuevo_titulo?.replace(/^\[[^\]]+\]\s*/, '');
        await b.guardarTrabajo({ ...anterior, ...(titulo ? { title: titulo } : {}),
          ...(accion.vence_local ? { dueDate: accion.vence_local.slice(0, 10), dueTime: accion.vence_local.slice(11, 16) } : {}),
          ...(accion.horas_est ? { estimatedHours: accion.horas_est } : {}) }, row.asignatura);
        deshacer = { tipo: 'deber_previo', deber: anterior, asignatura: row.asignatura, titulo: accion.titulo };
      } else {
        await b.editarMoodle(e.uid, { ...(accion.nuevo_titulo ? { titulo: accion.nuevo_titulo } : {}),
          ...(accion.vence_local ? { deadline_utc: localDeadlineUtc(accion.vence_local) } : {}),
          ...(accion.horas_est ? { horas_est: accion.horas_est } : {}) });
        deshacer = { tipo: 'entrega_moodle', uid: e.uid, titulo: accion.titulo, anterior: {
          ...(accion.nuevo_titulo ? { titulo: e.titulo } : {}), ...(accion.vence_local ? { deadline_utc: e.deadline_utc } : {}),
          ...(accion.horas_est ? { horas_est: e.horas_est ?? null } : {}) } };
      }
      const { limites } = await b.cargar();
      await recalcular(b, limites);
      return { frases: [`Cambiado: ${accion.titulo} ${dicho.join(' y ')}. He recalculado el plan.`], deshacer };
    }
    case 'completar_entrega': {
      const { data, limites } = await b.cargar();
      await b.mutar(data, 'entrega', { uid: accion.uid, estado: 'hecha' });
      await recalcular(b, limites);
      return { frases: [`¡Bien! ${accion.titulo}, hecha.`],
        deshacer: { tipo: 'estados', cambios: [{ uid: accion.uid, estado: 'pendiente' }], titulo: accion.titulo } };
    }
    case 'borrar_deber': {
      if (!accion.confirmado && !confirmar) return { confirmar: true, frases: [`¿Borro ${accion.titulo}? No se puede deshacer.`] };
      const row = (await b.trabajosUni()).find(r => `uni:${r.id}` === accion.uid);
      if (!row) throw new Error(`No encuentro ${accion.titulo}.`);
      await b.guardarTrabajo(deberDeFila(row), row.asignatura, true);
      const { limites } = await b.cargar();
      await recalcular(b, limites);
      return { frases: [`He borrado ${accion.titulo}.`] };
    }
    case 'completar_tarea':
    case 'borrar_tarea': {
      const anterior = tareas.find(t => t.id === accion.tarea_id);
      if (!anterior) throw new Error(`No encuentro ${accion.titulo} en tu agenda.`);
      const deshacer: Deshacer = { tipo: 'tarea', anterior, titulo: accion.titulo };
      if (accion.tipo === 'borrar_tarea') return { frases: [`He quitado ${accion.titulo} de tu agenda.`], tareaBorrada: anterior.id, deshacer };
      return { frases: [`Hecho: ${accion.titulo}.`], tareaCambiada: { ...anterior, completed: true }, deshacer };
    }
    case 'modificar_evento':
    case 'eliminar_evento': {
      const { data, limites } = await b.cargar();
      const original = data.eventos.find(e => e.id === accion.evento_id);
      if (!original) throw new Error(`No encuentro ${accion.titulo} en tus horarios.`);
      const anterior = eventoLimpio(original);
      if (accion.tipo === 'eliminar_evento') {
        if (accion.semanal && !accion.confirmado && !confirmar) {
          return { confirmar: true, frases: [`${accion.titulo} se repite cada semana. ¿Lo quito de todas las semanas?`] };
        }
        await b.mutar(data, 'eliminar_evento', { id: anterior.id });
        await recalcular(b, limites);
        return { frases: [`He quitado ${accion.titulo} y he recalculado el plan.`], deshacer: { tipo: 'evento_previo', evento: anterior, titulo: accion.titulo } };
      }
      const cambiado: Evento = { ...anterior, ...(accion.nuevo_titulo ? { titulo: accion.nuevo_titulo } : {}),
        ...(accion.inicio ? { inicio_local: accion.inicio } : {}), ...(accion.fin ? { fin_local: accion.fin } : {}),
        ...(accion.fecha && !anterior.dias_semana ? { fecha_inicio: accion.fecha, fecha_fin: accion.fecha } : {}) };
      await guardarEvento((d, a, p) => b.mutar(d, a, p), data, cambiado);
      await recalcular(b, limites);
      const cuando = anterior.dias_semana ? `de ${horaHablada(cambiado.inicio_local)} a ${horaHablada(cambiado.fin_local)}`
        : franja(cambiado.fecha_inicio, cambiado.inicio_local, cambiado.fin_local, hoy);
      return { frases: [`Cambiado: ${cambiado.titulo}, ${cuando}. He recalculado el plan.`],
        deshacer: { tipo: 'evento_previo', evento: anterior, titulo: accion.titulo } };
    }
    default:
      return { frases: [] };
  }
}

export async function deshacerCon(b: BackendAsistente, d: Deshacer): Promise<{ frases: string[]; quitarTarea?: string; restaurarTarea?: TaskItem }> {
  if (d.tipo === 'tarea') return { frases: [`He devuelto ${d.titulo} a su hora.`], restaurarTarea: d.anterior };
  if (d.tipo === 'estados') {
    await cambiarEstados(b, d.cambios);
    return { frases: [`He recuperado ${d.titulo} y he recalculado el plan.`] };
  }
  if (d.tipo === 'evento_previo') {
    const { data, limites } = await b.cargar();
    await guardarEvento((x, a, p) => b.mutar(x, a, p), data, d.evento);
    await recalcular(b, limites);
    return { frases: [`He dejado ${d.titulo} como estaba y he recalculado el plan.`] };
  }
  if (d.tipo === 'entrega_moodle' || d.tipo === 'deber_previo') {
    if (d.tipo === 'entrega_moodle') await b.editarMoodle(d.uid, { ...d.anterior });
    else await b.guardarTrabajo(d.deber, d.asignatura);
    const { limites } = await b.cargar();
    await recalcular(b, limites);
    return { frases: [`He dejado ${d.titulo} como estaba y he recalculado el plan.`] };
  }
  if (d.tipo === 'deber') {
    await b.guardarTrabajo(d.deber, d.asignatura, true);
  } else {
    for (const id of d.ids) {
      const { data } = await b.cargar();
      await b.mutar(data, 'eliminar_evento', { id });
    }
  }
  const { limites } = await b.cargar();
  await recalcular(b, limites);
  return { frases: [`He quitado ${d.titulo} y he recalculado el plan.`], quitarTarea: d.tipo === 'eventos' ? d.tareaId : undefined };
}

// Same as homeworkFromRow (universityPlannerService), without its browser imports
export function deberDeFila(row: UniversityWorkRow): UniversityHomework {
  return { ...row.datos, id: row.id, plannerUid: `uni:${row.id}`, estimatedHours: Number(row.horas_est),
    status: row.estado === 'hecha' || row.estado === 'descartada' ? 'entregado' : row.datos.status === 'en_progreso' ? 'en_progreso' : 'pendiente' };
}

const categoria = (area: Evento['area']): TaskItem['category'] =>
  area === 'gym' || area === 'karate' ? 'Sports/Karate' : area === 'trabajo' ? 'Work' : 'Personal';

// The activity as an agenda task so it shows in the day view. Never 'Academics': those become planner fixed events.
export function tareaDeEvento(evento: Evento): TaskItem {
  return { id: `voz-${evento.id.replace(/^voz:/, '')}`, title: evento.titulo, category: categoria(evento.area), date: evento.fecha_inicio,
    time: evento.inicio_local, endTime: evento.fin_local, durationMinutes: minutes(evento.fin_local) - minutes(evento.inicio_local),
    priority: 'media', notes: 'Añadida por voz', sourceType: 'voice', confidence: 1, completed: false };
}
