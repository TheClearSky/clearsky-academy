import { afterEach, describe, expect, it, vi } from 'vitest';
import { chapterProgress, documentChapters, parseStoredProgress, serialiseProgress, topicKey } from '../curriculum/progress';
import { syllabi } from '../curriculum/syllabi';

afterEach(() => vi.restoreAllMocks());

describe('topicKey', () => {
  it('is stable for the same topic and different for different topics', () => {
    expect(topicKey('cbse-10-mathematics', 'POLYNOMIALS', 'Zeros of a polynomial.')).toBe(topicKey('cbse-10-mathematics', 'POLYNOMIALS', 'Zeros of a polynomial.'));
    expect(topicKey('cbse-10-mathematics', 'POLYNOMIALS', 'Zeros of a polynomial.')).not.toBe(topicKey('cbse-10-mathematics', 'POLYNOMIALS', 'Zeros of a polynomial'));
    expect(topicKey('cbse-09-mathematics', 'POLYNOMIALS', 'Zeros of a polynomial.')).not.toBe(topicKey('cbse-10-mathematics', 'POLYNOMIALS', 'Zeros of a polynomial.'));
  });

  it('gives every topic of the shipped syllabus its own key (no collisions)', () => {
    const keys = new Map<string, string>();
    for (const document of syllabi) {
      for (const unit of document.units) {
        for (const chapter of unit.chapters) {
          for (const topic of chapter.topics) {
            const identity = `${document.id}|${chapter.title}|${topic}`;
            const key = topicKey(document.id, chapter.title, topic);
            const previous = keys.get(key);
            // The same topic text twice in one chapter is the same topic.
            if (previous !== undefined) expect(previous).toBe(identity);
            keys.set(key, identity);
          }
        }
      }
    }
    expect(keys.size).toBeGreaterThan(1000);
  });
});

describe('stored progress', () => {
  it('round-trips', () => {
    const done = new Set(['a1', 'b2']);
    expect(parseStoredProgress(serialiseProgress(done))).toEqual(done);
  });

  it('ignores a missing, corrupt or foreign value instead of trusting it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseStoredProgress(null).size).toBe(0);
    expect(parseStoredProgress('not json').size).toBe(0);
    expect(parseStoredProgress(JSON.stringify({ version: 2, done: ['x'] })).size).toBe(0);
    expect(parseStoredProgress(JSON.stringify({ version: 1, done: [42] })).size).toBe(0);
  });
});

describe('chapterProgress', () => {
  const document = syllabi.find((entry) => entry.id === 'cbse-12-physics')!;
  const chapter = document.units[0].chapters[0];

  it('counts the chapter’s done topics', () => {
    const done = new Set([topicKey(document.id, chapter.title, chapter.topics[0])]);
    const progress = chapterProgress(document.id, chapter, done);
    expect(progress).toEqual({ done: 1, total: chapter.topics.length, fraction: 1 / chapter.topics.length });
  });

  it('is complete when every topic is done', () => {
    const done = new Set(chapter.topics.map((topic) => topicKey(document.id, chapter.title, topic)));
    expect(chapterProgress(document.id, chapter, done).fraction).toBe(1);
  });

  it('lists every chapter of a document in order', () => {
    const chapters = documentChapters(document, new Set());
    expect(chapters.length).toBe(document.units.reduce((sum, unit) => sum + unit.chapters.length, 0));
    expect(chapters.every((entry) => entry.progress.done === 0)).toBe(true);
  });
});
