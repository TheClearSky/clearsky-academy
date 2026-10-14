import { HORIZON_FROM_TOP, lensShiftFor } from './lensShift';

/**
 * From a place ON SCREEN back to a place in the world, for the stage's
 * level, lens-shifted camera (`lensShift.ts`): "a book 18 m away, a fifth of
 * the way down and three quarters across". Props are laid out this way so
 * they frame the page's cards at every aspect instead of drifting behind
 * them on a narrow screen.
 *
 * The camera sits at (0, eyeHeight, 0) looking down -Z with no rotation.
 * For a point at view depth d (= distance in front of the camera):
 *   NDC x = x / (d · tan(fovY/2) · aspect)
 *   NDC y = y_view / (d · tan(fovY/2)) − shift      (shift = lensShiftFor(...))
 */

function worldXForScreen(fromLeft: number, distance: number, fovYDegrees: number, aspect: number): number {
  const ndcX = fromLeft * 2 - 1;
  return ndcX * distance * Math.tan((fovYDegrees * Math.PI) / 360) * aspect;
}

function worldYForScreen(fromTop: number, distance: number, fovYDegrees: number, eyeHeight: number, horizonFromTop = HORIZON_FROM_TOP): number {
  const ndcY = 1 - fromTop * 2;
  const viewY = (ndcY + lensShiftFor(horizonFromTop)) * distance * Math.tan((fovYDegrees * Math.PI) / 360);
  return eyeHeight + viewY;
}

export { worldXForScreen, worldYForScreen };
