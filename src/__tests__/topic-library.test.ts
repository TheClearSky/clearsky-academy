import { describe, expect, it } from 'vitest';
import { documentChapters, topicKey } from '../curriculum/progress';
import { syllabi } from '../curriculum/syllabi';
import type { TopicManifest } from '../topics/contract';

/**
 * The website's topic media (`src/topics/library/<slug>/topic.json`, read by
 * the topic modal): every manifest points at a real syllabus topic and
 * carries its progress key, so a re-extracted syllabus can't silently orphan
 * a topic's video or playground. (Split out of the video pipeline's own
 * tests, which stay local with the pipeline.)
 */

const manifests = import.meta.glob<TopicManifest>('../topics/library/*/topic.json', { eager: true, import: 'default' });

describe('library topic.json files', () => {
  const entries = Object.entries(manifests);

  it('has at least the sample topic', () => {
    expect(entries.some(([path]) => path.includes('/quadratic-standard-form/'))).toBe(true);
  });

  it.each(entries)('%s resolves to its syllabus topic and key', (path, manifest) => {
    const slug = path.split('/').at(-2) ?? '';
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const document = syllabi.find((candidate) => candidate.id === manifest.doc);
    expect(document, `unknown doc "${manifest.doc}"`).toBeDefined();
    const chapters = documentChapters(document!, new Set());
    const entry = chapters[manifest.chapter - 1];
    expect(entry, `${manifest.doc} has no chapter ${manifest.chapter}`).toBeDefined();
    const topic = entry.chapter.topics[manifest.topic - 1];
    expect(topic, `chapter ${manifest.chapter} has no topic ${manifest.topic}`).toBeDefined();
    expect(topicKey(document!.id, entry.chapter.title, topic)).toBe(manifest.key);
    expect(manifest.title.trim().length).toBeGreaterThan(0);
    expect(manifest.youtube === null || /^[A-Za-z0-9_-]{11}$/.test(manifest.youtube)).toBe(true);
  });

  it('gives each syllabus topic at most one folder', () => {
    const keys = entries.map(([, manifest]) => manifest.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
