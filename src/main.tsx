import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { basenameFrom, routes } from './routes';
import { reloadOnceForNewDeploy } from './staleDeploy';
// Sets `<html data-theme='light'>` on every page (the theme is fixed: `theme.ts`).
import './theme';

// A reload or a fresh visit starts at the top of the page: the browser does not restore the old scroll
// (Deepak, 2026-10-17: a reload after coming back from a chapter jumped to the progress HUD). Coming
// back from a chapter is the one time the landing scrolls itself (`chapter/chapterPath.ts`).
window.history.scrollRestoration = 'manual';

// A preloaded code file of an older deploy is gone (Vite's preload helper
// reports it here before the import fails): reload once onto the new deploy.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForNewDeploy()) event.preventDefault();
});

// Under a sub-path on GitHub Pages (`vite.config.ts` base); '/' locally.
const router = createBrowserRouter(routes, { basename: basenameFrom(import.meta.env.BASE_URL) });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
