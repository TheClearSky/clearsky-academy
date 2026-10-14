import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HORIZON_FROM_TOP, lensShiftFor, stageFov } from '../stage/engine/lensShift';
import { EYE_HEIGHT } from '../stage/world/props/propLayout';
import {
  BELOW_FLOOR,
  RING_RATIOS,
  SPELL_LAYERS,
  SPELL_TIMELINE,
  calmSpellFrame,
  spellFrame,
  spellPlacement,
  spinTravel,
} from '../stage/world/spellTimeline';
import type { SpellFrame, SpellPhase } from '../stage/world/spellTimeline';

const T = SPELL_TIMELINE;
const STEP = 1 / 60;

/** Every frame of one loop, at 60 fps. */
function sweep(): SpellFrame[] {
  const frames: SpellFrame[] = [];
  for (let t = 0; t < T.period; t += STEP) frames.push(spellFrame(t));
  return frames;
}

/** Every number in a frame (nested), for the finiteness check. */
function numbersIn(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbersIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbersIn);
  return [];
}

function stageCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(stageFov(aspect), aspect, 0.1, 5000);
  camera.position.set(0, EYE_HEIGHT, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = lensShiftFor(HORIZON_FROM_TOP);
  return camera;
}

function onScreen(camera: THREE.PerspectiveCamera, x: number, y: number, z: number) {
  const ndc = new THREE.Vector3(x, y, z).project(camera);
  return { fromLeft: (ndc.x + 1) / 2, fromTop: (1 - ndc.y) / 2 };
}

describe('spellFrame — the story', () => {
  it('plays the phases in order, each once, and loops back to idle', () => {
    const order: SpellPhase[] = [];
    for (const frame of sweep()) if (order[order.length - 1] !== frame.phase) order.push(frame.phase);
    expect(order).toEqual(['idle', 'draw', 'summon', 'float', 'return', 'unwind', 'idle']);
  });

  it('is a pure loop: the same frame one period later, and for negative time', () => {
    for (const t of [0.5, 3.3, 7.7, 11.1, 15.5, 18.2, 21.4]) {
      expect(spellFrame(t + T.period)).toEqual(spellFrame(t));
      expect(spellFrame(t + 5 * T.period).loopTime).toBeCloseTo(spellFrame(t).loopTime, 6);
    }
    expect(spellFrame(-1).loopTime).toBeCloseTo(T.period - 1, 9);
  });

  it('keeps every number finite over the whole loop (a NaN uniform blacks out the frame)', () => {
    for (const frame of sweep()) for (const value of numbersIn(frame)) expect(Number.isFinite(value)).toBe(true);
  });

  it('starts and ends on an empty floor: nothing drawn, nothing summoned', () => {
    for (const t of [0, 1, T.drawStart - 0.01, T.fadeEnd + 0.01, T.period - 0.01]) {
      const frame = spellFrame(t);
      expect(frame.reveal.every((value) => value === 0)).toBe(true);
      expect(frame.star).toBe(0);
      expect(frame.column).toBe(0);
      expect(frame.book.visible).toBe(false);
      expect(frame.candle.visible).toBe(false);
      // Only faint embers.
      expect(frame.sparkles).toBeLessThanOrEqual(0.1);
    }
  });

  it('draws the rings on inner to outer, then the star, then pops the runes', () => {
    const firstFull = (layer: number) => sweep().find((frame) => frame.reveal[layer] >= 1)?.loopTime ?? Infinity;
    for (let layer = 1; layer < SPELL_LAYERS; layer++) expect(firstFull(layer)).toBeGreaterThan(firstFull(layer - 1));
    const midDraw = spellFrame(T.drawStart + 0.5);
    expect(midDraw.reveal[0]).toBeGreaterThan(0);
    expect(midDraw.reveal[0]).toBeLessThan(1);
    expect(midDraw.star).toBe(0);
    expect(spellFrame(T.starStart + T.starDuration / 2).star).toBeCloseTo(0.5, 5);
    expect(spellFrame(T.glyphStart - 0.5).glyphTime).toBeLessThan(0);
    // Everything is drawn by the ignition.
    const ignited = spellFrame(T.ignite);
    expect(ignited.reveal.every((value) => value === 1)).toBe(true);
    expect(ignited.star).toBe(1);
  });

  it('ignites white-hot with a shock ring, and lets the column rise', () => {
    expect(spellFrame(T.ignite - 0.01).flash).toBe(0);
    expect(spellFrame(T.ignite + 0.05).flash).toBe(1);
    expect(spellFrame(T.ignite + 0.05).shockAmount).toBeGreaterThan(1);
    expect(spellFrame(T.ignite + 1.5).flash).toBeLessThan(0.02);
    expect(spellFrame(T.ignite + 2).column).toBe(1);
  });

  it('summons the book first, then the candle; both float above the floor, the book open and the candle lit', () => {
    const frames = sweep();
    const firstVisible = (pick: (frame: SpellFrame) => boolean) => frames.find(pick)?.loopTime ?? Infinity;
    const bookAt = firstVisible((frame) => frame.book.visible);
    const candleAt = firstVisible((frame) => frame.candle.visible);
    expect(bookAt).toBeGreaterThan(T.ignite);
    expect(candleAt).toBeGreaterThan(bookAt);
    for (let t = T.floatStart; t < T.bookCloseStart; t += 0.25) {
      const frame = spellFrame(t);
      expect(frame.book.visible && frame.candle.visible).toBe(true);
      expect(frame.book.elevation).toBeGreaterThan(0.8);
      expect(frame.candle.elevation).toBeGreaterThan(0.6);
      expect(frame.book.dissolve).toBe(0);
      expect(frame.book.action).toBeCloseTo(1, 5);
      // The flame has caught (it takes 0.45 s from the ignition).
      if (t > T.candleIgnite + 0.45) expect(frame.candle.action).toBe(1);
      expect(frame.book.scale).toBeCloseTo(1, 5);
    }
    // Shut and unlit until their moment.
    expect(spellFrame(T.bookOpenStart - 0.05).book.action).toBe(0);
    expect(spellFrame(T.candleIgnite - 0.05).candle.action).toBe(0);
  });

  it('sends them back into the circle: they sink below the floor, shrink and dissolve, then are gone', () => {
    const late = spellFrame(T.bookSinkStart + T.sinkDuration - 0.05);
    expect(late.book.elevation).toBeLessThan(0);
    expect(late.book.dissolve).toBeGreaterThan(0.9);
    expect(late.book.scale).toBeLessThan(0.6);
    expect(spellFrame(T.bookCloseStart + T.bookCloseDuration + 0.01).book.action).toBe(0);
    expect(spellFrame(T.candleSinkStart + 0.5).candle.action).toBe(0);
    const after = spellFrame(T.candleSinkStart + T.sinkDuration + 0.01);
    expect(after.book.visible).toBe(false);
    expect(after.candle.visible).toBe(false);
    expect(after.candle.elevation).toBe(BELOW_FLOOR);
  });

  it('gives a last pulse, then unwinds outer ring first and fades out', () => {
    const farewell = spellFrame(T.lastPulse + 0.05);
    expect(farewell.flash).toBeGreaterThan(0.5);
    expect(farewell.shockAmount).toBeGreaterThan(1);
    const unwinding = spellFrame(T.unwindStart + 0.6);
    expect(unwinding.reveal[SPELL_LAYERS - 1]).toBeLessThan(unwinding.reveal[0]);
    expect(spellFrame(T.fadeEnd).gain).toBe(0);
    // The rings turn backwards while unwinding (speed 1 − 2.6·(1 − e^(−2u))).
    expect(spinTravel(T.unwindStart + 2)).toBeLessThan(spinTravel(T.unwindStart + 1));
  });

  it('moves smoothly: no jumps between frames except the ignition flashes', () => {
    const frames = sweep();
    for (let index = 1; index < frames.length; index++) {
      const previous = frames[index - 1];
      const frame = frames[index];
      for (let layer = 0; layer < SPELL_LAYERS; layer++) {
        expect(Math.abs(frame.reveal[layer] - previous.reveal[layer])).toBeLessThan(0.05);
        expect(Math.abs(frame.ringAngles[layer] - previous.ringAngles[layer])).toBeLessThan(0.05);
      }
      expect(Math.abs(frame.gain - previous.gain)).toBeLessThan(0.05);
      expect(Math.abs(frame.column - previous.column)).toBeLessThan(0.05);
      if (previous.book.visible && frame.book.visible) {
        expect(Math.abs(frame.book.elevation - previous.book.elevation)).toBeLessThan(0.1);
        expect(Math.abs(frame.book.yaw - previous.book.yaw)).toBeLessThan(0.1);
      }
      if (previous.candle.visible && frame.candle.visible) expect(Math.abs(frame.candle.elevation - previous.candle.elevation)).toBeLessThan(0.1);
    }
  });

  it('counter-rotates neighbouring rings, the inner one fastest', () => {
    const frame = spellFrame(T.floatStart + 2);
    for (let layer = 1; layer < SPELL_LAYERS; layer++) {
      expect(Math.sign(frame.ringAngles[layer])).toBe(-Math.sign(frame.ringAngles[layer - 1]));
      expect(Math.abs(frame.ringAngles[layer])).toBeLessThan(Math.abs(frame.ringAngles[layer - 1]));
    }
    expect(RING_RATIOS).toHaveLength(SPELL_LAYERS);
  });

  it('spins continuously across its pieces (draw → ignition kick → unwind)', () => {
    for (const boundary of [T.drawStart, T.ignite, T.unwindStart]) {
      expect(spinTravel(boundary + 1e-6) - spinTravel(boundary - 1e-6)).toBeLessThan(1e-4);
    }
    // The ignition kicks the speed up (≈ 3.5× full speed), then it settles to 1.
    const speed = (t: number) => (spinTravel(t + 1e-3) - spinTravel(t)) / 1e-3;
    expect(speed(T.ignite + 0.01)).toBeGreaterThan(3);
    expect(speed(T.unwindStart - 0.1)).toBeLessThan(1.1);
  });
});

describe('calmSpellFrame — the circle option and the reduced-motion still', () => {
  it('is fully drawn with nothing summoned, no flash, no column', () => {
    const frame = calmSpellFrame(0);
    expect(frame.reveal.every((value) => value === 1)).toBe(true);
    expect(frame.star).toBe(1);
    expect(frame.glyphTime).toBeGreaterThanOrEqual(100);
    expect(frame.flash).toBe(0);
    expect(frame.column).toBe(0);
    expect(frame.book.visible || frame.candle.visible).toBe(false);
    expect(frame.gain).toBeGreaterThan(0.5);
  });

  it('is the same still at the same time (deterministic) and turns slowly with time', () => {
    expect(calmSpellFrame(0)).toEqual(calmSpellFrame(0));
    const later = calmSpellFrame(10);
    expect(later.ringAngles[0]).not.toBeCloseTo(calmSpellFrame(0).ringAngles[0], 3);
    for (const value of numbersIn(later)) expect(Number.isFinite(value)).toBe(true);
  });
});

describe('spellPlacement', () => {
  it('lies in the empty middle below the hero, inside the props corridor, in landscape', () => {
    for (const aspect of [16 / 9, 1.6, 4 / 3, 21 / 9]) {
      const camera = stageCamera(aspect);
      const { distance, radius } = spellPlacement(aspect);
      const left = onScreen(camera, -radius, 0, -distance);
      const right = onScreen(camera, radius, 0, -distance);
      const far = onScreen(camera, 0, 0, -distance - radius);
      const near = onScreen(camera, 0, 0, -distance + radius);
      // Centred, within the props' corridor (0.21..0.79 of the width).
      expect(left.fromLeft).toBeGreaterThan(0.21);
      expect(right.fromLeft).toBeLessThan(0.79);
      expect(left.fromLeft + right.fromLeft).toBeCloseTo(1, 6);
      // On the floor below the horizon, fully on screen.
      expect(far.fromTop).toBeGreaterThan(HORIZON_FROM_TOP);
      expect(near.fromTop).toBeLessThan(1);
    }
  });

  it('still fits a portrait phone', () => {
    const aspect = 390 / 844;
    const camera = stageCamera(aspect);
    const { distance, radius } = spellPlacement(aspect);
    expect(onScreen(camera, -radius, 0, -distance).fromLeft).toBeGreaterThan(0.1);
    expect(onScreen(camera, 0, 0, -distance + radius).fromTop).toBeLessThan(1);
  });
});
