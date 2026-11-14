import { STORAGE_NAMESPACE } from '../storageNamespace';

/**
 * The chapter page's address (`ChapterPage.tsx`): `/chapter/<syllabus
 * document id>/<chapter number, 1-based>`, e.g. `/chapter/cbse-11-physics/2`.
 * Kept in its own tiny module so the landing's HUD can link to the page
 * without loading it.
 */
function chapterPath(documentId: string, number: number): string {
  return `/chapter/${encodeURIComponent(documentId)}/${number}`;
}

const RETURN_KEY = `${STORAGE_NAMESPACE}:return-to-progress`;

/**
 * Back from a chapter returns to the progress HUD, not the top of the page —
 * WITHOUT touching the URL (Deepak, 2026-10-17: it used to mark the landing
 * `#progress`, and a reload then jumped to the HUD; "When i click back, dont
 * add anything to the url"). A one-shot flag in session storage instead: set
 * when leaving the landing for a chapter (so the browser's Back works too) and
 * by the chapter page's own Back link; `LandingPage` takes it once on arrival
 * and clears it once it has scrolled, so a later reload starts at the top.
 */
function markReturnToProgress(): void {
  try {
    sessionStorage.setItem(RETURN_KEY, '1');
  } catch {
    // Storage blocked: Back lands at the top of the page, which is fine.
  }
}

/** Whether the visitor is coming back from a chapter (the flag stays until `clearReturnToProgress`). */
function isReturningToProgress(): boolean {
  try {
    return sessionStorage.getItem(RETURN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Clear the flag — once the landing has actually scrolled to the HUD (React may run an effect twice). */
function clearReturnToProgress(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

/** A topic's modal over its chapter page (`TopicModal.tsx`), 1-based. */
function topicPath(documentId: string, number: number, topic: number): string {
  return `${chapterPath(documentId, number)}/topic/${topic}`;
}

export { chapterPath, clearReturnToProgress, isReturningToProgress, markReturnToProgress, topicPath };
