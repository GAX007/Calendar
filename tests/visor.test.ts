import test from 'node:test';
import assert from 'node:assert/strict';
import { EJERCICIOS_VISOR } from '../src/visor/ejercicios';
import { crearEsqueleto, prepararPoses, colocar, punto } from '../src/visor/rig';
import { fotograma, duracion, EASINGS } from '../src/visor/animacion';

test('excéntrica lenta y concéntrica explosiva', () => {
  // At 30 % of the phase the explosive curve has done most of the way, the controlled one very little
  assert.ok(EASINGS.explosivo(0.3) > 0.85);
  assert.ok(EASINGS.lento(0.3) < 0.2);
  for (const e of Object.values(EASINGS)) {
    assert.ok(Math.abs(e(0)) < 1e-9);
    assert.ok(Math.abs(e(1) - 1) < 1e-9);
  }
});

test('cada animación se coloca sobre el suelo, sin hundirse ni valores rotos', () => {
  const e = crearEsqueleto();
  for (const v of Object.values(EJERCICIOS_VISOR)) {
    const poses = prepararPoses(e, v.keyframes);
    const total = duracion(v);
    for (let t = 0; t < total; t += total / 23) {
      const f = fotograma(v, poses, t);
      for (const val of Object.values(f.pose)) assert.ok(Number.isFinite(val), `${v.id}: ángulo roto en t=${t}`);
      colocar(e, f.pose, { ancla: v.ancla, en: v.en, suelo: v.suelo, contacto: v.contacto }, f.offset);
      const pies = Math.min(punto(e, 'talonL').y, punto(e, 'talonR').y, punto(e, 'punteraL').y, punto(e, 'punteraR').y);
      assert.ok(pies > -0.05, `${v.id}: pies bajo el suelo en t=${t.toFixed(2)} (${pies.toFixed(2)})`);
      assert.ok(f.etiqueta.length > 0, `${v.id}: fase sin etiqueta en t=${t.toFixed(2)}`);
    }
  }
});

test('las manos llegan a la barra, la frente o la nuca', () => {
  const e = crearEsqueleto();
  for (const id of ['back-squat', 'bench-press', 'neck-isometric', 'overhead-press', 'pull-up']) {
    const v = EJERCICIOS_VISOR[id];
    const poses = prepararPoses(e, v.keyframes);
    v.keyframes.forEach((k, i) => {
      if (!k.manos) return;
      colocar(e, poses[i], { ancla: null, suelo: false });
      for (const o of k.manos) {
        const mano = punto(e, `mano${o.mano}`);
        const destino = punto(e, o.a);
        assert.ok(mano.distanceTo(destino) < 0.8, `${id} k${i}: mano ${o.mano} lejos de ${o.a}`);
      }
    });
  }
});
