// Gym routines for Claude: an MCP server (Streamable HTTP, stateless JSON) so the user can connect their own Claude
// (Settings → Connectors → custom connector) and say "this week I train this, this and this". Claude reads and writes
// the routines through these tools; every routine is validated against src/types.ts GymRoutine, so the iOS app and the
// web always draw it with the same design. Pure: the database comes in as a `RutinasStore` (servidor/rutinasGym.ts).
import type { ExerciseItem, GymRoutine, WorkoutKind } from '../types';

export interface RutinasStore {
  listar(): Promise<GymRoutine[]>;
  guardar(rutina: GymRoutine, posicion?: number): Promise<void>;
  borrar(id: string): Promise<boolean>;
  reemplazar(rutinas: GymRoutine[]): Promise<void>;
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const TIPOS: WorkoutKind[] = ['gym', 'movilidad', 'descompresion'];
export const VERSIONES_MCP = ['2025-06-18', '2025-03-26', '2024-11-05'];

// --- Validation ------------------------------------------------------------------------------
export class RutinaInvalida extends Error {}

const texto = (v: unknown, campo: string, max: number, obligatorio = false): string | undefined => {
  if (v === undefined || v === null || v === '') {
    if (obligatorio) throw new RutinaInvalida(`Falta «${campo}».`);
    return undefined;
  }
  if (typeof v !== 'string') throw new RutinaInvalida(`«${campo}» tiene que ser texto.`);
  const t = v.trim();
  if (obligatorio && !t) throw new RutinaInvalida(`Falta «${campo}».`);
  if (t.length > max) throw new RutinaInvalida(`«${campo}» es demasiado largo (máximo ${max} caracteres).`);
  return t || undefined;
};

const entero = (v: unknown, campo: string, min: number, max: number): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new RutinaInvalida(`«${campo}» tiene que ser un número entero entre ${min} y ${max}.`);
  }
  return n;
};

const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function validarEjercicio(e: unknown, i: number, rutina: string): ExerciseItem {
  if (!e || typeof e !== 'object') throw new RutinaInvalida(`El ejercicio ${i + 1} de «${rutina}» no es válido.`);
  const x = e as Record<string, unknown>;
  const name = texto(x.name, `exercises[${i}].name`, 140, true)!;
  const setsReps = texto(x.setsReps, `exercises[${i}].setsReps`, 200, true)!;
  // The app counts the sets from the leading number ("4 series x 8 reps" → 4 circles to tick)
  if (!/^\d{1,2}\b/.test(setsReps)) {
    throw new RutinaInvalida(`«${name}»: setsReps tiene que empezar por el número de series, p. ej. "4 series x 8 reps" o "8 rondas de 30 s".`);
  }
  if (Number(setsReps.match(/^\d+/)![0]) > 12) throw new RutinaInvalida(`«${name}»: como mucho 12 series.`);
  const id = texto(x.id, `exercises[${i}].id`, 80) || `${slug(name) || 'ejercicio'}-${i + 1}`;
  if (!ID.test(id)) throw new RutinaInvalida(`«${name}»: el id solo puede llevar minúsculas, números y guiones.`);
  const ejercicio: ExerciseItem = {
    id,
    name,
    muscleGroup: texto(x.muscleGroup, `exercises[${i}].muscleGroup`, 200) || '',
    setsReps,
    weight: texto(x.weight, `exercises[${i}].weight`, 200) || '',
    transfer: texto(x.transfer, `exercises[${i}].transfer`, 400) || '',
    execution: texto(x.execution, `exercises[${i}].execution`, 1200) || '',
  };
  const opcionales: Partial<ExerciseItem> = {
    notes: texto(x.notes, `exercises[${i}].notes`, 600),
    restSeconds: entero(x.restSeconds, `exercises[${i}].restSeconds`, 0, 900),
    workSeconds: entero(x.workSeconds, `exercises[${i}].workSeconds`, 0, 3600),
    visualId: texto(x.visualId, `exercises[${i}].visualId`, 80),
    videoUrl: texto(x.videoUrl, `exercises[${i}].videoUrl`, 400),
  };
  for (const [k, v] of Object.entries(opcionales)) if (v !== undefined) (ejercicio as any)[k] = v;
  return ejercicio;
}

// Only the known fields survive (whatever else Claude sends is dropped), so the design can't break
export function validarRutina(r: unknown, ahora = new Date()): GymRoutine {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new RutinaInvalida('La rutina tiene que ser un objeto.');
  const x = r as Record<string, unknown>;
  const title = texto(x.title, 'title', 160, true)!;
  const id = texto(x.id, 'id', 80) || `rutina-${slug(title)}`;
  if (!ID.test(id)) throw new RutinaInvalida('El id de la rutina solo puede llevar minúsculas, números y guiones.');
  if (!Array.isArray(x.exercises) || x.exercises.length === 0) throw new RutinaInvalida(`«${title}» necesita al menos un ejercicio.`);
  if (x.exercises.length > 30) throw new RutinaInvalida(`«${title}»: como mucho 30 ejercicios.`);
  const exercises = x.exercises.map((e, i) => validarEjercicio(e, i, title));
  const ids = new Set<string>();
  for (const e of exercises) {
    if (ids.has(e.id)) throw new RutinaInvalida(`«${title}»: dos ejercicios tienen el mismo id «${e.id}».`);
    ids.add(e.id);
  }
  let targetDays: string[] | undefined;
  if (x.targetDays !== undefined) {
    if (!Array.isArray(x.targetDays)) throw new RutinaInvalida('targetDays tiene que ser una lista de días.');
    targetDays = x.targetDays.map(d => {
      const dia = DIAS.find(n => n.toLowerCase() === String(d).trim().toLowerCase().replace('miercoles', 'miércoles').replace('sabado', 'sábado'));
      if (!dia) throw new RutinaInvalida(`«${d}» no es un día. Usa: ${DIAS.join(', ')}.`);
      return dia;
    });
  }
  let warmup: string[] | undefined;
  if (x.warmup !== undefined) {
    if (!Array.isArray(x.warmup) || x.warmup.some(l => typeof l !== 'string')) throw new RutinaInvalida('warmup tiene que ser una lista de textos.');
    warmup = (x.warmup as string[]).map(l => l.trim()).filter(Boolean).slice(0, 20);
    if (warmup.some(l => l.length > 600)) throw new RutinaInvalida('Cada línea de warmup puede tener como mucho 600 caracteres.');
  }
  const kind = x.kind === undefined ? undefined : String(x.kind);
  if (kind !== undefined && !TIPOS.includes(kind as WorkoutKind)) throw new RutinaInvalida(`kind tiene que ser uno de: ${TIPOS.join(', ')}.`);

  const rutina: GymRoutine = { id, title, exercises, type: 'workout_session', updatedAt: ahora.toISOString() };
  const opcionales: Partial<GymRoutine> = {
    subtitle: texto(x.subtitle, 'subtitle', 300),
    targetDays,
    estimatedMinutes: entero(x.estimatedMinutes, 'estimatedMinutes', 1, 300),
    focus: texto(x.focus, 'focus', 200),
    warmup: warmup?.length ? warmup : undefined,
    kind: kind as WorkoutKind | undefined,
    tabLabel: texto(x.tabLabel, 'tabLabel', 30),
  };
  for (const [k, v] of Object.entries(opcionales)) if (v !== undefined) (rutina as any)[k] = v;
  return rutina;
}

// --- Tools ----------------------------------------------------------------------------------
const EJERCICIO_SCHEMA = {
  type: 'object',
  required: ['name', 'setsReps'],
  properties: {
    id: { type: 'string', description: 'Identificador estable del ejercicio (minúsculas y guiones). Mantenlo igual al editar: el progreso de series de la app va ligado a él.' },
    name: { type: 'string', description: 'Nombre. En bloques de contraste usa el prefijo del bloque: "A1. Sentadilla Trasera con Barra", "A2. Saltos al Cajón", "B. Hip Thrust…".' },
    muscleGroup: { type: 'string', description: 'Músculos que trabaja.' },
    setsReps: { type: 'string', description: 'Empieza SIEMPRE por el número de series (la app dibuja un círculo por serie): "4 series x 3 reps", "3 series x 30 s", "8 rondas de [30 s sprint + 60 s suave]". Máximo 12.' },
    weight: { type: 'string', description: 'Carga: "115 - 120 kg", "Peso corporal", "RPE 8"…' },
    execution: { type: 'string', description: 'Cómo se hace (técnica, tempo).' },
    transfer: { type: 'string', description: 'Para qué sirve en el deporte (p. ej. karate).' },
    restSeconds: { type: 'integer', minimum: 0, maximum: 900, description: 'Descanso tras cada serie, en segundos. Lanza la cuenta atrás con aviso en la app.' },
    workSeconds: { type: 'integer', minimum: 0, maximum: 3600, description: 'Duración de cada serie si va por tiempo (isométricos, estiramientos).' },
    notes: { type: 'string' },
    visualId: { type: 'string', description: 'Animación del visor 3D de la web, si existe. Déjalo sin poner si no lo sabes.' },
    videoUrl: { type: 'string' },
  },
};

const RUTINA_SCHEMA = {
  type: 'object',
  required: ['title', 'exercises'],
  properties: {
    id: { type: 'string', description: 'Identificador estable (minúsculas y guiones), p. ej. "rutina-lunes-pierna". Usa el mismo id para modificar una rutina existente.' },
    title: { type: 'string', description: 'Formato "DÍA: Nombre", p. ej. "LUNES: Contraste de Pierna + Capacidad Láctica". Lo de antes de ":" es la pestaña de la app.' },
    subtitle: { type: 'string', description: 'Una línea: fase, días y zonas. P. ej. "Fase 2 · Contraste A1+A2 de pierna".' },
    targetDays: { type: 'array', items: { type: 'string', enum: DIAS }, description: 'Días en que toca. La app abre sola la rutina del día.' },
    estimatedMinutes: { type: 'integer', minimum: 1, maximum: 300 },
    focus: { type: 'string', description: 'Objetivo en pocas palabras (sale en una etiqueta verde). Que no repita el título.' },
    warmup: { type: 'array', items: { type: 'string' }, description: 'Calentamiento: la PRIMERA línea es el título del bloque ("Calentamiento - 15 min"); las demás, los pasos.' },
    kind: { type: 'string', enum: TIPOS },
    tabLabel: { type: 'string', description: 'Texto corto de la pestaña si no quieres que sea lo de antes de ":" en el título.' },
    exercises: { type: 'array', minItems: 1, maxItems: 30, items: EJERCICIO_SCHEMA },
  },
};

export const HERRAMIENTAS = [
  {
    name: 'ver_rutinas',
    title: 'Ver las rutinas de gym',
    description: 'Devuelve todas las rutinas de gym del usuario, en orden y en JSON. Llámala siempre antes de modificar algo para conservar ids, días y formato.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'guardar_rutina',
    title: 'Crear o modificar una rutina',
    description: 'Crea una rutina o reemplaza la que tenga el mismo id. Se muestra en la app al momento, con el diseño de siempre.',
    inputSchema: {
      type: 'object',
      required: ['rutina'],
      properties: {
        rutina: RUTINA_SCHEMA,
        posicion: { type: 'integer', minimum: 0, description: 'Posición en la lista (0 = primera). Si no se indica, conserva la suya o va al final.' },
      },
    },
  },
  {
    name: 'reemplazar_rutinas',
    title: 'Poner el plan de la semana',
    description: 'Sustituye TODAS las rutinas por esta lista, en este orden (las que no estén se borran). Para "esta semana entreno esto, esto y esto".',
    inputSchema: {
      type: 'object',
      required: ['rutinas'],
      properties: { rutinas: { type: 'array', minItems: 1, maxItems: 14, items: RUTINA_SCHEMA } },
    },
    annotations: { destructiveHint: true },
  },
  {
    name: 'borrar_rutina',
    title: 'Borrar una rutina',
    description: 'Borra la rutina con ese id.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    annotations: { destructiveHint: true },
  },
];

export const INSTRUCCIONES = 'Rutinas de gym de la app CalendarAsist. Antes de cambiar nada llama a ver_rutinas y respeta el formato: '
  + 'título "DÍA: Nombre", setsReps empezando por el número de series, descansos en restSeconds, calentamiento en warmup '
  + '(primera línea = título) y bloques de contraste con prefijos A1/A2/B. Conserva los ids de lo que no cambie.';

const resumen = (r: GymRoutine) => `«${r.title}» (${r.exercises.length} ejercicios${r.targetDays?.length ? `, ${r.targetDays.join(' y ')}` : ''})`;

export async function llamarHerramienta(store: RutinasStore, nombre: string, args: Record<string, unknown> = {}) {
  const ok = (text: string, extra?: unknown) => ({ content: [{ type: 'text', text }], ...(extra ? { structuredContent: extra } : {}) });
  const error = (text: string) => ({ content: [{ type: 'text', text }], isError: true });
  try {
    switch (nombre) {
      case 'ver_rutinas': {
        const rutinas = await store.listar();
        if (!rutinas.length) return ok('No hay rutinas todavía. Crea una con guardar_rutina.', { rutinas: [] });
        return ok(JSON.stringify(rutinas, null, 2), { rutinas });
      }
      case 'guardar_rutina': {
        const rutina = validarRutina(args.rutina);
        const posicion = entero(args.posicion, 'posicion', 0, 100);
        await store.guardar(rutina, posicion);
        return ok(`Guardada ${resumen(rutina)}. Ya aparece en la app.`, { rutina });
      }
      case 'reemplazar_rutinas': {
        if (!Array.isArray(args.rutinas) || !args.rutinas.length) return error('Pasa la lista de rutinas en «rutinas».');
        const rutinas = args.rutinas.map(r => validarRutina(r));
        const ids = new Set(rutinas.map(r => r.id));
        if (ids.size !== rutinas.length) return error('Hay dos rutinas con el mismo id.');
        await store.reemplazar(rutinas);
        return ok(`Plan actualizado con ${rutinas.length} rutinas:\n${rutinas.map(r => `· ${resumen(r)}`).join('\n')}`);
      }
      case 'borrar_rutina': {
        const id = texto(args.id, 'id', 80, true)!;
        return (await store.borrar(id)) ? ok(`Rutina «${id}» borrada.`) : error(`No hay ninguna rutina con id «${id}».`);
      }
      default:
        return error(`Herramienta desconocida: ${nombre}`);
    }
  } catch (err) {
    if (err instanceof RutinaInvalida) return error(err.message);
    throw err;
  }
}

// --- JSON-RPC (MCP) --------------------------------------------------------------------------
interface Peticion { jsonrpc?: string; id?: string | number | null; method?: string; params?: any }

// One message in, its answer out (null for notifications, which get no answer)
export async function atenderMcp(store: RutinasStore, msg: Peticion): Promise<Record<string, unknown> | null> {
  const responder = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id ?? null, result });
  const fallo = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fallo(-32600, 'Petición JSON-RPC no válida');
  if (msg.id === undefined) return null;
  switch (msg.method) {
    case 'initialize': {
      const pedida = String(msg.params?.protocolVersion || '');
      return responder({
        protocolVersion: VERSIONES_MCP.includes(pedida) ? pedida : VERSIONES_MCP[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'calendarasist-gym', title: 'CalendarAsist · Gym', version: '1.0.0' },
        instructions: INSTRUCCIONES,
      });
    }
    case 'ping':
      return responder({});
    case 'tools/list':
      return responder({ tools: HERRAMIENTAS });
    case 'tools/call':
      return responder(await llamarHerramienta(store, String(msg.params?.name || ''), msg.params?.arguments || {}));
    default:
      return fallo(-32601, `Método no soportado: ${msg.method}`);
  }
}
