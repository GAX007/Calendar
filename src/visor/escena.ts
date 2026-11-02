import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Color, EjercicioVisual, Musculo, MusculoId, Overlay, Prop, PuntoId } from './ejercicios';
import { crearEsqueleto, colocar, punto, prepararPoses, type Esqueleto } from './rig';
import { BICI, fotograma, type Fotograma } from './animacion';

// Heatmap: neutral body, primary muscles red/orange pulsing with the effort, stabilizers cyan
const C = {
  fondo: 0x0b1220,
  cuerpo: 0x334155,
  primarioBajo: new THREE.Color('#FF9500'),
  primarioAlto: new THREE.Color('#FF3B30'),
  blanco: new THREE.Color('#FFFFFF'),
  estabilizador: new THREE.Color('#00F5D4'),
  fuerza: 0xffd60a,
  guia: 0x34c759,
  rojo: 0xff3b30,
  particula: 0x4cc9f0,
  equipo: 0x94a3b8,
  mueble: 0x1e293b,
};
const COLOR: Record<Color, number> = { fuerza: C.fuerza, guia: C.guia, cian: 0x00f5d4, rojo: C.rojo, blanco: 0xffffff };

type Lado = 'L' | 'R';
type Hueso = 'pelvis' | 'abdomen' | 'pecho' | 'cabeza' | 'hombro' | 'codo' | 'cadera' | 'rodilla';
// Where each muscle sits: bone, center (x mirrored for the right side) and radii of the ellipsoid
const MUSCULOS: Record<MusculoId, { hueso: Hueso; c: [number, number, number]; r: [number, number, number]; lados: boolean }> = {
  cuadriceps: { hueso: 'cadera', c: [0, -0.21, 0.045], r: [0.062, 0.16, 0.05], lados: true },
  isquios: { hueso: 'cadera', c: [0, -0.22, -0.045], r: [0.058, 0.16, 0.045], lados: true },
  aductores: { hueso: 'cadera', c: [-0.04, -0.15, 0], r: [0.04, 0.14, 0.05], lados: true },
  gluteo: { hueso: 'pelvis', c: [0.075, -0.05, -0.08], r: [0.08, 0.085, 0.06], lados: true },
  gluteoMedio: { hueso: 'pelvis', c: [0.13, 0.02, -0.02], r: [0.045, 0.065, 0.06], lados: true },
  rotadores: { hueso: 'pelvis', c: [0.08, -0.07, -0.07], r: [0.06, 0.03, 0.035], lados: true },
  capsulaCadera: { hueso: 'cadera', c: [0, -0.01, 0], r: [0.07, 0.07, 0.07], lados: true },
  psoas: { hueso: 'pelvis', c: [0.06, 0.02, 0.06], r: [0.03, 0.1, 0.03], lados: true },
  gemelos: { hueso: 'rodilla', c: [0, -0.13, -0.04], r: [0.045, 0.12, 0.04], lados: true },
  tibial: { hueso: 'rodilla', c: [0.01, -0.15, 0.035], r: [0.03, 0.12, 0.025], lados: true },
  abdomen: { hueso: 'abdomen', c: [0, 0.12, 0.085], r: [0.085, 0.13, 0.035], lados: false },
  oblicuos: { hueso: 'abdomen', c: [0.1, 0.11, 0.03], r: [0.035, 0.12, 0.065], lados: true },
  lumbares: { hueso: 'abdomen', c: [0, 0.11, -0.085], r: [0.07, 0.14, 0.035], lados: false },
  cuadradoLumbar: { hueso: 'abdomen', c: [0.075, 0.07, -0.06], r: [0.03, 0.09, 0.03], lados: true },
  dorsal: { hueso: 'pecho', c: [0.11, 0.1, -0.07], r: [0.06, 0.13, 0.04], lados: true },
  romboides: { hueso: 'pecho', c: [0, 0.2, -0.1], r: [0.08, 0.07, 0.025], lados: false },
  trapecio: { hueso: 'pecho', c: [0, 0.29, -0.05], r: [0.13, 0.05, 0.05], lados: false },
  pectoral: { hueso: 'pecho', c: [0.08, 0.18, 0.1], r: [0.08, 0.06, 0.03], lados: true },
  serrato: { hueso: 'pecho', c: [0.15, 0.12, 0.04], r: [0.03, 0.07, 0.045], lados: true },
  deltoidesAnt: { hueso: 'hombro', c: [0, -0.04, 0.035], r: [0.05, 0.075, 0.04], lados: true },
  deltoidesPost: { hueso: 'hombro', c: [0, -0.04, -0.035], r: [0.05, 0.075, 0.04], lados: true },
  triceps: { hueso: 'hombro', c: [0, -0.16, -0.032], r: [0.035, 0.11, 0.03], lados: true },
  biceps: { hueso: 'hombro', c: [0, -0.16, 0.032], r: [0.035, 0.1, 0.03], lados: true },
  antebrazo: { hueso: 'codo', c: [0, -0.12, 0], r: [0.035, 0.11, 0.035], lados: true },
  cuelloAnt: { hueso: 'cabeza', c: [0, 0.04, 0.035], r: [0.055, 0.06, 0.03], lados: false },
  cuelloPost: { hueso: 'cabeza', c: [0, 0.04, -0.04], r: [0.06, 0.07, 0.03], lados: false },
  cuelloLat: { hueso: 'cabeza', c: [0.045, 0.04, 0], r: [0.025, 0.06, 0.035], lados: true },
  toracica: { hueso: 'pecho', c: [0, 0.13, -0.1], r: [0.045, 0.17, 0.025], lados: false },
  rodillaAncla: { hueso: 'rodilla', c: [0, 0, 0.02], r: [0.07, 0.07, 0.07], lados: true },
};

function huesoDe(e: Esqueleto, h: Hueso, l: Lado): THREE.Object3D {
  if (h === 'hombro' || h === 'codo' || h === 'cadera' || h === 'rodilla') return e[h][l];
  return e[h];
}

export interface EstadoVisor {
  etiqueta: string;
  fase: number;
  enHold: boolean;
  progreso: number;
}

export interface Visor {
  setPausa(p: boolean): void;
  setVelocidad(v: number): void;
  destruir(): void;
}

export function crearVisor(contenedor: HTMLElement, v: EjercicioVisual, onEstado: (s: EstadoVisor) => void): Visor {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(C.fondo);
  contenedor.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.fondo, 5, 11);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
  camera.position.set(...v.camara.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...v.camara.mira);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.8;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI * 0.53;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xcbd5e1, 0x0b1220, 1.4));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(2, 4, 3);
  scene.add(sol);

  // Floor
  const suelo = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshStandardMaterial({ color: 0x111a2e, roughness: 1 }));
  suelo.rotation.x = -Math.PI / 2;
  scene.add(suelo);
  const rejilla = new THREE.GridHelper(6, 24, 0x1f2a44, 0x1f2a44);
  rejilla.position.y = 0.001;
  scene.add(rejilla);

  // Mannequin
  const e = crearEsqueleto();
  scene.add(e.raiz);
  const matCuerpo = new THREE.MeshStandardMaterial({ color: C.cuerpo, emissive: C.cuerpo, emissiveIntensity: 0.55, transparent: true, opacity: 0.7, roughness: 0.55, metalness: 0.05 });
  const malla = (geo: THREE.BufferGeometry, padre: THREE.Object3D, pos: [number, number, number], escala?: [number, number, number], rotZ = 0) => {
    const m = new THREE.Mesh(geo, matCuerpo);
    m.position.set(...pos);
    if (escala) m.scale.set(...escala);
    m.rotation.z = rotZ;
    padre.add(m);
    return m;
  };
  malla(new THREE.CapsuleGeometry(0.1, 0.12, 6, 14), e.pelvis, [0, -0.02, 0], [1, 1, 0.85], Math.PI / 2);
  malla(new THREE.CapsuleGeometry(0.1, 0.12, 6, 14), e.abdomen, [0, 0.12, 0], [1.05, 1, 0.8]);
  malla(new THREE.CapsuleGeometry(0.12, 0.1, 6, 14), e.pecho, [0, 0.15, 0], [1.3, 1, 0.82]);
  malla(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), e.cabeza, [0, 0.03, 0]);
  malla(new THREE.SphereGeometry(0.105, 18, 14), e.cabeza, [0, 0.16, 0.01], [0.92, 1.08, 1]);
  for (const l of ['L', 'R'] as const) {
    malla(new THREE.SphereGeometry(0.055, 12, 10), e.hombro[l], [0, 0, 0]);
    malla(new THREE.CapsuleGeometry(0.045, 0.2, 4, 10), e.hombro[l], [0, -0.145, 0]);
    malla(new THREE.CapsuleGeometry(0.038, 0.22, 4, 10), e.codo[l], [0, -0.14, 0]);
    malla(new THREE.SphereGeometry(0.045, 10, 8), e.codo[l], [0, -0.3, 0], [0.8, 1.2, 0.6]);
    malla(new THREE.CapsuleGeometry(0.068, 0.3, 4, 12), e.cadera[l], [0, -0.22, 0]);
    malla(new THREE.CapsuleGeometry(0.05, 0.32, 4, 10), e.rodilla[l], [0, -0.215, 0]);
    malla(new THREE.BoxGeometry(0.085, 0.05, 0.24), e.tobillo[l], [0, -0.055, 0.06]);
  }

  // Muscles of the exercise
  const glow = (color: THREE.Color) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const esfera = new THREE.SphereGeometry(1, 20, 14);
  const musculos: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; clave: Musculo; primario: boolean }[] = [];
  const anadir = (lista: Musculo[], primario: boolean) => {
    const vistos = new Set<string>();
    for (const m of lista) {
      const [id, lado] = m.split('.') as [MusculoId, Lado | undefined];
      const def = MUSCULOS[id];
      const lados: Lado[] = def.lados ? (lado ? [lado] : ['L', 'R']) : ['L'];
      for (const l of lados) {
        const clave = (def.lados ? `${id}.${l}` : id) as Musculo;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        const mat = glow(primario ? C.primarioAlto : C.estabilizador);
        const mesh = new THREE.Mesh(esfera, mat);
        mesh.position.set(def.c[0] * (l === 'R' ? -1 : 1), def.c[1], def.c[2]);
        mesh.scale.set(...def.r);
        huesoDe(e, def.hueso, l).add(mesh);
        musculos.push({ mesh, mat, clave, primario });
      }
    }
  };
  anadir(v.estabilizadores, false);
  anadir(v.primarios, true);

  // Equipment
  const matEquipo = new THREE.MeshStandardMaterial({ color: C.equipo, metalness: 0.7, roughness: 0.3 });
  const matMueble = new THREE.MeshStandardMaterial({ color: C.mueble, roughness: 0.8 });
  const matDisco = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, metalness: 0.2 });
  const actualizar: ((f: Fotograma) => void)[] = [];
  const X = new THREE.Vector3(1, 0, 0);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  const barraConDiscos = (largo: number, discos: number) => {
    const g = new THREE.Group();
    const barra = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, largo, 10), matEquipo);
    barra.rotation.z = Math.PI / 2;
    g.add(barra);
    for (let i = 0; i < discos; i++) {
      for (const s of [1, -1]) {
        const d = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - i * 0.03, 0.2 - i * 0.03, 0.035, 28), matDisco);
        d.rotation.z = Math.PI / 2;
        d.position.x = s * (largo / 2 - 0.2 - i * 0.04);
        g.add(d);
      }
    }
    return g;
  };

  const crearProp = (p: Prop) => {
    switch (p.tipo) {
      case 'barra': {
        const g = barraConDiscos(1.9, p.discos ?? 2);
        scene.add(g);
        actualizar.push(() => {
          const a = punto(e, 'manoL', tmpA);
          const b = punto(e, 'manoR', tmpB);
          g.position.copy(a).add(b).multiplyScalar(0.5);
          const dir = a.sub(b);
          if (dir.length() < 0.15) dir.set(1, 0, 0);
          g.quaternion.setFromUnitVectors(X, dir.normalize());
        });
        break;
      }
      case 'mancuernas': {
        for (const l of ['L', 'R'] as const) {
          const g = new THREE.Group();
          const mango = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8), matEquipo);
          mango.rotation.x = Math.PI / 2;
          g.add(mango);
          for (const s of [1, -1]) {
            const cabeza = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 6), matDisco);
            cabeza.rotation.x = Math.PI / 2;
            cabeza.position.z = s * 0.1;
            g.add(cabeza);
          }
          scene.add(g);
          actualizar.push(() => g.position.copy(punto(e, `mano${l}` as PuntoId, tmpA)));
        }
        break;
      }
      case 'landmine': {
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.16), matMueble);
        base.position.set(p.ancla[0], 0.03, p.ancla[2]);
        scene.add(base);
        const barra = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 10), matEquipo);
        const disco = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.035, 24), matDisco);
        scene.add(barra, disco);
        const ancla = new THREE.Vector3(...p.ancla);
        actualizar.push(() => {
          const agarre = punto(e, p.agarre, tmpA);
          const dir = tmpB.copy(agarre).sub(ancla);
          const largo = dir.length() + 0.12;
          dir.normalize();
          barra.scale.y = largo;
          barra.position.copy(ancla).addScaledVector(dir, largo / 2);
          barra.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          disco.position.copy(ancla).addScaledVector(dir, largo - 0.3);
          disco.quaternion.copy(barra.quaternion);
        });
        break;
      }
      case 'banco':
      case 'cajon': {
        const m = new THREE.Mesh(new THREE.BoxGeometry(...p.tam), matMueble);
        m.position.set(...p.pos);
        scene.add(m);
        break;
      }
      case 'dominadas': {
        const barra = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 10), matEquipo);
        barra.rotation.z = Math.PI / 2;
        barra.position.set(0, p.y, 0);
        scene.add(barra);
        for (const s of [1, -1]) {
          const poste = new THREE.Mesh(new THREE.BoxGeometry(0.06, p.y + 0.1, 0.06), matMueble);
          poste.position.set(s * 0.75, (p.y + 0.1) / 2, 0);
          scene.add(poste);
        }
        break;
      }
      case 'bici': {
        const en = v.en || [0, 1, 0];
        const eje = new THREE.Vector3(en[0], en[1] + BICI.cadera[1] + BICI.eje[1], en[2] + BICI.eje[0]);
        const sillin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.26), matMueble);
        sillin.position.set(en[0], en[1] - 0.13, en[2] - 0.03);
        const tubo = new THREE.Mesh(new THREE.BoxGeometry(0.06, en[1] - 0.15, 0.06), matMueble);
        tubo.position.set(en[0], (en[1] - 0.15) / 2, en[2] - 0.05);
        const rueda = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 32), matDisco);
        rueda.rotation.z = Math.PI / 2;
        rueda.position.set(eje.x, 0.3, eje.z + 0.42);
        const biela = new THREE.Mesh(new THREE.TorusGeometry(BICI.biela, 0.008, 6, 40), new THREE.MeshBasicMaterial({ color: 0x475569 }));
        biela.rotation.y = Math.PI / 2;
        biela.position.copy(eje);
        const manillar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 8), matEquipo);
        manillar.rotation.z = Math.PI / 2;
        const poste = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05), matMueble);
        scene.add(sillin, tubo, rueda, biela, manillar, poste);
        const pedales = (['L', 'R'] as const).map(() => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.06), matEquipo);
          scene.add(m);
          return m;
        });
        actualizar.push(() => {
          const manos = punto(e, 'manos', tmpA);
          manillar.position.copy(manos);
          poste.scale.y = manos.y;
          poste.position.set(manos.x, manos.y / 2, manos.z + 0.08);
          pedales.forEach((m, i) => m.position.copy(punto(e, i === 0 ? 'metatarsoL' : 'metatarsoR', tmpB)));
        });
        break;
      }
      case 'pared': {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), new THREE.MeshStandardMaterial({ color: 0x1a2438, side: THREE.DoubleSide }));
        m.position.set(0, 1.1, p.z);
        m.rotation.y = Math.PI;
        scene.add(m);
        break;
      }
      case 'polea': {
        const torre = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2, 0.14), matMueble);
        torre.position.set(p.ancla[0] + 0.1, 1, p.ancla[2]);
        scene.add(torre);
        const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xe2e8f0 }));
        scene.add(cable);
        const ancla = new THREE.Vector3(...p.ancla);
        actualizar.push(() => {
          cable.geometry.setFromPoints([ancla, punto(e, 'manos', tmpA).clone()]);
        });
        break;
      }
      case 'esterilla': {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshStandardMaterial({ color: 0x1b2a3f, roughness: 1 }));
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.003;
        scene.add(m);
        break;
      }
    }
  };
  (v.props || []).forEach(crearProp);

  // Biomechanical guides
  const visible = (o: { fases?: number[] }, f: Fotograma) => !o.fases || o.fases.includes(f.fase);
  const crearOverlay = (o: Overlay) => {
    switch (o.tipo) {
      case 'flecha': {
        const dir = new THREE.Vector3(...o.dir).normalize();
        const largo = o.largo ?? 0.3;
        const a = new THREE.ArrowHelper(dir, new THREE.Vector3(), largo, COLOR[o.color || 'fuerza'], largo * 0.3, largo * 0.18);
        scene.add(a);
        actualizar.push((f) => {
          const esf = f.esfuerzo('*' as Musculo);
          a.visible = visible(o, f) && (o.minEsfuerzo === undefined || esf >= o.minEsfuerzo);
          // An external force (hand against the head) ends on the point; the rest start from it
          a.position.copy(punto(e, o.en, tmpA));
          if (o.hacia) a.position.addScaledVector(dir, -largo * 1.05);
        });
        break;
      }
      case 'linea':
      case 'plomada': {
        const n = o.tipo === 'linea' ? o.puntos.length : 2;
        const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: n }, () => new THREE.Vector3()));
        const mat = new THREE.LineDashedMaterial({ color: COLOR[o.color || 'guia'], dashSize: 0.045, gapSize: 0.03, transparent: true, opacity: 0.95 });
        const linea = new THREE.Line(geo, mat);
        linea.frustumCulled = false;
        scene.add(linea);
        actualizar.push((f) => {
          linea.visible = visible(o, f);
          const pts = o.tipo === 'linea' ? o.puntos.map((id) => punto(e, id)) : [punto(e, o.en), punto(e, o.en).setY(0)];
          geo.setFromPoints(pts);
          linea.computeLineDistances();
        });
        break;
      }
      case 'estela': {
        const N = 34;
        const pts = Array.from({ length: N }, () => new THREE.Vector3());
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const colores = new Float32Array(N * 3);
        const base = new THREE.Color(COLOR[o.color || 'blanco']);
        for (let i = 0; i < N; i++) base.clone().multiplyScalar(i / N).toArray(colores, i * 3);
        geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
        const linea = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending }));
        linea.frustumCulled = false;
        scene.add(linea);
        let iniciada = false;
        actualizar.push(() => {
          const p = punto(e, o.en, tmpA);
          if (!iniciada) {
            pts.forEach((q) => q.copy(p));
            iniciada = true;
          }
          pts.shift();
          pts.push(p.clone());
          geo.setFromPoints(pts);
        });
        break;
      }
      case 'anillo': {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.095, 40), new THREE.MeshBasicMaterial({ color: COLOR[o.color || 'fuerza'], transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        scene.add(m);
        actualizar.push((f) => {
          m.visible = visible(o, f);
          const p = punto(e, o.en, tmpA);
          m.position.copy(p);
          if (o.en.startsWith('metatarso') || o.en.startsWith('talon')) m.position.y = 0.01;
          const pulso = 1 + 0.25 * Math.sin(performance.now() / 160);
          m.scale.setScalar(pulso);
          (m.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(performance.now() / 160);
          if (o.en === 'lumbar') m.lookAt(camera.position);
        });
        break;
      }
      case 'giro': {
        const g = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: C.fuerza, transparent: true, opacity: 0.9 });
        const arco = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 8, 48, Math.PI * 1.25), mat);
        const punta = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 12), mat);
        const ang = Math.PI * 1.25;
        punta.position.set(Math.cos(ang) * 0.3, Math.sin(ang) * 0.3, 0);
        punta.rotation.z = ang + (o.sentido > 0 ? 0 : Math.PI);
        g.add(arco, punta);
        g.rotation.x = -Math.PI / 2;
        scene.add(g);
        actualizar.push((f) => {
          g.visible = visible(o, f);
          g.position.copy(punto(e, o.en, tmpA));
        });
        break;
      }
      case 'particulas': {
        const N = 26;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(N * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const puntos = new THREE.Points(geo, new THREE.PointsMaterial({ color: C.particula, size: 0.035, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        puntos.frustumCulled = false;
        scene.add(puntos);
        const fase = Array.from({ length: N }, (_, i) => i / N);
        actualizar.push(() => {
          const ruta = o.recorrido.map((id) => punto(e, id));
          const t = performance.now() / 4000;
          for (let i = 0; i < N; i++) {
            const u = (fase[i] + t) % 1;
            const s = u * (ruta.length - 1);
            const k = Math.min(Math.floor(s), ruta.length - 2);
            tmpA.lerpVectors(ruta[k], ruta[k + 1], s - k);
            tmpA.x += Math.sin(i * 12.9) * 0.03;
            tmpA.z += Math.cos(i * 7.3) * 0.03;
            tmpA.toArray(pos, i * 3);
          }
          geo.attributes.position.needsUpdate = true;
        });
        break;
      }
      case 'pedales': {
        const flechas = (['L', 'R'] as const).map(() => {
          const a = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 0.22, C.fuerza, 0.07, 0.045);
          scene.add(a);
          return a;
        });
        actualizar.push((f) => {
          flechas.forEach((a, i) => {
            const ang = (f.pedal || 0) + (i === 0 ? 0 : Math.PI);
            // Tangent of the crank circle in the direction of pedalling
            a.setDirection(tmpB.set(0, Math.sin(ang), Math.cos(ang)).normalize());
            a.position.copy(punto(e, i === 0 ? 'metatarsoL' : 'metatarsoR', tmpA));
          });
        });
        break;
      }
    }
  };
  (v.overlays || []).forEach(crearOverlay);

  // Animation
  const poses = prepararPoses(e, v.keyframes);
  const colocacion = { ancla: v.ancla, en: v.en, suelo: v.suelo, contacto: v.contacto };
  let t = 0;
  let pausa = false;
  let velocidad = 1;
  let ultimo = performance.now();
  let raf = 0;
  let ultimaClave = '';
  const color = new THREE.Color();

  const pintarMusculos = (f: Fotograma, ahora: number) => {
    for (const m of musculos) {
      if (!m.primario) {
        m.mat.color.copy(C.estabilizador);
        m.mat.opacity = 0.5 + 0.06 * Math.sin(ahora / 500);
        continue;
      }
      const esf = Math.max(0, Math.min(1, f.esfuerzo(m.clave)));
      // Pulse faster and brighter with the effort; full effort flashes towards white
      const pulso = 0.85 + 0.15 * Math.sin((ahora / 1000) * (4 + 10 * esf));
      color.copy(C.primarioBajo).lerp(C.primarioAlto, esf);
      if (esf > 0.92) color.lerp(C.blanco, (esf - 0.92) * 5);
      m.mat.color.copy(color);
      m.mat.opacity = (0.18 + 0.72 * esf) * pulso;
      m.mesh.scale.set(...MUSCULOS[m.clave.split('.')[0] as MusculoId].r).multiplyScalar(1 + 0.08 * esf);
    }
  };

  const tamano = () => {
    const w = contenedor.clientWidth || 1;
    const h = contenedor.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    // A narrow (phone) canvas needs the camera further away to fit the whole movement
    const lejos = camera.aspect < 1 ? Math.pow(1 / camera.aspect, 0.7) : 1;
    camera.position.copy(controls.target).add(tmpA.set(...v.camara.pos).sub(controls.target).multiplyScalar(lejos));
    camera.updateProjectionMatrix();
  };
  tamano();
  const ro = new ResizeObserver(tamano);
  ro.observe(contenedor);

  const bucle = () => {
    raf = requestAnimationFrame(bucle);
    const ahora = performance.now();
    const dt = Math.min(0.1, (ahora - ultimo) / 1000);
    ultimo = ahora;
    if (!pausa) t += dt * velocidad;
    const f = fotograma(v, poses, t);
    colocar(e, f.pose, colocacion, f.offset);
    pintarMusculos(f, ahora);
    actualizar.forEach((u) => u(f));
    controls.update();
    renderer.render(scene, camera);
    const clave = `${f.etiqueta}|${f.fase}|${f.enHold}|${Math.round(f.progresoFase * 20)}`;
    if (clave !== ultimaClave) {
      ultimaClave = clave;
      onEstado({ etiqueta: f.etiqueta, fase: f.fase, enHold: f.enHold, progreso: f.progresoFase });
    }
  };
  bucle();

  return {
    setPausa: (p) => {
      pausa = p;
    },
    setVelocidad: (x) => {
      velocidad = x;
    },
    destruir: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
