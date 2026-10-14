import type { HudChapter } from '../../contract';
import type { Moment } from '../../kit/progressMoments';

/**
 * The classic card (round 1's Chapter Deck card, lifted for round 3) — the
 * pure parts, unit-tested in `src/__tests__/hud-shared-classic.test.ts`:
 * a card's state, where its ink line sits, and the plan of this mount's
 * moments (who snaps, who stamps, when). The fan and the deal timing are
 * the round-2 helpers (`shared/ascension/logic`), re-exported here so a
 * design imports the classic card's whole toolset from one place.
 */

type ClassicState = 'untouched' | 'started' | 'done';

function stateOf(chapter: Pick<HudChapter, 'done' | 'complete'>): ClassicState {
  if (chapter.complete) return 'done';
  return chapter.done > 0 ? 'started' : 'untouched';
}

/**
 * Where the ink line sits, as a fraction of the card's height from the
 * bottom. The TRUE fraction, except that a started card's line never hides
 * in the rounded bottom corner (≥ 6 %) and an unfinished card always keeps
 * a band of paper at the top (≤ 92 %), so "almost" never reads as "done".
 */
function lineOf(done: number, total: number): number {
  if (total <= 0 || done <= 0) return 0;
  if (done >= total) return 1;
  return Math.min(0.92, Math.max(0.06, done / total));
}

type ClassicBeat = {
  /** When the line snaps up from the bottom (ms after mount of the hand). */
  at: number;
  /** When the wax seal stamps (complete moments only), else null. */
  stamp: number | null;
};

/**
 * This mount's celebrations, in syllabus order: the first `cap` moments
 * each get a line snap, one after another `spacing` ms apart (≥ 380, so the
 * line's flare stays under 3 a second); a complete one stamps its seal
 * `stampAfter` ms after its snap. Moments past the cap simply show their
 * level (the sample preview makes every started chapter a moment — this
 * keeps it calm). Pure; unit-tested.
 */
function planCuts(chapters: readonly Pick<HudChapter, 'key'>[], moments: ReadonlyMap<string, Moment>, start: number, { cap = 6, spacing = 400, stampAfter = 430 } = {}): Map<string, ClassicBeat> {
  const out = new Map<string, ClassicBeat>();
  const gap = Math.max(380, spacing);
  for (const chapter of chapters) {
    if (out.size >= cap) break;
    const moment = moments.get(chapter.key);
    if (!moment) continue;
    const at = start + out.size * gap;
    out.set(chapter.key, { at, stamp: moment === 'complete' ? at + stampAfter : null });
  }
  return out;
}

export { dealEnd, fanOf, nextChapter, perRowFor } from '../ascension/logic';
export { lineOf, planCuts, stateOf };
export type { ClassicBeat, ClassicState };
