import * as THREE from 'three';
import { cameraWander, easeWanderWeight } from './engine/cameraWander';
import type { AssetClass, AssetOption, StageContext } from './engine/contract';
import { HORIZON_FROM_TOP, lensShiftFor, stageFov } from './engine/lensShift';
import { createPalette } from './engine/palette';
import { createPost, POST_OPTIONS } from './engine/post';
import type { StagePost } from './engine/post';
import { createStageAdaptive, detectStageTier, stageLadder } from './engine/quality';
import type { StageTierGuess } from './engine/quality';
import { createRenderGate } from './renderGate';
import { create as createSky } from './world/sky';
import { create as createFloor } from './world/floor';
import { create as createFog } from './world/veils';
import { create as createMotes } from './world/motes';
import { create as createProps } from './world/props';
import { create as createLandscape } from './world/landscape';
import { create as createPromenade } from './world/promenade';
import { createSpell } from './world/spell';
import { createCardTable } from './cards/cardTable';
import type { CardTable } from './cards/cardTable';
import { createRingLayer } from './ui/rings';
import type { RingLayer } from './ui/rings';

/**
 * The landing stage: ONE canvas and ONE WebGL renderer for the whole page
 * (`.claude/plans/stage-v1.md` › Architecture). Browsers cap live WebGL
 * contexts (~8–16, the oldest is lost past it) and contexts share nothing,
 * so every 3D element of the page draws here.
 *
 * Lifecycle, learned in Nodestra (`StageLanding.tsx`, `stageScene.ts`):
 *  - the stage makes its OWN canvas inside `host` and removes it on dispose:
 *    `dispose()` gives the WebGL context back at once (`forceContextLoss`),
 *    which kills that canvas for good — React's StrictMode mounts twice, so
 *    each stage needs a fresh one;
 *  - it draws only while its render gate is open (not paused, tab visible,
 *    canvas in view), at most 61 fps, through the tier's quality ladder;
 *  - shaders compile in parallel off the main thread first (`compileAsync`);
 *  - the camera is never tied to the pointer's position: it drifts in the
 *    hellscape's idle handheld wander (`engine/cameraWander.ts`, held still
 *    under reduced motion), and a mouse or pen DRAG on the background (the
 *    canvas shows through wherever there is no button, card, ring or text)
 *    turns it, exactly as the hellscape's drag-to-look;
 *  - a lost context is logged, and anything drawn only once (the baked sky)
 *    is redrawn when it comes back;
 *  - with reduced motion it draws one still frame per change, no loop: any
 *    pointer, focus or key event on the page, a card or ring registering,
 *    and every setter schedule one (coalesced to a frame) — review G6/C-2.
 */

type StageOptions = {
  reducedMotion: boolean;
  /** Option per asset class (`{ sky: 'baked', … }`); the tier picks the rest. */
  selection?: Record<string, string>;
};

type StageClassInfo = {
  id: string;
  label: string;
  options: readonly AssetOption[];
  current: string;
};

type Stage = {
  /** The card table: `CardSlot` registers its DOM here; the lab fires its effects. */
  cards: Pick<CardTable, 'register' | 'setBackdrop' | 'effects' | 'isDealt' | 'layout' | 'setDealt' | 'pick' | 'setPickSpots' | 'subscribe'>;
  /** The ring layer: `ChapterRing` registers its DOM here. */
  rings: Pick<RingLayer, 'register'>;
  classes(): StageClassInfo[];
  setOption(classId: string, optionId: string): void;
  selection(): Record<string, string>;
  /** "high", "medium · auto −2", … */
  quality(): string;
  setPaused(paused: boolean): void;
  /** Darken the 3D world (0..1) under the cards and rings — e.g. as the page
   *  scrolls down to content. The UI layer is not dimmed. */
  setWorldDim(amount: number): void;
  /** Slide the 3D world up the screen by `pixels` (CSS px), as if it
   *  scrolled away with the page; black fills the screen below it, under
   *  the cards and rings. 0 = the world fills the screen. */
  setWorldScroll(pixels: number): void;
  dispose(): void;
  debug: {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    /** The UI overlay (cards and rings). */
    overlay: THREE.Scene;
    tier: StageTierGuess;
    /** Draw one frame at time t (tests and screenshots). */
    renderAt(t: number): void;
  };
};

/** The loop's cap: a 120/144 Hz screen draws every 2nd/3rd vsync. */
const FRAME_CAP_MS = 1000 / 61;
const EYE_HEIGHT = 2.4;

/** What the pointer may NOT drag the camera from: controls, cards, rings,
 *  and anything marked `data-no-drag` (the lab's panel). */
const NOT_DRAGGABLE = 'a,button,input,select,textarea,label,summary,[role="button"],[role="radio"],[role="tab"],[contenteditable],[data-slot="card-slot"],[data-slot="chapter-ring"],[data-no-drag]';

/** A drag starts on the background only — where the canvas shows through:
 *  not on a control, and not on an element that holds text (that is for
 *  reading and selecting). */
function startsCameraDrag(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || target.closest(NOT_DRAGGABLE)) return false;
  for (const node of target.childNodes) if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return false;
  return true;
}

function createStage(host: HTMLElement, options: StageOptions): Stage {
  const tier = detectStageTier();
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.slot = 'stage-canvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  host.appendChild(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (error) {
    canvas.remove();
    throw error;
  }
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.params.prCap));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 3000);
  camera.position.set(0, EYE_HEIGHT, 0);
  const worldBuffer = new THREE.Vector2(1, 1);
  const context: StageContext = { scene, camera, renderer, palette: createPalette(), tier: tier.params, uniforms: { uTime: { value: 0 } }, worldBuffer };

  const classes: AssetClass[] = [createSky(context), createLandscape(context), createFloor(context), createFog(context), createMotes(context), createProps(context), createPromenade(context), createSpell(context)];
  const cardTable = createCardTable(options.reducedMotion);
  const ringLayer = createRingLayer(context.palette, options.reducedMotion);
  // The UI overlay: the rings and the cards, over the world, through the
  // card table's pixel camera (the rings and the veil place themselves in
  // screen space and ignore it).
  const uiScene = new THREE.Scene();
  // A full-screen veil drawn FIRST in the UI pass: it darkens the world
  // below it, never the cards and rings drawn after it. It is in the OPAQUE
  // list (transparent: false) with its own blending — three draws the
  // transparent list after every opaque object whatever the renderOrder, so
  // a transparent veil landed ON the cards (review G3/C-1).
  const veilMaterial = new THREE.ShaderMaterial({
    uniforms: { uAmount: { value: 0 } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }',
    fragmentShader: 'uniform float uAmount; void main() { gl_FragColor = vec4(0.0, 0.0, 0.01, uAmount); }',
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), veilMaterial);
  veil.frustumCulled = false;
  veil.renderOrder = -100;
  veil.visible = false;
  // The curtain: opaque black from the bottom of the screen up to where the
  // world, scrolled away, now ends (`setWorldScroll`), edged with a band of
  // red and black stripes (the owner: "have a red and black striped
  // border between the scene and the black background"; then "longer, not
  // slanted, half thin"): 6 px tall, 36 px long, riding with the edge.
  // Opaque with normal blending, so the anime post counts it as UI and
  // leaves it ungraded.
  const curtainMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uCover: { value: 0 },
      uTop: { value: 0 },
      uPixelRatio: { value: 1 },
      uBand: { value: 6 },
      uStripe: { value: 36 },
      uRed: { value: new THREE.Color('#c8102e') },
    },
    vertexShader: 'uniform float uCover; void main() { gl_Position = vec4(position.x * 2.0, (position.y + 0.5) * 2.0 * uCover - 1.0, 0.0, 1.0); }',
    fragmentShader: `
      uniform float uTop; // the edge, CSS px up from the bottom of the screen
      uniform float uPixelRatio;
      uniform float uBand; // the striped band's height (CSS px)
      uniform float uStripe; // one stripe's width (CSS px)
      uniform vec3 uRed;
      void main() {
        vec2 p = gl_FragCoord.xy / uPixelRatio;
        float below = uTop - p.y;
        // Upright stripes, red then black along the edge; a 1 px soft edge on each.
        float wave = abs(fract(p.x / (2.0 * uStripe)) - 0.5) * 2.0;
        float red = clamp((0.5 - wave) * uStripe + 0.5, 0.0, 1.0);
        float band = clamp(uBand - below + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(uRed * red * band, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), curtainMaterial);
  curtain.frustumCulled = false;
  curtain.renderOrder = -99;
  curtain.visible = false;
  uiScene.add(veil, curtain, ringLayer.scene, cardTable.scene);
  const overlay = { scene: uiScene, camera: cardTable.camera };
  const uiClasses = [...cardTable.classes, ...ringLayer.classes];
  // High and medium: the hellscape landing's anime finish; phones: straight to the canvas.
  let postId = tier.params.tier === 'low' ? 'none' : 'anime';
  let post: StagePost = createPost(postId, renderer, tier.params.msaa);
  // The world's pixel ratio (the tier's, then the runtime ladder's); the
  // canvas's is the post's call (phones: higher, for sharp cards).
  let worldRatio = renderer.getPixelRatio();
  const applyPixelRatios = () => renderer.setPixelRatio(post.setWorldPixelRatio?.(worldRatio) ?? worldRatio);
  applyPixelRatios();

  // ── sizing ──────────────────────────────────────────────────────────────
  let width = 1;
  let height = 1;
  let worldScroll = 0;
  // The tilt-shift lens (`lensShift.ts`) also carries the scroll: shifting
  // the projection moves the whole world image up without moving the camera.
  const applyLens = () => {
    const shift = Math.min(worldScroll, height);
    camera.projectionMatrix.elements[9] = lensShiftFor(HORIZON_FROM_TOP) - (2 * shift) / height;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    curtainMaterial.uniforms.uCover.value = shift / height;
    curtainMaterial.uniforms.uTop.value = shift;
    curtainMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    curtain.visible = shift > 0;
    // Scrolled fully away: nothing of the world is on screen.
    scene.visible = shift < height;
  };
  const resize = () => {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    post.setSize(width, height);
    worldBuffer.set(Math.max(1, Math.floor(width * worldRatio)), Math.max(1, Math.floor(height * worldRatio)));
    camera.aspect = width / height;
    for (const assetClass of classes) {
      assetClass.setAspect?.(camera.aspect);
      assetClass.setViewport?.(width, height);
    }
    camera.fov = stageFov(camera.aspect);
    camera.updateProjectionMatrix();
    applyLens();
    if (options.reducedMotion) drawStill();
  };

  // ── the runtime quality ladder ──────────────────────────────────────────
  const ladder = stageLadder(tier.params, window.devicePixelRatio || 1);
  const applyLevel = (level: number) => {
    const step = ladder[level];
    worldRatio = step.pixelRatio;
    applyPixelRatios();
    post.setBloomScale(step.bloom);
    for (const assetClass of classes) {
      assetClass.setMoteBudget?.(step.motes);
      assetClass.setQualityLevel?.(level);
    }
    resize();
  };
  const adaptive = createStageAdaptive(ladder.length, applyLevel, { enabled: !tier.forced && !options.reducedMotion });

  // ── the camera: level, looking down −Z, plus the idle wander and the drag ─
  let wanderWeight = 0;
  const look = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 };
  const placeCamera = (t: number, dt: number) => {
    wanderWeight = easeWanderWeight(wanderWeight, dt, options.reducedMotion);
    const wander = cameraWander(t, wanderWeight);
    // The hellscape eases the look 0.08 per 60 fps frame (τ ≈ 0.2 s).
    const follow = options.reducedMotion ? 1 : 1 - Math.exp(-dt / 0.2);
    look.yaw += (look.targetYaw - look.yaw) * follow;
    look.pitch += (look.targetPitch - look.pitch) * follow;
    camera.position.set(0, EYE_HEIGHT + wander.bob, 0);
    // YXZ: yaw about the vertical, then pitch — no roll, the horizon stays level.
    camera.rotation.set(wander.pitch + look.pitch, wander.yaw + look.yaw, 0, 'YXZ');
  };

  // Drag to look (Nodestra `hell-stage.ts` › onPointerMove): the scene follows
  // the hand like an orbit camera — drag right turns the view left, drag down
  // tilts it up — at 1.6 rad per canvas width, yaw ±0.6, pitch −0.25…0.3.
  // Mouse and pen only: a finger drag scrolls the page.
  const drag = { pointer: -1, x: 0, y: 0 };
  const onDragStart = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || event.button !== 0 || !startsCameraDrag(event.target)) return;
    // No text selection, no native drag.
    event.preventDefault();
    drag.pointer = event.pointerId;
    drag.x = event.clientX;
    drag.y = event.clientY;
    document.documentElement.style.cursor = 'grabbing';
  };
  const onDragMove = (event: PointerEvent) => {
    if (event.pointerId !== drag.pointer) {
      if (drag.pointer < 0 && event.pointerType === 'mouse') document.documentElement.style.cursor = startsCameraDrag(event.target) ? 'grab' : '';
      return;
    }
    const sensitivity = 1.6 / Math.max(canvas.clientWidth, 1);
    look.targetYaw = Math.min(0.6, Math.max(-0.6, look.targetYaw + (event.clientX - drag.x) * sensitivity));
    look.targetPitch = Math.min(0.3, Math.max(-0.25, look.targetPitch + (event.clientY - drag.y) * sensitivity));
    drag.x = event.clientX;
    drag.y = event.clientY;
    requestStill();
  };
  const onDragEnd = (event: PointerEvent) => {
    if (event.pointerId !== drag.pointer) return;
    drag.pointer = -1;
    document.documentElement.style.cursor = '';
  };
  window.addEventListener('pointerdown', onDragStart);
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragEnd);

  // ── frame ───────────────────────────────────────────────────────────────
  let elapsed = 0;
  let lastFrame = -1;
  let lastDrawn = -1;
  let skipped = false;
  const step = (t: number, dt: number) => {
    context.uniforms.uTime.value = t;
    placeCamera(t, dt);
    camera.updateMatrixWorld();
    for (const assetClass of classes) assetClass.update?.(t, dt);
    cardTable.update(t, dt, width, height);
    ringLayer.update(t, dt, width, height);
    post.render(scene, camera, t, overlay);
  };
  const drawStill = () => {
    if (!warmed) return;
    step(elapsed, 0);
  };
  // Reduced motion: one still frame per change, coalesced to a frame.
  let stillRequest = 0;
  const requestStill = () => {
    if (!options.reducedMotion || stillRequest || disposed) return;
    stillRequest = requestAnimationFrame(() => {
      stillRequest = 0;
      drawStill();
    });
  };
  const STILL_EVENTS = ['pointerover', 'pointerout', 'pointerdown', 'pointerup', 'focusin', 'focusout', 'keyup', 'scroll'] as const;
  if (options.reducedMotion) for (const name of STILL_EVENTS) window.addEventListener(name, requestStill, { passive: true, capture: true });
  const frame = (now: number) => {
    if (lastDrawn >= 0 && now - lastDrawn < FRAME_CAP_MS - 1) {
      skipped = true;
      return;
    }
    const dt = lastFrame < 0 ? 0 : Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    lastDrawn = now;
    elapsed += dt;
    step(elapsed, dt);
    adaptive.frame(now, skipped);
    skipped = false;
  };

  let warmed = false;
  let disposed = false;
  const syncLoop = () => {
    const run = warmed && !disposed && !options.reducedMotion && gate.isOpen();
    if (!run) {
      // Coming back must not count the pause as one long frame.
      lastFrame = -1;
      lastDrawn = -1;
      adaptive.reset();
    }
    renderer.setAnimationLoop(run ? frame : null);
  };
  const gate = createRenderGate(canvas, syncLoop);

  // ── context loss ────────────────────────────────────────────────────────
  const onContextLost = (event: Event) => {
    event.preventDefault();
    console.warn('[stage] lost its WebGL context');
  };
  const onContextRestored = () => {
    console.warn('[stage] got its WebGL context back; redrawing what is drawn only once');
    for (const assetClass of classes) assetClass.restore?.();
    if (options.reducedMotion) drawStill();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  // Selection: the caller's picks on top of the tier's defaults.
  const setOption = (classId: string, optionId: string) => {
    if (classId === 'post') {
      if (!POST_OPTIONS.some((option) => option.id === optionId)) throw new Error(`[post] unknown option "${optionId}"`);
      if (optionId === postId) return;
      post.dispose();
      postId = optionId;
      post = createPost(postId, renderer, tier.params.msaa);
      applyPixelRatios();
      resize();
      return;
    }
    const assetClass = [...classes, ...uiClasses].find((entry) => entry.id === classId);
    if (!assetClass) throw new Error(`[stage] unknown asset class "${classId}"`);
    assetClass.setOption(optionId);
    if (options.reducedMotion) drawStill();
  };
  for (const [classId, optionId] of Object.entries(options.selection ?? {})) setOption(classId, optionId);

  // Compile every shader in parallel before the first frame (a compile
  // stall on the first draw blocks the page — measured in Nodestra).
  // Into the world's own target where it has one: a target's programs differ
  // from the canvas's (no tone mapping), and they are the ones drawn.
  renderer.setRenderTarget(post.worldTarget?.() ?? null);
  renderer
    .compileAsync(scene, camera)
    .catch((error: unknown) => console.warn('[stage] parallel shader compile unavailable', error))
    .finally(() => {
      if (disposed) return;
      warmed = true;
      if (options.reducedMotion) drawStill();
      syncLoop();
    });

  return {
    cards: {
      register(slot, model, cardOptions) {
        const handle = cardTable.register(slot, model, cardOptions);
        requestStill();
        const still = <T extends unknown[]>(call: (...args: T) => void) => (...args: T) => {
          call(...args);
          requestStill();
        };
        return { setModel: still(handle.setModel), setSelected: still(handle.setSelected), setFlipped: still(handle.setFlipped), dispose: still(handle.dispose) };
      },
      setBackdrop(element) {
        cardTable.setBackdrop(element);
        requestStill();
      },
      effects: cardTable.effects,
      isDealt: cardTable.isDealt,
      layout: cardTable.layout,
      setDealt(dealt) {
        cardTable.setDealt(dealt);
        requestStill();
      },
      pick(slot) {
        cardTable.pick(slot);
        requestStill();
      },
      setPickSpots(held, deck) {
        cardTable.setPickSpots(held, deck);
        requestStill();
      },
      subscribe: cardTable.subscribe,
    },
    rings: {
      register(anchor, counter, state) {
        const handle = ringLayer.register(anchor, counter, state);
        requestStill();
        return {
          set(next) {
            handle.set(next);
            requestStill();
          },
          dispose() {
            handle.dispose();
            requestStill();
          },
        };
      },
    },
    classes: () => [
      ...[...classes, ...uiClasses].map((entry) => ({ id: entry.id, label: entry.label, options: entry.options, current: entry.current() })),
      { id: 'post', label: 'Post', options: POST_OPTIONS, current: postId },
    ],
    setOption,
    selection: () => ({ ...Object.fromEntries([...classes, ...uiClasses].map((entry) => [entry.id, entry.current()])), post: postId }),
    quality: () => `${tier.params.tier}${adaptive.label()}`,
    setPaused: (paused) => gate.setPaused(paused),
    setWorldDim(amount) {
      const clamped = Math.max(0, Math.min(1, amount));
      veilMaterial.uniforms.uAmount.value = clamped;
      veil.visible = clamped > 0.001;
      if (options.reducedMotion) drawStill();
    },
    setWorldScroll(pixels) {
      const next = Math.max(0, pixels);
      if (next === worldScroll) return;
      worldScroll = next;
      applyLens();
      if (options.reducedMotion) drawStill();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gate.dispose();
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      for (const assetClass of classes) assetClass.dispose();
      if (stillRequest) cancelAnimationFrame(stillRequest);
      for (const name of STILL_EVENTS) window.removeEventListener(name, requestStill, { capture: true });
      window.removeEventListener('pointerdown', onDragStart);
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragEnd);
      window.removeEventListener('pointercancel', onDragEnd);
      document.documentElement.style.cursor = '';
      cardTable.dispose();
      ringLayer.dispose();
      veil.geometry.dispose();
      veilMaterial.dispose();
      curtain.geometry.dispose();
      curtainMaterial.dispose();
      post.dispose();
      renderer.dispose();
      // Give the context back now, not when the canvas is collected.
      renderer.forceContextLoss();
      canvas.remove();
    },
    debug: {
      renderer,
      scene,
      camera,
      overlay: uiScene,
      tier,
      renderAt(t) {
        elapsed = t;
        step(t, 1 / 60);
      },
    },
  };
}

export { createStage };
export type { Stage, StageClassInfo, StageOptions };
