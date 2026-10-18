// Understands what the user says to the voice assistant. Pure functions, no browser APIs, so it can be tested.
// "hoy de 11.30 a 13.30 voy a vender una aplicación a bares" → add a fixed activity; "¿y mañana?" → summary of that day.
import type { Evento } from '../planner/types';
import { addDays, timeString } from '../planner/time';

export type Comando =
  | { tipo: 'anadir'; fecha: string; inicio: string; fin: string; titulo: string; area: Evento['area']; finSupuesto: boolean }
  | { tipo: 'consulta'; fecha: string }
  | { tipo: 'entregas' }
  | { tipo: 'deshacer' }
  | { tipo: 'parar' }
  | { tipo: 'desconocido' };

const DIAS: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const NUMEROS: Record<string, string> = { una: '1', uno: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7',
  ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12' };
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// One time of day: "11", "11:30", "11.30", "11h", "11 y media", "9 menos cuarto", "7 de la tarde", "8 pm", "mediodía"
const FRANJA = '(?:\\s*(?:de|por|en)\\s+la\\s+(?:ma[nñ]ana|tarde|noche|madrugada)|\\s*(?:am|pm)\\b)';
const HORA = `(?:\\d{1,2}(?:[:.]\\d{2})?(?:\\s*h\\b)?(?:\\s+y\\s+(?:media|cuarto|\\d{1,2}))?(?:\\s+menos\\s+(?:cuarto|\\d{1,2}))?${FRANJA}?|mediod[ií]a|medianoche)`;
const ART = '(?:las?\\s+)?';
const RANGOS = [
  new RegExp(`\\b(?:de|desde)\\s+${ART}(${HORA})\\s+(?:a|hasta)\\s+${ART}(${HORA})`),
  new RegExp(`\\bentre\\s+${ART}(${HORA})\\s+y\\s+${ART}(${HORA})`),
];
const INICIO = new RegExp(`\\b(?:a|sobre|desde|hacia)\\s+(?:eso\\s+de\\s+)?${ART}(${HORA})|\\b(\\d{1,2}[:.]\\d{2})\\b`);
const FIN = new RegExp(`\\bhasta\\s+${ART}(${HORA})`);
const DURACION = /\b(?:durante\s+)?(?:(\d+)\s+horas?(\s+y\s+media)?|(\d+)\s+minutos|(media)\s+hora|hora\s+y\s+media|(1)\s+hora)\b/;

interface Hora { min: number; explicita: boolean }

function leerHora(texto: string): Hora | null {
  const t = sinTildes(texto.trim());
  if (t === 'mediodia') return { min: 12 * 60, explicita: true };
  if (t === 'medianoche') return { min: 23 * 60 + 59, explicita: true };
  const m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*h?(?:\s+y\s+(media|cuarto|\d{1,2}))?(?:\s+menos\s+(cuarto|\d{1,2}))?(?:\s*(?:de|por|en)\s+la\s+(manana|tarde|noche|madrugada)|\s*(am|pm))?$/);
  if (!m) return null;
  let h = Number(m[1]), min = Number(m[2] || 0);
  if (m[3]) min = m[3] === 'media' ? 30 : m[3] === 'cuarto' ? 15 : Number(m[3]);
  if (m[4]) { h -= 1; min = 60 - (m[4] === 'cuarto' ? 15 : Number(m[4])); }
  const franja = m[5] || m[6];
  if ((franja === 'tarde' || franja === 'pm') && h < 12) h += 12;
  if (franja === 'noche' && h >= 6 && h < 12) h += 12;
  if (h > 23 || min > 59 || h < 0) return null;
  return { min: h * 60 + min, explicita: Boolean(franja) || h >= 13 || h === 0 };
}

// "a las 7" without more context is 19:00: nobody plans the gym at 7 in the morning by voice without saying so
const tarde = (h: Hora) => (!h.explicita && h.min >= 60 && h.min < 8 * 60 ? h.min + 12 * 60 : h.min);

function leerFecha(texto: string, hoy: string): string | null {
  const t = sinTildes(texto);
  if (/\bpasado\s+manana\b/.test(t)) return addDays(hoy, 2);
  if (/\b(dia\s+siguiente|siguiente\s+dia)\b/.test(t)) return addDays(hoy, 1);
  if (/(?<!\bla\s)(?<!\besta\s)\bmanana\b/.test(t)) return addDays(hoy, 1);
  if (/\b(hoy|esta\s+(tarde|noche|manana))\b/.test(t)) return hoy;
  const dia = t.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  if (dia) {
    const actual = new Date(`${hoy}T12:00:00Z`).getUTCDay();
    let delta = (DIAS[dia[1]] - actual + 7) % 7;
    if (delta === 0 && /\b(que\s+viene|proximo)\b/.test(t)) delta = 7;
    return addDays(hoy, delta);
  }
  const num = t.match(/\b(?:el\s+)?dia\s+(\d{1,2})\b/);
  if (num) {
    const d = Number(num[1]);
    if (d < 1 || d > 31) return null;
    let fecha = `${hoy.slice(0, 8)}${String(d).padStart(2, '0')}`;
    if (fecha < hoy) {
      const [y, mo] = hoy.slice(0, 7).split('-').map(Number);
      fecha = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return Number.isFinite(Date.parse(`${fecha}T12:00:00Z`)) ? fecha : null;
  }
  return null;
}

export function area(texto: string): Evento['area'] {
  const t = sinTildes(texto.toLowerCase());
  if (/\b(gym|gimnasio|entren\w*|pesas|correr|running)\b/.test(t)) return 'gym';
  if (/\bkarate\b/.test(t)) return 'karate';
  if (/\bclase\s+particular\b/.test(t)) return 'clase_particular';
  if (/\b(trabaj\w*|vend\w*|venta\w*|reunion\w*|curro|cliente\w*|turno)\b/.test(t)) return 'trabajo';
  if (/\b(salgo|salir|calle|cena\w*|comida|quedo|quedada|amig\w*|fiesta|cumple\w*|paseo|pasear|cafe|copas?)\b/.test(t)) return 'social';
  return 'otro';
}

function titulo(resto: string, zona: Evento['area']): string {
  let t = ` ${resto} `.replace(/\s+/g, ' ');
  // Trailing orders: "…, añádelo como fijo", "y apúntalo en la agenda"
  t = t.replace(/\s(y\s)?(a[nñ][aá]de(lo|la|me)?|ap[uú]nta(lo|la|me)?|ponlo|gu[aá]rda(lo|la)?|m[eé]te(lo|la)?)\b.*$/, ' ');
  t = t.replace(/\s(como\s)?fij[oa]\s?$/, ' ').replace(/\s(en\s(el\s)?(calendario|la\sagenda|el\splan\w*))\s?$/, ' ');
  t = t.replace(/\s(por\s)?favor\s?$/, ' ');
  // Fillers at the start
  for (let i = 0; i < 4; i++) {
    t = ` ${t.trim()} `
      .replace(/^ (oye|vale|bueno|pues|hola|y|que|eh|a|de|el|la)\s/, ' ')
      .replace(/^ (a[nñ][aá]de(me)?|ap[uú]nta(me)?|pon(me)?|agenda|guarda|mete)\s(que\s)?/, ' ')
      .replace(/^ (me\s)?(voy|vamos|iremos|ir[eé])\sal\s/, ' ')
      .replace(/^ (me\s)?(voy|vamos|iremos|ir[eé])\sa\s(la\s|el\s)?/, ' ')
      .replace(/^ (tengo|tendr[eé])\s(que\s)?/, ' ')
      .replace(/^ (estar[eé]|estoy)\s(en\s)?/, ' ');
  }
  t = t.trim().replace(/^salgo\b/, 'salir').replace(/[\s,.;:]+$/, '').replace(/^[\s,.;:]+/, '');
  if (!t) return zona === 'gym' ? 'Gym' : zona === 'social' ? 'Salir' : zona === 'trabajo' ? 'Trabajo' : 'Actividad';
  if (/^(gym|gimnasio)$/.test(t)) return 'Gym';
  return (t[0].toUpperCase() + t.slice(1)).slice(0, 200);
}

// Spoken numbers that act as hours: "a las siete", "de nueve a once", "dos horas"
function numerosHablados(t: string): string {
  const w = Object.keys(NUMEROS).join('|');
  return t
    .replace(new RegExp(`\\b(a|de|desde|hasta|entre|y|sobre)\\s+(las?\\s+)?(${w})\\b(?!\\s+(?:aplicaci|cosa|vez|persona))`, 'g'),
      (_m, p: string, art = '', n: string) => `${p} ${art}${NUMEROS[n]}`)
    .replace(new RegExp(`\\b(${w})\\s+(horas?|minutos)\\b`, 'g'), (_m, n: string, u: string) => `${NUMEROS[n]} ${u}`);
}

export function interpretarComando(entrada: string, ahoraLocal: string): Comando {
  const hoy = ahoraLocal.slice(0, 10);
  const original = numerosHablados(entrada.toLowerCase().replace(/[¿?¡!"«»]/g, ' ').replace(/\s+/g, ' ').trim());
  const t = sinTildes(original);
  if (!t) return { tipo: 'desconocido' };
  if (/^(para|parar|calla(te)?|stop|silencio|basta)$/.test(t)) return { tipo: 'parar' };
  if (/\b(deshaz\w*|deshacer|borra(lo)?|quita(lo)?|cancela(lo)?|elimina(lo)?)\b/.test(t) && !/\d/.test(t)) return { tipo: 'deshacer' };

  let resto = original;
  let inicio: Hora | null = null, fin: Hora | null = null;
  for (const re of RANGOS) {
    const m = resto.match(re);
    if (m && leerHora(m[1]) && leerHora(m[2])) { inicio = leerHora(m[1]); fin = leerHora(m[2]); resto = resto.replace(m[0], ' '); break; }
  }
  if (!inicio) {
    const m = resto.match(INICIO);
    const h = m && leerHora(m[1] || m[2]);
    if (m && h) { inicio = h; resto = resto.replace(m[0], ' '); }
  }
  if (inicio && !fin) {
    const m = resto.match(FIN);
    const h = m && leerHora(m[1]);
    if (m && h) { fin = h; resto = resto.replace(m[0], ' '); }
  }
  let duracion = 0;
  const d = resto.match(DURACION);
  if (d) {
    duracion = d[1] ? Number(d[1]) * 60 + (d[2] ? 30 : 0) : d[3] ? Number(d[3]) : d[4] ? 30 : d[5] ? 60 : 90;
    resto = resto.replace(d[0], ' ');
  }

  const fecha = leerFecha(resto, hoy);
  const pregunta = /^(y|que|como|cuando|cuanto|cuantas|dime|cuentame|resume\w*|lee\w*|hay|tengo algo|algo)\b/.test(t)
    || /\b(que tengo|que hay|que me queda|mas sobre|dime mas|cuentame mas)\b/.test(t);
  const sobreEntregas = /\b(entregas?|deberes|examen(es)?|tareas pendientes)\b/.test(t);

  if (inicio && !pregunta) {
    const zona = area(sinTildes(resto));
    const ini = tarde(inicio);
    let fn = fin ? (fin.explicita ? fin.min : tarde(fin)) : 0;
    if (fin && fn <= ini && !fin.explicita && fn + 12 * 60 > ini && fn + 12 * 60 < 24 * 60) fn += 12 * 60;
    const finSupuesto = !fin;
    if (!fin) fn = Math.min(ini + (duracion || (zona === 'gym' ? 90 : 60)), 23 * 60 + 59);
    if (fn <= ini) return { tipo: 'desconocido' };
    // Strip date words from the title once they have been read
    const sinFecha = resto
      .replace(/\bpasado\s+ma[nñ]ana\b/g, ' ')
      .replace(/\b(hoy|esta\s+(tarde|noche|ma[nñ]ana))\b/g, ' ')
      .replace(/(?<!\bla\s)\bma[nñ]ana\b/g, ' ')
      .replace(/\b(el\s+)?(pr[oó]ximo\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(\s+que\s+viene)?\b/g, ' ')
      .replace(/\b(el\s+)?d[ií]a\s+\d{1,2}\b/g, ' ')
      .replace(/\b(por|de|en)\s+la\s+(tarde|noche|ma[nñ]ana)\b/g, ' ')
      .replace(/\ba\s+esta\s+hora\b/g, ' ');
    return { tipo: 'anadir', fecha: fecha || hoy, inicio: timeString(ini), fin: timeString(fn), titulo: titulo(sinFecha, zona), area: zona, finSupuesto };
  }
  if (sobreEntregas && !fecha) return { tipo: 'entregas' };
  if (fecha || pregunta) return { tipo: 'consulta', fecha: fecha || hoy };
  return { tipo: 'desconocido' };
}
