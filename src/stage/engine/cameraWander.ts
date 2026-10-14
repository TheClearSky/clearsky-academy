/**
 * The camera's idle "handheld" wander — Nodestra's hellscape landing
 * (`hell-src/hell-stage.ts` › `placeView`), the owner: "dont have pan tied
 * to mouse position, follow what we do in hellscape scene landing page,
 * including the idle random movements".
 *
 * A sum of unrelated slow sines with the hellscape's FIXED phases, so it
 * never visibly repeats and screenshots are deterministic: peaks ≈ 3.0° yaw
 * and 0.9° pitch, periods 48–119 s, plus a slow vertical bob. The weight
 * eases in from 0 (the hellscape's 0.02/frame at 60 fps, made frame-rate
 * independent). Pure, so the bounds are tested.
 *
 * Unlike the source, reduced motion holds the weight at 0: the still frames
 * show the exact base pose.
 */

type CameraWander = {
  /** Radians added to the base yaw (+ turns left). */
  yaw: number;
  /** Radians added to the base pitch (+ looks up). */
  pitch: number;
  /** Metres added to the eye height. */
  bob: number;
};

const WANDER_PHASES = [0.3, 1.9, 4.1, 2.6] as const;
/** The weight's time constant (s): 0.02 per frame at 60 fps. */
const WANDER_EASE_SECONDS = 0.825;
/** The hellscape's 0.03 m bob at its 9 m eye, scaled to our 2.4 m eye. */
const WANDER_BOB = 0.03 * (2.4 / 9);
/** Largest |yaw| and |pitch| the sines can reach (the sum of amplitudes). */
const WANDER_MAX_YAW = 0.035 + 0.018;
const WANDER_MAX_PITCH = 0.01 + 0.006;

/** The weight after dt seconds, easing toward 1 (or held at 0). */
function easeWanderWeight(weight: number, dt: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return weight + (1 - weight) * (1 - Math.exp(-dt / WANDER_EASE_SECONDS));
}

/** The wander at time t (s) with the given weight (0..1). */
function cameraWander(t: number, weight: number): CameraWander {
  const [a, b, c, d] = WANDER_PHASES;
  return {
    yaw: weight * (0.035 * Math.sin(t * 0.13 + a) + 0.018 * Math.sin(t * 0.071 + b)),
    pitch: weight * (0.01 * Math.sin(t * 0.09 + c) + 0.006 * Math.sin(t * 0.053 + d)),
    bob: weight * WANDER_BOB * Math.sin(t * 0.21 + b),
  };
}

export { cameraWander, easeWanderWeight, WANDER_BOB, WANDER_MAX_PITCH, WANDER_MAX_YAW };
export type { CameraWander };
