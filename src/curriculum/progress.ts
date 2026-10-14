import { z } from 'zod';
import type { SyllabusChapter, SyllabusDocument } from './schema';
import { STORAGE_NAMESPACE } from '../storageNamespace';

/**
 * A learner's progress: which syllabus topics they have marked done.
 *
 * A topic is identified by a STABLE KEY built from its content, not its
 * position: `<document id>|<chapter title>|<topic text>` hashed (FNV-1a,
 * 32-bit, base 36). Re-extracting a syllabus that inserts a unit therefore
 * keeps every other topic's mark — an index path would silently re-point
 * them (review finding C-16).
 *
 * Stored in localStorage under `${STORAGE_NAMESPACE}:progress` as
 * `{ version: 1, done: string[] }`, validated with zod on the way in: a
 * corrupt or foreign value is ignored (logged), never trusted.
 */

const STORAGE_KEY = `${STORAGE_NAMESPACE}:progress`;

const storedProgressSchema = z.object({ version: z.literal(1), done: z.array(z.string().max(64)).max(20000) });

/** FNV-1a 32-bit of the string, as base-36 text. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function topicKey(documentId: string, chapterTitle: string, topic: string): string {
  return fnv1a(`${documentId}|${chapterTitle}|${topic}`);
}

function parseStoredProgress(raw: string | null): Set<string> {
  if (raw === null) return new Set();
  try {
    const parsed = storedProgressSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return new Set(parsed.data.done);
    console.warn('[progress] stored progress has an unexpected shape; ignoring it', parsed.error.issues);
  } catch (error) {
    console.warn('[progress] stored progress is not JSON; ignoring it', error);
  }
  return new Set();
}

function serialiseProgress(done: ReadonlySet<string>): string {
  return JSON.stringify({ version: 1, done: [...done].sort() });
}

type ChapterProgress = { done: number; total: number; fraction: number };

function chapterProgress(documentId: string, chapter: SyllabusChapter, done: ReadonlySet<string>): ChapterProgress {
  const total = chapter.topics.length;
  const count = chapter.topics.filter((topic) => done.has(topicKey(documentId, chapter.title, topic))).length;
  return { done: count, total, fraction: total === 0 ? 0 : count / total };
}

/** Every chapter of a document in order, with its unit and its progress. */
function documentChapters(document: SyllabusDocument, done: ReadonlySet<string>) {
  return document.units.flatMap((unit) =>
    unit.chapters.map((chapter) => ({ unit, chapter, progress: chapterProgress(document.id, chapter, done) })),
  );
}

function loadProgress(): Set<string> {
  try {
    return parseStoredProgress(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage blocked (private mode, site data off): progress lives in memory.
    return new Set();
  }
}

function saveProgress(done: ReadonlySet<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialiseProgress(done));
  } catch (error) {
    console.warn('[progress] could not save progress (storage unavailable)', error);
  }
}

export { chapterProgress, documentChapters, loadProgress, parseStoredProgress, saveProgress, serialiseProgress, STORAGE_KEY, topicKey };
export type { ChapterProgress };
