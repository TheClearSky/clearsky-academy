import { describe, expect, it } from 'vitest';
import { cameraWander, easeWanderWeight, WANDER_BOB, WANDER_MAX_PITCH, WANDER_MAX_YAW } from '../stage/engine/cameraWander';

describe('cameraWander', () => {
  it('stays within the hellscape amplitudes over ten minutes', () => {
    let maxYaw = 0;
    let maxPitch = 0;
    let maxBob = 0;
    for (let t = 0; t < 600; t += 0.25) {
      const wander = cameraWander(t, 1);
      maxYaw = Math.max(maxYaw, Math.abs(wander.yaw));
      maxPitch = Math.max(maxPitch, Math.abs(wander.pitch));
      maxBob = Math.max(maxBob, Math.abs(wander.bob));
    }
    expect(maxYaw).toBeLessThanOrEqual(WANDER_MAX_YAW);
    expect(maxPitch).toBeLessThanOrEqual(WANDER_MAX_PITCH);
    expect(maxBob).toBeLessThanOrEqual(WANDER_BOB);
    // It really moves (not a constant): at least half the reach is used.
    expect(maxYaw).toBeGreaterThan(WANDER_MAX_YAW / 2);
  });

  it('is the base pose at weight 0', () => {
    const wander = cameraWander(123.4, 0);
    // toBeCloseTo: 0 × a negative sine is −0.
    expect(wander.yaw).toBeCloseTo(0, 12);
    expect(wander.pitch).toBeCloseTo(0, 12);
    expect(wander.bob).toBeCloseTo(0, 12);
  });

  it('is deterministic (the hellscape fixed phases)', () => {
    expect(cameraWander(42, 1)).toEqual(cameraWander(42, 1));
  });
});

describe('easeWanderWeight', () => {
  it('eases toward 1 at the hellscape rate (0.02 per 60 fps frame)', () => {
    expect(easeWanderWeight(0, 1 / 60, false)).toBeCloseTo(0.02, 3);
    let weight = 0;
    for (let frame = 0; frame < 600; frame++) weight = easeWanderWeight(weight, 1 / 60, false);
    expect(weight).toBeGreaterThan(0.99);
  });

  it('holds 0 under reduced motion', () => {
    expect(easeWanderWeight(0.7, 1, true)).toBe(0);
  });
});
