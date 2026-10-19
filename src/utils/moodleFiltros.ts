// Which Moodle deliverables are not worth planning: quiz openings and the user's own filters.
// Pure functions shared by the server sync and the app.

export interface FiltrosMoodle {
  palabras: string[]; // case/accent-insensitive words or phrases in the title
  asignaturas: string[]; // subject codes discarded entirely
}

export const CLAVE_FILTROS_MOODLE = 'moodle_filtros';
export const FILTROS_VACIOS: FiltrosMoodle = { palabras: [], asignaturas: [] };

const normal = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// "Galdetegia 3(r)en hasiera-data" is the OPENING of a quiz; its real deadline is the "…itxiera-data" event
export function esAperturaCuestionario(titulo: string): boolean {
  return /\(r\)en\s+hasiera-data/i.test(titulo) || /\bse abre\s*:?\s*$/i.test(titulo) || /\bopens\s*:?\s*$/i.test(titulo);
}

// Accepts whatever is stored in parametros and returns clean, de-duplicated filters
export function normalizarFiltros(raw: unknown): FiltrosMoodle {
  const o = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const lista = (v: unknown, max: number) => [...new Set((Array.isArray(v) ? v : [])
    .filter((x): x is string => typeof x === 'string').map(x => x.trim().replace(/\s+/g, ' ').slice(0, 80)).filter(x => x.length >= 2))].slice(0, max);
  return { palabras: lista(o.palabras, 50), asignaturas: lista(o.asignaturas, 50) };
}

interface EntregaFiltrable { titulo: string; titulo_raw?: string | null; asignatura_codigo: string }

// Why a deliverable is discarded automatically, or null when it stays
export function motivoDescarte(e: EntregaFiltrable, filtros: FiltrosMoodle = FILTROS_VACIOS): string | null {
  if (esAperturaCuestionario(e.titulo_raw || '') || esAperturaCuestionario(e.titulo)) return 'apertura de cuestionario';
  if (filtros.asignaturas.includes(e.asignatura_codigo)) return `asignatura ${e.asignatura_codigo}`;
  const titulo = normal(`${e.titulo} ${e.titulo_raw || ''}`);
  const palabra = filtros.palabras.find(p => titulo.includes(normal(p)));
  return palabra ? `filtro «${palabra}»` : null;
}
