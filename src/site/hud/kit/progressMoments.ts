import { useEffect, useMemo } from 'react';
import { STORAGE_NAMESPACE } from '../../../storageNamespace';
import type { HudChapter } from '../contract';

/**
 * PROGRESS MOMENTS: which chapters moved since this learner last saw the
 * HUD, so a design celebrates real progress ONCE — the Codex seal stamping,
 * a card ascending — instead of on every visit and every subject switch
 * (review round 2: "completion effects replay on mount").
 *
 * Progress is ticked on the chapter pages, so the HUD remembers the done count it last
 * showed for each chapter (`clearsky-academy:hud-seen`). A chapter whose
 * count is above that is a moment: `complete` if it reached 100 % since,
 * else `advanced`. A moment fires once per page session; the counts are
 * written back as soon as they have been shown. The sample-progress
 * preview never reads or writes the store: there every complete chapter is
 * a `complete` moment and every started one `advanced`, so the effects can
 * be judged.
 */

type Moment = 'complete' | 'advanced';
type SeenCounts = Record<string, number>;

const STORAGE_KEY = `${STORAGE_NAMESPACE}:hud-seen`;
/** What the learner had seen when this page loaded (read once). */
let seenAtLoad: SeenCounts | null = null;
/** Moments already celebrated in this page session. */
const celebrated = new Set<string>();

function parseSeen(raw: string | null): SeenCounts {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: SeenCounts = {};
    for (const [key, count] of Object.entries(value)) if (typeof count === 'number' && Number.isFinite(count) && count >= 0) out[key] = count;
    return out;
  } catch {
    return {};
  }
}

function readSeen(): SeenCounts {
  if (seenAtLoad) return seenAtLoad;
  try {
    seenAtLoad = parseSeen(localStorage.getItem(STORAGE_KEY));
  } catch {
    seenAtLoad = {};
  }
  return seenAtLoad;
}

function writeSeen(chapters: readonly HudChapter[]) {
  try {
    const stored = parseSeen(localStorage.getItem(STORAGE_KEY));
    for (const chapter of chapters) stored[chapter.key] = chapter.done;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked: moments repeat next visit, nothing breaks.
  }
}

/** The moment for one chapter, given what was seen (pure; unit-tested). */
function momentFor(chapter: HudChapter, seen: number | undefined): Moment | null {
  const before = seen ?? 0;
  if (chapter.done <= before) return null;
  return chapter.complete ? 'complete' : 'advanced';
}

/** The moments for this list of chapters, stable for the mount. */
function useProgressMoments(chapters: readonly HudChapter[], sample: boolean): ReadonlyMap<string, Moment> {
  const moments = useMemo(() => {
    const out = new Map<string, Moment>();
    if (sample) {
      for (const chapter of chapters) if (chapter.done > 0) out.set(chapter.key, chapter.complete ? 'complete' : 'advanced');
      return out;
    }
    const seen = readSeen();
    for (const chapter of chapters) {
      if (celebrated.has(chapter.key)) continue;
      const moment = momentFor(chapter, seen[chapter.key]);
      if (moment) out.set(chapter.key, moment);
    }
    return out;
  }, [chapters, sample]);

  useEffect(() => {
    if (sample) return;
    for (const key of moments.keys()) celebrated.add(key);
    writeSeen(chapters);
  }, [chapters, moments, sample]);

  return moments;
}

export { momentFor, parseSeen, useProgressMoments };
export type { Moment };
