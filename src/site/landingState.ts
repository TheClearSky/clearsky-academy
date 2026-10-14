import { STORAGE_NAMESPACE } from '../storageNamespace';

/**
 * Where the visitor left the landing: the class they picked, whether its
 * card is held on the table, and the HUD's subject — so coming back (the
 * browser's Back, the chapter page's back link, the logo, a reload) finds
 * the page as they left it (Deepak, round 4: "page should remember my state
 * when i click back, the class card i selected doesn't stay").
 *
 * Kept in localStorage under `clearsky-academy:landing` (Deepak picked it
 * over sessionStorage, round 4): Back, reloads AND later visits restore
 * it — a returning learner finds their class held, not the deal. Another
 * tab's change is picked up on its next load (last write wins). Reads are
 * validated and every access is guarded — blocked storage just means
 * nothing is remembered.
 */

type LandingState = {
  /** The picked course's key ("cbse-11"). */
  course?: string;
  /** Its card is held on the table (the picked view). */
  picked?: boolean;
  /** The HUD's subject (a syllabus document id). */
  subject?: string;
};

const STORAGE_KEY = `${STORAGE_NAMESPACE}:landing`;

/** The stored state, keeping only well-formed fields (pure; unit-tested). */
function parseLandingState(raw: string | null): LandingState {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const record = value as Record<string, unknown>;
    const out: LandingState = {};
    if (typeof record.course === 'string' && record.course.length <= 64) out.course = record.course;
    if (typeof record.picked === 'boolean') out.picked = record.picked;
    if (typeof record.subject === 'string' && record.subject.length <= 64) out.subject = record.subject;
    return out;
  } catch {
    return {};
  }
}

function readLandingState(): LandingState {
  try {
    return parseLandingState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

/** Merges `patch` into the stored state (an `undefined` field is removed). */
function writeLandingState(patch: LandingState): void {
  try {
    const next: Record<string, unknown> = { ...readLandingState(), ...patch };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the page just won't remember.
  }
}

export { parseLandingState, readLandingState, writeLandingState };
export type { LandingState };
