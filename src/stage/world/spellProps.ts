import * as THREE from 'three';
import type { StageContext } from '../engine/contract';
import { lightingUniforms } from '../engine/lighting';
import {
  BOOK_FRAGMENT,
  BOOK_HEIGHT,
  BOOK_VERTEX,
  LOOSE_PAGES,
  PAGE_FRAGMENT,
  PAGE_LENGTH,
  PAGE_VERTEX,
  bookBodyGeometry,
} from './props/books';
import { CANDLE_BODY_FRAGMENT, CANDLE_BODY_VERTEX, CANDLE_FLAME_FRAGMENT, CANDLE_FLAME_VERTEX, candleGeometry } from './props/candles';
import { BOOK_SURFACE_EDITS, CANDLE_BODY_EDITS, CANDLE_FLAME_EDITS, patchShader } from './spellShaders';
import type { SummonedState } from './spellTimeline';

/**
 * What the spell summons: ONE book and ONE candle, built from the library
 * props' own geometry and shaders (`props/books.ts`, `props/candles.ts`), so
 * they look exactly like the floating ones — the same tooled leather, gilt,
 * fanning pages, dripping wax and layered flame — with three patches
 * (`spellShaders.ts`): a dissolve into light, a glowing seam where they
 * cross the floor, and a spectral white-blue wash; the flame grows from a
 * spark as it ignites and burns ice blue.
 *
 * Four draw calls: book body, its loose pages, candle body, flame (each an
 * InstancedMesh of one, which the props' instanced shaders expect).
 *
 * They rise through the floor out of the circle and sink back into it: the
 * floor's depth hides whatever is still below it, so nothing is clipped by
 * hand.
 */

type SpellLights = {
  /** The spell's white-blue, linear. */
  spell: THREE.Color;
  /** The summoned candle's flame body colour, linear. */
  flame: THREE.Color;
  /** Its core, linear (HDR). */
  flameCore: THREE.Color;
};

type SummonedProps = {
  group: THREE.Group;
  /** Place both for this frame. `centre`: the circle's centre (world);
   *  `radius`: the circle's radius (m); `t`: the stage time (flutter, flicker). */
  update(book: SummonedState, candle: SummonedState, centre: THREE.Vector3, radius: number, light: number, t: number): void;
  /** Patch anchors that were not found (empty when every patch applied). */
  missingPatches(): string[];
  dispose(): void;
};

/** Book and candle sizes at the landscape circle's radius (3 m). */
const BOOK_SCALE = 2.3;
const CANDLE_SCALE = 3.0;
const CANDLE_HEIGHT = 0.62;
/** Where they float, as a fraction of the circle's radius from its centre. */
const BOOK_OFFSET = new THREE.Vector3(-0.34, 0, 0.08);
const CANDLE_OFFSET = new THREE.Vector3(0.36, 0, -0.05);
const REFERENCE_RADIUS = 3;

type SurfaceUniforms = {
  uSpellDissolve: { value: number };
  uSpellGlow: { value: number };
  uSpellFloorY: { value: number };
  uSpellPatternScale: { value: number };
  uSpellColour: { value: THREE.Color };
  uSpellAnchor: { value: THREE.Vector3 };
};

function surfaceUniforms(colour: THREE.Color): SurfaceUniforms {
  return {
    uSpellDissolve: { value: 1 },
    uSpellGlow: { value: 1 },
    uSpellFloorY: { value: 0 },
    uSpellPatternScale: { value: 1 },
    uSpellColour: { value: colour },
    uSpellAnchor: { value: new THREE.Vector3() },
  };
}

function applySurface(uniforms: SurfaceUniforms, state: SummonedState, anchor: THREE.Vector3, scale: number) {
  uniforms.uSpellDissolve.value = state.dissolve;
  uniforms.uSpellGlow.value = state.glow;
  uniforms.uSpellAnchor.value.copy(anchor);
  uniforms.uSpellPatternScale.value = 1.6 / Math.max(scale, 0.05);
}

const position = new THREE.Vector3();
const anchor = new THREE.Vector3();
const scaleVector = new THREE.Vector3();
const orientation = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const matrix = new THREE.Matrix4();

function createSummonedProps(context: StageContext, lights: SpellLights): SummonedProps {
  const group = new THREE.Group();
  group.name = 'spell-summoned';
  const missing: string[] = [];
  const patched = (source: string, label: string, edits: Parameters<typeof patchShader>[2]) => {
    const result = patchShader(source, label, edits);
    missing.push(...result.missing);
    return result.source;
  };

  // ── the book ───────────────────────────────────────────────────────────
  const bookSurface = surfaceUniforms(lights.spell);
  const bookFill = new THREE.Color();
  const bookTime = { value: 0 };
  const pageTime = { value: 0 };
  const bookUniforms = {
    ...lightingUniforms(context.palette),
    uGold: { value: context.palette.gold },
    uCandleFill: { value: bookFill },
    uTime: bookTime,
    ...bookSurface,
  };
  const bodyGeometry = bookBodyGeometry();
  const bodyOpen = new Float32Array(1);
  const bodyOpenAttribute = new THREE.InstancedBufferAttribute(bodyOpen, 1);
  bodyOpenAttribute.setUsage(THREE.DynamicDrawUsage);
  bodyGeometry.setAttribute('aOpen', bodyOpenAttribute);
  // A broad, thick tome; a seeded style: gilt-edged pages, a blue ribbon.
  const bookSize = [1.05, 1.1, 1.5];
  bodyGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(bookSize), 3));
  bodyGeometry.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array([0.37, 0.55, 1, 0.9]), 4));
  const bodyMaterial = new THREE.ShaderMaterial({
    uniforms: bookUniforms,
    vertexShader: BOOK_VERTEX,
    fragmentShader: patched(BOOK_FRAGMENT, 'book body', BOOK_SURFACE_EDITS),
    side: THREE.DoubleSide,
  });
  const bookBody = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, 1);
  bookBody.setColorAt(0, new THREE.Color('#1c2a5a'));
  bookBody.frustumCulled = false;

  const sheets = LOOSE_PAGES + 1;
  const pageGeometry = new THREE.PlaneGeometry(PAGE_LENGTH, BOOK_HEIGHT * 0.94, 10, 1).translate(PAGE_LENGTH / 2, 0, 0);
  const pageOpen = new Float32Array(sheets);
  const pageOpenAttribute = new THREE.InstancedBufferAttribute(pageOpen, 1);
  pageOpenAttribute.setUsage(THREE.DynamicDrawUsage);
  const pageFan = new Float32Array(sheets);
  const pageFlipper = new Float32Array(sheets);
  for (let sheet = 0; sheet < sheets; sheet++) {
    const isFlipper = sheet === LOOSE_PAGES;
    pageFan[sheet] = isFlipper ? 0 : (sheet + 0.5) / LOOSE_PAGES;
    pageFlipper[sheet] = isFlipper ? 1 : 0;
  }
  pageGeometry.setAttribute('aPage', new THREE.InstancedBufferAttribute(pageFan, 1));
  pageGeometry.setAttribute('aFlipper', new THREE.InstancedBufferAttribute(pageFlipper, 1));
  pageGeometry.setAttribute('aBookSeed', new THREE.InstancedBufferAttribute(new Float32Array(sheets).fill(0.37), 1));
  pageGeometry.setAttribute('aOpen', pageOpenAttribute);
  pageGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: sheets }, () => bookSize).flat()), 3));
  const pageMaterial = new THREE.ShaderMaterial({
    uniforms: { ...lightingUniforms(context.palette), uTime: pageTime, ...bookSurface },
    vertexShader: PAGE_VERTEX,
    fragmentShader: patched(PAGE_FRAGMENT, 'book pages', BOOK_SURFACE_EDITS),
    side: THREE.DoubleSide,
  });
  const bookPages = new THREE.InstancedMesh(pageGeometry, pageMaterial, sheets);
  bookPages.frustumCulled = false;
  group.add(bookBody, bookPages);

  // ── the candle ─────────────────────────────────────────────────────────
  const candleSurface = surfaceUniforms(lights.spell);
  const candleTime = { value: 0 };
  const waxGlow = new THREE.Color();
  const candleAttribute = new THREE.InstancedBufferAttribute(new Float32Array([CANDLE_HEIGHT, 0.71, 0.3, 0]), 4);
  const candleBodyGeometry = candleGeometry();
  candleBodyGeometry.setAttribute('aCandle', candleAttribute);
  const candleBodyMaterial = new THREE.ShaderMaterial({
    uniforms: { ...lightingUniforms(context.palette), uFlame: { value: waxGlow }, uTime: candleTime, ...candleSurface },
    vertexShader: CANDLE_BODY_VERTEX,
    fragmentShader: patched(CANDLE_BODY_FRAGMENT, 'candle body', CANDLE_BODY_EDITS),
  });
  const candleBody = new THREE.InstancedMesh(candleBodyGeometry, candleBodyMaterial, 1);
  candleBody.frustumCulled = false;
  const flameGeometry = new THREE.PlaneGeometry(1, 1);
  flameGeometry.setAttribute('aCandle', candleAttribute);
  const flameUniforms = {
    uTime: candleTime,
    uFlame: { value: lights.flame },
    uFlameCore: { value: lights.flameCore },
    uIgnite: { value: 0 },
    uFlameGain: { value: 0 },
  };
  const flameMaterial = new THREE.ShaderMaterial({
    uniforms: flameUniforms,
    vertexShader: CANDLE_FLAME_VERTEX,
    fragmentShader: patched(CANDLE_FLAME_FRAGMENT, 'candle flame', CANDLE_FLAME_EDITS),
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const flame = new THREE.InstancedMesh(flameGeometry, flameMaterial, 1);
  flame.frustumCulled = false;
  group.add(candleBody, flame);

  return {
    group,
    update(book, candle, centre, radius, light, t) {
      const sizeFactor = radius / REFERENCE_RADIUS;

      // Book: its spine up local y, its spread facing local +x — turned so the
      // spread faces the camera (+z), leaning back a little toward the eye.
      bookBody.visible = book.visible;
      bookPages.visible = book.visible;
      if (book.visible) {
        const scale = BOOK_SCALE * sizeFactor * book.scale;
        position.copy(BOOK_OFFSET).multiplyScalar(radius).add(centre);
        position.y = book.elevation + (BOOK_HEIGHT / 2) * bookSize[1] * scale;
        euler.set(0.08 * Math.sin(t * 0.7), -Math.PI / 2 + 0.35 + book.yaw, 0.28 + 0.06 * Math.sin(t * 0.9 + 1), 'YXZ');
        orientation.setFromEuler(euler);
        scaleVector.setScalar(scale);
        matrix.compose(position, orientation, scaleVector);
        bookBody.setMatrixAt(0, matrix);
        for (let sheet = 0; sheet < sheets; sheet++) bookPages.setMatrixAt(sheet, matrix);
        bookBody.instanceMatrix.needsUpdate = true;
        bookPages.instanceMatrix.needsUpdate = true;
        // Open: a slow wing-beat like the library's books, the pages trailing it.
        const beat = (time: number) => 1.05 + 0.32 * Math.sin(time * 2.2) + 0.08 * Math.sin(time * 4.4 + 0.6);
        bodyOpen[0] = book.action * beat(t);
        for (let sheet = 0; sheet < sheets; sheet++) pageOpen[sheet] = book.action * beat(t - 0.05 - 0.04 * Math.abs(sheet - LOOSE_PAGES / 2));
        bodyOpenAttribute.needsUpdate = true;
        pageOpenAttribute.needsUpdate = true;
        bookTime.value = t;
        // The pages flutter faster than the library's (the spell's wind).
        pageTime.value = t * 1.7;
        bookFill.copy(lights.spell).multiplyScalar(0.12 + 0.3 * light);
        applySurface(bookSurface, book, anchor.copy(position), scale);
      }

      // Candle: upright, turning slowly, swaying a little.
      candleBody.visible = candle.visible;
      flame.visible = candle.visible && candle.action > 0.001;
      if (candle.visible) {
        const scale = CANDLE_SCALE * sizeFactor * candle.scale;
        position.copy(CANDLE_OFFSET).multiplyScalar(radius).add(centre);
        position.y = candle.elevation;
        euler.set(0.04 * Math.sin(t * 0.8 + 2), candle.yaw, 0.05 * Math.sin(t * 0.6), 'YXZ');
        orientation.setFromEuler(euler);
        scaleVector.setScalar(scale);
        matrix.compose(position, orientation, scaleVector);
        candleBody.setMatrixAt(0, matrix);
        flame.setMatrixAt(0, matrix);
        candleBody.instanceMatrix.needsUpdate = true;
        flame.instanceMatrix.needsUpdate = true;
        candleTime.value = t;
        // The flame flares past full size as it catches, then settles.
        const catching = candle.action;
        const flare = catching < 1 ? catching * (1 + 0.5 * Math.sin(Math.PI * catching)) : 1;
        flameUniforms.uIgnite.value = Math.min(1, flare);
        flameUniforms.uFlameGain.value = Math.min(1.6, flare * (1 + 0.6 * (1 - catching))) * (1 - candle.dissolve);
        waxGlow.copy(lights.flame).multiplyScalar(0.15 + 0.6 * catching);
        applySurface(candleSurface, candle, anchor.set(position.x, position.y + CANDLE_HEIGHT * scale * 0.5, position.z), scale * CANDLE_HEIGHT);
      }
    },
    missingPatches: () => [...missing],
    dispose() {
      bodyGeometry.dispose();
      pageGeometry.dispose();
      candleBodyGeometry.dispose();
      flameGeometry.dispose();
      bodyMaterial.dispose();
      pageMaterial.dispose();
      candleBodyMaterial.dispose();
      flameMaterial.dispose();
      bookBody.dispose();
      bookPages.dispose();
      candleBody.dispose();
      flame.dispose();
    },
  };
}

export { createSummonedProps };
export type { SpellLights, SummonedProps };
