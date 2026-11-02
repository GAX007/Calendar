// Biomechanics of each exercise for the 3D viewer: keyframed poses of the mannequin,
// muscles lit as primary (red/orange) or stabilizer (cyan) and the guides drawn over it.
// Angles in degrees. The mannequin faces +Z, its left is +X. Conventions of each joint:
//   rootPitch + leans forward (-90 = lying face up, 90 = face down) · rootYaw + turns left · rootRoll + tilts right
//   spine/chest Flex + forward, Side + to the left, Twist + to the left · headFlex + chin down, headTurn + left
//   hip Flex + thigh forward, Abd + outward, Rot + external · knee + bent · ankle + toes up
//   sh Flex + arm forward/up (180 overhead), Abd + outward (90 = cross), Rot + external · el + bent
// A key with * applies to both sides (hip*Flex = hipLFlex and hipRFlex).

export type Pose = Record<string, number>;

export type PuntoId =
  | 'pelvis' | 'sacro' | 'lumbar' | 'ombligo' | 'esternon' | 'pecho' | 'escapulas' | 'cuello' | 'cabeza' | 'frente' | 'nuca'
  | 'hombroL' | 'hombroR' | 'codoL' | 'codoR' | 'manoL' | 'manoR' | 'manos'
  | 'caderaL' | 'caderaR' | 'rodillaL' | 'rodillaR' | 'rodillas' | 'tobilloL' | 'tobilloR'
  | 'talonL' | 'talonR' | 'punteraL' | 'punteraR' | 'metatarsoL' | 'metatarsoR' | 'mediopieL' | 'mediopieR' | 'pies';

export type MusculoId =
  | 'cuadriceps' | 'isquios' | 'aductores' | 'gluteo' | 'gluteoMedio' | 'rotadores' | 'capsulaCadera' | 'psoas'
  | 'gemelos' | 'tibial' | 'abdomen' | 'oblicuos' | 'lumbares' | 'cuadradoLumbar' | 'dorsal' | 'romboides' | 'trapecio'
  | 'pectoral' | 'serrato' | 'deltoidesAnt' | 'deltoidesPost' | 'triceps' | 'biceps' | 'antebrazo'
  | 'cuelloAnt' | 'cuelloPost' | 'cuelloLat' | 'toracica' | 'rodillaAncla';

// 'gluteo' = both sides, 'gluteo.L' = only the left one
export type Musculo = MusculoId | `${MusculoId}.L` | `${MusculoId}.R`;

export type Ease = 'lineal' | 'lento' | 'explosivo' | 'suave' | 'frenada';

export interface ObjetivoMano {
  mano: 'L' | 'R';
  a: PuntoId;
  off?: [number, number, number];
  codo?: [number, number, number];
  mundo?: boolean;
}

export interface Keyframe {
  pose: Pose;
  dur: number; // seconds to reach this pose from the previous one
  ease?: Ease;
  hold?: number; // seconds held once reached
  label?: string; // phase shown while moving into this pose
  holdLabel?: string; // phase shown while holding it
  esfuerzo?: number | Partial<Record<Musculo | '*', number>>; // 0..1, intensity of the primary muscles
  offset?: [number, number, number]; // displacement after placing on the floor (jumps)
  manos?: ObjetivoMano[]; // hands placed on body points (bar on the back, forehead…)
}

export type Color = 'fuerza' | 'guia' | 'cian' | 'rojo' | 'blanco';

export type Overlay =
  | { tipo: 'flecha'; en: PuntoId; dir: [number, number, number]; largo?: number; color?: Color; fases?: number[]; minEsfuerzo?: number; hacia?: boolean }
  | { tipo: 'linea'; puntos: PuntoId[]; color?: Color; fases?: number[] }
  | { tipo: 'plomada'; en: PuntoId; color?: Color; fases?: number[] }
  | { tipo: 'estela'; en: PuntoId; color?: Color }
  | { tipo: 'anillo'; en: PuntoId; color?: Color; fases?: number[] }
  | { tipo: 'giro'; en: PuntoId; sentido: 1 | -1; fases?: number[] }
  | { tipo: 'particulas'; recorrido: PuntoId[] }
  | { tipo: 'pedales' };

export type Prop =
  | { tipo: 'barra'; discos?: number }
  | { tipo: 'mancuernas' }
  | { tipo: 'landmine'; ancla: [number, number, number]; agarre: 'manos' | 'manoR' }
  | { tipo: 'banco'; pos: [number, number, number]; tam: [number, number, number] }
  | { tipo: 'cajon'; pos: [number, number, number]; tam: [number, number, number] }
  | { tipo: 'dominadas'; y: number }
  | { tipo: 'bici' }
  | { tipo: 'pared'; z: number }
  | { tipo: 'polea'; ancla: [number, number, number] }
  | { tipo: 'esterilla' };

export interface EjercicioVisual {
  id: string;
  titulo: string;
  bloque: 'gym' | 'movilidad' | 'descompresion';
  camara: { pos: [number, number, number]; mira: [number, number, number] };
  ancla?: PuntoId | null;
  en?: [number, number, number];
  suelo?: boolean;
  contacto?: PuntoId[];
  props?: Prop[];
  primarios: Musculo[];
  estabilizadores: Musculo[];
  keyframes: Keyframe[];
  overlays?: Overlay[];
  respiracion?: boolean;
  alerta?: string;
  bici?: { sprint: number; suave: number }; // seconds of each part of the loop
  videoUrl?: string;
  progreso?: boolean; // progress bar of each held phase (isometrics)
}

// Expands keys with * to both sides
export function sym(o: Pose): Pose {
  const out: Pose = {};
  for (const [k, v] of Object.entries(o)) {
    if (k.includes('*')) {
      out[k.replace('*', 'L')] = v;
      out[k.replace('*', 'R')] = v;
    } else out[k] = v;
  }
  return out;
}

const P = (...partes: Pose[]): Pose => Object.assign({}, ...partes.map(sym));

// Linear mix of two poses (intermediate keyframes of a fast movement)
export function mezcla(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * t;
  return out;
}

const CAM_LADO: EjercicioVisual['camara'] = { pos: [3, 1.3, 1.4], mira: [0, 0.8, 0] };
const CAM_34: EjercicioVisual['camara'] = { pos: [2.3, 1.4, 2.5], mira: [0, 0.8, 0] };
const CAM_SUELO: EjercicioVisual['camara'] = { pos: [2.2, 1.5, 2.2], mira: [0, 0.35, 0] };

const DE_PIE = P({ 'hip*Abd': 5 });
const BRAZOS_COLGANDO = P({ 'sh*Abd': 8, 'el*': 8 });

// ---------------------------------------------------------------- LUNES

const sentadillaArriba = P(DE_PIE, { 'hip*Abd': 9, 'hip*Rot': 12, rootPitch: 4, headFlex: 0 });
const sentadillaAbajo = P({ rootPitch: 42, spineFlex: 0, headFlex: -38, 'hip*Flex': 127, 'hip*Abd': 16, 'hip*Rot': 20, 'knee*': 122, 'ankle*': 36 });
const barraEnTrapecio: ObjetivoMano[] = [
  { mano: 'L', a: 'escapulas', off: [0.36, 0.1, -0.02], codo: [0.6, -0.8, -0.3] },
  { mano: 'R', a: 'escapulas', off: [-0.36, 0.1, -0.02], codo: [-0.6, -0.8, -0.3] },
];

const backSquat: EjercicioVisual = {
  id: 'back-squat',
  titulo: 'Sentadilla trasera con barra',
  bloque: 'gym',
  camara: CAM_34,
  ancla: 'pies',
  props: [{ tipo: 'barra', discos: 4 }],
  primarios: ['cuadriceps', 'gluteo'],
  estabilizadores: ['abdomen', 'lumbares', 'oblicuos'],
  keyframes: [
    { pose: sentadillaArriba, dur: 0.4, ease: 'explosivo', hold: 0.7, label: 'Concéntrica explosiva · 0,4 s', holdLabel: 'Bloqueo arriba', esfuerzo: 1, manos: barraEnTrapecio },
    { pose: sentadillaArriba, dur: 0.01, esfuerzo: 0.25, manos: barraEnTrapecio },
    { pose: sentadillaAbajo, dur: 2, ease: 'lento', hold: 0.1, label: 'Excéntrica controlada · 2 s', holdLabel: 'Rompe el paralelo', esfuerzo: 0.4, manos: barraEnTrapecio },
  ],
  overlays: [
    { tipo: 'plomada', en: 'manos', color: 'guia' },
    { tipo: 'linea', puntos: ['rodillaL', 'punteraL'], color: 'guia' },
    { tipo: 'linea', puntos: ['rodillaR', 'punteraR'], color: 'guia' },
    { tipo: 'flecha', en: 'rodillaL', dir: [1, 0, 0.25], largo: 0.25, color: 'fuerza' },
    { tipo: 'flecha', en: 'rodillaR', dir: [-1, 0, 0.25], largo: 0.25, color: 'fuerza' },
    { tipo: 'flecha', en: 'mediopieL', dir: [0, 1, 0], largo: 0.35, color: 'fuerza', minEsfuerzo: 0.7 },
    { tipo: 'flecha', en: 'mediopieR', dir: [0, 1, 0], largo: 0.35, color: 'fuerza', minEsfuerzo: 0.7 },
  ],
};

const saltoDip = P({ rootPitch: 32, headFlex: -25, 'hip*Flex': 68, 'knee*': 72, 'ankle*': 30, 'sh*Flex': -55, 'el*': 10, 'hip*Abd': 6 });
const saltoDespegue = P({ rootPitch: 2, 'ankle*': -40, 'sh*Flex': 165, 'el*': 5, 'hip*Abd': 5 });
const saltoVuelo = P({ rootPitch: 22, headFlex: -15, 'hip*Flex': 85, 'knee*': 95, 'ankle*': 10, 'sh*Flex': 70, 'el*': 20, 'hip*Abd': 8 });
const saltoAterriza = P({ rootPitch: 34, headFlex: -25, 'hip*Flex': 80, 'knee*': 88, 'ankle*': 32, 'sh*Flex': 45, 'el*': 25, 'hip*Abd': 8 });

const boxJump: EjercicioVisual = {
  id: 'box-jump',
  titulo: 'Saltos verticales / al cajón',
  bloque: 'gym',
  camara: { pos: [3.2, 1.5, 1.6], mira: [0, 0.8, 0.35] },
  ancla: 'pies',
  en: [0, 0, -0.25],
  props: [{ tipo: 'cajon', pos: [0, 0.25, 0.42], tam: [0.6, 0.5, 0.5] }],
  primarios: ['gemelos', 'cuadriceps', 'gluteo'],
  estabilizadores: ['abdomen'],
  keyframes: [
    { pose: DE_PIE, dur: 0.6, ease: 'suave', hold: 0.6, label: 'Vuelve al suelo', holdLabel: 'Preparado', esfuerzo: 0.1 },
    { pose: saltoDip, dur: 0.3, ease: 'frenada', label: 'Contramovimiento rápido · 0,3 s', esfuerzo: 0.45 },
    { pose: saltoDespegue, dur: 0.14, ease: 'explosivo', label: 'Triple extensión', esfuerzo: 1, offset: [0, 0.04, 0.08] },
    { pose: saltoVuelo, dur: 0.24, ease: 'frenada', label: 'Vuelo', esfuerzo: 0.3, offset: [0, 0.6, 0.38] },
    { pose: saltoAterriza, dur: 0.18, ease: 'frenada', hold: 0.45, label: 'Aterrizaje', holdLabel: 'Amortigua sin ruido', esfuerzo: 0.5, offset: [0, 0.5, 0.62] },
    { pose: DE_PIE, dur: 0.5, ease: 'suave', hold: 0.3, label: 'De pie en el cajón', esfuerzo: 0.1, offset: [0, 0.5, 0.62] },
  ],
  overlays: [
    { tipo: 'flecha', en: 'metatarsoL', dir: [0, 1, 0.15], largo: 0.45, color: 'fuerza', fases: [2] },
    { tipo: 'flecha', en: 'metatarsoR', dir: [0, 1, 0.15], largo: 0.45, color: 'fuerza', fases: [2] },
    { tipo: 'anillo', en: 'rodillaL', color: 'cian', fases: [4] },
    { tipo: 'anillo', en: 'rodillaR', color: 'cian', fases: [4] },
  ],
};

const hipArriba = P({ rootPitch: -88, headFlex: 32, 'hip*Flex': 4, 'knee*': 88, 'ankle*': 0, 'hip*Abd': 8 });
const hipAbajo = P({ rootPitch: -59, headFlex: 26, 'hip*Flex': 71, 'knee*': 133, 'ankle*': 3, 'hip*Abd': 8 });
const barraEnCadera: ObjetivoMano[] = [
  { mano: 'L', a: 'caderaL', off: [0.17, 0.04, 0.13], codo: [1, 0, 0.2] },
  { mano: 'R', a: 'caderaR', off: [-0.17, 0.04, 0.13], codo: [-1, 0, 0.2] },
];

const hipThrust: EjercicioVisual = {
  id: 'hip-thrust',
  titulo: 'Hip thrust con barra',
  bloque: 'gym',
  camara: { pos: [2.3, 1.5, 2.1], mira: [0, 0.4, 0] },
  ancla: 'pies',
  en: [0, 0, 0.55],
  props: [{ tipo: 'barra', discos: 3 }, { tipo: 'banco', pos: [0, 0.21, -0.62], tam: [1.0, 0.42, 0.42] }],
  primarios: ['gluteo'],
  estabilizadores: ['abdomen', 'isquios'],
  keyframes: [
    { pose: hipArriba, dur: 0.4, ease: 'explosivo', hold: 1, label: 'Empuje explosivo de cadera · 0,4 s', holdLabel: 'Pausa isométrica 1 s · costillas cerradas', esfuerzo: 1, manos: barraEnCadera },
    { pose: hipAbajo, dur: 2, ease: 'lento', hold: 0.15, label: 'Bajada controlada · 2 s', esfuerzo: 0.3, manos: barraEnCadera },
  ],
  overlays: [
    { tipo: 'linea', puntos: ['hombroR', 'caderaR', 'rodillaR'], color: 'guia', fases: [0] },
    { tipo: 'flecha', en: 'talonL', dir: [0, -1, 0], largo: 0.25, color: 'fuerza', minEsfuerzo: 0.6 },
    { tipo: 'flecha', en: 'talonR', dir: [0, -1, 0], largo: 0.25, color: 'fuerza', minEsfuerzo: 0.6 },
  ],
};

const manosJuntas = (off: [number, number, number]): ObjetivoMano[] => [
  { mano: 'L', a: 'esternon', off: [off[0] + 0.04, off[1], off[2]] },
  { mano: 'R', a: 'esternon', off: [off[0] - 0.04, off[1], off[2]] },
];
const atleta = P({ rootPitch: 14, headFlex: -10, 'hip*Flex': 26, 'knee*': 28, 'ankle*': 14, 'hip*Abd': 14 });
const landmineDer = P(atleta, { rootYaw: -38, chestTwist: -22, spineTwist: -10, 'hip*Rot': 0, hipLRot: -25, hipRRot: 25 });
const landmineIzq = P(atleta, { rootYaw: 38, chestTwist: 22, spineTwist: 10, hipLRot: 25, hipRRot: -25 });
const landmineCentro = P(atleta, { rootPitch: 8, 'knee*': 18, 'hip*Flex': 16 });

const landmineRotation: EjercicioVisual = {
  id: 'landmine-rotation',
  titulo: 'Rotación explosiva en landmine',
  bloque: 'gym',
  camara: { pos: [3.1, 1.7, 1.5], mira: [0, 0.8, 0.5] },
  ancla: 'pies',
  props: [{ tipo: 'landmine', ancla: [0, 0.03, 1.9], agarre: 'manos' }],
  primarios: ['oblicuos', 'gluteoMedio'],
  estabilizadores: ['deltoidesAnt', 'abdomen'],
  keyframes: [
    { pose: landmineDer, dur: 0.6, ease: 'lento', hold: 0.4, label: 'Vuelve controlado', holdLabel: 'Barra en la cadera derecha', esfuerzo: 0.3, manos: manosJuntas([-0.06, -0.42, 0.3]) },
    { pose: landmineCentro, dur: 0.2, ease: 'lineal', label: 'Giro violento de cadera', esfuerzo: 1, manos: manosJuntas([0, 0.12, 0.5]) },
    { pose: landmineIzq, dur: 0.22, ease: 'frenada', hold: 0.5, label: 'Giro violento de cadera', holdLabel: 'Frena en seco', esfuerzo: 1, manos: manosJuntas([0.06, -0.42, 0.3]) },
    { pose: landmineCentro, dur: 0.6, ease: 'lento', label: 'Vuelve controlado', esfuerzo: 0.3, manos: manosJuntas([0, 0.12, 0.5]) },
  ],
  overlays: [
    { tipo: 'giro', en: 'pelvis', sentido: 1, fases: [1, 2] },
    { tipo: 'anillo', en: 'metatarsoR', color: 'fuerza', fases: [1, 2] },
    { tipo: 'anillo', en: 'metatarsoL', color: 'fuerza', fases: [0] },
    { tipo: 'estela', en: 'manos', color: 'blanco' },
  ],
};

const bikeHiit: EjercicioVisual = {
  id: 'bike-hiit',
  titulo: 'Bici estática · HIIT láctico',
  bloque: 'gym',
  camara: { pos: [3.3, 1.4, 0.7], mira: [0, 0.8, 0.15] },
  ancla: 'pelvis',
  en: [0, 0.98, 0],
  suelo: false,
  props: [{ tipo: 'bici' }],
  primarios: ['cuadriceps', 'gluteo', 'gemelos'],
  estabilizadores: ['abdomen', 'lumbares'],
  keyframes: [
    {
      pose: P({ rootPitch: 45, headFlex: -40, 'sh*Flex': 55, 'sh*Abd': 6, 'el*': 25 }),
      dur: 1,
      manos: [
        { mano: 'L', a: 'pelvis', off: [0.2, 0.36, 0.55] },
        { mano: 'R', a: 'pelvis', off: [-0.2, 0.36, 0.55] },
      ],
    },
  ],
  bici: { sprint: 3, suave: 4 },
  overlays: [{ tipo: 'pedales' }],
  alerta: 'Últimos 4 min: enfriamiento obligatorio a nivel 1 · retorno venoso',
};

// ---------------------------------------------------------------- MIÉRCOLES

const tumbadoBanco = P({ rootPitch: -90, headFlex: 0, 'hip*Flex': -18, 'hip*Abd': 22, 'knee*': 84, 'ankle*': 6 });
const barraArriba: ObjetivoMano[] = [
  { mano: 'L', a: 'hombroL', off: [0.12, -0.02, 0.6], codo: [1, 0, 1] },
  { mano: 'R', a: 'hombroR', off: [-0.12, -0.02, 0.6], codo: [-1, 0, 1] },
];
const barraEnPecho: ObjetivoMano[] = [
  { mano: 'L', a: 'esternon', off: [0.3, -0.06, 0.08], codo: [0.75, -0.55, -0.4] },
  { mano: 'R', a: 'esternon', off: [-0.3, -0.06, 0.08], codo: [-0.75, -0.55, -0.4] },
];

const benchPress: EjercicioVisual = {
  id: 'bench-press',
  titulo: 'Press de banca con barra',
  bloque: 'gym',
  camara: { pos: [2.2, 1.6, 1.2], mira: [0, 0.6, -0.2] },
  ancla: 'pelvis',
  en: [0, 0.62, 0],
  suelo: false,
  props: [{ tipo: 'barra', discos: 3 }, { tipo: 'banco', pos: [0, 0.25, -0.38], tam: [0.32, 0.5, 1.2] }],
  primarios: ['pectoral', 'deltoidesAnt', 'triceps'],
  estabilizadores: ['romboides', 'gluteo'],
  keyframes: [
    { pose: tumbadoBanco, dur: 0.4, ease: 'explosivo', hold: 0.5, label: 'Empuje explosivo · 0,4 s', holdLabel: 'Bloqueo sobre los hombros', esfuerzo: 1, manos: barraArriba },
    { pose: tumbadoBanco, dur: 0.01, esfuerzo: 0.3, manos: barraArriba },
    { pose: tumbadoBanco, dur: 2, ease: 'lento', hold: 0.1, label: 'Bajada a la base del esternón · 2 s', esfuerzo: 0.45, manos: barraEnPecho },
  ],
  overlays: [
    { tipo: 'linea', puntos: ['codoR', 'hombroR', 'caderaR'], color: 'guia', fases: [2] },
    { tipo: 'flecha', en: 'metatarsoL', dir: [0, -0.7, 0.7], largo: 0.3, color: 'fuerza', minEsfuerzo: 0.6 },
    { tipo: 'flecha', en: 'metatarsoR', dir: [0, -0.7, 0.7], largo: 0.3, color: 'fuerza', minEsfuerzo: 0.6 },
  ],
};

const guardia = P({ rootYaw: -28, headTurn: 25, rootPitch: 6, hipLFlex: 28, kneeL: 24, ankleL: 8, hipRFlex: -14, kneeR: 16, ankleR: 2, hipLAbd: 6, hipRAbd: 6, hipRRot: 20 });
const guardiaManos: ObjetivoMano[] = [
  { mano: 'R', a: 'hombroR', off: [0.04, 0.0, 0.1], codo: [0, -1, 0.2] },
  { mano: 'L', a: 'cabeza', off: [0.12, -0.06, 0.2], codo: [0.3, -1, 0.4] },
];
const golpe = P({ rootYaw: 12, chestTwist: 16, headTurn: -12, rootPitch: 14, hipLFlex: 34, kneeL: 30, ankleL: 14, hipRFlex: -28, kneeR: 2, ankleR: -28, hipLAbd: 6, hipRAbd: 6, hipRRot: -10 });
const golpeManos: ObjetivoMano[] = [
  { mano: 'R', a: 'hombroR', off: [0.12, 0.2, 0.55], codo: [0, 0, 1] },
  { mano: 'L', a: 'cabeza', off: [0.12, -0.08, 0.18], codo: [0.3, -1, 0.4] },
];

const landminePunch: EjercicioVisual = {
  id: 'landmine-punch',
  titulo: 'Landmine punch explosivo (Gyaku Tsuki)',
  bloque: 'gym',
  camara: { pos: [2.6, 1.6, 2.3], mira: [0, 1, 0.4] },
  ancla: 'pies',
  props: [{ tipo: 'landmine', ancla: [-0.15, 0.03, 2.1], agarre: 'manoR' }],
  primarios: ['gemelos.R', 'gluteo.R', 'oblicuos', 'serrato.R', 'pectoral.R', 'triceps.R'],
  estabilizadores: ['abdomen', 'cuadriceps.L'],
  keyframes: [
    { pose: guardia, dur: 0.35, ease: 'lento', hold: 0.8, label: 'Retracción rápida a la guardia', holdLabel: 'Guardia', esfuerzo: 0.1, manos: guardiaManos },
    { pose: mezcla(guardia, golpe, 0.25), dur: 0.07, ease: 'lineal', label: 'Gemelo trasero', esfuerzo: { '*': 0.1, 'gemelos.R': 1 }, manos: guardiaManos },
    { pose: mezcla(guardia, golpe, 0.55), dur: 0.07, ease: 'lineal', label: 'Cadera', esfuerzo: { '*': 0.15, 'gemelos.R': 0.8, 'gluteo.R': 1, oblicuos: 0.6 }, manos: guardiaManos },
    { pose: golpe, dur: 0.12, ease: 'explosivo', hold: 0.15, label: 'Oblicuos → serrato, pectoral y tríceps', holdLabel: 'Latigazo', esfuerzo: { '*': 1, 'gemelos.R': 0.5 }, manos: golpeManos },
  ],
  overlays: [{ tipo: 'estela', en: 'manoR', color: 'blanco' }],
};

const colgado = P({ 'hip*Flex': 8, 'knee*': 12, 'ankle*': -20 });
const colgadoManos: ObjetivoMano[] = [
  { mano: 'L', a: 'hombroL', off: [0.18, 0.56, 0.02], codo: [0.3, 1, 0] },
  { mano: 'R', a: 'hombroR', off: [-0.18, 0.56, 0.02], codo: [-0.3, 1, 0] },
];
const deprimido: ObjetivoMano[] = [
  { mano: 'L', a: 'hombroL', off: [0.18, 0.6, 0.02], codo: [0.3, 1, 0] },
  { mano: 'R', a: 'hombroR', off: [-0.18, 0.6, 0.02], codo: [-0.3, 1, 0] },
];
const arribaBarra: ObjetivoMano[] = [
  { mano: 'L', a: 'hombroL', off: [0.17, 0.14, 0.12], codo: [0.6, -0.8, 0.1] },
  { mano: 'R', a: 'hombroR', off: [-0.17, 0.14, 0.12], codo: [-0.6, -0.8, 0.1] },
];

const pullUp: EjercicioVisual = {
  id: 'pull-up',
  titulo: 'Dominadas estrictas',
  bloque: 'gym',
  camara: { pos: [2.4, 1.6, 2.6], mira: [0, 1.5, 0] },
  ancla: 'manos',
  en: [0, 2.3, 0],
  suelo: false,
  props: [{ tipo: 'dominadas', y: 2.3 }],
  primarios: ['dorsal', 'romboides', 'biceps'],
  estabilizadores: ['abdomen', 'gluteo'],
  keyframes: [
    { pose: colgado, dur: 2, ease: 'lento', hold: 0.4, label: 'Bajada controlada · 2 s', holdLabel: 'Colgado', esfuerzo: 0.3, manos: colgadoManos },
    { pose: P(colgado, { chestFlex: -6 }), dur: 0.35, ease: 'suave', label: 'Depresión escapular', esfuerzo: 0.55, manos: deprimido },
    { pose: P(colgado, { chestFlex: -10, headFlex: -10 }), dur: 0.55, ease: 'explosivo', hold: 1, label: 'Tracción explosiva: codos a los bolsillos', holdLabel: 'Clavícula a la barra · 1 s', esfuerzo: 1, manos: arribaBarra },
  ],
  overlays: [
    { tipo: 'flecha', en: 'codoL', dir: [0, -1, 0.25], largo: 0.3, color: 'fuerza', minEsfuerzo: 0.6 },
    { tipo: 'flecha', en: 'codoR', dir: [0, -1, 0.25], largo: 0.3, color: 'fuerza', minEsfuerzo: 0.6 },
  ],
};

const rack: ObjetivoMano[] = [
  { mano: 'L', a: 'hombroL', off: [0.06, 0.03, 0.15], codo: [0.2, -0.6, 0.8] },
  { mano: 'R', a: 'hombroR', off: [-0.06, 0.03, 0.15], codo: [-0.2, -0.6, 0.8] },
];
const pasandoCara: ObjetivoMano[] = [
  { mano: 'L', a: 'hombroL', off: [0.06, 0.32, 0.17], codo: [0.6, -0.3, 0.6] },
  { mano: 'R', a: 'hombroR', off: [-0.06, 0.32, 0.17], codo: [-0.6, -0.3, 0.6] },
];
const bloqueoArriba: ObjetivoMano[] = [
  { mano: 'L', a: 'hombroL', off: [0.07, 0.58, 0.0], codo: [1, 0.4, 0] },
  { mano: 'R', a: 'hombroR', off: [-0.07, 0.58, 0.0], codo: [-1, 0.4, 0] },
];
const dePieFirme = P({ 'hip*Abd': 6 });

const overheadPress: EjercicioVisual = {
  id: 'overhead-press',
  titulo: 'Press militar de pie',
  bloque: 'gym',
  camara: CAM_LADO,
  ancla: 'pies',
  props: [{ tipo: 'barra', discos: 2 }],
  primarios: ['deltoidesAnt', 'triceps', 'trapecio'],
  estabilizadores: ['gluteo', 'cuadriceps', 'abdomen'],
  keyframes: [
    { pose: dePieFirme, dur: 2, ease: 'lento', hold: 0.6, label: 'Bajada controlada a la clavícula', holdLabel: 'Barra en la clavícula', esfuerzo: 0.3, manos: rack },
    { pose: P(dePieFirme, { headFlex: -18, chestFlex: -3 }), dur: 0.2, ease: 'explosivo', label: 'Cabeza atrás: la barra pasa recta', esfuerzo: 0.9, manos: pasandoCara },
    { pose: P(dePieFirme, { headFlex: 4 }), dur: 0.3, ease: 'explosivo', hold: 0.6, label: 'Empuje vertical', holdLabel: 'Cabeza debajo de la barra', esfuerzo: 1, manos: bloqueoArriba },
  ],
  overlays: [
    { tipo: 'plomada', en: 'manos', color: 'guia' },
    { tipo: 'anillo', en: 'lumbar', color: 'rojo' },
  ],
  alerta: 'Prohibido arquear la zona lumbar',
};

const cuelloBase = P({ 'hip*Abd': 6 });
const cuello = (label: string, manos: ObjetivoMano[], pose: Pose = {}): Keyframe[] => [
  { pose: P(cuelloBase, pose), dur: 0.8, ease: 'suave', label: `${label} · coloca las manos`, esfuerzo: 0.2, manos },
  { pose: P(cuelloBase, pose), dur: 10, ease: 'lineal', label: `${label} · 50 % → 85 %`, esfuerzo: 1, manos },
];
const brazoAbajo = (mano: 'L' | 'R'): ObjetivoMano => ({ mano, a: `cadera${mano}`, off: [mano === 'L' ? 0.12 : -0.12, 0.02, 0.02] });

const neckIsometric: EjercicioVisual = {
  id: 'neck-isometric',
  titulo: 'Blindaje cervical isométrico',
  bloque: 'gym',
  camara: { pos: [0.9, 1.75, 1.05], mira: [0, 1.5, 0] },
  ancla: 'pies',
  primarios: ['cuelloAnt', 'cuelloPost', 'cuelloLat', 'trapecio'],
  estabilizadores: ['abdomen'],
  progreso: true,
  keyframes: [
    ...cuello('Frente', [
      { mano: 'L', a: 'frente', off: [0.03, 0, 0.05], codo: [0.6, -0.4, 0.6] },
      { mano: 'R', a: 'frente', off: [-0.03, 0, 0.05], codo: [-0.6, -0.4, 0.6] },
    ]),
    ...cuello('Nuca', [
      { mano: 'L', a: 'nuca', off: [0.04, 0, -0.04], codo: [0.8, 0.2, 0.4] },
      { mano: 'R', a: 'nuca', off: [-0.04, 0, -0.04], codo: [-0.8, 0.2, 0.4] },
    ]),
    ...cuello('Sien izquierda', [{ mano: 'L', a: 'cabeza', off: [0.13, 0.02, 0.02], codo: [1, -0.3, 0.2] }, brazoAbajo('R')]),
    ...cuello('Sien derecha', [{ mano: 'R', a: 'cabeza', off: [-0.13, 0.02, 0.02], codo: [-1, -0.3, 0.2] }, brazoAbajo('L')]),
  ],
  overlays: [
    { tipo: 'flecha', en: 'frente', dir: [0, 0, -1], largo: 0.22, color: 'fuerza', fases: [1], hacia: true },
    { tipo: 'flecha', en: 'cuello', dir: [0, 0, 1], largo: 0.22, color: 'cian', fases: [1] },
    { tipo: 'flecha', en: 'nuca', dir: [0, 0, 1], largo: 0.22, color: 'fuerza', fases: [3], hacia: true },
    { tipo: 'flecha', en: 'cuello', dir: [0, 0, -1], largo: 0.22, color: 'cian', fases: [3] },
    { tipo: 'flecha', en: 'cabeza', dir: [-1, 0, 0], largo: 0.25, color: 'fuerza', fases: [5], hacia: true },
    { tipo: 'flecha', en: 'cuello', dir: [1, 0, 0], largo: 0.22, color: 'cian', fases: [5] },
    { tipo: 'flecha', en: 'cabeza', dir: [1, 0, 0], largo: 0.25, color: 'fuerza', fases: [7], hacia: true },
    { tipo: 'flecha', en: 'cuello', dir: [-1, 0, 0], largo: 0.22, color: 'cian', fases: [7] },
  ],
};

// ---------------------------------------------------------------- VIERNES / SÁBADO

const rdlArriba = P({ rootPitch: 4, 'hip*Flex': 13, 'knee*': 18, 'ankle*': 9, 'hip*Abd': 5 });
const rdlAbajo = P({ rootPitch: 62, headFlex: -30, 'hip*Flex': 97, 'knee*': 28, 'ankle*': -7, 'hip*Abd': 5 });
const barraColgando: ObjetivoMano[] = [
  { mano: 'L', a: 'hombroL', off: [0.04, -0.58, 0.04], mundo: true },
  { mano: 'R', a: 'hombroR', off: [-0.04, -0.58, 0.04], mundo: true },
];

const rdl: EjercicioVisual = {
  id: 'rdl',
  titulo: 'Peso muerto rumano dinámico',
  bloque: 'gym',
  camara: CAM_LADO,
  ancla: 'pies',
  props: [{ tipo: 'barra', discos: 4 }],
  primarios: ['isquios', 'gluteo'],
  estabilizadores: ['lumbares', 'dorsal'],
  keyframes: [
    { pose: rdlArriba, dur: 0.5, ease: 'explosivo', hold: 0.5, label: 'Latigazo de cadera adelante · 0,5 s', holdLabel: 'Arriba, barra pegada', esfuerzo: 1, manos: barraColgando },
    { pose: rdlAbajo, dur: 2.5, ease: 'lento', hold: 0.1, label: 'Bisagra: cadera atrás, espalda plana · 2,5 s', esfuerzo: 0.55, manos: barraColgando },
  ],
  overlays: [
    { tipo: 'flecha', en: 'sacro', dir: [0, 0, -1], largo: 0.4, color: 'fuerza', fases: [1] },
    { tipo: 'flecha', en: 'sacro', dir: [0, 0, 1], largo: 0.4, color: 'fuerza', fases: [0] },
    { tipo: 'linea', puntos: ['cuello', 'lumbar', 'sacro'], color: 'guia' },
    { tipo: 'plomada', en: 'manos', color: 'guia' },
  ],
};

const largoDip = P({ rootPitch: 50, headFlex: -30, 'hip*Flex': 92, 'knee*': 70, 'ankle*': 26, 'sh*Flex': -60, 'el*': 8, 'hip*Abd': 6 });
const largoDespegue = P({ rootPitch: 38, headFlex: -25, 'hip*Flex': 10, 'knee*': 0, 'ankle*': -40, 'sh*Flex': 150, 'el*': 5, 'hip*Abd': 5 });
const largoVuelo = P({ rootPitch: 25, headFlex: -15, 'hip*Flex': 95, 'knee*': 80, 'ankle*': 10, 'sh*Flex': 90, 'el*': 15, 'hip*Abd': 8 });
const largoAterriza = P({ rootPitch: 48, headFlex: -30, 'hip*Flex': 100, 'knee*': 85, 'ankle*': 28, 'sh*Flex': 70, 'el*': 15, 'hip*Abd': 8 });

const broadJump: EjercicioVisual = {
  id: 'broad-jump',
  titulo: 'Saltos de longitud a pies juntos',
  bloque: 'gym',
  camara: { pos: [3.6, 1.5, 0.7], mira: [0, 0.7, 0.7] },
  ancla: 'pies',
  en: [0, 0, -0.1],
  primarios: ['gluteo', 'isquios', 'cuadriceps', 'gemelos'],
  estabilizadores: ['abdomen', 'lumbares'],
  keyframes: [
    { pose: DE_PIE, dur: 0.9, ease: 'suave', hold: 0.5, label: 'Vuelve a la línea', holdLabel: 'Preparado', esfuerzo: 0.1 },
    { pose: largoDip, dur: 0.35, ease: 'frenada', label: 'Bisagra rápida, brazos atrás', esfuerzo: 0.5 },
    { pose: largoDespegue, dur: 0.16, ease: 'explosivo', label: 'Proyección a 45°', esfuerzo: 1, offset: [0, 0.05, 0.2] },
    { pose: largoVuelo, dur: 0.3, ease: 'lineal', label: 'Vuelo', esfuerzo: 0.3, offset: [0, 0.5, 1.38] },
    { pose: largoAterriza, dur: 0.22, ease: 'frenada', hold: 0.5, label: 'Aterriza: cadera atrás, rodillas estables', holdLabel: 'Absorbe el impacto', esfuerzo: 0.6, offset: [0, 0, 1.45] },
    { pose: DE_PIE, dur: 0.5, ease: 'suave', hold: 0.2, label: 'De pie', esfuerzo: 0.1, offset: [0, 0, 1.45] },
  ],
  overlays: [{ tipo: 'estela', en: 'pelvis', color: 'guia' }],
};

const zancadaArriba = P({ 'hip*Abd': 4 });
const zancadaAbajo = P({ rootPitch: 10, headFlex: -8, hipLFlex: 92, kneeL: 92, ankleL: 10, hipRFlex: -6, kneeR: 92, ankleR: 45, 'hip*Abd': 4 });
const mancuernas: ObjetivoMano[] = [
  { mano: 'L', a: 'hombroL', off: [0.07, -0.57, 0], mundo: true },
  { mano: 'R', a: 'hombroR', off: [-0.07, -0.57, 0], mundo: true },
];

const reverseLunge: EjercicioVisual = {
  id: 'reverse-lunge',
  titulo: 'Zancadas hacia atrás con mancuernas',
  bloque: 'gym',
  camara: CAM_LADO,
  ancla: 'metatarsoL',
  props: [{ tipo: 'mancuernas' }],
  primarios: ['gluteo.L', 'cuadriceps.L'],
  estabilizadores: ['gluteoMedio.L', 'abdomen'],
  keyframes: [
    { pose: zancadaArriba, dur: 0.45, ease: 'explosivo', hold: 0.5, label: 'Empuje potente con el pie delantero', holdLabel: 'Arriba', esfuerzo: 1, manos: mancuernas },
    { pose: zancadaAbajo, dur: 1.4, ease: 'lento', hold: 0.15, label: 'Paso atrás y baja a 90° / 90°', holdLabel: 'Rodilla trasera roza el suelo', esfuerzo: 0.5, manos: mancuernas },
  ],
  overlays: [
    { tipo: 'plomada', en: 'rodillaL', color: 'guia' },
    { tipo: 'flecha', en: 'rodillaL', dir: [0.6, 0, 0], largo: 0.2, color: 'cian', fases: [1] },
  ],
};

const remoBase = P({ rootPitch: 48, headFlex: -25, 'hip*Flex': 72, 'knee*': 22, 'ankle*': 8, 'hip*Abd': 6 });
const remoAbajo: ObjetivoMano[] = [
  { mano: 'L', a: 'hombroL', off: [0.05, -0.57, 0.02], mundo: true },
  { mano: 'R', a: 'hombroR', off: [-0.05, -0.57, 0.02], mundo: true },
];
const remoArriba: ObjetivoMano[] = [
  { mano: 'L', a: 'ombligo', off: [0.22, -0.02, 0.1], codo: [0.3, 0.3, -1] },
  { mano: 'R', a: 'ombligo', off: [-0.22, -0.02, 0.1], codo: [-0.3, 0.3, -1] },
];

const barbellRow: EjercicioVisual = {
  id: 'barbell-row',
  titulo: 'Remo con barra inclinado',
  bloque: 'gym',
  camara: CAM_LADO,
  ancla: 'pies',
  props: [{ tipo: 'barra', discos: 3 }],
  primarios: ['dorsal', 'romboides', 'trapecio', 'deltoidesPost'],
  estabilizadores: ['isquios', 'lumbares'],
  keyframes: [
    { pose: remoBase, dur: 1.5, ease: 'lento', hold: 0.3, label: 'Bajada controlada', holdLabel: 'Torso a 45°, bisagra fija', esfuerzo: 0.3, manos: remoAbajo },
    { pose: remoBase, dur: 0.35, ease: 'explosivo', hold: 0.3, label: 'Tirón seco al ombligo', holdLabel: 'Escápulas juntas', esfuerzo: 1, manos: remoArriba },
  ],
  overlays: [
    { tipo: 'linea', puntos: ['cuello', 'lumbar', 'sacro'], color: 'guia' },
    { tipo: 'estela', en: 'manos', color: 'blanco' },
  ],
};

const pallofBase = P({ rootPitch: 10, 'hip*Flex': 26, 'knee*': 28, 'ankle*': 16, 'hip*Abd': 13 });

const pallofPress: EjercicioVisual = {
  id: 'pallof-press',
  titulo: 'Press Pallof isométrico',
  bloque: 'gym',
  camara: { pos: [0.4, 1.9, 3.1], mira: [0.3, 1, 0] },
  ancla: 'pies',
  props: [{ tipo: 'polea', ancla: [1.6, 1.15, 0.1] }],
  primarios: ['oblicuos', 'abdomen', 'gluteoMedio.L'],
  estabilizadores: ['gluteo', 'romboides'],
  progreso: true,
  keyframes: [
    { pose: pallofBase, dur: 0.8, ease: 'suave', hold: 0.4, label: 'Vuelve al esternón', holdLabel: 'Agarre en el esternón', esfuerzo: 0.3, manos: manosJuntas([0, 0.02, 0.1]) },
    { pose: pallofBase, dur: 0.9, ease: 'suave', label: 'Estira los brazos al frente', esfuerzo: 0.8, manos: manosJuntas([0, -0.02, 0.42]) },
    { pose: pallofBase, dur: 6, ease: 'lineal', label: 'Mantén 15 s sin girar', esfuerzo: 1, manos: manosJuntas([0, -0.02, 0.42]) },
  ],
  overlays: [
    { tipo: 'flecha', en: 'manos', dir: [1, 0, 0], largo: 0.4, color: 'rojo', fases: [1, 2] },
    { tipo: 'linea', puntos: ['pelvis', 'cuello'], color: 'cian' },
    { tipo: 'linea', puntos: ['hombroL', 'hombroR'], color: 'cian' },
  ],
};

// ---------------------------------------------------------------- MOVILIDAD

const BRAZOS_9090 = { 'sh*Flex': 70, 'sh*Abd': 25, 'el*': 70 };
const noventa = (delante: 'L' | 'R', yaw: number): Pose => {
  const atras = delante === 'L' ? 'R' : 'L';
  return P(BRAZOS_9090, { rootYaw: yaw, [`hip${delante}Flex`]: 90, [`hip${delante}Abd`]: 20, [`hip${delante}Rot`]: 90, [`knee${delante}`]: 95, [`hip${atras}Flex`]: 90, [`hip${atras}Abd`]: 80, [`hip${atras}Rot`]: -85, [`knee${atras}`]: 95, [`ankle${atras}`]: -30 });
};
const noventaIzq = noventa('L', 25);
const noventaDer = noventa('R', -25);
const rodillasArriba = P(BRAZOS_9090, { 'hip*Flex': 100, 'hip*Abd': 30, 'knee*': 115, 'ankle*': 10 });
const extension = P(noventaDer, { rootPitch: 0, hipRFlex: 25, hipRAbd: 30, hipLFlex: 15, hipLAbd: 55 });

const hip9090: EjercicioVisual = {
  id: 'hip-90-90',
  titulo: 'Transiciones 90/90 de cadera',
  bloque: 'movilidad',
  camara: { pos: [1.6, 1.6, 2], mira: [0, 0.35, 0] },
  ancla: 'pelvis',
  props: [{ tipo: 'esterilla' }],
  primarios: ['capsulaCadera', 'rotadores', 'gluteo'],
  estabilizadores: ['abdomen', 'lumbares'],
  keyframes: [
    { pose: noventaIzq, dur: 1.5, ease: 'suave', hold: 1, label: 'Gira sobre los talones', holdLabel: '90/90 · torso erguido', esfuerzo: 0.6 },
    { pose: rodillasArriba, dur: 1.2, ease: 'suave', label: 'Rodillas arriba sin manos', esfuerzo: 0.4 },
    { pose: noventaDer, dur: 1.2, ease: 'suave', hold: 0.8, label: 'Invierte al otro lado', holdLabel: '90/90 al otro lado', esfuerzo: 0.6 },
    { pose: extension, dur: 1.2, ease: 'suave', hold: 1, label: 'Eleva la pelvis sobre las espinillas', holdLabel: 'Extensión de cadera', esfuerzo: 1 },
    { pose: noventaDer, dur: 1, ease: 'suave', label: 'Vuelve al 90/90', esfuerzo: 0.5 },
    { pose: rodillasArriba, dur: 1.2, ease: 'suave', label: 'Rodillas arriba sin manos', esfuerzo: 0.4 },
  ],
  videoUrl: 'https://www.youtube.com/watch?v=m51AZSXMvEA',
};

const ranaAdelante = P({ rootPitch: 88, headFlex: -20, 'hip*Flex': 88, 'hip*Abd': 62, 'hip*Rot': 0, 'knee*': 90, 'ankle*': 0, 'sh*Flex': 85, 'el*': 95, 'sh*Abd': 8 });
const ranaAtras = P({ rootPitch: 84, headFlex: -15, 'hip*Flex': 126, 'hip*Abd': 58, 'hip*Rot': -35, 'knee*': 110, 'ankle*': 0, 'sh*Flex': 118, 'el*': 70, 'sh*Abd': 8 });

const frogStretch: EjercicioVisual = {
  id: 'frog-stretch',
  titulo: 'Postura de la rana dinámica',
  bloque: 'movilidad',
  camara: { pos: [2, 1.6, -1.6], mira: [0, 0.3, 0] },
  ancla: 'rodillas',
  contacto: ['rodillaL', 'rodillaR', 'codoL', 'codoR', 'punteraL', 'punteraR'],
  props: [{ tipo: 'esterilla' }],
  primarios: ['aductores'],
  estabilizadores: ['lumbares', 'abdomen'],
  keyframes: [
    { pose: ranaAdelante, dur: 1.5, ease: 'suave', hold: 0.5, label: 'Vuelve adelante', holdLabel: 'Rodillas abiertas, tibias paralelas', esfuerzo: 0.35 },
    { pose: ranaAtras, dur: 4, ease: 'lento', hold: 0.6, label: 'Pelvis atrás hacia los talones · 4 s', holdLabel: 'Máxima apertura', esfuerzo: 0.8 },
  ],
  overlays: [{ tipo: 'linea', puntos: ['cuello', 'lumbar', 'sacro'], color: 'cian' }],
};

const cossackCentro = P({ rootPitch: 15, 'hip*Flex': 30, 'hip*Abd': 38, 'hip*Rot': 25, 'knee*': 30, 'ankle*': 12, 'sh*Flex': 80, 'el*': 20 });
const cossackIzq = P({ rootPitch: 32, rootYaw: 10, headFlex: -20, hipLFlex: 108, hipLAbd: 30, hipLRot: 25, kneeL: 135, ankleL: 38, hipRFlex: 8, hipRAbd: 52, hipRRot: 80, kneeR: 0, ankleR: 55, 'sh*Flex': 85, 'el*': 15 });
const cossackDer = P({ rootPitch: 32, rootYaw: -10, headFlex: -20, hipRFlex: 108, hipRAbd: 30, hipRRot: 25, kneeR: 135, ankleR: 38, hipLFlex: 8, hipLAbd: 52, hipLRot: 80, kneeL: 0, ankleL: 55, 'sh*Flex': 85, 'el*': 15 });

const cossackSquat: EjercicioVisual = {
  id: 'cossack-squat',
  titulo: 'Cossack squat',
  bloque: 'movilidad',
  camara: { pos: [0.3, 1.4, 3.4], mira: [0, 0.6, 0] },
  ancla: 'pies',
  primarios: ['aductores', 'isquios', 'cuadriceps', 'tibial'], // each side lights through the esfuerzo maps
  estabilizadores: ['abdomen', 'gluteoMedio'],
  keyframes: [
    { pose: cossackCentro, dur: 1.2, ease: 'suave', hold: 0.2, label: 'Sube al centro', esfuerzo: 0.3 },
    { pose: cossackIzq, dur: 1.6, ease: 'lento', hold: 0.8, label: 'Baja sobre el talón izquierdo', holdLabel: 'Planta pegada, puntera derecha al techo', esfuerzo: { '*': 0.2, 'aductores.R': 1, 'isquios.R': 1, 'cuadriceps.L': 1, 'tibial.L': 1 } },
    { pose: cossackCentro, dur: 1.2, ease: 'suave', hold: 0.2, label: 'Sube al centro', esfuerzo: 0.3 },
    { pose: cossackDer, dur: 1.6, ease: 'lento', hold: 0.8, label: 'Baja sobre el talón derecho', holdLabel: 'Planta pegada, puntera izquierda al techo', esfuerzo: { '*': 0.2, 'aductores.L': 1, 'isquios.L': 1, 'cuadriceps.R': 1, 'tibial.R': 1 } },
  ],
  videoUrl: 'https://www.youtube.com/watch?v=MJvazUpmdZU',
};

const caballero = P({ hipLFlex: 100, kneeL: 100, ankleL: 4, hipRFlex: -12, kneeR: 95, ankleR: -40, 'hip*Abd': 6 });
const caballeroManos: ObjetivoMano[] = [
  { mano: 'L', a: 'caderaL', off: [0.1, 0.06, 0.04] },
  { mano: 'R', a: 'caderaR', off: [-0.1, 0.06, 0.04] },
];
const brazosCruz = P({ 'sh*Abd': 88, 'el*': 5 });

const psoasRotation: EjercicioVisual = {
  id: 'psoas-rotation',
  titulo: 'Psoas en caballero con rotación torácica',
  bloque: 'movilidad',
  camara: { pos: [2.8, 1.5, 1.6], mira: [0, 0.6, 0.1] },
  ancla: 'rodillaR',
  props: [{ tipo: 'esterilla' }],
  primarios: ['psoas.R', 'cuadriceps.R', 'toracica'],
  estabilizadores: ['gluteo.R', 'abdomen'],
  keyframes: [
    { pose: caballero, dur: 1.2, ease: 'suave', hold: 0.6, label: 'Vuelve al centro', holdLabel: 'Caballero', esfuerzo: 0.3, manos: caballeroManos },
    { pose: P(caballero, { rootPitch: -9, hipRFlex: -22, hipLFlex: 92 }), dur: 1.2, ease: 'suave', hold: 0.8, label: 'Retroversión: mete el coxis', holdLabel: 'Aprieta el glúteo de atrás', esfuerzo: 0.8, manos: caballeroManos },
    { pose: P(caballero, brazosCruz, { rootPitch: -9, hipRFlex: -22, hipLFlex: 92, spineTwist: 35, chestTwist: 50, headTurn: 25 }), dur: 1.8, ease: 'lento', hold: 1.5, label: 'Gira hombros y brazos 90° hacia la pierna adelantada', holdLabel: 'Mantén y respira', esfuerzo: 1 },
  ],
  videoUrl: 'https://www.youtube.com/watch?v=o4adc_RcptM',
};

const deLado = P({ rootRoll: -90, 'hip*Flex': 90, 'knee*': 90, hipLFlex: 100, hipLAbd: -30, headFlex: 0 });
const libroCerrado = P(deLado, { 'sh*Flex': 90, 'el*': 0 });
const libroAbierto = P(deLado, { chestTwist: 75, spineTwist: 20, headTurn: 70, shRFlex: 90, shRAbd: 110, shLFlex: 30, shLAbd: 80 });

const openBook: EjercicioVisual = {
  id: 'open-book',
  titulo: 'Apertura torácica · libro abierto',
  bloque: 'movilidad',
  camara: { pos: [0.5, 2.4, 1.8], mira: [0, 0.2, 0] },
  ancla: 'pelvis',
  contacto: ['pelvis', 'rodillaL', 'rodillaR', 'cabeza', 'caderaR'],
  props: [{ tipo: 'esterilla' }],
  primarios: ['pectoral.L', 'toracica'],
  estabilizadores: ['rodillaAncla.L', 'oblicuos'],
  keyframes: [
    { pose: libroCerrado, dur: 1.6, ease: 'suave', hold: 0.6, label: 'Cierra el libro', holdLabel: 'Rodilla de arriba anclada', esfuerzo: 0.3 },
    { pose: libroAbierto, dur: 2.4, ease: 'lento', hold: 1.6, label: 'El brazo dibuja un arco amplio', holdLabel: 'Omóplatos al suelo, mira la mano', esfuerzo: 1 },
  ],
  overlays: [{ tipo: 'estela', en: 'manoL', color: 'blanco' }],
  videoUrl: 'https://www.youtube.com/watch?v=SKapoHxQxuk',
};

// ---------------------------------------------------------------- DESCOMPRESIÓN NOCTURNA

const paloma = (bajo: number): Pose =>
  P({ rootPitch: 22 + bajo, spineFlex: 32 + bajo / 2, chestFlex: 26, headFlex: 25, hipLFlex: 112 + bajo, hipLAbd: 25, hipLRot: 75, kneeL: 115, ankleL: -20, hipRFlex: -62 + bajo, hipRAbd: 4, kneeR: 0, ankleR: -70 });
const palomaManos: ObjetivoMano[] = [
  { mano: 'L', a: 'frente', off: [0.13, 0.02, 0.06], codo: [1, 0.2, 0.3] },
  { mano: 'R', a: 'frente', off: [-0.13, 0.02, 0.06], codo: [-1, 0.2, 0.3] },
];

const pigeon: EjercicioVisual = {
  id: 'pigeon',
  titulo: 'Paloma pasiva',
  bloque: 'descompresion',
  camara: { pos: [2.2, 1.4, 1.8], mira: [0, 0.25, 0] },
  ancla: 'pelvis',
  props: [{ tipo: 'esterilla' }],
  primarios: ['gluteo.L', 'gluteoMedio.L', 'rotadores.L'],
  estabilizadores: [],
  respiracion: true,
  keyframes: [
    // In step with the breathing guide: 4 s inhaling, 6 s exhaling
    { pose: paloma(-4), dur: 4, ease: 'suave', label: 'Inhala por la nariz', esfuerzo: 0.35, manos: palomaManos },
    { pose: paloma(0), dur: 6, ease: 'suave', label: 'Exhala lento · suelta un poco más', esfuerzo: 0.6, manos: palomaManos },
  ],
  videoUrl: 'https://www.youtube.com/watch?v=AI5A1PRYX7E',
};

const nino = (lado: number): Pose =>
  P({ rootPitch: 80, spineFlex: 8, chestFlex: 8, headFlex: 10, spineSide: lado * 12, chestSide: lado * 16, 'hip*Flex': 160, 'hip*Abd': 10, 'knee*': 165, 'ankle*': -75, 'sh*Flex': 172, 'sh*Abd': 8, 'el*': 4, shLAbd: 8 + lado * 6, shRAbd: 8 - lado * 6 });

const childPose: EjercicioVisual = {
  id: 'child-pose',
  titulo: 'Postura del niño con alcance lateral',
  bloque: 'descompresion',
  camara: { pos: [1.4, 2.1, 2.3], mira: [0, 0.2, 0.3] },
  ancla: 'rodillas',
  props: [{ tipo: 'esterilla' }],
  primarios: ['lumbares', 'dorsal', 'cuadradoLumbar'],
  estabilizadores: [],
  respiracion: true,
  keyframes: [
    { pose: nino(0), dur: 2, ease: 'suave', hold: 3, label: 'Manos al centro', holdLabel: 'Centro · 1 min', esfuerzo: { '*': 0.5, 'dorsal.L': 0.35, 'dorsal.R': 0.35, 'cuadradoLumbar.L': 0.3, 'cuadradoLumbar.R': 0.3 } },
    { pose: nino(1), dur: 2, ease: 'suave', hold: 3, label: 'Las manos caminan a la izquierda', holdLabel: 'Izquierda · 1 min (estira el costado derecho)', esfuerzo: { '*': 0.4, 'dorsal.R': 0.9, 'cuadradoLumbar.R': 0.9, 'dorsal.L': 0.1, 'cuadradoLumbar.L': 0.1 } },
    { pose: nino(-1), dur: 3, ease: 'suave', hold: 3, label: 'Las manos caminan a la derecha', holdLabel: 'Derecha · 1 min (estira el costado izquierdo)', esfuerzo: { '*': 0.4, 'dorsal.L': 0.9, 'cuadradoLumbar.L': 0.9, 'dorsal.R': 0.1, 'cuadradoLumbar.R': 0.1 } },
  ],
  videoUrl: 'https://www.youtube.com/watch?v=N3AussBta5k',
};

const pared = (aire: number): Pose =>
  P({ rootPitch: -90, headFlex: 0, 'hip*Flex': 90, 'hip*Abd': 4, 'knee*': 2, 'ankle*': -15, 'sh*Abd': 85, 'sh*Rot': 60, 'el*': 10, chestFlex: -aire });

const legsWall: EjercicioVisual = {
  id: 'legs-wall',
  titulo: 'Piernas en la pared',
  bloque: 'descompresion',
  camara: { pos: [2.4, 1.3, -0.6], mira: [0, 0.4, 0.1] },
  ancla: 'pelvis',
  props: [{ tipo: 'esterilla' }, { tipo: 'pared', z: 0.2 }],
  primarios: ['isquios'],
  estabilizadores: [],
  respiracion: true,
  keyframes: [
    { pose: pared(3), dur: 4, ease: 'suave', label: 'Inhala por la nariz', esfuerzo: 0.4 },
    { pose: pared(0), dur: 6, ease: 'suave', label: 'Exhala lento', esfuerzo: 0.25 },
  ],
  overlays: [
    { tipo: 'particulas', recorrido: ['tobilloL', 'rodillaL', 'caderaL', 'pecho'] },
    { tipo: 'particulas', recorrido: ['tobilloR', 'rodillaR', 'caderaR', 'pecho'] },
  ],
  videoUrl: 'https://www.youtube.com/watch?v=do_1LisFah0',
};

export const EJERCICIOS_VISOR: Record<string, EjercicioVisual> = Object.fromEntries(
  [
    backSquat, boxJump, hipThrust, landmineRotation, bikeHiit,
    benchPress, landminePunch, pullUp, overheadPress, neckIsometric,
    rdl, broadJump, reverseLunge, barbellRow, pallofPress,
    hip9090, frogStretch, cossackSquat, psoasRotation, openBook,
    pigeon, childPose, legsWall,
  ].map((e) => [e.id, e])
);
