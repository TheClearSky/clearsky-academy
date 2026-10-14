import { existsSync } from 'node:fs';
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

export default defineConfig({
  base: basePath(),
  // Tailwind v4 through its Vite plugin — no config file, no PostCSS file;
  // the tokens live in `src/index.css` (the host's arrangement).
  plugins: [react(), tailwindcss(), reloadOnLinkedLibraryBuild()],
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
