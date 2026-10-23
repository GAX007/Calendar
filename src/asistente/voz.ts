// Spoken summary of the day: builds the script from the app's own data. Pure functions, no browser APIs, so it can be tested.
import type { PlannerData } from '../planner/data';
import type { Plan } from '../planner/types';
import type { TaskItem } from '../types';
import type { ItemCierre } from './logica';
import { addMinutesLocal, esCandidata } from './logica';
import { expandEventos } from '../planner/engine';
import { addDays, blockEnd, blockStart, madridLocal, minutes } from '../planner/time';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MAX_LISTA = 5;

const diaSemana = (fecha: string) => DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()];

// "las 4 y media de la tarde", "la 1 de la tarde", "las 9 menos cuarto de la mañana", "medianoche"
export function horaHablada(hhmm: string): string {
  const total = minutes(hhmm.slice(0, 5));
  if (total >= 23 * 60 + 59 || total === 0) return 'medianoche';
  if (total === 12 * 60) return 'mediodía';
  let h = Math.floor(total / 60), m = total % 60;
  let resto = '';
  if (m === 15) resto = ' y cuarto';
  else if (m === 30) resto = ' y media';
  else if (m === 45) { resto = ' menos cuarto'; h += 1; }
  else if (m > 0) resto = ` y ${m}`;
  const franja = h < 6 || h >= 21 ? 'de la noche' : h < 12 ? 'de la mañana' : h === 12 ? 'del mediodía' : 'de la tarde';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12 === 1 ? 'la' : 'las'} ${h12}${resto} ${franja}`;
}

// "2 horas y media", "45 minutos", "1 hora y 15 minutos"
export function duracionHablada(horas: number): string {
  const total = Math.round(horas * 60 / 5) * 5;
  const h = Math.floor(total / 60), m = total % 60;
  if (!h) return `${m} minutos`;
  const base = h === 1 ? '1 hora' : `${h} horas`;
  if (!m) return base;
  return m === 30 ? `${base} y media` : `${base} y ${m} minutos`;
}

// "hoy a las 2 de la tarde", "mañana antes de medianoche", "el jueves a las 10 de la mañana", "el lunes 26 a las…"
export function cuandoHablado(local: string, hoy: string): string {
  const fecha = local.slice(0, 10), hora = horaHablada(local.slice(11, 16));
  const momento = hora === 'medianoche' ? 'antes de medianoche' : hora === 'mediodía' ? 'a mediodía' : `a ${hora}`;
  if (fecha === hoy) return `hoy ${momento}`;
  if (fecha === addDays(hoy, 1)) return `mañana ${momento}`;
  const dia = fecha <= addDays(hoy, 6) ? `el ${diaSemana(fecha)}` : `el ${diaSemana(fecha)} ${Number(fecha.slice(8, 10))}`;
  return `${dia} ${momento}`;
}

function enumerar(items: string[]): string {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join('; ')}; y ${items.at(-1)}`;
}
const cuantas = (n: number, una: string, varias: string) => `${n === 1 ? 'una' : n} ${n === 1 ? una : varias}`;
const fechaHablada = (fecha: string) => `${diaSemana(fecha)}, ${Number(fecha.slice(8, 10))} de ${MESES[Number(fecha.slice(5, 7)) - 1]}`;

export interface GuionInput {
  data: PlannerData;
  plan: Plan;
  tareas: TaskItem[];
  ahoraLocal: string;
  // Day to summarise; today by default. Today only counts what is still ahead.
  fecha?: string;
  cierre?: ItemCierre[];
}

export interface Guion {
  frases: string[];
  entregas: number;
}

const pendientes = (data: PlannerData, ahoraLocal: string) => data.entregas.filter(esCandidata)
  .map(t => ({ t, vence: madridLocal(t.deadline_utc) }))
  .filter(({ vence }) => vence > ahoraLocal)
  .sort((a, b) => a.vence.localeCompare(b.vence));

// Sentences to speak, in order, about a single day. Each sentence is spoken separately (iOS cuts long utterances).
export function guionDelDia({ data, plan, tareas, ahoraLocal, fecha, cierre = [] }: GuionInput): Guion {
  const hoy = ahoraLocal.slice(0, 10), hora = ahoraLocal.slice(11, 16), min = minutes(hora);
  const dia = fecha || hoy, esHoy = dia === hoy;
  // For another day everything counts; for today only what has not finished yet
  const desde = esHoy ? ahoraLocal : `${dia}T00:00`;
  const frases: string[] = [];
  if (esHoy) {
    const saludo = min < 14 * 60 ? 'Buenos días' : min < 21 * 60 ? 'Buenas tardes' : 'Buenas noches';
    frases.push(`${saludo}. Hoy es ${fechaHablada(hoy)}.`);
  } else {
    const nombre = dia === addDays(hoy, 1) ? 'Mañana' : dia === addDays(hoy, 2) ? 'Pasado mañana' : 'El';
    frases.push(nombre === 'El' ? `El ${fechaHablada(dia)}.` : `${nombre}, ${fechaHablada(dia)}.`);
  }
  const verbo = (n: number) => esHoy ? (n === 1 ? 'te queda' : 'te quedan') : 'tienes';

  // Fixed things of the day: classes and events from the planner plus the agenda tasks
  const fijos = [
    ...expandEventos(data.eventos, dia, dia).filter(b => blockEnd(b) > desde).map(b => ({ inicio: b.inicio_local, titulo: b.titulo })),
    ...tareas.filter(t => t.date === dia && !t.completed && t.time && `${dia}T${t.endTime || t.time}` > desde)
      .map(t => ({ inicio: t.time.slice(0, 5), titulo: t.title })),
  ].sort((a, b) => a.inicio.localeCompare(b.inicio))
    .filter((f, i, all) => i === 0 || f.inicio !== all[i - 1].inicio || f.titulo.toLowerCase() !== all[i - 1].titulo.toLowerCase());
  if (fijos.length) {
    const lista = fijos.slice(0, MAX_LISTA).map(f => `${esHoy && f.inicio <= hora ? 'ahora' : `a ${horaHablada(f.inicio)}`}, ${f.titulo}`);
    const mas = fijos.length > MAX_LISTA ? `, y ${cuantas(fijos.length - MAX_LISTA, 'cosa más', 'cosas más')}` : '';
    frases.push(`En la agenda ${verbo(fijos.length)} ${cuantas(fijos.length, 'cosa', 'cosas')}: ${enumerar(lista)}${mas}.`);
  } else {
    frases.push(esHoy ? 'No te queda nada fijo en la agenda para hoy.' : 'No tienes nada fijo en la agenda.');
  }

  // Study blocks of the day
  const bloques = plan.bloques.filter(b => b.fecha === dia && b.task_uid && blockEnd(b) > desde)
    .sort((a, b) => a.inicio_local.localeCompare(b.inicio_local));
  if (bloques.length) {
    const horas = bloques.reduce((n, b) => n + minutes(b.fin_local) - Math.max(minutes(b.inicio_local), esHoy && blockStart(b) < ahoraLocal ? min : 0), 0) / 60;
    const primero = bloques[0];
    const cuando = esHoy && blockStart(primero) <= ahoraLocal ? 'ya ha empezado' : `empieza a ${horaHablada(primero.inicio_local)}`;
    const total = esHoy ? `Te ${horas === 1 ? 'queda' : 'quedan'} ${duracionHablada(horas)} de estudio` : `Tienes ${duracionHablada(horas)} de estudio`;
    frases.push(`${total}. El primer bloque ${cuando}: ${primero.titulo}.`);
  } else {
    frases.push(esHoy ? 'Hoy no te queda estudio planificado.' : 'No hay estudio planificado.');
  }

  // Deliverables due that day; if none, only the next one
  const proximas = pendientes(data, ahoraLocal);
  const delDia = proximas.filter(({ vence }) => vence.slice(0, 10) === dia);
  const proyeccion = plan.proyeccion || plan.bloques;
  if (delDia.length) {
    const lista = delDia.slice(0, MAX_LISTA).map(({ t, vence }) => {
      const horas = proyeccion.filter(b => b.task_uid === t.uid && blockStart(b) >= ahoraLocal && blockEnd(b) <= vence)
        .reduce((n, b) => n + minutes(b.fin_local) - minutes(b.inicio_local), 0) / 60;
      const planificado = horas > 0 ? `, con ${duracionHablada(horas)} de trabajo planificado` : '';
      return `${t.titulo}, ${cuandoHablado(vence, hoy)}${planificado}`;
    });
    frases.push(`${delDia.length === 1 ? 'Vence una entrega' : `Vencen ${delDia.length} entregas`}: ${enumerar(lista)}.`);
  } else {
    const siguiente = proximas.find(({ vence }) => vence.slice(0, 10) > dia);
    frases.push(`${esHoy ? 'Hoy no vence' : 'Ese día no vence'} ninguna entrega.${siguiente ? ` La próxima es ${siguiente.t.titulo}, ${cuandoHablado(siguiente.vence, hoy)}.` : ''}`);
  }

  if (esHoy) {
    // Only risks that matter today or tomorrow; the rest are in the plan
    const urgente = plan.en_riesgo.find(r => {
      const vence = proximas.find(p => p.t.uid === r.task_uid)?.vence;
      return vence && vence.slice(0, 10) <= addDays(hoy, 1);
    });
    if (urgente) frases.push(`Ojo: ${urgente.titulo} está en riesgo, te faltan ${duracionHablada(urgente.horas_pendientes)} que no caben antes del plazo.`);
    if (cierre.length) {
      const uno = cierre.length === 1;
      frases.push(`Anoche moví ${uno ? 'un bloque que no marcaste como hecho' : `${cierre.length} bloques que no marcaste como hechos`}. Si ${uno ? 'lo' : 'los'} hiciste, puedes deshacerlo en Tu día.`);
    }
  }
  return { frases, entregas: delDia.length };
}

// Answer to "¿qué entregas tengo?": the next `dias` days
export function guionEntregas(data: PlannerData, plan: Plan, ahoraLocal: string, dias = 7): string[] {
  const hoy = ahoraLocal.slice(0, 10);
  const limite = addMinutesLocal(ahoraLocal, dias * 24 * 60);
  const entregas = pendientes(data, ahoraLocal).filter(({ vence }) => vence <= limite);
  if (!entregas.length) return [`No tienes entregas en los próximos ${dias} días.`];
  const proyeccion = plan.proyeccion || plan.bloques;
  const lista = entregas.slice(0, MAX_LISTA).map(({ t, vence }) => {
    const horas = proyeccion.filter(b => b.task_uid === t.uid && blockStart(b) >= ahoraLocal && blockEnd(b) <= vence)
      .reduce((n, b) => n + minutes(b.fin_local) - minutes(b.inicio_local), 0) / 60;
    return `${t.titulo}, ${cuandoHablado(vence, hoy)}${horas > 0 ? `, con ${duracionHablada(horas)} de trabajo planificado` : ''}`;
  });
  const mas = entregas.length > MAX_LISTA ? `, y ${cuantas(entregas.length - MAX_LISTA, 'más', 'más')}` : '';
  return [`Entregas en los próximos ${dias} días: ${entregas.length === 1 ? 'solo una' : entregas.length}. ${enumerar(lista)}${mas}.`];
}


// Short titles for speech: "[GIG302F] Praktika 2: Herentzia eta polimorfismoa" → "Praktika 2"
function tituloCorto(titulo: string): string {
  const sin = titulo.replace(/^\[[^\]]+\]\s*/, '');
  const antes = sin.split(/[:(]/)[0].trim();
  const base = antes.length >= 4 ? antes : sin;
  const palabras = base.split(/\s+/);
  return palabras.length > 6 ? `${palabras.slice(0, 6).join(' ')}…` : base;
}

// Short spoken summary of a day: at most 4 sentences (agenda, study, deliverables, one urgent warning).
// The full one (guionDelDia) is only read when the user asks for the detail.
export function guionBreve({ data, plan, tareas, ahoraLocal, fecha }: GuionInput): Guion {
  const hoy = ahoraLocal.slice(0, 10), hora = ahoraLocal.slice(11, 16), min = minutes(hora);
  const dia = fecha || hoy, esHoy = dia === hoy;
  const desde = esHoy ? ahoraLocal : `${dia}T00:00`;
  const nombre = esHoy ? 'Hoy' : dia === addDays(hoy, 1) ? 'Mañana' : `El ${diaSemana(dia)}`;
  const frases: string[] = [];

  const fijos = [
    ...expandEventos(data.eventos, dia, dia).filter(b => blockEnd(b) > desde).map(b => ({ inicio: b.inicio_local, titulo: b.titulo })),
    ...tareas.filter(t => t.date === dia && !t.completed && t.time && `${dia}T${t.endTime || t.time}` > desde)
      .map(t => ({ inicio: t.time.slice(0, 5), titulo: t.title })),
  ].sort((a, b) => a.inicio.localeCompare(b.inicio))
    .filter((f, i, all) => i === 0 || f.inicio !== all[i - 1].inicio || f.titulo.toLowerCase() !== all[i - 1].titulo.toLowerCase());
  if (fijos.length) {
    const lista = fijos.slice(0, 2).map(f => `${esHoy && f.inicio <= hora ? 'ahora' : `a ${horaHablada(f.inicio)}`}, ${tituloCorto(f.titulo)}`);
    const resto = fijos.length - lista.length;
    const partes = resto > 0 ? [...lista, resto === 1 ? 'una más' : `${resto} más`] : lista;
    frases.push(`${nombre} ${esHoy ? (fijos.length === 1 ? 'te queda' : 'te quedan') : 'tienes'} ${cuantas(fijos.length, 'cosa', 'cosas')}: ${enumerar(partes)}.`);
  } else {
    frases.push(`${nombre} no ${esHoy ? 'te queda' : 'tienes'} nada fijo.`);
  }

  const bloques = plan.bloques.filter(b => b.fecha === dia && b.task_uid && blockEnd(b) > desde)
    .sort((a, b) => a.inicio_local.localeCompare(b.inicio_local));
  if (bloques.length) {
    const horas = bloques.reduce((n, b) => n + minutes(b.fin_local) - Math.max(minutes(b.inicio_local), esHoy && blockStart(b) < ahoraLocal ? min : 0), 0) / 60;
    const primero = bloques[0];
    const cuando = esHoy && blockStart(primero) <= ahoraLocal ? 'ahora' : `a ${horaHablada(primero.inicio_local)}`;
    frases.push(`Estudio: ${duracionHablada(horas)}, empezando ${cuando} con ${tituloCorto(primero.titulo)}.`);
  }

  const proximas = pendientes(data, ahoraLocal);
  const delDia = proximas.filter(({ vence }) => vence.slice(0, 10) === dia);
  if (delDia.length) {
    const lista = delDia.slice(0, 2).map(({ t }) => tituloCorto(t.titulo));
    frases.push(`${delDia.length === 1 ? 'Vence' : `Vencen ${delDia.length}:`} ${enumerar(lista).replace(/; y /, ' y ')}${delDia.length > 2 ? ' y más' : ''}.`);
  } else {
    const siguiente = proximas.find(({ vence }) => vence.slice(0, 10) > dia);
    if (siguiente) frases.push(`Próxima entrega: ${tituloCorto(siguiente.t.titulo)}, ${cuandoHablado(siguiente.vence, hoy)}.`);
  }

  if (esHoy) {
    const urgente = plan.en_riesgo.find(r => {
      const vence = proximas.find(p => p.t.uid === r.task_uid)?.vence;
      return vence && vence.slice(0, 10) <= addDays(hoy, 1);
    });
    if (urgente) frases.push(`Ojo: ${tituloCorto(urgente.titulo)} va justa.`);
  }
  return { frases: frases.slice(0, 4), entregas: delDia.length };
}
