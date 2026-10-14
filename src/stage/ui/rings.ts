import * as THREE from 'three';
import type { AssetClass, AssetOption } from '../engine/contract';
import type { StagePalette } from '../engine/palette';
import { RING_FRAGMENT, RING_VERTEX } from './ringShaders';
import { createSpring, PROGRESS_SPRING, stepSpring } from './spring';
import type { Spring } from './spring';

/**
 * The stage's ring layer: every chapter's progress ring, ONE instanced draw.
 * A ring is registered from the DOM (`ChapterRing`): an anchor element the
 * ring wraps (it holds the real label and the `role="progressbar"`), and an
 * optional counter element whose text counts up with the fill.
 *
 * The fill animates from 0 the first time a ring is seen (staggered), then
 * follows changes on a spring that never overshoots the true progress. When
 * a chapter reaches 100 % its ring fires a one-shot shock ring.
 */

type RingState = { done: number; total: number };

type RingHandle = {
  set(state: RingState): void;
  dispose(): void;
};

type RingLayer = {
  scene: THREE.Scene;
  register(anchor: HTMLElement, counter: HTMLElement | null, state: RingState): RingHandle;
  update(t: number, dt: number, viewportWidth: number, viewportHeight: number): void;
  classes: AssetClass[];
  dispose(): void;
};

type Ring = {
  anchor: HTMLElement;
  counter: HTMLElement | null;
  state: RingState;
  shown: Spring;
  seen: boolean;
  startAt: number;
  hovered: boolean;
  hover: Spring;
  burst: number;
  wasComplete: boolean;
  seed: number;
  detach(): void;
};

const RING_OPTIONS: readonly AssetOption[] = [
  { id: 'astrolabe', label: 'Astrolabe', description: 'Gold and lavender hairlines, a diamond comet head, topic cells, a slow 60-tick ring — matches the cards.' },
  { id: 'tactical', label: 'Tactical HUD', description: 'Cyan on indigo, chevron segments, dashed counter-rotation and a scanning wedge. Energetic.' },
  { id: 'sigil', label: 'Arcane sigil', description: 'Each chapter is a magic circle: a star polygon of its topic count, drawn on stroke by stroke as it fills.' },
];

const ATTRIBUTES = ['aCentre', 'aRadius', 'aProgress', 'aDone', 'aTotal', 'aHover', 'aBurst', 'aSeed'] as const;
const SIZES: Record<(typeof ATTRIBUTES)[number], number> = { aCentre: 2, aRadius: 1, aProgress: 1, aDone: 1, aTotal: 1, aHover: 1, aBurst: 1, aSeed: 1 };
const STAGGER = 0.07;
const BURST_SECONDS = 0.8;

function createRingLayer(palette: StagePalette, reducedMotion: boolean): RingLayer {
  const scene = new THREE.Scene();
  const style = { value: 0 };
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uViewport: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uStyle: style,
      uGold: { value: palette.gold },
      uLavender: { value: new THREE.Color('#c9c2ff') },
      uCyan: { value: new THREE.Color('#7fe7ff') },
    },
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Premultiplied over: the lines add light, the soft disc behind the label darkens.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const quad = new THREE.PlaneGeometry(2, 2);
  let capacity = 0;
  let geometry = new THREE.InstancedBufferGeometry();
  let mesh: THREE.Mesh | null = null;
  const arrays = {} as Record<(typeof ATTRIBUTES)[number], Float32Array>;

  const allocate = (next: number) => {
    capacity = next;
    if (mesh) scene.remove(mesh);
    geometry.dispose();
    geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    for (const name of ATTRIBUTES) {
      arrays[name] = new Float32Array(capacity * SIZES[name]);
      geometry.setAttribute(name, new THREE.InstancedBufferAttribute(arrays[name], SIZES[name]).setUsage(THREE.DynamicDrawUsage));
    }
    geometry.instanceCount = 0;
    mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
  };
  allocate(32);

  const rings = new Set<Ring>();
  let clock = 0;

  const register: RingLayer['register'] = (anchor, counter, state) => {
    const ring: Ring = {
      anchor,
      counter,
      state,
      shown: createSpring(reducedMotion ? (state.total ? state.done / state.total : 0) : 0),
      seen: false,
      startAt: 0,
      hovered: false,
      hover: createSpring(),
      burst: 0,
      wasComplete: state.total > 0 && state.done >= state.total,
      seed: Math.random(),
      detach: () => {},
    };
    const onEnter = () => {
      ring.hovered = true;
    };
    const onLeave = () => {
      ring.hovered = false;
    };
    anchor.addEventListener('pointerenter', onEnter);
    anchor.addEventListener('pointerleave', onLeave);
    anchor.addEventListener('focusin', onEnter);
    anchor.addEventListener('focusout', onLeave);
    ring.detach = () => {
      anchor.removeEventListener('pointerenter', onEnter);
      anchor.removeEventListener('pointerleave', onLeave);
      anchor.removeEventListener('focusin', onEnter);
      anchor.removeEventListener('focusout', onLeave);
    };
    rings.add(ring);
    if (rings.size > capacity) allocate(capacity * 2);
    return {
      set(next) {
        const complete = next.total > 0 && next.done >= next.total;
        if (complete && !ring.wasComplete && !reducedMotion) ring.burst = 0.0001;
        ring.wasComplete = complete;
        ring.state = next;
      },
      dispose() {
        ring.detach();
        rings.delete(ring);
      },
    };
  };

  const update: RingLayer['update'] = (t, dt, viewportWidth, viewportHeight) => {
    clock = t;
    material.uniforms.uTime.value = t;
    material.uniforms.uViewport.value.set(viewportWidth, viewportHeight);
    let index = 0;
    let firstUnseen = 0;
    for (const ring of rings) {
      const rect = ring.anchor.getBoundingClientRect();
      const visible = rect.width > 0 && rect.bottom > -50 && rect.top < viewportHeight + 50 && rect.right > -50 && rect.left < viewportWidth + 50;
      if (!visible) continue;
      if (!ring.seen) {
        ring.seen = true;
        ring.startAt = clock + firstUnseen * STAGGER;
        firstUnseen++;
      }
      const target = ring.state.total ? ring.state.done / ring.state.total : 0;
      if (reducedMotion) ring.shown.value = target;
      else if (clock >= ring.startAt) stepSpring(ring.shown, target, PROGRESS_SPRING, dt);
      stepSpring(ring.hover, ring.hovered ? 1 : 0, { stiffness: 140, damping: 0.55 }, dt);
      if (ring.burst > 0) ring.burst = ring.burst >= 1 ? 0 : ring.burst + dt / BURST_SECONDS;
      if (ring.counter) {
        const shownDone = Math.round(Math.max(0, Math.min(1, ring.shown.value)) * ring.state.total);
        const text = `${shownDone}/${ring.state.total}`;
        if (ring.counter.textContent !== text) ring.counter.textContent = text;
      }
      arrays.aCentre[index * 2] = rect.left + rect.width / 2;
      arrays.aCentre[index * 2 + 1] = rect.top + rect.height / 2;
      arrays.aRadius[index] = Math.min(rect.width, rect.height) / 2;
      arrays.aProgress[index] = Math.max(0, Math.min(1, ring.shown.value));
      arrays.aDone[index] = Math.round(Math.max(0, Math.min(1, ring.shown.value)) * ring.state.total);
      arrays.aTotal[index] = ring.state.total;
      arrays.aHover[index] = Math.max(0, Math.min(1.2, ring.hover.value));
      arrays.aBurst[index] = ring.burst;
      arrays.aSeed[index] = ring.seed;
      index++;
    }
    geometry.instanceCount = index;
    for (const name of ATTRIBUTES) (geometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
  };

  const classes: AssetClass[] = [
    {
      id: 'ring',
      label: 'Progress ring',
      options: RING_OPTIONS,
      current: () => RING_OPTIONS[style.value].id,
      setOption(id) {
        const found = RING_OPTIONS.findIndex((option) => option.id === id);
        if (found < 0) throw new Error(`[ring] unknown option "${id}"`);
        style.value = found;
      },
      dispose() {},
    },
  ];

  return {
    scene,
    register,
    update,
    classes,
    dispose() {
      for (const ring of rings) ring.detach();
      rings.clear();
      geometry.dispose();
      quad.dispose();
      material.dispose();
    },
  };
}

export { createRingLayer };
export type { RingHandle, RingLayer, RingState };
