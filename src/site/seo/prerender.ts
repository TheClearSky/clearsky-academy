// npx vite-node src/site/seo/prerender.ts [-- <outDir, default dist>]   (run by `npm run build`, after `vite build`)
// (It lives in src/, not scripts/, because scripts/ is local-only (.gitignore) and CI must run it.)
//
// THE SITE'S ADDRESSES ANSWER 200 (2026-11-18; `.claude/research/growth/PLAYBOOK.md` R4.1). GitHub Pages has no
// rewrites, so every address but `/` used to be answered by 404.html (the SPA booted, with HTTP 404) and Google
// would not index it. This writes, for EVERY address the app serves (`src/site/seo/sitePages.ts` › sitePages: the
// landing, every chapter page, every topic page), a copy of the built index.html with that address's own head
// (title, description, canonical, Open Graph / Twitter card, VideoObject JSON-LD for a topic with a video), as
// `<path>.html` (served at `<path>` with no redirect) and `<path>/index.html` (served at `<path>/`). Same JS, same
// CSS, same body: the app boots exactly as before. Also writes sitemap.xml, robots.txt and 404.html (the untouched
// template + noindex, for unknown addresses; the SPA still boots from it and sends them home).
//
// Base-path aware: BASE_PATH (the Pages workflow passes /<repo>/; default /) as in vite.config.ts; SITE_ORIGIN
// overrides https://theclearsky.github.io. Revert: drop `&& vite-node src/site/seo/prerender.ts` from the
// "build" script in package.json (the Pages workflow then copies index.html to 404.html as before).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { syllabi } from '../../curriculum/syllabi';
import { notFoundHtml, pageFiles, pageHtml, robotsTxt, sitemapXml, sitePages, siteUrlFrom } from './sitePages';
import { playgroundLoader, TOPICS } from '../../topics/registry';

const outDir = resolve(process.argv.slice(2).filter((arg) => arg !== '--')[0] ?? 'dist');
const indexPath = join(outDir, 'index.html');
if (!existsSync(indexPath)) throw new Error(`[prerender] ${indexPath} is missing: run \`vite build\` first`);

const template = readFileSync(indexPath, 'utf8');
const siteUrl = siteUrlFrom(process.env.BASE_PATH || '/', process.env.SITE_ORIGIN || undefined);
// The built page must load its code from this base, or the copies would not boot.
const base = new URL(siteUrl).pathname;
if (!template.includes(`src="${base}assets/`)) throw new Error(`[prerender] the built index.html does not load its code from ${base}assets/: was it built with the same BASE_PATH?`);

const pages = sitePages(syllabi, TOPICS, (slug) => playgroundLoader(slug) !== undefined);
const write = (file: string, text: string) => {
  const path = join(outDir, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

// 404.html first, from the untouched template (index.html is rewritten below).
write('404.html', notFoundHtml(template));
let files = 0;
for (const page of pages) {
  const html = pageHtml(template, page, siteUrl);
  for (const file of pageFiles(page.path)) {
    write(file, html);
    files++;
  }
}
write('sitemap.xml', sitemapXml(pages, siteUrl));
write('robots.txt', robotsTxt(siteUrl));

const count = (kind: string) => pages.filter((page) => page.kind === kind).length;
console.log(
  `[prerender] ${pages.length} pages (${count('home')} home, ${count('chapter')} chapters, ${count('topic')} topics, ${pages.filter((page) => page.video).length} with a video) -> ${files} files + 404.html, sitemap.xml, robots.txt in ${outDir} for ${siteUrl}`,
);
