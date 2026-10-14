import * as THREE from 'three';
import type { AssetClass, AssetOption } from '../engine/contract';
import { createChips } from '../fx/chips';
import { createSparkles } from '../fx/sparkles';
import { createSunburst } from '../fx/sunburst';
import { createSpring, stepSpring } from '../ui/spring';
import type { Spring } from '../ui/spring';
import { CARD_HEIGHT, CARD_RADIUS, CARD_THICKNESS, CARD_WIDTH, createCardGeometry, createShadowGeometry } from './cardGeometry';
import { paintBack, paintFace, textureWidthFor } from './cardPainter';
import type { CardTheme } from './cardPainter';
import { CARD_FRAGMENT, CARD_VERTEX, SHADOW_FRAGMENT, SHADOW_VERTEX } from './cardShader';
import { CARD_ASPECT, editionStrengths, faceModelKey } from './model';
import type { CardEdition, CardFaceModel } from './model';
import { clamp01, DEAL_SECONDS, DEAL_STAGGER, dealPose, easing, fanPose, mixPose, pilePose, punch, shufflePose, stepProgress } from './motion';
import type { CardPose } from './motion';
import { createStudioTexture } from './studioEnv';

/**
 * The card table: the stage's playing cards as real 3D objects (research
 * `.claude/research/stage-v2/CARDS.md` › C).
 *
 * A PIXEL-MATCHED perspective camera (one unit = one CSS px at the table,
 * z = 0) lets a card be posed straight from its DOM SLOT — an un-tilted
 * element that holds the real button and text for keyboard and screen
 * readers (`react/CardSlot.tsx`) — and lets cards leave their slots: they
 * are dealt from a deck, fanned, piled, shuffled, with sparkles in the same
 * space. Each frame the table:
 *   1. READS every slot's rect (one batch, no writes between);
 *   2. works out each card's pose: its slot, or the running choreography
 *      (`motion.ts`), plus the springs of interaction — pointer tilt, hover
 *      pop with a punch, lift, press, select, flip — and an idle float;
 *   3. WRITES the mesh, its shadow and its uniforms.
 *
 * The cards live in one of three LAYOUTS: gathered into a face-down DECK
 * at the middle of the slots, DEALT into their slots, or PICKED — one card
 * kept, spun up onto its held spot, the rest gathered into the deck beside
 * it (the owner: "after clicking a card, spin that card and keep it, move
 * the rest cards back to deck and offer a button 'Pick another card'").
 * The picked view's two places are DOM elements too (`setPickSpots`). With
 * the default `scroll` deal the cards are dealt when the deck section
 * scrolls into view and gathered again when the page scrolls back up to
 * the hero; `setDealt` switches by hand until the section next leaves the
 * screen, and a pick holds through any scrolling until `setDealt`. A switch mid-flight starts from where each card is.
 *
 * Faces are painted into canvases (`cardPainter.ts`), at most one per frame
 * and only when the model or the needed resolution changes; the back is
 * painted once and shared.
 *
 * Draw order inside the UI pass (all in the OPAQUE list first, so nothing
 * transparent lands on a card — the v1 bugs G2/G3): the sunburst
 * (renderOrder −90), the cards (opaque, depth-tested), their shadows (on
 * a table plane below every card, depth-tested, so a card hides its own
 * shadow), then sparkles (additive, on top).
 */

type CardHandle = {
  setModel(model: CardFaceModel): void;
  setSelected(selected: boolean): void;
  setFlipped(flipped: boolean): void;
  dispose(): void;
};

type TableMode = 'slots' | 'fan' | 'pile' | 'shuffle';

/** Gathered, dealt, or one card kept beside the gathered rest. */
type TableLayout = 'deck' | 'slots' | 'picked';

/** A card's resting place: its slot, the deck (at the middle of the slots,
 *  or at the picked view's deck spot), or the picked view's held spot. */
type Place = 'slot' | 'deck' | 'pickedDeck' | 'held';

type CardEffects = {
  /** Gather everything into the deck, then deal it out again. */
  deal(): void;
  /** Leave the slots for a choreography; 'slots' brings them home. */
  setMode(mode: TableMode): void;
  flipAll(): void;
  burst(): void;
  /** Toss a handful of poker chips up from the deck. */
  chips(): void;
};

type CardTable = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Dealt into the slots (true) or not (gathered or picked). */
  isDealt(): boolean;
  layout(): TableLayout;
  /** Deal or gather by hand (the deck's button). */
  setDealt(dealt: boolean): void;
  /** Keep the card in `slot`: it spins onto the held spot while the rest
   *  gather into the deck beside it. `instant` puts everything in place at
   *  once, with no spin (restoring a pick when the visitor comes back). */
  pick(slot: HTMLElement, options?: { instant?: boolean }): void;
  /** The picked view's places: where the kept card rests and where the
   *  deck sits beside it (their rects; the held spot also takes the hover). */
  setPickSpots(held: HTMLElement | null, deck: HTMLElement | null): void;
  /** Called whenever the layout changes; returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
  register(slot: HTMLElement, model: CardFaceModel, options?: { seed?: number }): CardHandle;
  /** The element the violet sunburst sits behind (the deck section). */
  setBackdrop(element: HTMLElement | null): void;
  update(t: number, dt: number, viewportWidth: number, viewportHeight: number): void;
  effects: CardEffects;
  classes: AssetClass[];
  dispose(): void;
};

type Card = {
  slot: HTMLElement;
  model: CardFaceModel;
  paintedKey: string;
  paintedWidth: number;
  faceCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  faceTexture: THREE.CanvasTexture;
  maskTexture: THREE.CanvasTexture;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  shadowMaterial: THREE.ShaderMaterial;
  shadow: THREE.Mesh;
  seed: number;
  order: number;
  pointer: { x: number; y: number };
  hovered: boolean;
  focused: boolean;
  pressed: boolean;
  selected: boolean;
  flipped: boolean;
  hoverStart: number;
  /** The pose last drawn (before interaction), so a switch mid-flight starts there. */
  basePose: CardPose | null;
  /** Where the running deal/gather starts from: a live place, or a frozen pose. */
  layoutFrom: Place | CardPose;
  landed: boolean;
  springs: { tiltX: Spring; tiltY: Spring; lift: Spring; scale: Spring; flip: Spring; hover: Spring; pointerX: Spring; pointerY: Spring; lean: Spring };
  lastX: number;
  rect: DOMRect | null;
  detach(): void;
};

/** Camera distance (px): the table's perspective, like CSS `perspective`. */
const DISTANCE = 1600;
const MAX_TILT = 0.22;
const HOVER_LIFT = 28;
const TILT_SPRING = { stiffness: 180, damping: 0.6 };
const POP_SPRING = { stiffness: 260, damping: 0.5 };
const FLIP_SPRING = { stiffness: 90, damping: 0.62 };
const MODE_SECONDS = 0.7;
const SHUFFLE_SECONDS = 1.6;
/** The kept card's spin: two full turns about its vertical axis, easing out. */
const SPIN_SECONDS = 1.3;
const SPIN_TURNS = 2;

const EDITION_OPTIONS: readonly AssetOption[] = [
  { id: 'earned', label: 'Earned by progress', description: 'Base at 0 %, foil once started, holo from half-way, prism when complete.' },
  { id: 'base', label: 'All base', description: 'Bright white stock, varnish, embossed ink — no foil.' },
  { id: 'foil', label: 'All foil', description: 'Gold-foil frame and gilded edges with the travelling light sweep.' },
  { id: 'holo', label: 'All holo', description: 'Foil plus a rainbow holo window and glitter.' },
  { id: 'prism', label: 'All prism', description: 'Everything, plus a faint rainbow over the card and star dust.' },
];
const THEME_OPTIONS: readonly AssetOption[] = [
  { id: 'light', label: 'Light cards', description: 'Bright white stock, dark ink (the site follows the System / Light / Dark switch).' },
  { id: 'dark', label: 'Dark cards', description: 'Ink-navy "obsidian" stock, light ink, pastel accents; a deeper purple back.' },
];
const BACKDROP_OPTIONS: readonly AssetOption[] = [
  { id: 'sunburst', label: 'Violet sunburst', description: 'God-rays and bokeh behind the deck, fading into the night (poker-effects reference).' },
  { id: 'none', label: 'Night only', description: 'No backdrop behind the deck.' },
];
const DEAL_OPTIONS: readonly AssetOption[] = [
  { id: 'scroll', label: 'Deal on scroll', description: 'Dealt from the deck when the section scrolls into view; gathered back when you scroll up to the hero.' },
  { id: 'static', label: 'No deal', description: 'Cards rest in their slots; the deck button still gathers and deals.' },
];

function createCardTable(reducedMotion: boolean): CardTable {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, DISTANCE * 4);
  camera.position.set(0, 0, DISTANCE);
  const geometry = createCardGeometry();
  const shadowGeometry = createShadowGeometry();
  const studio = createStudioTexture();
  const sparkles = createSparkles();
  const sunburst = createSunburst();
  const chips = createChips();
  scene.add(sunburst.mesh, sparkles.mesh, chips.mesh);

  const backCanvas = document.createElement('canvas');
  const backMaskCanvas = document.createElement('canvas');
  paintBack(backCanvas, backMaskCanvas, 768);
  const backTexture = new THREE.CanvasTexture(backCanvas);
  backTexture.colorSpace = THREE.SRGBColorSpace;
  backTexture.anisotropy = 8;
  const backMaskTexture = new THREE.CanvasTexture(backMaskCanvas);
  backMaskTexture.anisotropy = 8;

  const shared = {
    uTime: { value: 0 },
    uStudio: { value: studio },
    uBack: { value: backTexture },
    uBackMask: { value: backMaskTexture },
    uBackTexel: { value: new THREE.Vector2(1 / backCanvas.width, 1 / backCanvas.height) },
    uGold: { value: new THREE.Color('#d9a93c') },
    uKeyDirection: { value: new THREE.Vector3(-0.4, 0.6, 0.8) },
    uEdgeCore: { value: new THREE.Color('#1a1630') },
    uThickness: { value: CARD_THICKNESS },
    uAspect: { value: CARD_ASPECT },
  };
  const state = {
    theme: 0,
    edition: 0,
    backdrop: 0,
    deal: 0,
    mode: 'slots' as TableMode,
    modeStart: -100,
    previousMode: 'slots' as TableMode,
    time: 0,
    layout: (reducedMotion ? 'slots' : 'deck') as TableLayout,
    layoutStart: -100,
    /** The picked card (layout 'picked' only). */
    kept: null as Card | null,
    spinStart: -100,
    /** A hand switch holds until the section next leaves the screen. */
    manual: false,
  };
  const listeners = new Set<() => void>();
  const cards: Card[] = [];

  /** Where a card rests in the current layout. */
  const placeOf = (card: Card | null): Place => {
    if (state.layout === 'slots') return 'slot';
    if (state.layout === 'deck') return 'deck';
    return card !== null && card === state.kept ? 'held' : 'pickedDeck';
  };
  let paintQueue: Card[] = [];

  const themeOf = (): CardTheme => (THEME_OPTIONS[state.theme].id === 'dark' ? 'dark' : 'light');
  const editionOf = (card: Card): CardEdition => (state.edition === 0 ? card.model.edition : (EDITION_OPTIONS[state.edition].id as CardEdition));

  const paint = (card: Card, width: number) => {
    paintFace(card.faceCanvas, card.maskCanvas, card.model, width, themeOf());
    card.faceTexture.dispose();
    card.maskTexture.dispose();
    card.faceTexture = new THREE.CanvasTexture(card.faceCanvas);
    card.faceTexture.colorSpace = THREE.SRGBColorSpace;
    card.faceTexture.anisotropy = 8;
    card.maskTexture = new THREE.CanvasTexture(card.maskCanvas);
    card.maskTexture.anisotropy = 8;
    card.material.uniforms.uFace.value = card.faceTexture;
    card.material.uniforms.uFaceMask.value = card.maskTexture;
    card.material.uniforms.uFaceTexel.value.set(1 / card.faceCanvas.width, 1 / card.faceCanvas.height);
    card.paintedKey = faceModelKey(card.model);
    card.paintedWidth = width;
  };

  const register: CardTable['register'] = (slot, model, options = {}) => {
    const seed = options.seed ?? Math.random();
    const faceCanvas = document.createElement('canvas');
    const maskCanvas = document.createElement('canvas');
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...shared,
        uFace: { value: null },
        uFaceMask: { value: null },
        uFaceTexel: { value: new THREE.Vector2(1 / 512, 1 / 716) },
        uPointer: { value: new THREE.Vector2(0.5, 0.5) },
        uSeed: { value: seed },
        uHover: { value: 0 },
        uFoil: { value: 0 },
        uHolo: { value: 0 },
        uPrism: { value: 0 },
      },
      vertexShader: CARD_VERTEX,
      fragmentShader: CARD_FRAGMENT,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.rotation.order = 'ZYX';
    const shadowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uHalfSize: { value: new THREE.Vector2(CARD_WIDTH / 2, CARD_HEIGHT / 2) },
        uRadius: { value: CARD_RADIUS },
        uBlur: { value: 0.03 },
        uOpacity: { value: 0.45 },
        uGlow: { value: 0 },
        uColour: { value: new THREE.Color('#120a2a') },
        uGlowColour: { value: new THREE.Color(model.accent) },
      },
      vertexShader: SHADOW_VERTEX,
      fragmentShader: SHADOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.frustumCulled = false;
    scene.add(shadow, mesh);

    const card: Card = {
      slot,
      model,
      paintedKey: '',
      paintedWidth: 0,
      faceCanvas,
      maskCanvas,
      faceTexture: new THREE.CanvasTexture(faceCanvas),
      maskTexture: new THREE.CanvasTexture(maskCanvas),
      material,
      mesh,
      shadowMaterial,
      shadow,
      seed,
      order: cards.length,
      pointer: { x: 0.5, y: 0.5 },
      hovered: false,
      focused: false,
      pressed: false,
      selected: false,
      flipped: false,
      hoverStart: -100,
      basePose: null,
      layoutFrom: placeOf(null),
      landed: true,
      springs: {
        tiltX: createSpring(),
        tiltY: createSpring(),
        lift: createSpring(),
        scale: createSpring(1),
        flip: createSpring(),
        hover: createSpring(),
        pointerX: createSpring(0.5),
        pointerY: createSpring(0.5),
        lean: createSpring(),
      },
      lastX: Number.NaN,
      rect: null,
      detach: () => {},
    };
    // The first paint happens now (a card is never shown blank).
    paint(card, textureWidthFor(slot.getBoundingClientRect().width || 200, window.devicePixelRatio || 1));

    const fromEvent = (event: PointerEvent) => {
      const rect = slot.getBoundingClientRect();
      card.pointer.x = clamp01((event.clientX - rect.left) / Math.max(rect.width, 1));
      card.pointer.y = clamp01((event.clientY - rect.top) / Math.max(rect.height, 1));
    };
    const onEnter = (event: PointerEvent) => {
      card.hovered = true;
      card.hoverStart = state.time;
      fromEvent(event);
      if (!reducedMotion && card.rect && card.landed && state.layout === 'slots') {
        const centre = toTable(card.rect);
        sparkles.spawn({ x: centre.x, y: centre.y, count: 3, spread: card.rect.width * 0.6, size: [8, 18], life: [0.5, 0.9], speed: 12 });
      }
    };
    const onMove = (event: PointerEvent) => fromEvent(event);
    const onLeave = () => {
      card.hovered = false;
      card.pressed = false;
    };
    const onDown = () => {
      card.pressed = true;
    };
    const onUp = () => {
      card.pressed = false;
    };
    const onFocusIn = () => {
      card.focused = slot.querySelector(':focus-visible') !== null;
    };
    const onFocusOut = () => {
      card.focused = false;
    };
    slot.addEventListener('pointerenter', onEnter);
    slot.addEventListener('pointermove', onMove);
    slot.addEventListener('pointerleave', onLeave);
    slot.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    slot.addEventListener('focusin', onFocusIn);
    slot.addEventListener('focusout', onFocusOut);
    card.detach = () => {
      slot.removeEventListener('pointerenter', onEnter);
      slot.removeEventListener('pointermove', onMove);
      slot.removeEventListener('pointerleave', onLeave);
      slot.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      slot.removeEventListener('focusin', onFocusIn);
      slot.removeEventListener('focusout', onFocusOut);
    };
    cards.push(card);

    return {
      setModel(next) {
        const wasComplete = card.model.edition === 'prism';
        card.model = next;
        card.shadowMaterial.uniforms.uGlowColour.value.set(next.accent);
        if (next.edition === 'prism' && !wasComplete && card.rect && !reducedMotion) {
          // The course is complete: a shower of sparkles and a toss of chips.
          const centre = toTable(card.rect);
          sparkles.spawn({ x: centre.x, y: centre.y, count: 30, spread: card.rect.width * 0.7, size: [10, 30], life: [0.6, 1.4], speed: 60 });
          chips.toss({ x: centre.x, y: centre.y, count: 10, size: card.rect.width * 0.16 });
        }
      },
      setSelected(selected) {
        if (selected && !card.selected && card.rect && !reducedMotion) {
          const centre = toTable(card.rect);
          sparkles.spawn({ x: centre.x, y: centre.y, count: 14, spread: card.rect.width * 0.55, size: [10, 24], life: [0.5, 1.0], speed: 45 });
        }
        card.selected = selected;
      },
      setFlipped(flipped) {
        card.flipped = flipped;
      },
      dispose() {
        card.detach();
        scene.remove(mesh, shadow);
        material.dispose();
        shadowMaterial.dispose();
        card.faceTexture.dispose();
        card.maskTexture.dispose();
        if (state.kept === card) state.kept = null;
        const index = cards.indexOf(card);
        if (index >= 0) cards.splice(index, 1);
        paintQueue = paintQueue.filter((entry) => entry !== card);
      },
    };
  };

  let viewport = { width: 1, height: 1 };
  /** A DOM rect's centre in table space (x right, y up, origin at the viewport centre). */
  const toTable = (rect: DOMRect) => ({ x: rect.left + rect.width / 2 - viewport.width / 2, y: viewport.height / 2 - (rect.top + rect.height / 2) });

  const slotPose = (rect: DOMRect): CardPose => ({ ...toTable(rect), z: 0, roll: 0, flip: 0, scale: 1 });

  /** The slots' bounding box (CSS px), or null before layout. */
  const slotBounds = () => {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const card of cards) {
      const rect = card.rect;
      if (!rect || rect.width <= 0) continue;
      left = Math.min(left, rect.left);
      right = Math.max(right, rect.right);
      top = Math.min(top, rect.top);
      bottom = Math.max(bottom, rect.bottom);
    }
    return left === Infinity ? null : { left, right, top, bottom };
  };

  /** A card's place in a gathered deck: a face-down stack, the first card
   *  on top, each a little askew — at the middle of the slots, or (`spot`)
   *  at the picked view's deck spot, without the kept card. */
  const deckPose = (card: Card, at: 'slots' | 'spot'): CardPose => {
    const stack = at === 'spot' && state.kept ? cards.filter((entry) => entry !== state.kept) : cards;
    const index = Math.max(0, stack.indexOf(card));
    let x = 0;
    let y = -viewport.height;
    const spot = spots.deckRect;
    const bounds = slotBounds();
    if (at === 'spot' && spot && spot.width > 0) ({ x, y } = toTable(spot));
    else if (bounds) {
      x = (bounds.left + bounds.right) / 2 - viewport.width / 2;
      y = viewport.height / 2 - (bounds.top + bounds.bottom) / 2;
    }
    // Stacked a card's thickness (plus a hair) apart, so none cut through another.
    const spacing = (cards[0]?.rect?.width ?? 200) * (CARD_THICKNESS + 0.006);
    // Each lower card peeks out a little down-right, so the stack's edges show.
    const depth = stack.length - 1 - index;
    return { x: x + depth * 1.6, y: y - depth * 2.2, z: depth * spacing, roll: 0.05 + Math.sin(index * 2.4) * 0.025, flip: 1, scale: 1 };
  };

  /** The kept card on its held spot, face up, sized to the spot. */
  const heldPose = (slotRect: DOMRect): CardPose => {
    const spot = spots.heldRect;
    if (!spot || spot.width <= 0) return slotPose(slotRect);
    return { ...toTable(spot), z: 0, roll: 0, flip: 0, scale: spot.width / Math.max(slotRect.width, 1) };
  };

  const setLayout = (layout: TableLayout, kept: Card | null = null) => {
    const nextKept = layout === 'picked' ? kept : null;
    if (layout === state.layout && nextKept === state.kept) return;
    for (const card of cards) {
      // A card still in flight starts from where it is; a settled one from its live place.
      card.layoutFrom = card.landed || !card.basePose ? placeOf(card) : { ...card.basePose };
      card.landed = false;
    }
    // The held spot's hover belongs to the kept card only while it is kept.
    if (state.kept) state.kept.hovered = false;
    state.layout = layout;
    state.kept = nextKept;
    state.layoutStart = state.time;
    for (const listener of listeners) listener();
  };

  // The picked view's two places (DOM elements, read each frame). The held
  // spot takes the pointer for the kept card (its slot is inert under it):
  // hover tilts it, a click spins it again.
  const spots = {
    held: null as HTMLElement | null,
    deck: null as HTMLElement | null,
    heldRect: null as DOMRect | null,
    deckRect: null as DOMRect | null,
    detach: () => {},
  };
  const setPickSpots: CardTable['setPickSpots'] = (held, deck) => {
    spots.detach();
    spots.held = held;
    spots.deck = deck;
    spots.detach = () => {};
    if (!held) return;
    const pointAt = (card: Card, event: PointerEvent) => {
      const rect = held.getBoundingClientRect();
      card.pointer.x = clamp01((event.clientX - rect.left) / Math.max(rect.width, 1));
      card.pointer.y = clamp01((event.clientY - rect.top) / Math.max(rect.height, 1));
    };
    const onEnter = (event: PointerEvent) => {
      const card = state.kept;
      if (!card) return;
      card.hovered = true;
      card.hoverStart = state.time;
      pointAt(card, event);
    };
    const onMove = (event: PointerEvent) => {
      if (state.kept) pointAt(state.kept, event);
    };
    const onLeave = () => {
      if (!state.kept) return;
      state.kept.hovered = false;
      state.kept.pressed = false;
    };
    const onDown = () => {
      if (state.kept) state.kept.pressed = true;
    };
    const onClick = () => {
      // Once landed and still: another spin.
      if (state.kept?.landed && state.time - state.spinStart > SPIN_SECONDS) state.spinStart = state.time;
    };
    held.addEventListener('pointerenter', onEnter);
    held.addEventListener('pointermove', onMove);
    held.addEventListener('pointerleave', onLeave);
    held.addEventListener('pointerdown', onDown);
    held.addEventListener('click', onClick);
    spots.detach = () => {
      held.removeEventListener('pointerenter', onEnter);
      held.removeEventListener('pointermove', onMove);
      held.removeEventListener('pointerleave', onLeave);
      held.removeEventListener('pointerdown', onDown);
      held.removeEventListener('click', onClick);
    };
  };

  /** The choreography pose for a card in a non-slot mode. */
  const modePose = (mode: TableMode, index: number, slot: CardPose, width: number): CardPose => {
    const centreX = 0;
    const centreY = slot.y;
    switch (mode) {
      case 'fan':
        return fanPose(index, cards.length, centreX, deckPose(cards[index], 'slots').y - width * 0.4, width);
      case 'pile':
        return pilePose(index, centreX, slot.y, width * 1.3, 0.37);
      case 'shuffle':
        return shufflePose(index, cards.length, stepProgress(state.time, state.modeStart, SHUFFLE_SECONDS), centreX, centreY, width);
      default:
        return slot;
    }
  };

  const update: CardTable['update'] = (t, dt, viewportWidth, viewportHeight) => {
    state.time = t;
    viewport = { width: viewportWidth, height: viewportHeight };
    shared.uTime.value = t;
    camera.aspect = viewportWidth / Math.max(viewportHeight, 1);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(viewportHeight / 2 / DISTANCE));
    camera.updateProjectionMatrix();
    sunburst.update(t, viewportWidth, viewportHeight);
    sparkles.update(t);
    chips.update(dt);

    // 1. READ every rect first.
    for (const card of cards) card.rect = card.slot.getBoundingClientRect();
    spots.heldRect = spots.held?.getBoundingClientRect() ?? null;
    spots.deckRect = spots.deck?.getBoundingClientRect() ?? null;

    // Deal when the section is in view; gather when the page is back up at
    // the hero (the whole deck is below the screen). A hand switch holds
    // until the section next leaves; a picked card holds for good (the
    // owner: "once a card is picked, the deck shouldn't unravel even if I
    // scroll to the hero") — only "Pick another card" deals again.
    const bounds = slotBounds();
    if (bounds && !reducedMotion && DEAL_OPTIONS[state.deal].id === 'scroll' && state.layout !== 'picked') {
      const belowScreen = bounds.top > viewportHeight * 0.92;
      const inView = bounds.top < viewportHeight * 0.7 && bounds.bottom > viewportHeight * 0.3;
      if (state.manual) {
        if (belowScreen) state.manual = false;
      } else if (inView) setLayout('slots');
      else if (belowScreen) setLayout('deck');
    }
    if (state.mode === 'shuffle' && t - state.modeStart > SHUFFLE_SECONDS) {
      state.previousMode = 'shuffle';
      state.mode = 'slots';
      state.modeStart = t;
    }

    const widthPx = cards[0]?.rect?.width ?? 200;

    // 2–3. POSE and WRITE.
    cards.forEach((card, index) => {
      const rect = card.rect!;
      const slot = slotPose(rect);
      const visible = rect.width > 0 && rect.bottom > -viewportHeight * 0.5 && rect.top < viewportHeight * 1.5;
      card.mesh.visible = visible || state.mode !== 'slots';
      card.shadow.visible = card.mesh.visible;
      if (!card.mesh.visible) return;

      // Repaint when the model or the needed resolution changes (≤ 1 per frame).
      const wantedWidth = textureWidthFor(rect.width, window.devicePixelRatio || 1);
      if ((card.paintedKey !== faceModelKey(card.model) || wantedWidth > card.paintedWidth) && !paintQueue.includes(card)) paintQueue.push(card);

      // The base pose: the slot, the deck or the held spot, the flight between them, or a choreography.
      const placed = (place: Place): CardPose =>
        place === 'slot' ? slot : place === 'deck' ? deckPose(card, 'slots') : place === 'pickedDeck' ? deckPose(card, 'spot') : heldPose(rect);
      const kept = state.layout === 'picked' && card === state.kept;
      const target = placed(placeOf(card));
      let pose: CardPose = target;
      if (!card.landed) {
        // Dealt top card first; gathered bottom card first; the kept card at once.
        const order = state.layout === 'slots' ? index : kept ? 0 : cards.length - 1 - index;
        const progress = reducedMotion ? 1 : stepProgress(t, state.layoutStart + order * DEAL_STAGGER, DEAL_SECONDS);
        const from = typeof card.layoutFrom === 'string' ? placed(card.layoutFrom) : card.layoutFrom;
        pose = progress <= 0 ? from : dealPose(progress, from, target, card.seed);
        // Cards in the air at once fly in layers: each later one a card's
        // thickness higher, so two flights never cut through each other.
        pose = { ...pose, z: pose.z + Math.sin(Math.PI * progress) * order * rect.width * (CARD_THICKNESS + 0.02) };
        if (progress >= 1) {
          card.landed = true;
          pose = target;
          if (state.layout === 'slots' && !reducedMotion) sparkles.spawn({ x: slot.x, y: slot.y - rect.height * 0.45, count: 4, spread: rect.width * 0.4, size: [8, 16], life: [0.4, 0.8], speed: 20 });
          if (kept && !reducedMotion) sparkles.spawn({ x: pose.x, y: pose.y, count: 18, spread: rect.width * pose.scale * 0.6, size: [10, 26], life: [0.5, 1.1], speed: 50 });
        }
      }
      card.basePose = pose;
      const transition = easing.inOutSine(stepProgress(t, state.modeStart, MODE_SECONDS));
      if (state.mode !== 'slots') {
        const target = modePose(state.mode, index, slot, widthPx);
        const from = state.previousMode === 'slots' ? pose : modePose(state.previousMode, index, slot, widthPx);
        pose = mixPose(from, target, state.mode === 'shuffle' ? 1 : transition);
      } else if (state.previousMode !== 'slots' && transition < 1) {
        pose = mixPose(modePose(state.previousMode, index, slot, widthPx), pose, transition);
      }

      // Interaction.
      const active = card.hovered || card.focused;
      const { springs } = card;
      // Resting where it can be played with: in its slot, or kept on the held spot.
      const inSlot = state.mode === 'slots' && card.landed && (state.layout === 'slots' || kept);
      if (reducedMotion) {
        springs.tiltX.value = 0;
        springs.tiltY.value = 0;
        springs.lift.value = active ? 8 : card.selected ? 4 : 0;
        springs.scale.value = 1;
        springs.flip.value = card.flipped ? 1 : 0;
        springs.hover.value = active ? 1 : 0;
        springs.pointerX.value = active ? card.pointer.x : 0.32;
        springs.pointerY.value = active ? card.pointer.y : 0.25;
        springs.lean.value = 0;
      } else {
        const tracking = card.hovered && inSlot;
        // The idle float only in the slots: stacked cards (fan, pile, deck)
        // lie flat, or a tilted card would cut through its neighbours.
        const idleX = inSlot ? Math.sin(t * 0.31 * Math.PI * 2 + card.seed * 6.28) * 0.018 : 0;
        const idleY = inSlot ? Math.sin(t * 0.47 * Math.PI * 2 + card.seed * 10.7) * 0.024 : 0;
        stepSpring(springs.tiltX, tracking ? (card.pointer.y - 0.5) * 2 * MAX_TILT : idleX, TILT_SPRING, dt);
        stepSpring(springs.tiltY, tracking ? (card.pointer.x - 0.5) * 2 * MAX_TILT : idleY, TILT_SPRING, dt);
        stepSpring(springs.lift, inSlot && active ? HOVER_LIFT : inSlot && card.selected ? HOVER_LIFT * 0.45 : 0, TILT_SPRING, dt);
        stepSpring(springs.scale, card.pressed ? 0.97 : inSlot && active ? 1.06 : 1, POP_SPRING, dt);
        stepSpring(springs.flip, card.flipped ? 1 : 0, FLIP_SPRING, dt);
        stepSpring(springs.hover, active ? 1 : card.selected ? 0.35 : 0, { stiffness: 120, damping: 1 }, dt);
        stepSpring(springs.pointerX, tracking ? card.pointer.x : 0.5, TILT_SPRING, dt);
        stepSpring(springs.pointerY, tracking ? card.pointer.y : 0.5, TILT_SPRING, dt);
        // Velocity lean (Balatro): a card banks as it travels.
        const velocity = Number.isNaN(card.lastX) || dt <= 0 ? 0 : (pose.x - card.lastX) / dt;
        stepSpring(springs.lean, Math.max(-0.35, Math.min(0.35, -velocity * 0.0005)), { stiffness: 120, damping: 0.8 }, dt);
      }
      card.lastX = pose.x;

      const punchRoll = reducedMotion ? 0 : 0.06 * punch(stepProgress(t, card.hoverStart, 0.45), 2);

      // The kept card spins as it rises to its spot, rising a little more while it turns.
      const spinProgress = kept && !reducedMotion ? stepProgress(t, state.spinStart, SPIN_SECONDS) : 1;
      const spin = spinProgress < 1 ? easing.outCubic(spinProgress) * Math.PI * 2 * SPIN_TURNS : 0;
      const spinLift = spinProgress < 1 ? Math.sin(Math.PI * spinProgress) * rect.width * 0.35 : 0;

      // 3. WRITE: the mesh…
      const width = rect.width * pose.scale * springs.scale.value;
      // A turning card rises as it turns, so no half of it dips under the table.
      const turning = Math.max(pose.flip, springs.flip.value);
      const lift = pose.z + springs.lift.value + Math.sin(Math.PI * clamp01(turning)) * rect.width * 0.55 + spinLift;
      card.mesh.position.set(pose.x, pose.y, lift);
      card.mesh.rotation.set(springs.tiltX.value, springs.tiltY.value + Math.PI * turning + spin, pose.roll + springs.lean.value + punchRoll);
      card.mesh.scale.setScalar(width);
      card.mesh.renderOrder = lift;
      // …its shadow on the table (offset and softened as it lifts)…
      // The table plane sits below the deepest point a tilted card reaches
      // (max tilt × half its height ≈ 0.16 W), or a neighbour's shadow would
      // cut across the half of a card that tilts back. It is pushed back, so
      // its place and size are scaled by the perspective to look unmoved.
      const height = Math.max(lift, 0);
      const tableZ = -0.25 * rect.width;
      const perspective = (DISTANCE - tableZ) / DISTANCE;
      card.shadow.position.set((pose.x + 0.35 * (6 + 0.5 * height)) * perspective, (pose.y - 0.65 * (6 + 0.5 * height)) * perspective, tableZ);
      card.shadow.rotation.set(0, 0, pose.roll + springs.lean.value + punchRoll);
      card.shadow.scale.setScalar(width * perspective);
      const shadowUniforms = card.shadowMaterial.uniforms;
      shadowUniforms.uBlur.value = 0.025 + 0.0011 * height;
      shadowUniforms.uOpacity.value = Math.max(0.12, 0.42 - 0.003 * height);
      // The chosen card's accent aura, only while it rests (slot or held spot).
      shadowUniforms.uGlow.value = card.selected && inSlot ? 0.55 : 0;
      // …and its finish.
      const strengths = editionStrengths(editionOf(card));
      const uniforms = card.material.uniforms;
      uniforms.uFoil.value = strengths.foil;
      uniforms.uHolo.value = strengths.holo;
      uniforms.uPrism.value = strengths.prism;
      uniforms.uHover.value = clamp01(springs.hover.value);
      uniforms.uPointer.value.set(springs.pointerX.value, 1 - springs.pointerY.value);

      // Star dust round a complete card.
      if (strengths.prism > 0 && !reducedMotion && Math.random() < dt * 2.5) {
        const angle = Math.random() * Math.PI * 2;
        sparkles.spawn({ x: pose.x + Math.cos(angle) * rect.width * 0.55, y: pose.y + Math.sin(angle) * rect.height * 0.55, count: 1, spread: 4, size: [6, 13], life: [0.6, 1.2], speed: 10 });
      }
    });

    // At most one face painted per frame.
    const next = paintQueue.shift();
    if (next && next.rect) paint(next, textureWidthFor(next.rect.width, window.devicePixelRatio || 1));
  };

  const repaintTheme = () => {
    paintBack(backCanvas, backMaskCanvas, 768, themeOf());
    backTexture.needsUpdate = true;
    backMaskTexture.needsUpdate = true;
    // Every face repaints (queued, at most one per frame — including cards
    // not measured yet, which a theme set at mount would otherwise miss).
    for (const card of cards) card.paintedKey = '';
  };

  const selector = (id: string, label: string, options: readonly AssetOption[], key: 'theme' | 'edition' | 'backdrop' | 'deal', onChange?: () => void): AssetClass => ({
    id,
    label,
    options,
    current: () => options[state[key]].id,
    setOption(optionId) {
      const index = options.findIndex((option) => option.id === optionId);
      if (index < 0) throw new Error(`[${id}] unknown option "${optionId}"`);
      state[key] = index;
      onChange?.();
    },
    dispose() {},
  });

  const classes: AssetClass[] = [
    selector('cardTheme', 'Card theme', THEME_OPTIONS, 'theme', repaintTheme),
    selector('cardEdition', 'Card finish', EDITION_OPTIONS, 'edition'),
    selector('cardBackdrop', 'Deck backdrop', BACKDROP_OPTIONS, 'backdrop', () => sunburst.setStrength(state.backdrop === 0 ? 1 : 0)),
    selector('cardDeal', 'Deal-in', DEAL_OPTIONS, 'deal', () => {
      if (DEAL_OPTIONS[state.deal].id === 'static') setLayout('slots');
    }),
  ];

  const effects: CardEffects = {
    deal() {
      if (reducedMotion) return;
      state.mode = 'slots';
      state.previousMode = 'slots';
      state.manual = true;
      // Snap into the deck, then deal from it.
      for (const card of cards) {
        card.landed = true;
        card.basePose = null;
      }
      state.layout = 'deck';
      state.kept = null;
      setLayout('slots');
    },
    setMode(mode) {
      if (reducedMotion || mode === state.mode) return;
      state.previousMode = state.mode;
      state.mode = mode;
      state.modeStart = state.time;
    },
    flipAll() {
      for (const card of cards) card.flipped = !card.flipped;
    },
    burst() {
      for (const card of cards) {
        if (!card.rect) continue;
        const centre = toTable(card.rect);
        sparkles.spawn({ x: centre.x, y: centre.y, count: 12, spread: card.rect.width * 0.6, size: [10, 28], life: [0.6, 1.2], speed: 50 });
      }
    },
    chips() {
      if (reducedMotion) return;
      const deck = cards[0] ? deckPose(cards[0], state.layout === 'picked' ? 'spot' : 'slots') : { x: 0, y: 0 };
      chips.toss({ x: deck.x, y: deck.y, count: 18, size: (cards[0]?.rect?.width ?? 200) * 0.16 });
    },
  };

  return {
    scene,
    camera,
    isDealt: () => state.layout === 'slots',
    layout: () => state.layout,
    setDealt(dealt) {
      state.manual = true;
      setLayout(dealt ? 'slots' : 'deck');
    },
    pick(slot, options) {
      const card = cards.find((entry) => entry.slot === slot);
      if (!card) return;
      state.manual = true;
      setLayout('picked', card);
      if (options?.instant) {
        // Already there: the flight and the spin both finished long ago.
        state.layoutStart = state.time - 100;
        state.spinStart = -100;
      } else state.spinStart = state.time;
    },
    setPickSpots,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    register,
    setBackdrop: (element) => sunburst.setTarget(element),
    update,
    effects,
    classes,
    dispose() {
      spots.detach();
      for (const card of [...cards]) {
        card.detach();
        card.material.dispose();
        card.shadowMaterial.dispose();
        card.faceTexture.dispose();
        card.maskTexture.dispose();
      }
      cards.length = 0;
      geometry.dispose();
      shadowGeometry.dispose();
      studio.dispose();
      backTexture.dispose();
      backMaskTexture.dispose();
      sparkles.dispose();
      sunburst.dispose();
      chips.dispose();
    },
  };
}

export { createCardTable };
export type { CardEffects, CardHandle, CardTable, TableLayout, TableMode };
