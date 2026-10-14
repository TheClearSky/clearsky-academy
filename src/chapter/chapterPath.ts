/**
 * The chapter page's address (`ChapterPage.tsx`): `/chapter/<syllabus
 * document id>/<chapter number, 1-based>`, e.g. `/chapter/cbse-11-physics/2`.
 * Kept in its own tiny module so the landing's HUD can link to the page
 * without loading it.
 */
function chapterPath(documentId: string, number: number): string {
  return `/chapter/${encodeURIComponent(documentId)}/${number}`;
}

/** Before leaving the landing for a chapter: mark the entry being left with
 *  `#progress`, so Back returns to the progress HUD (`LandingPage` scrolls
 *  to it) instead of the top of the page. */
function markReturnToProgress(): void {
  const url = new URL(window.location.href);
  url.hash = 'progress';
  window.history.replaceState(window.history.state, '', url);
}

/** A topic's modal over its chapter page (`TopicModal.tsx`), 1-based. */
function topicPath(documentId: string, number: number, topic: number): string {
  return `${chapterPath(documentId, number)}/topic/${topic}`;
}

export { chapterPath, markReturnToProgress, topicPath };
