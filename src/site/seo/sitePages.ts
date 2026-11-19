import { documentChapters } from '../../curriculum/progress';
import type { SyllabusDocument } from '../../curriculum/schema';
import type { TopicEntry } from '../../topics/contract';
import { buildCourses, subjectName } from '../courses';

/**
 * THE SITE'S PAGES, AS A CRAWLER SEES THEM (2026-11-18, `.claude/research/growth/PLAYBOOK.md` R4.1).
 *
 * GitHub Pages has no rewrites: before this, every address but `/` was answered by `404.html` (the SPA booted from
 * it, but with HTTP 404), so Google would not index a chapter or topic page and link previews were generic. The
 * build now writes a real HTML file per address (`src/site/seo/prerender.ts`): the very same built `index.html`
 * (same JS, same CSS, the app boots as before) with that address's own head: title, description, canonical URL,
 * Open Graph and Twitter card tags, and for a topic with a YouTube video, VideoObject JSON-LD.
 *
 * This module is the pure part: the list of addresses (the same ones the router serves: `routes.tsx`,
 * `chapter/ChapterPage.tsx`, which shows only the documents of a course, `site/courses.ts`), each page's text, and
 * the head / sitemap / robots markup. The `<title>` is EXACTLY what the page itself sets once it runs
 * (`LandingPage.tsx`, `ChapterPage.tsx`), so the tab title never changes as the app boots; the route-specific text
 * for previews lives in og:title / description.
 */

/** Where the site lives when nothing else is said (`SITE_ORIGIN` overrides it). */
const DEFAULT_ORIGIN = 'https://theclearsky.github.io';

/** The site-wide Open Graph image, in `public/og/` (1200x630, cropped from the channel banner `media/brand/banner.png`). */
const SITE_IMAGE = { path: 'og/clearsky-academy.jpg', width: 1200, height: 630, alt: 'ClearSky Academy: See every concept come alive' };

const SITE_NAME = 'ClearSky Academy';
/** `LandingPage.tsx` sets this title. */
const HOME_TITLE = 'ClearSky Academy — see the concept, then learn it';
/** The landing hero's own line (`LandingPage.tsx`). */
const HOME_DESCRIPTION = 'Animated Mathematics, Physics and Chemistry for Classes 9–12 — the CBSE syllabus and JEE, one chapter at a time.';

type PageImage = { url: string; width: number; height: number; alt: string };

type PageVideo = {
  youtube: string;
  /** The video's own title (`topic.json` › title, its YouTube title). */
  name: string;
  description: string;
};

type SitePage = {
  kind: 'home' | 'chapter' | 'topic';
  /** The router path, without the base: '/', '/chapter/<doc>/<n>', '/chapter/<doc>/<n>/topic/<t>'. */
  path: string;
  /** `<title>`: what the page sets once it runs. */
  title: string;
  /** og:title / twitter:title: this address's own. */
  shareTitle: string;
  description: string;
  /** Absent: the site image. */
  image?: PageImage;
  video?: PageVideo;
};

/** The documents the chapter page serves: those shown in a course (CBSE "Advanced Level" books are not). */
function routableDocuments(syllabi: readonly SyllabusDocument[]): SyllabusDocument[] {
  return buildCourses(syllabi).flatMap((course) => course.documents);
}

/** "CBSE Class 9 Mathematics", "JEE Main Physics": the words students search with. */
function documentLabel(document: SyllabusDocument): string {
  const subject = subjectName(document.subject);
  if (document.exam === 'CBSE board') return document.class === null ? `CBSE ${subject}` : `CBSE Class ${document.class} ${subject}`;
  return `${document.exam} ${subject}`;
}

/** Syllabus text for a head tag: a run of unreadable glyphs (U+FFFD, `curriculum/unreadableGlyphs.ts`) becomes "?",
 *  as the page shows it; whitespace is collapsed. */
function plain(text: string): string {
  return text.replace(/\uFFFD+/g, '?').replace(/\s+/g, ' ').trim();
}

/** At most `max` characters, cut at a word and marked with an ellipsis. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/** A sentence ends with a full stop (unless it already ends with punctuation). */
function sentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function youtubeThumbnail(id: string): PageImage {
  return { url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, width: 1280, height: 720, alt: '' };
}

/**
 * Every page of the site: the landing, then per routable document each chapter page and each of its topics' pages,
 * in the order the router numbers them (1-based, chapters across units: `curriculum/progress.ts` › documentChapters).
 * `topics` is the topic-media registry (`topics/registry.ts` › TOPICS); `hasPlayground` says whether a topic has a
 * playground under its video.
 */
function sitePages(syllabi: readonly SyllabusDocument[], topics: readonly TopicEntry[], hasPlayground: (slug: string) => boolean = () => false): SitePage[] {
  const pages: SitePage[] = [{ kind: 'home', path: '/', title: HOME_TITLE, shareTitle: HOME_TITLE, description: HOME_DESCRIPTION }];
  for (const document of routableDocuments(syllabi)) {
    const label = documentLabel(document);
    documentChapters(document, new Set()).forEach(({ chapter }, chapterIndex) => {
      const number = chapterIndex + 1;
      const chapterPath = `/chapter/${encodeURIComponent(document.id)}/${number}`;
      const chapterTitle = plain(chapter.title);
      const title = `${chapter.title} — ${SITE_NAME}`;
      const topicNames = chapter.topics.map(plain);
      pages.push({
        kind: 'chapter',
        path: chapterPath,
        title,
        shareTitle: clip(`${chapterTitle} — ${label}, chapter ${number}`, 90),
        description: clip(`${label}, chapter ${number}: ${chapterTitle}. ${topicNames.length} ${topicNames.length === 1 ? 'topic' : 'topics'}: ${topicNames.join('; ')}`, 160),
      });
      topicNames.forEach((name, topicIndex) => {
        const t = topicIndex + 1;
        const entry = topics.find((candidate) => candidate.doc === document.id && candidate.chapter === number && candidate.topic === t);
        const where = `Topic ${t} of chapter ${number}, ${chapterTitle} (${label}).`;
        const video = entry?.youtube ? entry.youtube : null;
        const lead = video ? `${sentence(clip(name, 100))} Watch it animated${entry && hasPlayground(entry.slug) ? ', then play with it' : ''}.` : sentence(clip(name, 110));
        const description = clip(`${lead} ${where}`, 200);
        pages.push({
          kind: 'topic',
          path: `${chapterPath}/topic/${t}`,
          title,
          // The topic, then where it belongs (the chapter is in the description).
          shareTitle: `${clip(name, 90 - label.length - 3)} — ${label}`,
          description,
          ...(video && entry ? { image: { ...youtubeThumbnail(video), alt: plain(entry.title) }, video: { youtube: video, name: plain(entry.title), description } } : {}),
        });
      });
    });
  }
  return pages;
}

/** The site's absolute root URL, ending in '/': origin + Vite's base ('/clearsky-academy/'). */
function siteUrlFrom(base: string, origin: string = DEFAULT_ORIGIN): string {
  if (!/^\/(?:.*\/)?$/.test(base)) throw new Error(`[seo] the base must start and end with "/" (got "${base}")`);
  return `${origin.replace(/\/+$/, '')}${base}`;
}

/** A page's canonical URL: the address without a trailing slash, as the app links to it (`chapter/chapterPath.ts`). */
function pageUrl(siteUrl: string, path: string): string {
  return path === '/' ? siteUrl : `${siteUrl}${path.replace(/^\/+/, '')}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** JSON that is safe inside a <script> element (no "</script>", no "<!--"). */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** The JSON-LD of a page: the site on the landing, a VideoObject on a topic with a video, none elsewhere. */
function structuredData(page: SitePage, siteUrl: string): unknown | null {
  if (page.kind === 'home') return { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: siteUrl, description: page.description };
  if (!page.video) return null;
  const { youtube, name, description } = page.video;
  // uploadDate is left out until the manifest records it (Google wants it for video rich results).
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name,
    description,
    thumbnailUrl: [`https://i.ytimg.com/vi/${youtube}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${youtube}/hqdefault.jpg`],
    embedUrl: `https://www.youtube.com/embed/${youtube}`,
    url: `https://www.youtube.com/watch?v=${youtube}`,
  };
}

/** The tags this page adds to the head, one per line (indented like the built index.html). */
function headTags(page: SitePage, siteUrl: string): string {
  const url = pageUrl(siteUrl, page.path);
  const image = page.image ?? { ...SITE_IMAGE, url: `${siteUrl}${SITE_IMAGE.path}` };
  const meta = (attribute: 'name' | 'property', key: string, content: string | number) => `<meta ${attribute}="${key}" content="${escapeHtml(String(content))}" />`;
  const tags = [
    meta('name', 'description', page.description),
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:locale', 'en_IN'),
    meta('property', 'og:url', url),
    meta('property', 'og:title', page.shareTitle),
    meta('property', 'og:description', page.description),
    meta('property', 'og:image', image.url),
    meta('property', 'og:image:width', image.width),
    meta('property', 'og:image:height', image.height),
    ...(image.alt ? [meta('property', 'og:image:alt', image.alt)] : []),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', page.shareTitle),
    meta('name', 'twitter:description', page.description),
    meta('name', 'twitter:image', image.url),
    ...(image.alt ? [meta('name', 'twitter:image:alt', image.alt)] : []),
  ];
  const data = structuredData(page, siteUrl);
  if (data) tags.push(`<script type="application/ld+json">${scriptJson(data)}</script>`);
  return tags.map((tag) => `    ${tag}`).join('\n');
}

const MARK_START = '<!-- seo: src/site/seo/prerender.ts -->';
const MARK_END = '<!-- /seo -->';

/**
 * The built index.html with this page's head: its <title> replaced, its tags added right after it (between two
 * marker comments). Nothing else changes: the same module script, stylesheet and body, so the app boots exactly as
 * it does from index.html.
 */
function pageHtml(template: string, page: SitePage, siteUrl: string): string {
  if (template.includes(MARK_START)) throw new Error('[seo] this index.html has already been prerendered: run `vite build` first');
  const titles = template.match(/<title>[\s\S]*?<\/title>/g) ?? [];
  if (titles.length !== 1) throw new Error(`[seo] the built index.html must have exactly one <title> (found ${titles.length})`);
  const head = `<title>${escapeHtml(page.title)}</title>\n    ${MARK_START}\n${headTags(page, siteUrl)}\n    ${MARK_END}`;
  return template.replace(titles[0], () => head);
}

/** The 404 page (unknown addresses; the SPA still boots from it and sends them home): the untouched template, told not
 *  to be indexed. */
function notFoundHtml(template: string): string {
  if (template.includes('name="robots"')) return template;
  return template.replace(/<\/title>/, () => '</title>\n    <meta name="robots" content="noindex" />');
}

function sitemapXml(pages: readonly SitePage[], siteUrl: string): string {
  const urls = pages.map((page) => `  <url><loc>${escapeHtml(pageUrl(siteUrl, page.path))}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** NOTE: crawlers read robots.txt only at the host's root; under a GitHub Pages project path it is a pointer for
 *  people and tools, and the sitemap is submitted in Search Console instead. */
function robotsTxt(siteUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`;
}

/** Where a page's file goes in dist/: `<path>.html` (GitHub Pages serves it at `<path>` with no redirect) and
 *  `<path>/index.html` (for `<path>/`). The landing is `index.html` only. */
function pageFiles(path: string): string[] {
  if (path === '/') return ['index.html'];
  const bare = path.replace(/^\/+|\/+$/g, '');
  return [`${bare}.html`, `${bare}/index.html`];
}

export { documentLabel, headTags, notFoundHtml, pageFiles, pageHtml, pageUrl, robotsTxt, routableDocuments, SITE_IMAGE, sitemapXml, sitePages, siteUrlFrom };
export type { SitePage };
