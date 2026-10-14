/**
 * Where the horizon sits on screen, without pitching the camera.
 *
 * The scene reference puts the horizon about 69 % down the frame. Tilting
 * the camera down to get there would converge every vertical (books, chair,
 * chess pieces would lean). Instead the camera looks level and the
 * projection is SHIFTED vertically — the photographer's tilt-shift lens.
 *
 * In three's column-major projection matrix, element 9 (column 2, row 1)
 * adds `e9 · z_view` to clip y. A point on the horizon is straight ahead
 * (z_view = -1, w = 1), so its NDC y is `-e9`; for it to land `fromTop` of
 * the way down the screen (NDC y = 1 - 2·fromTop), `e9 = 2·fromTop - 1`.
 */

/** The reference's horizon line, as a fraction of the height from the top. */
const HORIZON_FROM_TOP = 0.69;

function lensShiftFor(fromTop: number): number {
  return 2 * fromTop - 1;
}

/** Vertical field of view: wider in portrait, so the floor still spans a
 *  phone screen (the research's framing: 60° landscape, 75° portrait). */
function stageFov(aspect: number): number {
  return aspect < 1 ? 75 : 60;
}

export { HORIZON_FROM_TOP, lensShiftFor, stageFov };
