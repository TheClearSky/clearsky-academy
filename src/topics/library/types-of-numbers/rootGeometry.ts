/**
 * THE DIAGONAL'S FIGURE (shot 28), in plain numbers so its correctness is a unit test (`rootGeometry.test.ts`). Deepak: "cut the diagonals, slide the triangles into the bigger
 * square-btw current animation has a bug on 4th triangle, it only slides halway, have no bugs in the new animation".
 *
 * The figure is Pythagoras's for legs 1 and 1: the two unit squares stand on the legs of a right triangle, joined at the right angle O; the big square stands on the hypotenuse,
 * so its side is √2 and its area exactly 2. Each unit square is cut along one diagonal; the four right triangles (legs 1, hypotenuse √2) are the four triangles of the big square
 * (cut by ITS diagonals), each reached by a pure SLIDE (a translation, no turning): a triangle's right angle and its legs keep their directions.
 *
 * Coordinates: x right, y up, unit square side = 1, O = (0, 0). (Same mirror as v7's figure: the big square goes up and to the left.)
 *   S1 = square below the leg OP (P = (-1, 0)):  (0,0) (-1,0) (-1,-1) (0,-1)
 *   S2 = square right of the leg OQ (Q = (0, 1)): (0,0) (0,1) (1,1) (1,0)
 *   big = P Q R T, R = (-1, 2), T = (-2, 1), centre C = (-1, 1)
 */

type P2 = readonly [number, number];
type Tri = readonly [P2, P2, P2];

const O: P2 = [0, 0];
const P: P2 = [-1, 0];
const Q: P2 = [0, 1];
const R: P2 = [-1, 2];
const T: P2 = [-2, 1];
const C: P2 = [-1, 1];

const SQUARE_1: readonly P2[] = [O, P, [-1, -1], [0, -1]];
const SQUARE_2: readonly P2[] = [O, Q, [1, 1], [1, 0]];
const BIG_SQUARE: readonly P2[] = [P, Q, R, T];

/** The cut of each unit square, from where the scissors enter to where they leave. */
const CUT_1: readonly [P2, P2] = [O, [-1, -1]];
const CUT_2: readonly [P2, P2] = [[1, 0], Q];

/** Where a triangle starts (the cut piece), where it ends, the translation between them. `id` is its landing place, in the order they slide. */
type Piece = { id: 'A' | 'B' | 'U' | 'V'; home: Tri; target: Tri; slide: P2 };

const add = (p: P2, d: P2): P2 => [p[0] + d[0], p[1] + d[1]];
const piece = (id: Piece['id'], home: Tri, slide: P2, target: Tri): Piece => ({ id, home, target, slide });

const PIECES: Record<Piece['id'], Piece> = {
  // S1, cut O → (-1,-1): A is the half against the leg OP. It rises by 1: Q C P.
  A: piece('A', [O, P, [-1, -1]], [0, 1], [Q, C, P]),
  // The lower half of S1: to R C T.
  B: piece('B', [O, [0, -1], [-1, -1]], [-1, 2], [R, C, T]),
  // S2, cut (1,0) → (0,1): U is the half against the leg OQ (it keeps its right angle at O): to Q R C.
  U: piece('U', [[1, 0], Q, O], [-1, 1], [Q, R, C]),
  // The far half of S2: to P T C.
  V: piece('V', [[1, 0], Q, [1, 1]], [-2, 0], [P, T, C]),
};

/** The order of the slides: A must clear before B (B crosses where A lay), U before V. One at a time (EYE-03), the long ones last. */
const SLIDE_ORDER: readonly Piece['id'][] = ['U', 'V', 'A', 'B'];

/** A triangle at slide progress k (0 home, 1 landed, exact at both ends). */
const triAt = (p: Piece, k: number): Tri => {
  const d: P2 = [p.slide[0] * k, p.slide[1] * k];
  return [add(p.home[0], d), add(p.home[1], d), add(p.home[2], d)];
};

/** The exact final vertices of a triangle: home + slide (no float of a progress involved). */
const landed = (p: Piece): Tri => [add(p.home[0], p.slide), add(p.home[1], p.slide), add(p.home[2], p.slide)];

/** Area of a triangle (positive). */
const triArea = (t: Tri) => Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2;

/** Sorted, rounded vertices of a polygon (for exact comparison). */
const verts = (v: readonly P2[]) => v.map(([x, y]) => `${x.toFixed(9)},${y.toFixed(9)}`).sort();

export { BIG_SQUARE, C, CUT_1, CUT_2, landed, O, P, PIECES, Q, R, SLIDE_ORDER, SQUARE_1, SQUARE_2, T, triArea, triAt, verts };
export type { P2, Piece, Tri };
