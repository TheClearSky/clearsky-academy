import { stageFov } from '../../engine/lensShift';
import { seededRandom } from '../../engine/random';
import { worldXForScreen, worldYForScreen } from '../../engine/screenSpace';

/**
 * Where the background props go (`.claude/research/stage/SCENE-PROPS-LOGO.md`
 * › Placement): three depth layers that FRAME the page's cards and never sit
 * behind them.
 *
 *   near wing  the classroom chair, on the floor at the left edge
 *   mid        floating books (most open, flapping) and candles, in two side clusters
 *              — or, on a portrait screen, in a band across the top
 *   far        giant chess pieces standing on the checker near the horizon
 *
 * Everything is placed by SCREEN position and distance (`screenSpace.ts`),
 * so the centre corridor stays clear at every aspect. Deterministic (seeded).
 */

type Placement = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
  /** 0..1: phase and speed of its motion, its colour. */
  seed: number;
};

const CHESS_PIECES = ['rook', 'knight', 'bishop', 'pawn'] as const;
type ChessPiece = (typeof CHESS_PIECES)[number];

type PropLayout = {
  closedBooks: Placement[];
  openBooks: Placement[];
  candles: Placement[];
  chess: (Placement & { piece: ChessPiece })[];
  chair: Placement;
};

type PropCounts = { books: number; candles: number };

/** The eye height the stage camera uses (`stage.ts`). */
const EYE_HEIGHT = 2.4;
/** In landscape the side clusters keep this far from the centre line
 *  (as a fraction of the screen width): 0.26 for the page's content, plus
 *  the camera wander's peak sideways shift (≈ 0.026 of the width at 3° yaw,
 *  `engine/cameraWander.ts`), so a prop never drifts over the hero. */
const CORRIDOR_HALF_WIDTH = 0.29;
/** In portrait the props stay above this line (fraction from the top). */
const PORTRAIT_BAND_BOTTOM = 0.2;
/** The share of the floating books that are open (flapping). */
const OPEN_BOOK_FRACTION = 0.65;
/** Euler order of a book's (pitch, yaw, roll): the spread faces local +x,
 *  the spine runs up local y — see the book loop in `propLayout`. */
const BOOK_EULER_ORDER = 'YXZ';

function propLayout(aspect: number, counts: PropCounts, seed = 11): PropLayout {
  const random = seededRandom(seed);
  const between = (low: number, high: number) => low + random() * (high - low);
  const fov = stageFov(aspect);
  const portrait = aspect < 1;

  /** A mid-layer screen spot: a side cluster, or the top band. */
  const midSpot = (index: number, topLow: number, topHigh: number) => {
    if (portrait) return { fromLeft: between(0.06, 0.94), fromTop: between(0.03, PORTRAIT_BAND_BOTTOM) };
    const left = index % 2 === 0;
    const fromLeft = left ? between(0.03, 0.5 - CORRIDOR_HALF_WIDTH) : between(0.5 + CORRIDOR_HALF_WIDTH, 0.97);
    return { fromLeft, fromTop: between(topLow, topHigh) };
  };

  const floating = (index: number, distanceLow: number, distanceHigh: number, topLow: number, topHigh: number, scaleLow: number, scaleHigh: number): Placement => {
    const distance = between(distanceLow, distanceHigh);
    const spot = midSpot(index, topLow, topHigh);
    return {
      x: worldXForScreen(spot.fromLeft, distance, fov, aspect),
      y: worldYForScreen(spot.fromTop, distance, fov, EYE_HEIGHT),
      z: -distance,
      yaw: between(-Math.PI, Math.PI),
      pitch: between(-0.5, 0.5),
      roll: between(-0.4, 0.4),
      scale: between(scaleLow, scaleHigh),
      seed: random(),
    };
  };

  // Most books are open and flap like wings; a minority stay shut and tumble.
  // Orientations are steep and varied (`BOOK_EULER_ORDER`): yaw turns the
  // book about the vertical, pitch tilts its spine within the plane it faces
  // (upright → diagonal → near level), roll leans it toward or away.
  const openCount = Math.round(counts.books * OPEN_BOOK_FRACTION);
  const closedBooks: Placement[] = [];
  const openBooks: Placement[] = [];
  for (let index = 0; index < counts.books; index++) {
    const placement = floating(index, 9, 20, 0.06, 0.5, 0.8, 1.4);
    const towardCamera = Math.atan2(placement.z, -placement.x);
    if (index < openCount) {
      // An open book's spread (+x) faces the viewer, give or take: some face
      // us square-on, some turn almost edge-on.
      placement.yaw = towardCamera + between(-1.35, 1.35);
      placement.pitch = between(-1.35, 1.35);
      placement.roll = between(-0.55, 0.55);
      openBooks.push(placement);
    } else {
      placement.pitch = between(-1.4, 1.4);
      placement.roll = between(-1.2, 1.2);
      closedBooks.push(placement);
    }
  }

  const candles: Placement[] = [];
  for (let index = 0; index < counts.candles; index++) {
    const placement = floating(index + 1, 12, 26, 0.04, 0.4, 0.8, 1.2);
    // Candles hang upright.
    placement.pitch = 0;
    placement.roll = between(-0.06, 0.06);
    candles.push(placement);
  }

  const chess = CHESS_PIECES.map((piece, index) => {
    const distance = between(32, 70);
    const left = index % 2 === 0;
    const fromLeft = left ? between(0.1, 0.3) : between(0.7, 0.9);
    return {
      piece,
      x: worldXForScreen(portrait ? between(0.1, 0.9) : fromLeft, distance, fov, aspect),
      y: 0,
      z: -distance,
      yaw: between(-Math.PI, Math.PI),
      pitch: 0,
      roll: 0,
      scale: between(6, 9),
      seed: random(),
    };
  });

  // The floor only comes into view ~6.7 m out (eye 2.4 m, 60° fov, lens
  // shift), so the chair stands beyond that, and a little larger than life.
  const chairDistance = portrait ? 10 : 8.5;
  const chair: Placement = {
    x: worldXForScreen(portrait ? 0.2 : 0.1, chairDistance, fov, aspect),
    y: 0,
    z: -chairDistance,
    yaw: 0.6,
    pitch: 0,
    roll: 0,
    scale: 1.7,
    seed: random(),
  };

  return { closedBooks, openBooks, candles, chess, chair };
}

export { BOOK_EULER_ORDER, CHESS_PIECES, CORRIDOR_HALF_WIDTH, EYE_HEIGHT, OPEN_BOOK_FRACTION, PORTRAIT_BAND_BOTTOM, propLayout };
export type { ChessPiece, Placement, PropCounts, PropLayout };
