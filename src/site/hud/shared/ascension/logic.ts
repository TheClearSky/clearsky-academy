import type { CardSuit } from '../../../../stage/cards/model';
import type { HudChapter } from '../../contract';
import type { Moment } from '../../kit/progressMoments';

/**
 * Round-2 card designs — the pure parts shared by the Ascension Deck and
 * the mixes built from its cards (title deck, order deck, album, arcana).
 * Unit-tested in `src/__tests__/hud-shared-ascension.test.ts`.
 */

/** The suits in a unit box centred on the origin (y down) — the stage
 *  cards' own art (`cardPainter.ts` › suitPath, via Chapter Deck). */
const SUIT_PATHS: Record<CardSuit, string> = {
  heart: 'M0 .46C-.12 .3 -.5 .08 -.5 -.17C-.5 -.38 -.34 -.48 -.2 -.48C-.09 -.48 -.02 -.41 0 -.32C.02 -.41 .09 -.48 .2 -.48C.34 -.48 .5 -.38 .5 -.17C.5 .08 .12 .3 0 .46Z',
  diamond: 'M0 -.5Q.18 -.2 .38 0Q.18 .2 0 .5Q-.18 .2 -.38 0Q-.18 -.2 0 -.5Z',
  spade: 'M0 -.5C.1 -.32 .5 -.1 .5 .13C.5 .3 .36 .38 .23 .38C.13 .38 .06 .33 .03 .27Q.06 .42 .17 .5L-.17 .5Q-.06 .42 -.03 .27C-.06 .33 -.13 .38 -.23 .38C-.36 .38 -.5 .3 -.5 .13C-.5 -.1 -.1 -.32 0 -.5Z',
  club: 'M.2 -.24A.2 .2 0 1 0 -.2 -.24A.2 .2 0 1 0 .2 -.24ZM-.04 .1A.2 .2 0 1 0 -.44 .1A.2 .2 0 1 0 -.04 .1ZM.44 .1A.2 .2 0 1 0 .04 .1A.2 .2 0 1 0 .44 .1ZM-.05 0L.05 0Q.06 .38 .18 .5L-.18 .5Q-.06 .38 -.05 0Z',
  star: 'M0 -.5Q.05 -.05 .5 0Q.05 .05 0 .5Q-.05 .05 -.5 0Q-.05 -.05 0 -.5Z',
};

/**
 * The card's material, earned by progress — the landing's own ladder
 * ("gold foil once you start, holo from half-way, prism when complete"):
 * cream stock, a gilt edge once started, foil from half, prism at 100 %.
 */
type Tier = 'stock' | 'gilt' | 'foil' | 'prism';

const TIER_RANK: Record<Tier, number> = { stock: 0, gilt: 1, foil: 2, prism: 3 };
/** Named ONCE, as a headline, only when it is earned. */
const TIER_NAME: Record<Tier, string> = { stock: '', gilt: 'Gilded', foil: 'Foiled', prism: 'Prism' };

function tierOf(done: number, total: number): Tier {
  if (total > 0 && done >= total) return 'prism';
  if (total > 0 && done / total >= 0.5) return 'foil';
  return done > 0 ? 'gilt' : 'stock';
}

/** "The next chapter to finish": the first started one that is not done,
 *  else the first untouched one; none when everything is complete. */
function nextChapter<T extends Pick<HudChapter, 'done' | 'complete'>>(chapters: readonly T[]): T | undefined {
  return chapters.find((chapter) => chapter.done > 0 && !chapter.complete) ?? chapters.find((chapter) => !chapter.complete);
}

type Fan = { rotate: number; lift: number };

/** Card `index` of `count`, `perRow` to a row: its tilt (deg) and arc lift (px) in that row's fan. */
function fanOf(index: number, count: number, perRow: number, maxRotate: number, arc: number): Fan {
  const row = Math.floor(index / Math.max(1, perRow));
  const inRow = Math.min(perRow, count - row * perRow);
  if (inRow <= 1) return { rotate: 0, lift: 0 };
  const half = (inRow - 1) / 2;
  const t = (index - row * perRow - half) / half;
  return { rotate: Math.round(t * maxRotate * 100) / 100, lift: Math.round(t * t * arc * 100) / 100 };
}

/** How many cards of width `card` (+ `gap`) fit a row of `width`, at least `min`. */
function perRowFor(width: number, card: number, gap: number, min = 1): number {
  return Math.max(min, Math.floor((width + gap) / (card + gap)));
}

/** When the deal of `count` cards has landed (ms): the last card's flight + flip. */
function dealEnd(count: number): number {
  return 420 + Math.min(Math.max(count, 1) - 1, 26) * 45 + 520;
}

type Beat = {
  /** The art's light rises from empty (ms after `start`), or null: shown at its level. */
  rise: number | null;
  /** The big ceremony (flip to the new finish, flash), or null. */
  ascend: number | null;
  /** The wax seal stamps, or null (a complete card shows its seal at rest). */
  stamp: number | null;
};

/**
 * The celebrations for this mount, in syllabus order: every moment's light
 * rises in a quick wave; the first `cap` completions ascend and stamp one
 * after another, `spacing` ms apart (so flashes stay under 3 a second and
 * the sample preview never turns into fireworks). Pure; unit-tested.
 */
function planMoments(chapters: readonly Pick<HudChapter, 'key'>[], moments: ReadonlyMap<string, Moment>, start: number, { cap = 4, spacing = 420, wave = 55 } = {}): Map<string, Beat> {
  const out = new Map<string, Beat>();
  let risen = 0;
  let ascended = 0;
  for (const chapter of chapters) {
    const moment = moments.get(chapter.key);
    if (!moment) continue;
    const rise = start + Math.min(risen++, 18) * wave;
    if (moment === 'complete' && ascended < cap) {
      const ascend = start + 500 + ascended++ * spacing;
      out.set(chapter.key, { rise, ascend, stamp: ascend + 360 });
    } else out.set(chapter.key, { rise, ascend: null, stamp: null });
  }
  return out;
}

/** The headline for this mount's moments: the best tier earned, the first
 *  chapter that earned it, and how many others did. Null with no moments. */
function headlineOf<T extends Pick<HudChapter, 'key' | 'done' | 'total' | 'number' | 'title'>>(chapters: readonly T[], moments: ReadonlyMap<string, Moment>): { tier: Tier; chapter: T; others: number } | null {
  let best: { tier: Tier; chapter: T; others: number } | null = null;
  for (const chapter of chapters) {
    if (!moments.has(chapter.key)) continue;
    const tier = tierOf(chapter.done, chapter.total);
    if (tier === 'stock') continue;
    if (!best || TIER_RANK[tier] > TIER_RANK[best.tier]) best = { tier, chapter, others: 0 };
    else if (tier === best.tier) best.others++;
  }
  return best;
}

/** A small seeded random (mulberry32 over an FNV hash of `seed`). */
function seeded(seed: string): () => number {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { dealEnd, fanOf, headlineOf, nextChapter, perRowFor, planMoments, seeded, SUIT_PATHS, TIER_NAME, TIER_RANK, tierOf };
export type { Beat, Fan, Tier };
