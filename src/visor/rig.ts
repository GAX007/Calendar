import * as THREE from 'three';
import type { Pose, PuntoId } from './ejercicios';

// Articulated mannequin: groups only (no meshes), so it also runs in tests.
// The character faces +Z with +Y up, so its left side is +X. Angles of a Pose are in degrees.
export const CUERPO = {
  caderaY: -0.05,
  caderaX: 0.1,
  muslo: 0.44,
  tibia: 0.43,
  tobillo: 0.08,
  abdomen: 0.24,
  pecho: 0.3,
  hombroX: 0.19,
  hombroY: 0.27,
  brazo: 0.29,
  antebrazo: 0.3,
  cuello: 0.3,
};

export interface Esqueleto {
  raiz: THREE.Group;
  pelvis: THREE.Group;
  abdomen: THREE.Group;
  pecho: THREE.Group;
  cabeza: THREE.Group;
  hombro: Record<'L' | 'R', THREE.Group>;
  codo: Record<'L' | 'R', THREE.Group>;
  cadera: Record<'L' | 'R', THREE.Group>;
  rodilla: Record<'L' | 'R', THREE.Group>;
  tobillo: Record<'L' | 'R', THREE.Group>;
}

const g = (padre: THREE.Object3D, x: number, y: number, z: number, orden: THREE.EulerOrder = 'XZY') => {
  const n = new THREE.Group();
  n.position.set(x, y, z);
  n.rotation.order = orden;
  padre.add(n);
  return n;
};

export function crearEsqueleto(): Esqueleto {
  const raiz = new THREE.Group();
  const pelvis = g(raiz, 0, 0, 0, 'YXZ');
  const abdomen = g(pelvis, 0, 0.04, 0);
  const pecho = g(abdomen, 0, CUERPO.abdomen, 0);
  const cabeza = g(pecho, 0, CUERPO.cuello, 0);
  const lados = (f: (s: number, l: 'L' | 'R') => THREE.Group) => ({ L: f(1, 'L'), R: f(-1, 'R') });
  const hombro = lados((s) => g(pecho, s * CUERPO.hombroX, CUERPO.hombroY, 0));
  const codo = lados((_, l) => g(hombro[l], 0, -CUERPO.brazo, 0));
  const cadera = lados((s) => g(pelvis, s * CUERPO.caderaX, CUERPO.caderaY, 0));
  const rodilla = lados((_, l) => g(cadera[l], 0, -CUERPO.muslo, 0));
  const tobillo = lados((_, l) => g(rodilla[l], 0, -CUERPO.tibia, 0));
  return { raiz, pelvis, abdomen, pecho, cabeza, hombro, codo, cadera, rodilla, tobillo };
}

const R = THREE.MathUtils.degToRad;

export function aplicarAngulos(e: Esqueleto, p: Pose) {
  const v = (k: string) => R(p[k] || 0);
  e.pelvis.rotation.set(v('rootPitch'), v('rootYaw'), -v('rootRoll'));
  e.abdomen.rotation.set(v('spineFlex'), v('spineTwist'), -v('spineSide'));
  e.pecho.rotation.set(v('chestFlex'), v('chestTwist'), -v('chestSide'));
  e.cabeza.rotation.set(v('headFlex'), v('headTurn'), -v('headSide'));
  for (const [l, s] of [['L', 1], ['R', -1]] as const) {
    e.cadera[l].rotation.set(-v(`hip${l}Flex`), s * v(`hip${l}Rot`), s * v(`hip${l}Abd`));
    e.rodilla[l].rotation.set(v(`knee${l}`), 0, 0);
    e.tobillo[l].rotation.set(-v(`ankle${l}`), 0, 0);
    e.hombro[l].rotation.set(-v(`sh${l}Flex`), s * v(`sh${l}Rot`), s * v(`sh${l}Abd`));
    e.codo[l].rotation.set(-v(`el${l}`), 0, 0);
  }
}

// Named points of the body in world space (with a radius for the floor contact)
const LOCALES: Record<string, [keyof Esqueleto | 'hombroL' | 'hombroR' | 'codoL' | 'codoR' | 'caderaL' | 'caderaR' | 'rodillaL' | 'rodillaR' | 'tobilloL' | 'tobilloR', number, number, number, number]> = {
  pelvis: ['pelvis', 0, 0, 0, 0.11],
  sacro: ['pelvis', 0, 0.02, -0.1, 0.03],
  lumbar: ['abdomen', 0, 0.1, -0.1, 0.03],
  ombligo: ['abdomen', 0, 0.06, 0.11, 0.02],
  esternon: ['pecho', 0, 0.18, 0.12, 0.02],
  pecho: ['pecho', 0, 0.15, 0, 0.12],
  escapulas: ['pecho', 0, 0.2, -0.1, 0.05],
  cuello: ['cabeza', 0, 0, 0, 0.05],
  cabeza: ['cabeza', 0, 0.16, 0.01, 0.12],
  frente: ['cabeza', 0, 0.2, 0.11, 0.01],
  nuca: ['cabeza', 0, 0.14, -0.1, 0.01],
  hombroL: ['hombroL', 0, 0, 0, 0.06],
  hombroR: ['hombroR', 0, 0, 0, 0.06],
  codoL: ['codoL', 0, 0, 0, 0.05],
  codoR: ['codoR', 0, 0, 0, 0.05],
  manoL: ['codoL', 0, -CUERPO.antebrazo, 0, 0.05],
  manoR: ['codoR', 0, -CUERPO.antebrazo, 0, 0.05],
  caderaL: ['caderaL', 0, 0, 0, 0.09],
  caderaR: ['caderaR', 0, 0, 0, 0.09],
  rodillaL: ['rodillaL', 0, 0, 0, 0.055],
  rodillaR: ['rodillaR', 0, 0, 0, 0.055],
  tobilloL: ['tobilloL', 0, 0, 0, 0.04],
  tobilloR: ['tobilloR', 0, 0, 0, 0.04],
  talonL: ['tobilloL', 0, -CUERPO.tobillo + 0.02, -0.05, 0.02],
  talonR: ['tobilloR', 0, -CUERPO.tobillo + 0.02, -0.05, 0.02],
  punteraL: ['tobilloL', 0, -CUERPO.tobillo + 0.02, 0.17, 0.02],
  punteraR: ['tobilloR', 0, -CUERPO.tobillo + 0.02, 0.17, 0.02],
  metatarsoL: ['tobilloL', 0, -CUERPO.tobillo + 0.02, 0.1, 0.02],
  metatarsoR: ['tobilloR', 0, -CUERPO.tobillo + 0.02, 0.1, 0.02],
};

function nodo(e: Esqueleto, k: string): THREE.Object3D {
  const m = k.match(/^(hombro|codo|cadera|rodilla|tobillo)([LR])$/);
  if (m) return (e as any)[m[1]][m[2]];
  return (e as any)[k];
}

const tmp = new THREE.Vector3();

export function punto(e: Esqueleto, id: PuntoId, out = new THREE.Vector3()): THREE.Vector3 {
  if (id === 'manos') return punto(e, 'manoL', out).add(punto(e, 'manoR', tmp)).multiplyScalar(0.5);
  if (id === 'pies') return punto(e, 'metatarsoL', out).add(punto(e, 'metatarsoR', tmp)).multiplyScalar(0.5).setY(0);
  if (id === 'mediopieL' || id === 'mediopieR') return punto(e, `metatarso${id.slice(-1)}` as PuntoId, out).setY(0);
  if (id === 'rodillas') return punto(e, 'rodillaL', out).add(punto(e, 'rodillaR', tmp)).multiplyScalar(0.5);
  const def = LOCALES[id];
  if (!def) throw new Error(`Punto desconocido: ${id}`);
  return out.set(def[1], def[2], def[3]).applyMatrix4(nodo(e, def[0]).matrixWorld);
}

const CONTACTO = Object.keys(LOCALES).filter((k) => !['sacro', 'lumbar', 'ombligo', 'esternon', 'escapulas', 'frente', 'nuca', 'pecho'].includes(k));

export interface Colocacion {
  ancla?: PuntoId | null; // point kept at `en`
  en?: [number, number, number]; // x, y, z; y only used when `suelo` is false
  suelo?: boolean; // lift so the lowest point touches the floor (default true)
  contacto?: PuntoId[]; // points that may touch the floor (all by default)
}

// Pose + placement: anchor horizontally, rest on the floor, then apply the keyframe offset
export function colocar(e: Esqueleto, pose: Pose, c: Colocacion, offset?: [number, number, number]) {
  aplicarAngulos(e, pose);
  e.raiz.position.set(0, 1, 0);
  e.raiz.updateMatrixWorld(true);
  const en = c.en || [0, 0, 0];
  if (c.ancla) {
    const a = punto(e, c.ancla, new THREE.Vector3());
    e.raiz.position.x += en[0] - a.x;
    e.raiz.position.z += en[2] - a.z;
    if (c.suelo === false) e.raiz.position.y += en[1] - a.y;
    e.raiz.updateMatrixWorld(true);
  }
  if (c.suelo !== false) {
    let min = Infinity;
    for (const k of c.contacto || CONTACTO) {
      const def = LOCALES[k];
      punto(e, k as PuntoId, tmp);
      min = Math.min(min, tmp.y - def[4]);
    }
    e.raiz.position.y -= min;
  }
  if (offset) e.raiz.position.add(tmp.set(...offset));
  e.raiz.updateMatrixWorld(true);
}

export interface ObjetivoIK {
  mano: 'L' | 'R';
  a: PuntoId; // body point the hand goes to
  off?: [number, number, number]; // offset in the chest frame (x = left, y = up the spine, z = forward)
  codo?: [number, number, number]; // preferred elbow direction from the shoulder, chest frame
  mundo?: boolean; // offset (and elbow direction) in world axes instead: arms hanging under gravity
}

const LIMITES: Record<string, [number, number]> = { Flex: [-70, 190], Abd: [-45, 180], Rot: [-100, 100] };

// Arm angles that put each hand on its target (coordinate descent, solved once per keyframe)
export function resolverIK(e: Esqueleto, pose: Pose, objetivos: ObjetivoIK[]): Pose {
  const p: Pose = { ...pose };
  const q = new THREE.Quaternion();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const error = () => {
    aplicarAngulos(e, p);
    e.raiz.position.set(0, 0, 0);
    e.raiz.updateMatrixWorld(true);
    e.pecho.getWorldQuaternion(q);
    let total = 0;
    for (const o of objetivos) {
      punto(e, o.a, a);
      if (o.off) a.add(o.mundo ? b.set(...o.off) : b.set(...o.off).applyQuaternion(q));
      total += punto(e, `mano${o.mano}` as PuntoId, b).distanceTo(a);
      if (o.codo) {
        punto(e, `codo${o.mano}` as PuntoId, b).sub(punto(e, `hombro${o.mano}` as PuntoId, c)).normalize();
        c.set(...o.codo).normalize();
        if (!o.mundo) c.applyQuaternion(q);
        total += 0.06 * (1 - b.dot(c));
      }
      const el = p[`el${o.mano}`] || 0;
      if (el < 0) total += -el * 0.01;
      if (el > 155) total += (el - 155) * 0.01;
      for (const [k, [min, max]] of Object.entries(LIMITES)) {
        const v = p[`sh${o.mano}${k}`] || 0;
        if (v < min) total += (min - v) * 0.01;
        if (v > max) total += (v - max) * 0.01;
      }
    }
    return total;
  };
  const claves = objetivos.flatMap((o) => ['Flex', 'Abd', 'Rot'].map((k) => `sh${o.mano}${k}`).concat(`el${o.mano}`));
  const descenso = () => {
    let mejor = error();
    for (const paso of [24, 12, 6, 3, 1.5, 0.75]) {
      for (let it = 0; it < 40; it++) {
        let mejoro = false;
        for (const k of claves) {
          for (const s of [1, -1]) {
            const antes = p[k] || 0;
            p[k] = antes + s * paso;
            const err = error();
            if (err < mejor - 1e-6) {
              mejor = err;
              mejoro = true;
            } else p[k] = antes;
          }
        }
        if (!mejoro) break;
      }
    }
    return mejor;
  };
  // Several starting arms (straight, bent, rotated) so it does not get stuck in a local minimum
  const semillas = [null, [0, 0, 0, 0], [90, 0, 0, 90], [60, 60, 70, 140], [150, 40, 60, 130], [-30, 50, 0, 120], [20, 20, -60, 145]];
  let mejor = Infinity;
  let mejorPose: Pose = p;
  for (const semilla of semillas) {
    if (mejor < 0.01) break;
    for (const o of objetivos) {
      ['Flex', 'Abd', 'Rot', 'el'].forEach((k, i) => {
        const clave = k === 'el' ? `el${o.mano}` : `sh${o.mano}${k}`;
        p[clave] = semilla ? semilla[i] : pose[clave] || 0; // first start: the pose's own arm
      });
    }
    const err = descenso();
    if (err < mejor) {
      mejor = err;
      mejorPose = { ...p };
    }
  }
  return mejorPose;
}

// Keyframe poses of an exercise with the hands already on their targets
export function prepararPoses(e: Esqueleto, keyframes: { pose: Pose; manos?: ObjetivoIK[] }[]): Pose[] {
  const cache = new Map<string, Pose>();
  return keyframes.map((k) => {
    if (!k.manos?.length) return k.pose;
    const clave = JSON.stringify([k.pose, k.manos]);
    if (!cache.has(clave)) cache.set(clave, resolverIK(e, k.pose, k.manos));
    return cache.get(clave)!;
  });
}
