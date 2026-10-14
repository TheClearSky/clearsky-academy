import { describe, expect, it } from 'vitest';
import { dealPose, easing, fanPose, pilePose, punch, shufflePose, stepProgress } from '../stage/cards/motion';
import type { CardPose } from '../stage/cards/motion';

const deck: CardPose = { x: 0, y: -300, z: 0, roll: 0.2, flip: 1, scale: 1 };
const slot: CardPose = { x: 240, y: 0, z: 0, roll: 0, flip: 0, scale: 1 };

describe('easings', () => {
  it('start at 0 and end at 1', () => {
    for (const ease of Object.values(easing)) {
      expect(ease(0)).toBeCloseTo(0, 6);
      expect(ease(1)).toBeCloseTo(1, 6);
    }
  });
  it('outBack overshoots', () => {
    expect(Math.max(...Array.from({ length: 100 }, (_, index) => easing.outBack(index / 99)))).toBeGreaterThan(1.05);
  });
});

describe('stepProgress and punch', () => {
  it('clamps', () => {
    expect(stepProgress(0, 1, 2)).toBe(0);
    expect(stepProgress(2, 1, 2)).toBe(0.5);
    expect(stepProgress(9, 1, 2)).toBe(1);
  });
  it('punch is 0 at both ends', () => {
    expect(punch(0)).toBe(0);
    expect(punch(1)).toBe(0);
  });
});

describe('dealPose', () => {
  it('starts at the deck face down and lands on the slot face up', () => {
    const start = dealPose(0, deck, slot, 0.5);
    expect(start.x).toBeCloseTo(deck.x);
    expect(start.y).toBeCloseTo(deck.y);
    expect(start.flip).toBeCloseTo(1);
    // A card leaving the top of a stack starts at the stack's height (it must
    // not drop through the cards below).
    expect(dealPose(0, { ...deck, z: 40 }, slot, 0.5).z).toBeCloseTo(40);
    expect(dealPose(0.05, { ...deck, z: 40 }, slot, 0.5).z).toBeGreaterThan(38);
    const end = dealPose(1, deck, slot, 0.5);
    expect(end.x).toBeCloseTo(slot.x);
    expect(end.y).toBeCloseTo(slot.y);
    expect(end.z).toBeCloseTo(slot.z);
    expect(end.flip).toBeCloseTo(0);
    expect(end.roll).toBeCloseTo(slot.roll);
    expect(end.scale).toBeCloseTo(1);
  });
  it('arcs above the straight line and lifts mid-flight', () => {
    const middle = dealPose(0.4, deck, slot, 0.5);
    expect(middle.z).toBeGreaterThan(20);
    expect(middle.y).toBeGreaterThan(-300 + (300 * easing.outCubic(0.4)));
  });
});

describe('fanPose', () => {
  it('is symmetric about the centre card', () => {
    const left = fanPose(0, 5, 0, 0, 100);
    const right = fanPose(4, 5, 0, 0, 100);
    expect(left.x).toBeCloseTo(-right.x);
    expect(left.roll).toBeCloseTo(-right.roll);
    expect(fanPose(2, 5, 0, 0, 100).x).toBeCloseTo(0);
  });
});

describe('pilePose', () => {
  it('is deterministic and stays in its disc', () => {
    expect(pilePose(3, 0, 0, 200, 0.4)).toEqual(pilePose(3, 0, 0, 200, 0.4));
    for (let index = 0; index < 50; index++) {
      const pose = pilePose(index, 10, 20, 200, 0.7);
      expect(Math.hypot(pose.x - 10, pose.y - 20)).toBeLessThanOrEqual(200);
    }
  });
});

describe('shufflePose', () => {
  it('is a squared deck at the start and end', () => {
    for (const p of [0, 1]) {
      const pose = shufflePose(3, 10, p, 50, 60, 100);
      expect(pose.x).toBeCloseTo(50);
      expect(pose.roll).toBeCloseTo(0);
    }
  });
});
