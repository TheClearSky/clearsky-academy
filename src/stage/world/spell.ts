import * as THREE from 'three';
import { airUniforms } from '../engine/air';
import { worldBufferSize } from '../engine/contract';
import type { AssetClass, AssetOption, StageContext } from '../engine/contract';
import { seededRandom } from '../engine/random';
import {
  SPELL_BAKE_FRAGMENT,
  SPELL_BAKE_VERTEX,
  SPELL_CIRCLE_FRAGMENT,
  SPELL_CIRCLE_VERTEX,
  SPELL_COLUMN_FRAGMENT,
  SPELL_COLUMN_VERTEX,
  SPELL_DISC_RADIUS,
  SPELL_LAYER_SPANS,
  SPELL_SPARKLE_FRAGMENT,
  SPELL_SPARKLE_VERTEX,
} from './spellShaders';
import { createSummonedProps } from './spellProps';
import type { SpellLights } from './spellProps';
import { SPELL_LAYERS, calmSpellFrame, spellFrame, spellPlacement } from './spellTimeline';
import type { SpellFrame } from './spellTimeline';

/**
 * Spell class: a blue-white, dreamy summoning circle on the floor in the
 * middle of the stage, below the hero — the owner (2026-10-12): "center is
 * too empty, add a blue white dreamy spell inspired by the hellscape spell
 * with proper sequences that spawn a book and a candle and then they go
 * back into the spell and spell gets over."
 *
 * The circle is Nodestra's hellscape magic circle, hell-02 (`hell/hell-src/
 * hell-02-circle-motion-glsl.ts`, run in the landing by `scene/circles-
 * life.ts`), re-coloured ice blue / lavender / white and laid on the floor:
 *  - its design is BAKED once into six small polar textures, one per ring
 *    layer (`spellShaders.ts`, hell-02 lines 4-21; the bake loop is
 *    `circles-life.ts:291-334` › `bakeLayers`), and baked again when a lost
 *    WebGL context comes back (`restore`);
 *  - ONE disc mesh draws all six layers (hell-02 used a mesh per layer):
 *    each ring turns by an offset in its texture's x, counter-rotating;
 *  - draw-on by angle, pen-order strokes, rune pops, the ignition flash,
 *    shock ring and pulses are hell-02's masks, driven by a pure timeline
 *    (`spellTimeline.ts`) instead of hell-02's per-frame integration.
 * Round it: a soft light column (`spellShaders.ts` › column), rising
 * sparkles (instanced quads, the motes' technique), and the summoned book
 * and candle (`spellProps.ts`), built from the library props' own geometry
 * and shaders.
 *
 * Options:
 *  - `spell`  — the full 22 s summoning loop (`spellTimeline.ts`);
 *  - `circle` — only the circle, fully drawn, turning slowly and breathing;
 *  - `none`   — nothing.
 * Under reduced motion the stage draws still frames only: both `spell` and
 * `circle` then show the calm circle at a fixed moment, no sequence. The
 * class reads the visitor's `prefers-reduced-motion` itself (the stage is
 * rebuilt when it changes — `react/StageProvider.tsx`), so the asset-class
 * contract needs no new field.
 *
 * Cost: 7 draw calls at most (circle, column, sparkles, book body, pages,
 * candle, flame), fewer while idle (the disc and column are hidden when
 * they would add nothing). Six bake renders at start-up. LOW tier: half-size
 * bake textures, no anisotropic filtering, fewer sparkles.
 */

const OPTIONS: readonly AssetOption[] = [
  { id: 'spell', label: 'Summoning', description: 'A blue-white circle draws itself on, ignites, summons a book and a candle, takes them back and unwinds — a 22 s loop.' },
  { id: 'circle', label: 'Calm circle', description: 'Only the circle: fully drawn, its rings turning slowly and breathing. No summons.' },
  { id: 'none', label: 'None', description: 'An empty floor.' },
];

/** Sparkle counts per tier. */
const SPARKLES = { high: 180, medium: 120, low: 60 } as const;
/** The light column: radius (fraction of the circle's) and height (m). */
const COLUMN_RADIUS = 0.55;
const COLUMN_HEIGHT = 6.5;
/** A hair above the floor (it never z-fights the checker at 12 m). */
const CIRCLE_LIFT = 0.012;

/** The spell's colours (linear): ice-blue lines, a lavender halo, white-blue heat. */
function spellColours() {
  return {
    line: new THREE.Color('#8ec5ff').multiplyScalar(1.8),
    halo: new THREE.Color('#7d6bff').multiplyScalar(0.38),
    hot: new THREE.Color(2.0, 2.3, 2.8),
    columnCore: new THREE.Color('#dfe9ff'),
    columnEdge: new THREE.Color('#8a7dff').multiplyScalar(0.7),
    sparkleIce: new THREE.Color('#bfe0ff'),
    sparkleLavender: new THREE.Color('#b9a8ff'),
    lights: {
      spell: new THREE.Color('#a9ccff'),
      flame: new THREE.Color('#7fb2ff'),
      flameCore: new THREE.Color(0.85, 0.93, 1.0).multiplyScalar(1.05),
    } satisfies SpellLights,
  };
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/** One polar render target per ring layer (hell-02's sizes: 2048 wide for
 *  the outer rings, 1024 inside; ≤ 512 texels across the annulus). */
function createLayerTargets(renderer: THREE.WebGLRenderer, low: boolean): THREE.WebGLRenderTarget[] {
  const anisotropy = low ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return SPELL_LAYER_SPANS.map(([r0, r1]) => {
    const width = (Math.PI * 2 * r1 > 2.5 ? 2048 : 1024) / (low ? 2 : 1);
    const texel = (Math.PI * 2 * r1) / width;
    const height = Math.min(low ? 256 : 512, Math.ceil((r1 - r0) / texel));
    const target = new THREE.WebGLRenderTarget(width, height, {
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: false,
    });
    target.texture.anisotropy = anisotropy;
    return target;
  });
}

/** Draw the design into the layer targets (`circles-life.ts` › `bakeLayers`). */
function bakeLayers(renderer: THREE.WebGLRenderer, targets: THREE.WebGLRenderTarget[]) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uBakeLayer: { value: 0 },
      uR0: { value: 0 },
      uR1: { value: 1 },
      uPx: { value: 0.003 },
      uSeed: { value: 2.618 },
    },
    vertexShader: SPELL_BAKE_VERTEX,
    fragmentShader: SPELL_BAKE_FRAGMENT,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const previous = renderer.getRenderTarget();
  targets.forEach((target, layer) => {
    const [r0, r1] = SPELL_LAYER_SPANS[layer];
    const texel = (Math.PI * 2 * r1) / target.width;
    material.uniforms.uBakeLayer.value = layer;
    material.uniforms.uR0.value = r0;
    material.uniforms.uR1.value = r1;
    material.uniforms.uPx.value = Math.max(texel, (r1 - r0) / target.height, 0.0028);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  });
  renderer.setRenderTarget(previous);
  material.dispose();
  quad.geometry.dispose();
}

function create(context: StageContext): AssetClass {
  const { renderer, tier, palette } = context;
  const reducedMotion = prefersReducedMotion();
  const low = tier.tier === 'low';
  const colours = spellColours();
  const root = new THREE.Group();
  root.name = 'spell';
  context.scene.add(root);

  // ── the circle on the floor ────────────────────────────────────────────
  const targets = createLayerTargets(renderer, low);
  bakeLayers(renderer, targets);
  const circleUniforms = {
    ...airUniforms(palette),
    ...Object.fromEntries(targets.map((target, layer) => [`uLayer${layer}`, { value: target.texture }])),
    uTheta: { value: new Float32Array(SPELL_LAYERS) },
    uReveal: { value: new Float32Array(SPELL_LAYERS) },
    uScroll: { value: new Float32Array(2) },
    uStar: { value: 0 },
    uGlyphT: { value: 1000 },
    uGain: { value: 0 },
    uBreath: { value: 1 },
    uSwell: { value: 0 },
    uFlash: { value: 0 },
    uShockR: { value: 0 },
    uShockAmp: { value: 0 },
    uPulseR: { value: 0 },
    uPulseAmp: { value: 0 },
    uFloorGlow: { value: 0 },
    uTime: { value: 0 },
    uLineColour: { value: colours.line },
    uHaloColour: { value: colours.halo },
    uHotColour: { value: colours.hot },
  };
  const additive = {
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  } as const;
  const circleGeometry = new THREE.CircleGeometry(SPELL_DISC_RADIUS, 160);
  // Premultiplied "over": the colour is added, the alpha darkens the floor
  // inside the circle (its pool of night).
  const circleMaterial = new THREE.ShaderMaterial({
    uniforms: circleUniforms,
    vertexShader: SPELL_CIRCLE_VERTEX,
    fragmentShader: SPELL_CIRCLE_FRAGMENT,
    ...additive,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const circle = new THREE.Mesh(circleGeometry, circleMaterial);
  // Lying on the floor; its 12 o'clock (local +y) points away from the camera.
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = CIRCLE_LIFT;
  circle.frustumCulled = false;

  // ── the light column ───────────────────────────────────────────────────
  const columnUniforms = {
    ...airUniforms(palette),
    uAmount: { value: 0 },
    uTime: { value: 0 },
    uCore: { value: colours.columnCore },
    uEdge: { value: colours.columnEdge },
  };
  const columnGeometry = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true).translate(0, 0.5, 0);
  const columnMaterial = new THREE.ShaderMaterial({ uniforms: columnUniforms, vertexShader: SPELL_COLUMN_VERTEX, fragmentShader: SPELL_COLUMN_FRAGMENT, side: THREE.FrontSide, ...additive });
  const column = new THREE.Mesh(columnGeometry, columnMaterial);
  column.frustumCulled = false;

  // ── rising sparkles ────────────────────────────────────────────────────
  const sparkleCount = SPARKLES[tier.tier];
  const random = seededRandom(97);
  const seeds = new Float32Array(sparkleCount * 4);
  for (let index = 0; index < seeds.length; index++) seeds[index] = random();
  const quad = new THREE.PlaneGeometry(2, 2);
  const sparkleGeometry = new THREE.InstancedBufferGeometry();
  sparkleGeometry.index = quad.index;
  sparkleGeometry.setAttribute('position', quad.getAttribute('position'));
  sparkleGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  sparkleGeometry.instanceCount = sparkleCount;
  const viewport = { value: new THREE.Vector2(1, 1) };
  const sparkleUniforms = {
    ...airUniforms(palette),
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uRadius: { value: 1 },
    uCentre: { value: new THREE.Vector3() },
    uViewport: viewport,
    uIce: { value: colours.sparkleIce },
    uLavender: { value: colours.sparkleLavender },
  };
  const sparkleMaterial = new THREE.ShaderMaterial({ uniforms: sparkleUniforms, vertexShader: SPELL_SPARKLE_VERTEX, fragmentShader: SPELL_SPARKLE_FRAGMENT, ...additive });
  const sparkles = new THREE.Mesh(sparkleGeometry, sparkleMaterial);
  sparkles.frustumCulled = false;

  // ── the summoned book and candle ───────────────────────────────────────
  const summoned = createSummonedProps(context, colours.lights);

  root.add(circle, column, sparkles);
  // In world space (its instances are placed in world coordinates).
  context.scene.add(summoned.group);

  let radius = 3;
  const place = (aspect: number) => {
    const placement = spellPlacement(aspect);
    radius = placement.radius;
    root.position.set(0, 0, -placement.distance);
    circle.scale.setScalar(radius);
    column.scale.set(radius * COLUMN_RADIUS, COLUMN_HEIGHT, radius * COLUMN_RADIUS);
    sparkleUniforms.uRadius.value = radius * 0.9;
    sparkleUniforms.uCentre.value.copy(root.position);
  };
  place(16 / 9);

  const drawingBuffer = new THREE.Vector2();
  const apply = (frame: SpellFrame, t: number) => {
    (circleUniforms.uTheta.value as Float32Array).set(frame.ringAngles.map((angle) => angle % (Math.PI * 2)));
    (circleUniforms.uReveal.value as Float32Array).set(frame.reveal);
    (circleUniforms.uScroll.value as Float32Array).set(frame.scroll.map((angle) => angle % (Math.PI * 2)));
    circleUniforms.uStar.value = frame.star;
    circleUniforms.uGlyphT.value = frame.glyphTime;
    circleUniforms.uGain.value = frame.gain;
    circleUniforms.uBreath.value = frame.breath;
    circleUniforms.uSwell.value = frame.swell;
    circleUniforms.uFlash.value = frame.flash;
    circleUniforms.uShockR.value = frame.shockRadius;
    circleUniforms.uShockAmp.value = frame.shockAmount;
    circleUniforms.uPulseR.value = frame.pulseRadius;
    circleUniforms.uPulseAmp.value = frame.pulseAmount;
    circleUniforms.uFloorGlow.value = frame.floorGlow;
    circleUniforms.uTime.value = t;
    const drawn = frame.reveal.some((value) => value > 0) || frame.shockAmount > 0.01 || frame.floorGlow > 0.001;
    circle.visible = frame.gain > 0.001 && drawn;

    column.visible = frame.column > 0.001;
    columnUniforms.uAmount.value = frame.column;
    columnUniforms.uTime.value = t;

    sparkleUniforms.uAmount.value = frame.sparkles;
    sparkleUniforms.uTime.value = t;
    viewport.value.copy(worldBufferSize(context, drawingBuffer));

    summoned.update(frame.book, frame.candle, root.position, radius, frame.gain * Math.max(frame.floorGlow, frame.column), t);
  };

  // The mist opens round the circle (the owner: "it fades away gradually
  // around the magic circle, and when the magic activates it should fade away
  // to a further distance and as magic is gone, the fog should come back").
  // At rest a small soft clearing; while the magic burns it widens; it eases
  // open in ~1.2 s and drifts closed in ~3 s, like air settling back.
  const mistClear = airUniforms(palette).uMistClear.value as THREE.Vector4;
  const clearing = { radius: 0.9, feather: 1.2 };
  const updateClearing = (activity: number, dt: number, instant: boolean) => {
    const targetRadius = 0.9 + 1.7 * activity;
    const targetFeather = 1.2 + 0.9 * activity;
    const opening = targetRadius > clearing.radius;
    const follow = instant ? 1 : 1 - Math.exp(-dt / (opening ? 1.2 : 3));
    clearing.radius += (targetRadius - clearing.radius) * follow;
    clearing.feather += (targetFeather - clearing.feather) * follow;
    if (!root.visible) mistClear.set(0, 0, -10, 1);
    else mistClear.set(root.position.x, root.position.z, clearing.radius * radius, clearing.feather * radius);
  };

  let current = '';
  const setOption = (id: string) => {
    if (!OPTIONS.some((option) => option.id === id)) throw new Error(`[spell] unknown option "${id}"`);
    current = id;
    root.visible = id !== 'none';
    summoned.group.visible = root.visible;
  };
  setOption('spell');

  return {
    id: 'spell',
    label: 'Spell',
    options: OPTIONS,
    current: () => current,
    setOption,
    setAspect: place,
    update(t, dt) {
      if (!root.visible) {
        updateClearing(0, dt, true);
        return;
      }
      // Reduced motion: one calm, fixed moment (the stage draws stills only).
      const time = reducedMotion ? 0 : t;
      const frame = current === 'spell' && !reducedMotion ? spellFrame(time) : calmSpellFrame(time);
      apply(frame, time);
      updateClearing(Math.min(1, Math.max(frame.column, frame.floorGlow) * frame.gain), dt, reducedMotion);
    },
    setMoteBudget(count) {
      // The runtime ladder's last step halves the motes: halve the sparkles too.
      sparkleGeometry.instanceCount = count < tier.motes ? Math.round(sparkleCount / 2) : sparkleCount;
    },
    restore() {
      bakeLayers(renderer, targets);
    },
    dispose() {
      context.scene.remove(root, summoned.group);
      for (const target of targets) target.dispose();
      circleGeometry.dispose();
      circleMaterial.dispose();
      columnGeometry.dispose();
      columnMaterial.dispose();
      quad.dispose();
      sparkleGeometry.dispose();
      sparkleMaterial.dispose();
      summoned.dispose();
    },
  };
}

export { create, create as createSpell };
