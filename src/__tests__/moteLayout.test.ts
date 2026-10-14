import { describe, expect, it } from 'vitest';
import { MOTE_FAR, MOTE_HEIGHT, MOTE_LOW, MOTE_NEAR, moteLayout } from '../stage/world/moteLayout';
import { seededRandom } from '../stage/engine/random';

describe('seededRandom', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const first = seededRandom(42);
    const second = seededRandom(42);
    for (let index = 0; index < 1000; index++) {
      const value = first();
      expect(value).toBe(second());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });
});

describe('moteLayout', () => {
  const count = 500;
  const { positions, seeds } = moteLayout(count);

  it('makes one position and one seed per mote', () => {
    expect(positions).toHaveLength(count * 3);
    expect(seeds).toHaveLength(count);
  });

  it('keeps every mote in the band above the horizon, spreading wider with distance', () => {
    for (let index = 0; index < count; index++) {
      const x = positions[index * 3];
      const y = positions[index * 3 + 1];
      const z = positions[index * 3 + 2];
      expect(-z).toBeGreaterThanOrEqual(MOTE_NEAR);
      expect(-z).toBeLessThanOrEqual(MOTE_FAR);
      expect(y).toBeGreaterThanOrEqual(MOTE_LOW);
      expect(y).toBeLessThanOrEqual(MOTE_LOW + MOTE_HEIGHT);
      expect(Math.abs(x)).toBeLessThanOrEqual(-z * 0.8 + 1e-6);
      expect(seeds[index]).toBeGreaterThanOrEqual(0);
      expect(seeds[index]).toBeLessThan(1);
    }
  });

  it('crowds the motes toward the floor (y = low + r²·h has its median below a quarter of the height)', () => {
    const heights = Array.from({ length: count }, (_, index) => positions[index * 3 + 1] - MOTE_LOW).sort((a, b) => a - b);
    expect(heights[count >> 1]).toBeLessThan(MOTE_HEIGHT * 0.25);
  });

  it('is the same layout on every call', () => {
    expect(moteLayout(10).positions).toEqual(moteLayout(10).positions);
  });
});
