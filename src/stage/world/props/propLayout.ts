import { HORIZON_FROM_TOP, lensShiftFor, stageFov } from '../../engine/lensShift';
import { seededRandom } from '../../engine/random';
import { worldXForScreen } from '../../engine/screenSpace';
import { spellPlacement } from '../spellTimeline';

/**
 * Where the background props go (`.claude/research/stage/SCENE-PROPS-LOGO.md`
 * › Placement), in three depth layers:
 *
 *   near wing  the classroom chair, on the floor at the left edge
 *   mid        THE CAROUSEL: the floating books and candles circle the
 *              summoning circle BELOW the hero text, sweeping forward at the
 *              sides and passing well BEHIND the circle in the middle —
 *              books on the outer ring, candles turning the other way inside
 *   far        giant chess pieces standing on the checker near the horizon
 *
 * The carousel (Deepak, 2026-10-17: "the background books and candles
 * aren't responsive, make sure they render below the text even if it means
 * rendering them behind text on all screen sizes. Make it interesting", then
 * "spread out the books and candles 1.5x on desktop and a lot on phone and
 * lower resolutions, reduce number of books and candles on lower screen
 * sizes"). Before, they framed the hero in two side clusters (landscape) or
 * crowded a band behind the header (portrait). Now:
 *
 *   - one loop, bean-shaped seen from above, in (screen angle u, depth d):
 *     it sweeps forward to NEAREST m at the sides, but wherever it crosses
 *     the middle (|u| within the circle's width plus SIDE_BUFFER) it bends
 *     back to pass BEHIND_BUFFER m behind the circle's far edge, rising a
 *     little — so a prop never flies in front of the spell or into its book;
 *     the summoned book (12 m out, ~3 m tall) simply hides it as it passes (Deepak, 2026-10-17: "when the
 *     books cross the area in the middle it goes into the summoning
 *     circle's book", then "it's still getting too close, have a buffer,
 *     make the books go from behind the magic circle with a good amount of
 *     buffer"). Its far side runs deeper still, so the path never crosses
 *     itself;
 *   - every prop flies at a height that keeps it between TEXT_LINE and
 *     BOTTOM_LINE of the screen at the nearest point of its orbit, so it
 *     stays under the text all the way round;
 *   - the props are spread by best-candidate sampling (blue noise) and each
 *     ring turns rigidly, so the spacing never closes up; each prop rises
 *     and dips twice a turn, like a carousel horse, within its band;
 *   - how many fly depends on the screen's size (`propCounts`).
 *
 * The chair and the chess pieces are placed by SCREEN position and distance
 * (`screenSpace.ts`). Deterministic (seeded).
 */

/** A prop's loop (see `orbitPoint`). With a = angle + rate·t and s = sin a
 *  (s > 0 the near side): screen angle u = width·reach·cos a (x = u·d), and
 *  depth d = centre − near·reach·s on the near side, centre + far·|s| on the
 *  far side (blended smoothly), then bent back to `behind` in the middle. */
type Orbit = {
  /** The circle's centre, this far in front of the camera (m). */
  centre: number;
  /** How far the loop comes forward (× reach) and runs back (m). */
  near: number;
  far: number;
  /** Half the loop's width in screen angle (x / depth). */
  width: number;
  /** The middle: |u| under `clear` is fully bent back, blending out over `blend`. */
  clear: number;
  blend: number;
  /** Through the middle: at least this deep (m) and this high (m). */
  behind: number;
  behindHeight: number;
  /** How far out on the ring (fraction of the radii). */
  reach: number;
  /** The angle at t = 0 (rad) and the angular speed (rad/s). */
  angle: number;
  rate: number;
  /** The carousel-horse rise and fall: y + wave·sin(2a + wavePhase) (m). */
  wave: number;
  wavePhase: number;
};

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
  /** Carousel props: x and z (above) are its place at t = 0. */
  orbit?: Orbit;
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
/** The hero text ends about here (fraction of the screen from the top);
 *  the carousel flies below it. */
const TEXT_LINE = 0.58;
/** …and above this (the screen's foot). */
const BOTTOM_LINE = 0.95;
/** No carousel prop comes nearer the camera than this (m): landscape, and
 *  portrait — where the summoning circle spans half the screen and the
 *  loops are narrow strips beside it, so the props fly smaller. */
const NEAREST = 8;
const NEAREST_PORTRAIT = 9;
/** The chair stands nearer than every carousel prop, so they pass behind it, never through it. */
const CHAIR_DISTANCE = 7.4;
const CHAIR_DISTANCE_PORTRAIT = 8.2;
/** Room above and below a prop's centre for its own size and bob (m). */
const PROP_MARGIN = 0.55;
/** Never lower than this over the floor (m). */
const FLOOR_CLEARANCE = 0.7;
/** The rings: how far out (fraction of the radii) and how fast (rad/s; one
 *  turn in 140 s for the books, 200 s the other way for the candles). */
const BOOK_RING = { inner: 0.58, outer: 1, rate: (2 * Math.PI) / 140 };
const CANDLE_RING = { inner: 0.22, outer: 0.54, rate: -(2 * Math.PI) / 200 };
/** Through the middle a prop passes at least this far behind the circle's far edge (m)… */
const BEHIND_BUFFER = 4;
/** …the middle being the circle's width plus this each side (m, at its depth)… */
const SIDE_BUFFER = 1.5;
/** …and at least this high (m): it passes high behind the summoned book and
 *  candle. (Not wholly ABOVE them on screen: their tops, ~3.3 m at the
 *  circle, show only ~4 % of the screen under the text line — no room.) */
const BEHIND_HEIGHT = 2.6;
/** A carousel prop's own half width (m): the loop keeps it wholly on screen. */
const PROP_HALF_WIDTH = 0.5;
/** The share of the floating books that are open (flapping). */
const OPEN_BOOK_FRACTION = 0.65;
/** Euler order of a book's (pitch, yaw, roll): the spread faces local +x,
 *  the spine runs up local y — see the book loop in `propLayout`. */
const BOOK_EULER_ORDER = 'YXZ';

/**
 * How many books and candles fly on a screen of this CSS size: the tier's
 * counts, fewer on smaller screens (whose rings are narrower). Size classes,
 * not a smooth scale, so resizing a window does not re-deal the props at
 * every step.
 */
function propCounts(tier: PropCounts, width: number, height: number): PropCounts {
  const area = width * height;
  // Phones (under 0.6 M px²) already run the low tier's short list: half its books, a third of its candles.
  const [books, candles] = area >= 1.8e6 ? [0.7, 0.7] : area >= 1.1e6 ? [0.6, 0.6] : area >= 0.6e6 ? [0.35, 0.35] : [0.5, 0.34];
  return { books: Math.max(2, Math.round(tier.books * books)), candles: Math.max(2, Math.round(tier.candles * candles)) };
}

/** The carousel for this aspect: as wide as the screen (the prop wholly on
 *  it), forward to NEAREST at the sides, the middle bent back behind the circle. */
function carousel(aspect: number) {
  const tan = Math.tan((stageFov(aspect) * Math.PI) / 360);
  const spell = spellPlacement(aspect);
  const centre = spell.distance;
  const nearest = aspect < 1 ? NEAREST_PORTRAIT : NEAREST;
  const behind = centre + spell.radius + BEHIND_BUFFER;
  const clear = (spell.radius + SIDE_BUFFER) / centre;
  const width = Math.max(clear + 0.1, 0.97 * tan * aspect - PROP_HALF_WIDTH / nearest);
  return { centre, tan, near: Math.max(1, centre - nearest), behind, clear, blend: 0.15, width };
}

/** The middle of the screen the carousel only crosses behind the circle (fraction of the width, each side of centre). */
function middleBand(aspect: number): number {
  const loop = carousel(aspect);
  return loop.clear / (2 * loop.tan * aspect);
}

/** How deep the carousel runs through the middle (m): at least this. */
function middleDepth(aspect: number): number {
  return carousel(aspect).behind;
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return k * k * (3 - 2 * k);
};

/** Where on its loop the prop is at time t; `rise` is its height over its base `y` (m): the carousel-horse wave, and the lift through the middle. */
function orbitPoint(orbit: Orbit, t: number, y = 0): { x: number; z: number; rise: number } {
  const angle = orbit.angle + orbit.rate * t;
  const s = Math.sin(angle);
  const u = orbit.width * orbit.reach * Math.cos(angle);
  // Near side −near·reach·s, far side +far·|s|, joined smoothly (a quadratic in s),
  // never nearer than the near side's own reach.
  const nearest = orbit.near * orbit.reach;
  const mean = (nearest + orbit.far) / 2;
  const bend = (orbit.far - nearest) / 2;
  let depth = Math.max(orbit.centre - nearest, orbit.centre - mean * s + bend * s * s);
  // Through the middle: bent back behind the circle, and lifted.
  const middle = 1 - smoothstep(orbit.clear, orbit.clear + orbit.blend, Math.abs(u));
  depth += middle * Math.max(0, orbit.behind - depth);
  const waved = y + orbit.wave * Math.sin(2 * angle + orbit.wavePhase);
  const lifted = waved + middle * Math.max(0, orbit.behindHeight - waved);
  return { x: u * depth, z: -depth, rise: lifted - y };
}

/** The heights (m) that keep a prop at view depth `depth` between the text line and the screen's foot. */
function heightBand(depth: number, tan: number): [number, number] {
  const shift = lensShiftFor(HORIZON_FROM_TOP);
  const atLine = (fromTop: number) => EYE_HEIGHT + (1 - 2 * fromTop + shift) * depth * tan;
  const high = atLine(TEXT_LINE) - PROP_MARGIN;
  const low = Math.max(FLOOR_CLEARANCE, atLine(BOTTOM_LINE) + PROP_MARGIN);
  // Too near for both: under the text wins (it may graze the screen's foot).
  return high >= low ? [low, high] : [high, high];
}

function propLayout(aspect: number, counts: PropCounts, seed = 11): PropLayout {
  const random = seededRandom(seed);
  const between = (low: number, high: number) => low + random() * (high - low);
  const fov = stageFov(aspect);
  const portrait = aspect < 1;
  const ring = carousel(aspect);
  // The highest a prop may lift through the middle and stay under the text there.
  const behindTop = heightBand(ring.behind, ring.tan)[1] - 0.45;
  /** A loop for a prop: deeper rings bend back a little further, so the rings never meet. */
  const loopFor = (reach: number, angle: number, rate: number, wave: number, wavePhase: number): Orbit => ({
    centre: ring.centre,
    near: ring.near,
    far: ring.behind - ring.centre + 3 + 3 * reach,
    width: ring.width,
    clear: ring.clear,
    blend: ring.blend,
    behind: ring.behind + 2 * (1 - reach),
    behindHeight: BEHIND_HEIGHT,
    reach,
    angle,
    rate,
    wave,
    wavePhase,
  });

  /**
   * `count` places on a ring, spread by best-candidate sampling on the floor
   * plane (each new prop takes the candidate farthest from those placed);
   * uniform over the ring's area.
   */
  const spread = (count: number, band: { inner: number; outer: number; rate: number }, others: { x: number; z: number }[]): Placement[] => {
    const placed: Placement[] = [];
    const taken = [...others];
    for (let index = 0; index < count; index++) {
      let best: { reach: number; angle: number; x: number; z: number; gap: number } | null = null;
      for (let candidate = 0; candidate < 24; candidate++) {
        const reach = Math.sqrt(between(band.inner * band.inner, band.outer * band.outer));
        const angle = between(-Math.PI, Math.PI);
        const point = orbitPoint(loopFor(reach, angle, band.rate, 0, 0), 0);
        const gap = taken.reduce((nearest, other) => Math.min(nearest, Math.hypot(other.x - point.x, other.z - point.z)), Infinity);
        if (!best || gap > best.gap) best = { reach, angle, x: point.x, z: point.z, gap };
      }
      const chosen = best!;
      taken.push(chosen);
      // Heights for the loop's nearest point (the sides); through the middle it lifts to behindHeight.
      const [low, high] = heightBand(ring.centre - ring.near * chosen.reach, ring.tan);
      const wave = Math.min(0.45, (high - low) / 2);
      const orbit = loopFor(chosen.reach, chosen.angle, band.rate, wave, between(0, 2 * Math.PI));
      orbit.behindHeight = between(BEHIND_HEIGHT, Math.max(BEHIND_HEIGHT, Math.min(BEHIND_HEIGHT + 1, behindTop)));
      placed.push({ x: chosen.x, y: between(low + wave, high - wave), z: chosen.z, yaw: between(-Math.PI, Math.PI), pitch: between(-0.5, 0.5), roll: between(-0.4, 0.4), scale: 1, seed: random(), orbit });
    }
    return placed;
  };

  // Candles first (the inner ring), then the books around them.
  const candles = spread(counts.candles, CANDLE_RING, []).map((placement) => ({ ...placement, pitch: 0, roll: between(-0.06, 0.06), scale: between(0.8, 1.2) }));
  const bookPlaces = spread(counts.books, BOOK_RING, candles);

  // Most books are open and flap like wings; a minority stay shut and tumble.
  // Orientations are steep and varied (`BOOK_EULER_ORDER`): yaw turns the
  // book about the vertical, pitch tilts its spine within the plane it faces
  // (upright → diagonal → near level), roll leans it toward or away.
  const openCount = Math.round(counts.books * OPEN_BOOK_FRACTION);
  const closedBooks: Placement[] = [];
  const openBooks: Placement[] = [];
  bookPlaces.forEach((placement, index) => {
    placement.scale = between(0.8, 1.3);
    const towardCamera = Math.atan2(placement.z, -placement.x);
    if (index < openCount) {
      // An open book's spread (+x) faces the viewer, give or take (it keeps
      // facing the viewer as it circles — `books.ts`).
      placement.yaw = towardCamera + between(-1.35, 1.35);
      placement.pitch = between(-1.35, 1.35);
      placement.roll = between(-0.55, 0.55);
      openBooks.push(placement);
    } else {
      placement.pitch = between(-1.4, 1.4);
      placement.roll = between(-1.2, 1.2);
      closedBooks.push(placement);
    }
  });

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
  const chairDistance = portrait ? CHAIR_DISTANCE_PORTRAIT : CHAIR_DISTANCE;
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

export { BEHIND_HEIGHT, BOOK_EULER_ORDER, BOTTOM_LINE, CHESS_PIECES, EYE_HEIGHT, middleBand, middleDepth, NEAREST, OPEN_BOOK_FRACTION, orbitPoint, propCounts, propLayout, TEXT_LINE };
export type { ChessPiece, Orbit, Placement, PropCounts, PropLayout };
