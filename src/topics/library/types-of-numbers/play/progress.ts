import { STORAGE_NAMESPACE } from '../../../../storageNamespace';

/**
 * The learner's progress on video 1's puzzles (M13.X1): per question how many tries, whether it has EVER been solved,
 * and the last result; plus the tab they were on. Stored in localStorage under `clearsky-academy:play:types-of-numbers`
 * as `{ version: 1, tab, questions: { <id>: { tries, solved, last } } }`. The parser trusts nothing: a corrupt,
 * foreign or future value gives an empty record (never a throw), and unknown question ids are dropped.
 */

const PROGRESS_KEY = `${STORAGE_NAMESPACE}:play:types-of-numbers`;

type QuestionProgress = { tries: number; solved: boolean; last: 'correct' | 'wrong' | null };
type PlayProgress = { tab: number; questions: Record<string, QuestionProgress> };

const emptyProgress = (): PlayProgress => ({ tab: 0, questions: {} });

function parseProgress(raw: string | null, ids: readonly string[]): PlayProgress {
  const out = emptyProgress();
  if (raw === null) return out;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!data || typeof data !== 'object' || (data as { version?: unknown }).version !== 1) return out;
  const record = data as { tab?: unknown; questions?: unknown };
  if (typeof record.tab === 'number' && Number.isInteger(record.tab) && record.tab >= 0 && record.tab < ids.length) out.tab = record.tab;
  if (record.questions && typeof record.questions === 'object' && !Array.isArray(record.questions)) {
    for (const id of ids) {
      const entry = (record.questions as Record<string, unknown>)[id];
      if (!entry || typeof entry !== 'object') continue;
      const { tries, solved, last } = entry as { tries?: unknown; solved?: unknown; last?: unknown };
      if (typeof tries !== 'number' || !Number.isInteger(tries) || tries < 0 || tries > 1e6) continue;
      out.questions[id] = { tries, solved: solved === true, last: last === 'correct' || last === 'wrong' ? last : null };
    }
  }
  return out;
}

function serialiseProgress(progress: PlayProgress): string {
  return JSON.stringify({ version: 1, tab: progress.tab, questions: progress.questions });
}

/** One submitted answer recorded. */
function recordTry(progress: PlayProgress, id: string, correct: boolean): PlayProgress {
  const before = progress.questions[id] ?? { tries: 0, solved: false, last: null };
  return { ...progress, questions: { ...progress.questions, [id]: { tries: before.tries + 1, solved: before.solved || correct, last: correct ? 'correct' : 'wrong' } } };
}

function loadProgress(ids: readonly string[]): PlayProgress {
  try {
    return parseProgress(localStorage.getItem(PROGRESS_KEY), ids);
  } catch {
    // Storage blocked (private mode, site data off): progress lives in memory.
    return emptyProgress();
  }
}

function saveProgress(progress: PlayProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, serialiseProgress(progress));
  } catch {
    // Storage blocked or full: progress lives in memory for this visit.
  }
}

export { emptyProgress, loadProgress, parseProgress, PROGRESS_KEY, recordTry, saveProgress, serialiseProgress };
export type { PlayProgress, QuestionProgress };
