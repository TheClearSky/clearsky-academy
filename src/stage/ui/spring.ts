/**
 * A damped spring, for every "physical" UI motion on the stage (card tilt,
 * lift, press, flip; ring fill). Under-damped on purpose: damping ratio
 * ζ ≈ 0.55–0.7 gives ONE visible overshoot, which is what makes a card feel
 * like a card and not like a UI tween (`.claude/research/stage/CARDS-HUD.md`
 * › Motion). Semi-implicit Euler in fixed sub-steps of ≤ 1/120 s, so it is
 * stable at 30 fps and after a long frame.
 */

type Spring = { value: number; velocity: number };

type SpringTuning = {
  /** Stiffness (1/s²). */
  stiffness: number;
  /** Damping ratio: < 1 overshoots, 1 is critical. */
  damping: number;
};

const CARD_SPRING: SpringTuning = { stiffness: 180, damping: 0.6 };
/** Progress must never visibly overshoot the truth (research: ζ = 0.8+). */
const PROGRESS_SPRING: SpringTuning = { stiffness: 60, damping: 1 };

const MAX_SUBSTEP = 1 / 120;
/** A frame longer than this is a pause, not motion (no catch-up). */
const MAX_FRAME = 0.1;

function stepSpring(spring: Spring, target: number, tuning: SpringTuning, seconds: number): Spring {
  const friction = 2 * Math.sqrt(tuning.stiffness) * tuning.damping;
  let remaining = Math.min(Math.max(seconds, 0), MAX_FRAME);
  while (remaining > 1e-9) {
    const h = Math.min(remaining, MAX_SUBSTEP);
    spring.velocity += (tuning.stiffness * (target - spring.value) - friction * spring.velocity) * h;
    spring.value += spring.velocity * h;
    remaining -= h;
  }
  return spring;
}

function createSpring(value = 0): Spring {
  return { value, velocity: 0 };
}

/** At rest: close to the target and barely moving. */
function springSettled(spring: Spring, target: number, tolerance = 1e-3): boolean {
  return Math.abs(spring.value - target) < tolerance && Math.abs(spring.velocity) < tolerance;
}

export { CARD_SPRING, createSpring, PROGRESS_SPRING, springSettled, stepSpring };
export type { Spring, SpringTuning };
