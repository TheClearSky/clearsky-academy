import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router';
import { documentChapters } from '../curriculum/progress';
import { syllabi } from '../curriculum/syllabi';
import { routes } from '../routes';
import { buildCourses } from '../site/courses';
import { notFoundHtml, pageFiles, pageHtml, pageUrl, robotsTxt, routableDocuments, sitemapXml, sitePages, siteUrlFrom } from '../site/seo/sitePages';
import type { SitePage } from '../site/seo/sitePages';
import { TOPICS } from '../topics/registry';
import type { TopicEntry } from '../topics/contract';

/**
 * The prerendered pages (`site/seo/sitePages.ts`, written by `site/seo/prerender.ts` after `vite build`): one
 * per address the app serves, each with its own head, and nothing else of the built page changed.
 */

const SITE = 'https://theclearsky.github.io/clearsky-academy/';
const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/clearsky-academy/favicon.svg" />
    <title>ClearSky Academy</title>
    <script type="module" crossorigin src="/clearsky-academy/assets/index-Bucn6V3Y.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const pages = sitePages(syllabi, TOPICS, () => true);
const byPath = (path: string) => pages.find((page) => page.path === path) as SitePage;

/** The leaf route a URL resolves to. */
function leaf(url: string) {
  const matches = matchRoutes(routes, url);
  return matches?.[matches.length - 1]?.route;
}

describe('the route list', () => {
  it('lists the landing, then every chapter and every topic of every course document', () => {
    const documents = buildCourses(syllabi).flatMap((course) => course.documents);
    let chapters = 0;
    let topics = 0;
    for (const document of documents) {
      for (const { chapter } of documentChapters(document, new Set())) {
        chapters++;
        topics += chapter.topics.length;
      }
    }
    expect(pages[0]).toMatchObject({ kind: 'home', path: '/' });
    expect(pages.filter((page) => page.kind === 'chapter')).toHaveLength(chapters);
    expect(pages.filter((page) => page.kind === 'topic')).toHaveLength(topics);
    expect(pages).toHaveLength(1 + chapters + topics);
    expect(new Set(pages.map((page) => page.path)).size).toBe(pages.length);
  });

  it('leaves out the documents the chapter page does not serve (the CBSE "Advanced Level" books)', () => {
    const served = routableDocuments(syllabi).map((document) => document.id);
    expect(served).not.toContain('cbse-09-mathematics-advanced');
    expect(pages.some((page) => page.path.includes('-advanced/') && page.path.startsWith('/chapter/cbse'))).toBe(false);
    expect(served).toContain('jee-advanced-physics');
  });

  it('numbers chapters across units and topics from 1, as the chapter page does', () => {
    expect(byPath('/chapter/cbse-09-mathematics/1')).toBeDefined();
    expect(byPath('/chapter/cbse-09-mathematics/1/topic/1')).toBeDefined();
    const document = syllabi.find((entry) => entry.id === 'cbse-09-mathematics')!;
    const last = documentChapters(document, new Set()).length;
    expect(byPath(`/chapter/cbse-09-mathematics/${last}`)).toBeDefined();
    expect(byPath(`/chapter/cbse-09-mathematics/${last + 1}`)).toBeUndefined();
    expect(byPath('/chapter/cbse-09-mathematics/0')).toBeUndefined();
  });

  it('every listed address is a real page of the router (never the catch-all that sends home)', () => {
    for (const page of pages) {
      const route = leaf(page.path);
      if (page.kind === 'home') expect(route?.index).toBe(true);
      else expect(route?.path, page.path).toBe('chapter/:documentId/:number/topic?/:topic?');
    }
  });

  it('writes each page as <path>.html and <path>/index.html (the landing as index.html)', () => {
    expect(pageFiles('/')).toEqual(['index.html']);
    expect(pageFiles('/chapter/cbse-09-mathematics/1')).toEqual(['chapter/cbse-09-mathematics/1.html', 'chapter/cbse-09-mathematics/1/index.html']);
    expect(pageFiles('/chapter/cbse-09-mathematics/1/topic/2')).toEqual(['chapter/cbse-09-mathematics/1/topic/2.html', 'chapter/cbse-09-mathematics/1/topic/2/index.html']);
  });
});

describe('page text', () => {
  it('uses the title each page sets itself, so the tab title never changes as the app boots', () => {
    expect(byPath('/').title).toBe('ClearSky Academy — see the concept, then learn it');
    expect(byPath('/chapter/cbse-09-mathematics/1').title).toBe('Number System — ClearSky Academy');
    // The topic's modal sits over its chapter page, which sets the chapter's title.
    expect(byPath('/chapter/cbse-09-mathematics/1/topic/1').title).toBe('Number System — ClearSky Academy');
  });

  it('gives chapters and topics their own share title and description, in the words students search with', () => {
    const chapter = byPath('/chapter/cbse-09-mathematics/1');
    expect(chapter.shareTitle).toBe('Number System — CBSE Class 9 Mathematics, chapter 1');
    expect(chapter.description).toMatch(/^CBSE Class 9 Mathematics, chapter 1: Number System\. \d+ topics: Types of Numbers/);
    const topic = byPath('/chapter/cbse-09-mathematics/1/topic/2');
    expect(topic.shareTitle).toBe('Representation of rational numbers on the number line — CBSE Class 9 Mathematics');
    expect(topic.description).toContain('Topic 2 of chapter 1, Number System (CBSE Class 9 Mathematics).');
    expect(byPath('/chapter/jee-main-physics/1').shareTitle).toMatch(/JEE Main Physics, chapter 1$/);
  });

  it('keeps descriptions and share titles short, and every page distinct', () => {
    for (const page of pages) {
      expect(page.description.length, page.path).toBeLessThanOrEqual(200);
      expect(page.shareTitle.length, page.path).toBeLessThanOrEqual(90);
      expect(page.description).not.toMatch(/�|\s{2}/);
    }
    const shared = new Set(pages.filter((page) => page.kind !== 'home').map((page) => `${page.shareTitle}\n${page.description}`));
    expect(shared.size).toBe(pages.length - 1);
  });

  it('gives a topic with a YouTube video its thumbnail and video, and no other topic', () => {
    const withVideo = TOPICS.filter((entry) => entry.youtube);
    expect(withVideo.length).toBeGreaterThan(0);
    for (const entry of withVideo) {
      const page = byPath(`/chapter/${entry.doc}/${entry.chapter}/topic/${entry.topic}`);
      expect(page.video?.youtube).toBe(entry.youtube);
      expect(page.image?.url).toBe(`https://i.ytimg.com/vi/${entry.youtube}/maxresdefault.jpg`);
      expect(page.description).toMatch(/Watch it animated, then play with it\./);
    }
    expect(pages.filter((page) => page.video)).toHaveLength(withVideo.length);
  });

  it('says "play with it" only when the topic has a playground', () => {
    const entry: TopicEntry = { key: 'x', doc: 'cbse-09-mathematics', chapter: 1, topic: 3, title: 'A video', youtube: 'abcdefghijk', slug: 'x' };
    const page = sitePages(syllabi, [entry], () => false).find((candidate) => candidate.video)!;
    expect(page.path).toBe('/chapter/cbse-09-mathematics/1/topic/3');
    expect(page.description).toMatch(/Watch it animated\. Topic 3/);
  });
});

describe('page markup', () => {
  it('replaces only the title and adds the head tags; the code, styles and body are untouched', () => {
    const html = pageHtml(TEMPLATE, byPath('/chapter/cbse-09-mathematics/1'), SITE);
    expect(html).toContain('<title>Number System — ClearSky Academy</title>');
    expect(html).not.toContain('<title>ClearSky Academy</title>');
    const strip = (text: string) => text.replace(/<title>[\s\S]*?<\/title>(?:\n\s*<!-- seo:[\s\S]*?<!-- \/seo -->)?/, '');
    expect(strip(html)).toBe(strip(TEMPLATE));
    expect(html).toContain('<link rel="canonical" href="https://theclearsky.github.io/clearsky-academy/chapter/cbse-09-mathematics/1" />');
    expect(html).toContain('<meta property="og:url" content="https://theclearsky.github.io/clearsky-academy/chapter/cbse-09-mathematics/1" />');
    expect(html).toContain('<meta property="og:image" content="https://theclearsky.github.io/clearsky-academy/og/clearsky-academy.jpg" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toMatch(/<meta name="description" content="CBSE Class 9 Mathematics, chapter 1: Number System\./);
    expect(html).not.toContain('application/ld+json');
  });

  it('adds VideoObject JSON-LD to a topic with a video, safe inside its script element', () => {
    const entry = TOPICS.find((candidate) => candidate.youtube)!;
    const page = byPath(`/chapter/${entry.doc}/${entry.chapter}/topic/${entry.topic}`);
    const html = pageHtml(TEMPLATE, page, SITE);
    const json = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)?.[1];
    expect(json).toBeDefined();
    const data = JSON.parse(json!);
    expect(data).toMatchObject({ '@type': 'VideoObject', name: entry.title, embedUrl: `https://www.youtube.com/embed/${entry.youtube}` });
    expect(data.thumbnailUrl[0]).toBe(`https://i.ytimg.com/vi/${entry.youtube}/maxresdefault.jpg`);
    expect(html).toContain(`<meta property="og:image" content="https://i.ytimg.com/vi/${entry.youtube}/maxresdefault.jpg" />`);
  });

  it('escapes text in attributes and in JSON-LD', () => {
    const page: SitePage = { kind: 'topic', path: '/chapter/x/1/topic/1', title: 'A "quoted" <b> & \'it\'', shareTitle: '</script><x>', description: 'd', video: { youtube: 'abc', name: '</script><script>alert(1)</script>', description: 'd' } };
    const html = pageHtml(TEMPLATE, page, SITE);
    expect(html).toContain('<title>A &quot;quoted&quot; &lt;b&gt; &amp; &#39;it&#39;</title>');
    expect(html).toContain('content="&lt;/script&gt;&lt;x&gt;"');
    expect(html.match(/<\/script>/g)).toHaveLength(2); // the module script's and the JSON-LD's own
  });

  it('puts the landing under the site root and adds the WebSite JSON-LD there', () => {
    const html = pageHtml(TEMPLATE, byPath('/'), SITE);
    expect(html).toContain(`<link rel="canonical" href="${SITE}" />`);
    expect(html).toContain('"@type":"WebSite"');
  });

  it('refuses an already prerendered page and a page without exactly one title', () => {
    const once = pageHtml(TEMPLATE, byPath('/'), SITE);
    expect(() => pageHtml(once, byPath('/'), SITE)).toThrow(/already been prerendered/);
    expect(() => pageHtml(TEMPLATE.replace(/<title>.*<\/title>/, ''), byPath('/'), SITE)).toThrow(/exactly one <title>/);
  });

  it('marks the 404 page noindex and leaves the rest of it alone', () => {
    const html = notFoundHtml(TEMPLATE);
    expect(html).toContain('<title>ClearSky Academy</title>\n    <meta name="robots" content="noindex" />');
    expect(html.replace('\n    <meta name="robots" content="noindex" />', '')).toBe(TEMPLATE);
  });
});

describe('site URL, sitemap and robots', () => {
  it('builds the site URL from the base path', () => {
    expect(siteUrlFrom('/clearsky-academy/')).toBe(SITE);
    expect(siteUrlFrom('/', 'http://127.0.0.1:5194/')).toBe('http://127.0.0.1:5194/');
    expect(() => siteUrlFrom('clearsky-academy')).toThrow(/start and end/);
    expect(pageUrl(SITE, '/chapter/a/1/topic/2')).toBe(`${SITE}chapter/a/1/topic/2`);
  });

  it('lists every page once in the sitemap', () => {
    const xml = sitemapXml(pages, SITE);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
    const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toHaveLength(pages.length);
    expect(locs[0]).toBe(SITE);
    expect(locs).toContain(`${SITE}chapter/cbse-09-mathematics/1/topic/1`);
    expect(locs.length).toBeLessThan(50000);
  });

  it('points robots.txt at the sitemap', () => {
    expect(robotsTxt(SITE)).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
  });
});
