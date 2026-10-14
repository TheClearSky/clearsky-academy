import { seededRandom } from '../engine/random';

/**
 * The cards' choreography, as PURE functions of time (research
 * `.claude/research/stage-v2/CARDS.md` › E): easings, the deal-in arc from a
 * deck, a fanned hand, a scattered pile (the classic aces reference), and a
 * riffle shuffle. `cardTable.ts` evaluates them per frame; interaction
 * (tilt, hover, press) stays on springs (`ui/spring.ts`). No tween library:
 * GSAP's licence is proprietary, and these are a few lines each.
 *
 * Units: CSS px in the card table's space (x right, y UP, z toward the
 * viewer), angles in radians.
 */

type CardPose = {
  x: number;
  y: number;
  /** Height above the table (px toward the viewer). */
  z: number;
  /** In-plane rotation (radians, + counter-clockwise). */
  roll: number;
  /** 0 = face up, 1 = face down (π about the card's vertical axis). */
  flip: number;
  scale: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const easing = {
  linear: (p: number) => p,
  outCubic: (p: number) => 1 - (1 - p) ** 3,
  inOutSine: (p: number) => -(Math.cos(Math.PI * p) - 1) / 2,
  /** Overshoots then settles (s = 1.70158, the classic back ease). */
  outBack: (p: number) => {
    const s = 1.70158;
    return 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;
  },
};

/** Progress 0..1 of a step that starts at `start` and lasts `duration` (s). */
function stepProgress(time: number, start: number, duration: number): number {
  return duration <= 0 ? (time >= start ? 1 : 0) : clamp01((time - start) / duration);
}

/** A damped "punch": a kick of amplitude 1 that rings out (0 at p = 0 and 1). */
function punch(p: number, oscillations = 2): number {
  if (p <= 0 || p >= 1) return 0;
  return Math.sin(p * Math.PI * 2 * oscillations) * (1 - p) ** 2;
}

/** Height between stacked cards, per px of card width: the card's thickness
 *  (`cardGeometry.ts`, 0.03 W) plus a hair, so stacked cards never intersect. */
const STACK_GAP = 0.036;

/** The deal: a card leaves the deck face down, arcs up and over to its
 *  slot, turns face up over the slot at the end and lands with a squash;
 *  the gather is the same flight the other way (it turns first). */
const DEAL_SECONDS = 0.55;
const DEAL_STAGGER = 0.08;
const DEAL_APEX = 150;

function dealPose(p: number, from: CardPose, to: CardPose, seed: number): CardPose {
  const travel = easing.outCubic(clamp01(p));
  // A quadratic Bézier through a raised control point: the arc.
  const controlX = (from.x + to.x) / 2;
  const controlY = Math.max(from.y, to.y) + DEAL_APEX * 0.6;
  const inverse = 1 - travel;
  const x = inverse * inverse * from.x + 2 * inverse * travel * controlX + travel * travel * to.x;
  const y = inverse * inverse * from.y + 2 * inverse * travel * controlY + travel * travel * to.y;
  const lift = Math.sin(Math.PI * travel) * DEAL_APEX * 0.5;
  const spin = (seed - 0.5) * 0.6;
  const roll = to.roll + (from.roll + spin - to.roll) * (1 - easing.outBack(clamp01(p)));
  // Turn where the card is ALONE: turning face-up (a deal) over its own
  // slot at the end of the flight; turning face-down (a gather) at its slot
  // before it leaves. Never mid-air beside other cards, where a card on its
  // edge would cut through its neighbours.
  const turningUp = to.flip < from.flip;
  const flip = 1 - easing.inOutSine(turningUp ? clamp01((p - 0.62) / 0.33) : clamp01((p - 0.02) / 0.3));
  // Landing squash: a small dip in scale just after touch-down.
  const squash = 1 - 0.035 * punch(clamp01((p - 0.82) / 0.18), 1);
  // Height glides from the start's to the end's (a card leaving the top of
  // the deck must not drop through the cards below it), plus the arc.
  const z = from.z + (to.z - from.z) * travel + lift;
  return { x, y, z, roll, flip: from.flip * flip + to.flip * (1 - flip), scale: to.scale * squash };
}

/** A fanned hand of `count` cards around a pivot below the hand. */
function fanPose(index: number, count: number, centreX: number, centreY: number, cardWidth: number): CardPose {
  const step = Math.min(0.157, 0.94 / Math.max(count, 1));
  const angle = (index - (count - 1) / 2) * step;
  const radius = cardWidth * 2.4;
  return {
    x: centreX + Math.sin(angle) * radius,
    y: centreY - radius + Math.cos(angle) * radius,
    z: index * cardWidth * STACK_GAP,
    roll: -angle,
    flip: 0,
    scale: 1,
  };
}

/** A scattered pile (the classic aces reference): seeded positions in a
 *  disc and any in-plane angle, stacked upward in draw order. */
function pilePose(index: number, centreX: number, centreY: number, radius: number, seed: number): CardPose {
  const random = seededRandom(Math.floor(seed * 1e6) + index * 7919);
  const distance = Math.sqrt(random()) * radius;
  const direction = random() * Math.PI * 2;
  return {
    x: centreX + Math.cos(direction) * distance,
    y: centreY + Math.sin(direction) * distance,
    z: index * (radius / 1.3) * STACK_GAP,
    roll: (random() - 0.5) * Math.PI * 2,
    flip: random() < 0.3 ? 1 : 0,
    scale: 1,
  };
}

/** A riffle shuffle at progress p: the deck splits into two halves that
 *  lean apart, the cards interleave, and the deck squares up. */
function shufflePose(index: number, count: number, p: number, centreX: number, centreY: number, cardWidth: number): CardPose {
  const left = index % 2 === 0;
  const split = Math.sin(Math.PI * clamp01(p / 0.8));
  const side = left ? -1 : 1;
  const order = left ? index / 2 : (count + index) / 2;
  return {
    x: centreX + side * split * cardWidth * 0.62,
    y: centreY + split * 18,
    z: order * cardWidth * STACK_GAP + split * 10,
    roll: -side * split * 0.14,
    flip: 1,
    scale: 1,
  };
}

/** Linear blend between two poses. */
function mixPose(from: CardPose, to: CardPose, amount: number): CardPose {
  const a = clamp01(amount);
  return {
    x: from.x + (to.x - from.x) * a,
    y: from.y + (to.y - from.y) * a,
    z: from.z + (to.z - from.z) * a,
    roll: from.roll + (to.roll - from.roll) * a,
    flip: from.flip + (to.flip - from.flip) * a,
    scale: from.scale + (to.scale - from.scale) * a,
  };
}

export { clamp01, DEAL_SECONDS, DEAL_STAGGER, dealPose, easing, fanPose, mixPose, pilePose, punch, shufflePose, stepProgress };
export type { CardPose };
