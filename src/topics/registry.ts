import type { PlaygroundModule, TopicEntry, TopicManifest, VideoModule } from './contract';

/**
 * The topic-media registry (`contract.ts`): every `library/<slug>/topic.json`
 * eagerly (tiny), every playground and video script lazily (three.js and the
 * concept code load only when a topic's modal or the studio asks).
 */

const manifests = import.meta.glob<TopicManifest>('./library/*/topic.json', { eager: true, import: 'default' });
const playgrounds = import.meta.glob<PlaygroundModule>('./library/*/Playground.tsx');
const videos = import.meta.glob<VideoModule>('./library/*/video.ts');

const slugOf = (path: string) => path.split('/').at(-2) ?? '';

const TOPICS: readonly TopicEntry[] = Object.entries(manifests)
  .map(([path, manifest]) => ({ ...manifest, slug: slugOf(path) }))
  .sort((a, b) => a.slug.localeCompare(b.slug));

/** The media entry for a topic of the chapter page (doc id, 1-based chapter and topic). */
function topicEntryAt(doc: string, chapter: number, topic: number): TopicEntry | undefined {
  return TOPICS.find((entry) => entry.doc === doc && entry.chapter === chapter && entry.topic === topic);
}

function playgroundLoader(slug: string): (() => Promise<PlaygroundModule>) | undefined {
  return playgrounds[`./library/${slug}/Playground.tsx`];
}

function videoLoader(slug: string): (() => Promise<VideoModule>) | undefined {
  return videos[`./library/${slug}/video.ts`];
}

export { playgroundLoader, topicEntryAt, TOPICS, videoLoader };
