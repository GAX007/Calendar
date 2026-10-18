// Voice assistant actions: understands a sentence (Gemini, local parser as fallback) and runs it on the planner and agenda
import { interpretarComando } from '../asistente/comandosVoz';
import { accionesDeComando, type Accion, type ContextoAsistente, type Interpretacion } from '../asistente/interpretar';
import { cuandoHablado, duracionHablada, horaHablada } from '../asistente/voz';
import { planActual, entradaSemana, esCandidata } from '../asistente/logica';
import { expandEventos, previewSocial } from '../planner/engine';
import { avisosImprevisto } from '../planner/imprevisto';
import { addDays, blockStart, madridLocal, minutes, timeString } from '../planner/time';
import type { Evento } from '../planner/types';
import type { TaskItem, UniversityHomework, UniversitySubject } from '../types';
import { newId } from '../utils/uuid';
import { confirmSocial, mutatePlanner } from './plannerService';
import { getUniversitySubjects } from './universityService';
import { saveUniversityWork } from './universityPlannerService';
import { ASISTENTE_ACTUALIZADO, contextoVoz, recalcularYGuardarSemana } from './asistenteService';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const INTERPRETAR_TIMEOUT_MS = 15000;
const capital = (s: string) => s.replace(/^./, c => c.toUpperCase());

export type Deshacer =
  | { tipo: 'eventos'; ids: string[]; tareaId?: string; titulo: string }
  | { tipo: 'deber'; deber: UniversityHomework; asignatura: UniversitySubject; titulo: string }
  | { tipo: 'tarea'; anterior: TaskItem; titulo: string };

export interface Resultado {
  frases: string[];
  deshacer?: Deshacer;
  // Above the postponed-hours limit: run the same action again with confirmarDeuda
  confirmar?: boolean;
  tareaNueva?: TaskItem;
  tareaCambiada?: TaskItem;
}

export interface Turno { usuario: string; asistente: string }

// What Gemini gets to know: compact, only what it may act on
export async function construirContexto(userId: string, tareas: TaskItem[]): Promise<ContextoAsistente> {
  const { ahora, hoy, data, limites } = await contextoVoz(userId);
  const manana = addDays(hoy, 1);
  const plan = planActual(data, hoy, ahora, limites);
  const planManana = weekOf(manana) === weekOf(hoy) ? plan : planActual(data, manana, ahora, limites);
  const bloques = [...plan.bloques, ...(planManana === plan ? [] : planManana.bloques)]
    .filter(b => b.task_uid && (b.fecha === hoy || b.fecha === manana) && `${b.fecha}T${b.fin_local}` > ahora)
    .map(b => ({ task_uid: b.task_uid!, titulo: b.titulo, fecha: b.fecha, inicio: b.inicio_local, fin: b.fin_local }));
  const agenda = [
    ...expandEventos(data.eventos, hoy, manana).map(b => ({ titulo: b.titulo, fecha: b.fecha, inicio: b.inicio_local, fin: b.fin_local })),
    ...tareas.filter(t => (t.date === hoy || t.date === manana) && !t.completed && t.time)
      .map(t => ({ tarea_id: t.id, titulo: t.title, fecha: t.date, inicio: t.time.slice(0, 5), fin: (t.endTime || t.time).slice(0, 5) })),
  ].sort((a, b) => `${a.fecha}${a.inicio}`.localeCompare(`${b.fecha}${b.inicio}`));
  const limite = addDays(hoy, 21);
  const entregas = data.entregas.filter(esCandidata).map(t => ({ uid: t.uid, titulo: t.titulo, vence_local: madridLocal(t.deadline_utc),
    horas_est: t.horas_est ?? null })).filter(e => e.vence_local > ahora && e.vence_local.slice(0, 10) <= limite)
    .sort((a, b) => a.vence_local.localeCompare(b.vence_local));
  const asignaturas = getUniversitySubjects().map(s => ({ id: s.id, code: s.code, name: s.name }));
  return { ahora_local: ahora, dia_semana: DIAS[new Date(`${hoy}T12:00:00Z`).getUTCDay()], entregas, bloques, agenda, asignaturas };
}
const weekOf = (fecha: string) => addDays(fecha, 1 - (new Date(`${fecha}T12:00:00Z`).getUTCDay() || 7));

// Gemini first; without network or key, the local parser
export async function interpretarFrase(texto: string, ctx: ContextoAsistente, historial: Turno[] = []): Promise<Interpretacion & { local: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERPRETAR_TIMEOUT_MS);
  try {
    const res = await fetch('/api/asistente/interpretar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ texto, contexto: ctx, historial: historial.slice(-3) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.acciones)) throw new Error('Respuesta sin acciones');
    return { respuesta: String(json.respuesta || ''), acciones: json.acciones as Accion[], local: false };
  } catch {
    return { respuesta: '', acciones: accionesDeComando(interpretarComando(texto, ctx.ahora_local)), local: true };
  } finally {
    clearTimeout(timer);
  }
}

interface Imprevisto { fecha: string; inicio: string; fin: string; titulo: string; area: Evento['area'] }

// One-off blocking event + replanning from its start, in one RPC (same flow as "Añadir plan imprevisto" in the planner)
async function guardarImprevisto(userId: string, act: Imprevisto, confirmarDeuda: boolean) {
  const { ahora, hoy, data, limites } = await contextoVoz(userId);
  let inicio = act.inicio;
  const frases: string[] = [];
  if (`${act.fecha}T${act.fin}` <= ahora) throw new Error('Esa hora ya ha pasado.');
  if (`${act.fecha}T${inicio}` < ahora) {
    const m = Math.ceil((minutes(ahora.slice(11, 16)) + 1) / 5) * 5;
    if (m >= minutes(act.fin)) throw new Error('Eso ya casi ha terminado; no cambio el plan.');
    inicio = timeString(m);
  }
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
  await confirmSocial(data, evento, diff, baseline, confirmarDeuda);
  return { evento, frases, confirmar: false, movidos: diff.movimientos.length };
}

// Free stretches of [inicio, fin] once fixed classes and events are taken out
async function huecosLibres(userId: string, fecha: string, inicio: string, fin: string): Promise<[string, string][]> {
  const { data } = await contextoVoz(userId);
  let libres: [number, number][] = [[minutes(inicio), minutes(fin)]];
  const ocupados = expandEventos(data.eventos.filter(e => e.tipo !== 'flexible' || e.bloqueo), fecha, fecha);
  for (const o of ocupados) {
    const s = minutes(o.inicio_local), e = minutes(o.fin_local);
    libres = libres.flatMap(([a, b]) => e <= a || s >= b ? [[a, b] as [number, number]] : [
      ...(s > a ? [[a, s] as [number, number]] : []), ...(e < b ? [[e, b] as [number, number]] : []),
    ]);
  }
  return libres.filter(([a, b]) => b - a >= 15).map(([a, b]) => [timeString(a), timeString(b)]);
}

const franja = (fecha: string, inicio: string, fin: string, hoy: string) =>
  `${cuandoHablado(`${fecha}T${inicio}`, hoy)} hasta ${horaHablada(fin)}`;

export async function ejecutarAccion(userId: string, accion: Accion, tareas: TaskItem[], confirmarDeuda = false): Promise<Resultado> {
  const hoy = madridLocal(new Date()).slice(0, 10);
  switch (accion.tipo) {
    case 'anadir_actividad': {
      const r = await guardarImprevisto(userId, accion, confirmarDeuda);
      const cuando = franja(accion.fecha, r.evento.inicio_local, accion.fin, hoy);
      if (r.confirmar) return { confirmar: true, frases: [`${capital(cuando)}: ${accion.titulo}. Si lo añado superas tu máximo de horas aplazadas. ¿Lo añado igualmente?`] };
      window.dispatchEvent(new Event(ASISTENTE_ACTUALIZADO));
      const tarea = tareaDeEvento(r.evento);
      return { frases: [`Añadido: ${accion.titulo}, ${cuando}.`, ...(r.movidos ? r.frases : ['No choca con tu estudio.', ...r.frases])],
        tareaNueva: tarea, deshacer: { tipo: 'eventos', ids: [r.evento.id], tareaId: tarea.id, titulo: accion.titulo } };
    }
    case 'bloquear_franja': {
      const tramos = await huecosLibres(userId, accion.fecha, accion.inicio, accion.fin);
      if (!tramos.length) return { frases: ['En esa franja ya tienes horarios fijos; no había estudio que mover.'] };
      const ids: string[] = [], frases: string[] = [];
      let movidos = 0;
      for (const [inicio, fin] of tramos) {
        if (`${accion.fecha}T${fin}` <= madridLocal(new Date())) continue;
        const r = await guardarImprevisto(userId, { ...accion, inicio, fin }, confirmarDeuda);
        if (r.confirmar) {
          return { confirmar: true, frases: ['Si libero esa franja superas tu máximo de horas aplazadas. ¿La libero igualmente?'],
            deshacer: ids.length ? { tipo: 'eventos', ids, titulo: accion.titulo } : undefined };
        }
        ids.push(r.evento.id); frases.push(...r.frases); movidos += r.movidos;
      }
      if (!ids.length) return { frases: ['Esa franja ya ha pasado.'] };
      window.dispatchEvent(new Event(ASISTENTE_ACTUALIZADO));
      return { frases: [`Hecho: ${franja(accion.fecha, accion.inicio, accion.fin, hoy)} queda ocupado.`, ...(movidos ? frases : ['No tenías estudio en esa franja.'])],
        deshacer: { tipo: 'eventos', ids, titulo: 'la franja ocupada' } };
    }
    case 'aplazar_entrega': {
      const { data, limites } = await contextoVoz(userId);
      await mutatePlanner(data, 'aplazar', { uid: accion.uid });
      const plan = await recalcularYGuardarSemana(limites);
      const siguiente = plan.bloques.find(b => b.task_uid === accion.uid && b.fecha > hoy);
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
      const asignaturas = getUniversitySubjects();
      const asignatura = asignaturas.find(s => s.id === accion.asignatura_id) || (asignaturas.length === 1 ? asignaturas[0] : null);
      if (!asignatura) {
        return { frases: [`¿De qué asignatura es ${accion.titulo}? Dímelo junto con el deber, por ejemplo: «${accion.titulo} de ${asignaturas[0]?.name || 'Física'}».`] };
      }
      const deber: UniversityHomework = { id: newId(), createdAt: new Date().toISOString(), subjectId: asignatura.id, title: accion.titulo,
        dueDate: accion.vence_local.slice(0, 10), dueTime: accion.vence_local.slice(11, 16), type: accion.tipo_deber, priority: 'alta',
        status: 'pendiente', estimatedHours: accion.horas_est, description: 'Añadido por voz' };
      await saveUniversityWork(deber, asignatura);
      const { limites } = await contextoVoz(userId);
      const plan = await recalcularYGuardarSemana(limites);
      const primero = plan.bloques.find(b => b.task_uid === `uni:${deber.id}`);
      return { frases: [`Apuntado: ${accion.titulo}, de ${asignatura.name}, para ${cuandoHablado(accion.vence_local, hoy)}, con ${duracionHablada(accion.horas_est)} de trabajo.`,
        primero ? `Empiezas ${cuandoHablado(blockStart(primero), hoy)}.` : 'Esta semana no hay bloques para él; lo verás en el plan.'],
        deshacer: { tipo: 'deber', deber, asignatura, titulo: accion.titulo } };
    }
    default:
      return { frases: [] };
  }
}

export async function deshacerVoz(userId: string, d: Deshacer): Promise<{ frases: string[]; quitarTarea?: string; restaurarTarea?: TaskItem }> {
  if (d.tipo === 'tarea') return { frases: [`He devuelto ${d.titulo} a su hora.`], restaurarTarea: d.anterior };
  if (d.tipo === 'deber') {
    await saveUniversityWork(d.deber, d.asignatura, true);
  } else {
    for (const id of d.ids) {
      const { data } = await contextoVoz(userId);
      await mutatePlanner(data, 'eliminar_evento', { id });
    }
  }
  const { limites } = await contextoVoz(userId);
  await recalcularYGuardarSemana(limites);
  return { frases: [`He quitado ${d.titulo} y he recalculado el plan.`], quitarTarea: d.tipo === 'eventos' ? d.tareaId : undefined };
}

const categoria = (area: Evento['area']): TaskItem['category'] =>
  area === 'gym' || area === 'karate' ? 'Sports/Karate' : area === 'trabajo' ? 'Work' : 'Personal';

// The activity as an agenda task so it shows in the day view. Never 'Academics': those become planner fixed events.
function tareaDeEvento(evento: Evento): TaskItem {
  return { id: `voz-${evento.id.replace(/^voz:/, '')}`, title: evento.titulo, category: categoria(evento.area), date: evento.fecha_inicio,
    time: evento.inicio_local, endTime: evento.fin_local, durationMinutes: minutes(evento.fin_local) - minutes(evento.inicio_local),
    priority: 'media', notes: 'Añadida por voz', sourceType: 'voice', confidence: 1, completed: false };
}
