import { describe, expect, it } from 'vitest';
import { CARD_SPRING, createSpring, PROGRESS_SPRING, springSettled, stepSpring } from '../stage/ui/spring';

function runSpring(target: number, tuning = CARD_SPRING, seconds = 3, frame = 1 / 60) {
  const spring = createSpring(0);
  let peak = 0;
  for (let t = 0; t < seconds; t += frame) {
    stepSpring(spring, target, tuning, frame);
    peak = Math.max(peak, spring.value);
  }
  return { spring, peak };
}

describe('stepSpring', () => {
  it('settles on the target', () => {
    const { spring } = runSpring(1);
    expect(springSettled(spring, 1)).toBe(true);
  });

  it('overshoots ONCE with the card tuning (the "physical" feel), never with the progress tuning', () => {
    expect(runSpring(1).peak).toBeGreaterThan(1.02);
    expect(runSpring(1).peak).toBeLessThan(1.25);
    expect(runSpring(1, PROGRESS_SPRING).peak).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('gives the same motion at 30 fps and 144 fps (fixed sub-steps)', () => {
    const slow = createSpring();
    const fast = createSpring();
    for (let frame = 0; frame < 15; frame++) stepSpring(slow, 1, CARD_SPRING, 1 / 30);
    for (let frame = 0; frame < 72; frame++) stepSpring(fast, 1, CARD_SPRING, 1 / 144);
    expect(slow.value).toBeCloseTo(fast.value, 2);
  });

  it('does not explode or catch up after a long pause', () => {
    const spring = createSpring();
    stepSpring(spring, 1, CARD_SPRING, 5);
    expect(Number.isFinite(spring.value)).toBe(true);
    expect(spring.value).toBeLessThan(1.3);
  });
});
