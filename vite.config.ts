import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * A LINKED LIBRARY'S REBUILD RELOADS THE PAGE — it is never hot-swapped.
 *
 * Carried over from Nodestra (`nodestra/vite.config.ts`), where it was
 * measured on 2026-09-27: hot-swapping an `npm link`ed library left the app
 * holding OLD and NEW copies of it at once (two document stores, one of them
 * empty), and the autosave then wrote the empty one over the open file. A
 * full reload boots one consistent copy of everything instead. It waits until
 * the build has finished writing: the build empties dist/ first, and a reload
 * into a half-written dist 404s.
 *
 * It only matters while the library is `npm link`ed into this checkout;
 * with the npm package installed it never fires.
 */
function reloadOnLinkedLibraryBuild(): Plugin {
  const linkedDists = ['easy-tutorial-builder/dist/'];
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    name: 'reload-on-linked-library-build',
    apply: 'serve',
    handleHotUpdate({ file, server }) {
      const normalized = file.replaceAll('\\', '/');
      const dist = linkedDists.find((marker) => normalized.includes(marker));
      if (dist === undefined) return undefined;
      const root = normalized.slice(0, normalized.indexOf(dist) + dist.length);
      clearTimeout(timer);
      const reloadWhenBuilt = (attempt: number) => {
        // The ES entry is written last-ish; its presence (plus a quiet
        // period) means the build is done.
        const built = ['index.d.ts', 'style.css'].some((name) =>
          existsSync(root + name),
        );
        if (built || attempt > 40) {
          server.ws.send({ type: 'full-reload' });
          return;
        }
        timer = setTimeout(() => reloadWhenBuilt(attempt + 1), 250);
      };
      timer = setTimeout(() => reloadWhenBuilt(0), 800);
      // Swallow the hot update: no module is swapped.
      return [];
    },
  };
}

/**
 * THE STUDIO'S "SAVE TO media/voice" — dev server only (`apply: 'serve'`;
 * the build never has it). The voice-over panel (`src/studio/voice/`)
 * POSTs its WAV mixdown to `/__studio/voice/<slug>` and this writes it to
 * `media/voice/<slug>.voice.wav` (git-ignored), ready for
 * `npm run video:voice -- <slug> media/voice/<slug>.voice.wav`.
 *
 * Guarded, because a dev server listens on the machine: the slug must be
 * [a-z0-9-] (no path can be built from it), the body must be a RIFF/WAVE
 * file of at most 200 MB (about 23 minutes of 48 kHz 24-bit mono), the
 * Content-Type must be audio/wav (not a "simple" type, so a cross-site
 * page cannot send it without a CORS preflight, which Vite refuses for
 * other origins), and an Origin, if sent, must be this server's own. The
 * file is written beside its target and renamed, so a half-written WAV
 * never replaces a good one.
 */
function studioVoiceSave(): Plugin {
  const route = /^\/__studio\/voice\/([^/?#]*)(?:[?#].*)?$/;
  const maxBytes = 200 * 1024 * 1024;
  return {
    name: 'studio-voice-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = route.exec(request.url ?? '');
        if (!match) return next();
        const reply = (status: number, body: Record<string, unknown>) => {
          response.statusCode = status;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(body));
        };
        if (request.method !== 'POST') return reply(405, { error: 'POST a WAV file' });
        const slug = match[1];
        if (!/^[a-z0-9-]{1,80}$/.test(slug)) return reply(400, { error: 'the slug must be lower-case letters, digits and dashes' });
        const origin = request.headers.origin;
        if (origin && origin !== 'null') {
          try {
            if (new URL(origin).host !== request.headers.host) return reply(403, { error: 'cross-origin request refused' });
          } catch {
            return reply(403, { error: 'bad Origin header' });
          }
        }
        if (!/^audio\/(?:x-)?wav(?:$|[;\s])/i.test(request.headers['content-type'] ?? '')) return reply(415, { error: 'Content-Type must be audio/wav' });
        const declared = Number(request.headers['content-length'] ?? 0);
        if (declared > maxBytes) return reply(413, { error: 'the WAV is larger than 200 MB' });
        const chunks: Buffer[] = [];
        let received = 0;
        let refused = false;
        request.on('data', (chunk: Buffer) => {
          if (refused) return;
          received += chunk.length;
          if (received > maxBytes) {
            refused = true;
            reply(413, { error: 'the WAV is larger than 200 MB' });
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        request.on('end', () => {
          if (refused) return;
          const body = Buffer.concat(chunks);
          if (body.length < 44 || body.toString('ascii', 0, 4) !== 'RIFF' || body.toString('ascii', 8, 12) !== 'WAVE') return reply(400, { error: 'the body is not a WAV file' });
          const directory = join(server.config.root, 'media', 'voice');
          const target = join(directory, `${slug}.voice.wav`);
          const partial = `${target}.partial`;
          mkdir(directory, { recursive: true })
            .then(() => writeFile(partial, body))
            .then(() => rename(partial, target))
            .then(() => reply(200, { path: `media/voice/${slug}.voice.wav`, bytes: body.length }))
            .catch((error: unknown) => reply(500, { error: error instanceof Error ? error.message : String(error) }));
        });
        request.on('error', () => {
          if (!refused) reply(400, { error: 'the upload failed' });
          refused = true;
        });
      });
    },
  };
}

/** GitHub Pages serves the site under /<repo>/; the Pages workflow passes
 *  that as BASE_PATH. Locally (dev, preview, tests) it is the root. It must
 *  be an absolute path with a slash at each end: a relative base breaks the
 *  router's basename, and an empty one is relative. */
function basePath(): string {
  const base = process.env.BASE_PATH || '/';
  if (!/^\/(?:.*\/)?$/.test(base)) {
    throw new Error(`BASE_PATH must start and end with "/" (got "${base}")`);
  }
  return base;
}

/**
 * THE SOURCES' CONTENT HASH (`virtual:source-hash`, 2026-11-05): the city lab's build cache
 * (`src/topics/videoKit/anime/city/paint/cache.ts`) keys every stored build by it, so a cached city is only
 * ever read back by the very code that built it. It hashes the WHOLE `src/` tree's code (every .ts, .tsx,
 * .js, .mjs, .json, .glsl and .css file, path and content), not a list of the files that seem to matter,
 * plus three's version: an edit anywhere is a new key. Tests (`__tests__/`, `*.test.*`) are left out: the page
 * never loads them, and a test edit must not throw the cached city away. In dev it is recomputed after any change under
 * `src/` (the module is invalidated; the page loads the new value with its next reload).
 */
function sourceHash(): Plugin {
  const id = 'virtual:source-hash';
  const resolved = `\0${id}`;
  const src = fileURLToPath(new URL('./src', import.meta.url));
  const code = /\.(?:ts|tsx|js|mjs|json|glsl|css)$/;
  const test = /\.test\.[^.]+$/;
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : files(path);
        return code.test(entry.name) && !test.test(entry.name) ? [path] : [];
      })
      .sort();
  const hash = () => {
    const h = createHash('sha256');
    const three = JSON.parse(readFileSync(fileURLToPath(new URL('./node_modules/three/package.json', import.meta.url)), 'utf8')).version;
    h.update(`three ${three}\0`);
    for (const file of files(src)) {
      h.update(relative(src, file).replaceAll('\\', '/'));
      h.update('\0');
      h.update(readFileSync(file));
      h.update('\0');
    }
    return h.digest('hex').slice(0, 20);
  };
  return {
    name: 'source-hash',
    resolveId: (source) => (source === id ? resolved : undefined),
    load: (loaded) => (loaded === resolved ? `export const SOURCE_HASH = ${JSON.stringify(hash())};` : undefined),
    configureServer(server) {
      const bust = (file: string) => {
        if (!resolve(file).startsWith(src) || /[\\/]__tests__[\\/]|\.test\.[^.\\/]+$/.test(file)) return;
        const module = server.moduleGraph.getModuleById(resolved);
        if (module) server.moduleGraph.invalidateModule(module);
      };
      for (const event of ['add', 'change', 'unlink'] as const) server.watcher.on(event, bust);
    },
  };
}

export default defineConfig({
  base: basePath(),
  // Tailwind v4 through its Vite plugin — no config file, no PostCSS file;
  // the tokens live in `src/index.css` (the host's arrangement).
  plugins: [react(), tailwindcss(), reloadOnLinkedLibraryBuild(), studioVoiceSave(), sourceHash()],
  server: {
    // `review/` holds tens of thousands of rendered frames and videos. Watching them left a long-running dev server at
    // 10 GB and 55,000 handles (Deepak's go-ahead to change this, 2026-11-09). Its files are still served; an open page
    // just won't notice an edit to a file in there until the dev server restarts. Renders start their own server.
    watch: { ignored: ['**/review/**'] },
  },
  resolve: {
    // LOAD-BEARING (learned in Nodestra): a linked library resolving its own
    // copy of React or zod mounts a SECOND instance — hooks crash and zod
    // schema identity breaks. Deduping pins ONE copy of each — this app's —
    // for dev and build alike.
    dedupe: ['react', 'react-dom', 'zod'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
