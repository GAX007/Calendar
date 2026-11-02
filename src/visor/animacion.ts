import type { Ease, EjercicioVisual, Keyframe, Musculo, Pose } from './ejercicios';
import { CUERPO } from './rig';

// Eccentric phases use easeInOutQuad (slow, controlled); concentric ones easeOutExpo (fast, violent)
export const EASINGS: Record<Ease, (t: number) => number> = {
  lineal: (t) => t,
  lento: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  explosivo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  suave: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  frenada: (t) => 1 - (1 - t) ** 2,
};

export interface Fotograma {
  pose: Pose;
  esfuerzo: (m: Musculo) => number;
  offset: [number, number, number];
  fase: number; // index of the keyframe being reached or held
  enHold: boolean;
  progresoFase: number; // 0..1 inside the current transition or hold
  etiqueta: string;
  pedal?: number; // crank angle (bike)
}

const valorEsfuerzo = (k: Keyframe, m: Musculo): number => {
  if (typeof k.esfuerzo === 'number') return k.esfuerzo;
  if (!k.esfuerzo) return 0.5;
  const base = m.split('.')[0] as Musculo;
  return k.esfuerzo[m] ?? k.esfuerzo[base] ?? k.esfuerzo['*'] ?? 0.5;
};

export function duracion(v: EjercicioVisual): number {
  if (v.bici) return v.bici.sprint + v.bici.suave;
  return v.keyframes.reduce((s, k) => s + k.dur + (k.hold || 0), 0);
}

// Pose and muscle intensity at time t (seconds, looping). `poses` are the keyframe poses with the hands already solved.
export function fotograma(v: EjercicioVisual, poses: Pose[], t: number): Fotograma {
  if (v.bici) return fotogramaBici(v, poses[0], t);
  const total = duracion(v);
  let r = ((t % total) + total) % total;
  const n = v.keyframes.length;
  for (let i = 0; i < n; i++) {
    const k = v.keyframes[i];
    const prev = v.keyframes[(i - 1 + n) % n];
    if (r < k.dur) {
      const p = r / k.dur;
      const e = EASINGS[k.ease || 'suave'](p);
      const a = poses[(i - 1 + n) % n];
      const b = poses[i];
      const pose: Pose = {};
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) pose[key] = (a[key] || 0) + ((b[key] || 0) - (a[key] || 0)) * e;
      const oa = prev.offset || [0, 0, 0];
      const ob = k.offset || [0, 0, 0];
      return {
        pose,
        esfuerzo: (m) => valorEsfuerzo(prev, m) + (valorEsfuerzo(k, m) - valorEsfuerzo(prev, m)) * e,
        offset: [oa[0] + (ob[0] - oa[0]) * e, oa[1] + (ob[1] - oa[1]) * e, oa[2] + (ob[2] - oa[2]) * e],
        fase: i,
        enHold: false,
        progresoFase: p,
        etiqueta: k.label || '',
      };
    }
    r -= k.dur;
    const hold = k.hold || 0;
    if (r < hold) {
      return {
        pose: poses[i],
        esfuerzo: (m) => valorEsfuerzo(k, m),
        offset: k.offset || [0, 0, 0],
        fase: i,
        enHold: true,
        progresoFase: r / hold,
        etiqueta: k.holdLabel || k.label || '',
      };
    }
    r -= hold;
  }
  const ultimo = n - 1;
  return { pose: poses[ultimo], esfuerzo: (m) => valorEsfuerzo(v.keyframes[ultimo], m), offset: [0, 0, 0], fase: ultimo, enHold: true, progresoFase: 1, etiqueta: '' };
}

// Bike geometry: hip over the seat, crank ahead and below it (pelvis frame placed at `en`)
export const BICI = { cadera: [0, -0.05] as const, eje: [0.22, -0.6] as const, biela: 0.17 };

// Two-bone leg IK in the sagittal plane: thigh and knee angles that put the ankle at (z, y) from the hip
export function piernaIK(dz: number, dy: number, pitch: number): { hip: number; knee: number } {
  const T = CUERPO.muslo;
  const S = CUERPO.tibia;
  const d = Math.min(Math.hypot(dz, dy), T + S - 1e-4);
  const haciaTobillo = Math.atan2(dz, -dy);
  const alfa = Math.acos((T * T + d * d - S * S) / (2 * T * d));
  const interior = Math.acos((T * T + S * S - d * d) / (2 * T * S));
  const muslo = haciaTobillo + alfa;
  return { hip: (muslo * 180) / Math.PI + pitch, knee: 180 - (interior * 180) / Math.PI };
}

function fotogramaBici(v: EjercicioVisual, base: Pose, t: number): Fotograma {
  const { sprint, suave } = v.bici!;
  const total = sprint + suave;
  const r = ((t % total) + total) % total;
  const enSprint = r < sprint;
  // Crank angle: 2.2 turns/s in the sprint, 0.8 in the easy part (integrated so it never jumps)
  const vueltas = Math.min(r, sprint) * 2.2 + Math.max(0, r - sprint) * 0.8;
  const ciclo = Math.floor(t / total) * (sprint * 2.2 + suave * 0.8);
  const ang = (vueltas + ciclo) * Math.PI * 2;
  const pitch = base.rootPitch || 0;
  const pose: Pose = { ...base };
  for (const [l, desfase] of [['L', 0], ['R', Math.PI]] as const) {
    const a = ang + desfase;
    const z = BICI.eje[0] + Math.sin(a) * BICI.biela - BICI.cadera[0];
    const y = BICI.eje[1] - Math.cos(a) * BICI.biela - BICI.cadera[1] + CUERPO.tobillo * 0.6;
    const { hip, knee } = piernaIK(z, y, pitch);
    pose[`hip${l}Flex`] = hip;
    pose[`knee${l}`] = knee;
    pose[`ankle${l}`] = knee - (hip - pitch) - 10 + Math.sin(a) * 12;
    pose[`hip${l}Abd`] = 3;
  }
  const pulso = enSprint ? 0.75 + 0.25 * Math.sin(t * 18) : 0.25;
  return {
    pose,
    esfuerzo: (m) => (m.startsWith('cuadriceps') || m.startsWith('gluteo') ? pulso : enSprint ? 0.6 : 0.2),
    offset: [0, 0, 0],
    fase: enSprint ? 0 : 1,
    enHold: false,
    progresoFase: enSprint ? r / sprint : (r - sprint) / suave,
    etiqueta: enSprint ? 'Sprint 30 s · resistencia 7-8/10' : 'Pedaleo suave 60 s · nivel 2-3/10',
    pedal: ang,
  };
}
