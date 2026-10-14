import { useEffect, useState } from 'react';
import { Navigate, useRouteError } from 'react-router';
import type { RouteObject } from 'react-router';
import { isStaleChunkError, reloadOnceForNewDeploy } from './staleDeploy';

/**
 * The site's routes.
 *
 *   /       the landing page — the 3D hero and what the site teaches
 *   /chapter/<document>/<n>  one chapter's topics on the Crystal Line
 *   /chapter/<document>/<n>/topic/<t>  a topic's modal over it (video + playground)
 *   *       anything else goes home
 *
 * Both pages are lazy, so the landing page never downloads the chapter page
 * and the chapter page never downloads the landing page's scene.
 */
function Blank() {
  return <div className='h-full bg-primary-black' />;
}

/** Any page that fails to load or render. Code missing after a deploy (a
 *  page loaded before it) reloads once, which fetches the new deploy;
 *  anything else says so plainly, with a way back. */
function RouteError() {
  const error = useRouteError();
  const [reloading] = useState(() => isStaleChunkError(error) && reloadOnceForNewDeploy());
  useEffect(() => {
    if (!reloading) console.error('[site] a page failed', error);
  }, [error, reloading]);
  if (reloading) return <Blank />;
  return (
    <div role='alert' className='flex h-full flex-col items-center justify-center gap-4 bg-primary-black px-6 text-center text-primary-white'>
      <p className='text-[18px]'>Something went wrong loading this page.</p>
      <p className='max-w-md text-[14px] text-primary-white/60'>Reloading usually fixes it.</p>
      <button
        type='button'
        onClick={() => location.reload()}
        className='cursor-pointer rounded-full border border-accent-gold/40 bg-white/8 px-5 py-2 text-[14px] hover:bg-white/16 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-gold'
      >
        Reload
      </button>
    </div>
  );
}

/** The router's basename for Vite's `BASE_URL`: '/clearsky-academy/' →
 *  '/clearsky-academy', '/' → '/'. A relative base ('./') has no basename to
 *  give: it is refused (`vite.config.ts` validates BASE_PATH too). */
function basenameFrom(baseUrl: string): string {
  if (!baseUrl.startsWith('/')) throw new Error(`[site] the base must be an absolute path, not "${baseUrl}"`);
  return baseUrl.replace(/\/+$/, '') || '/';
}

const routes: RouteObject[] = [
  {
    path: '/',
    HydrateFallback: Blank,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('./site/LandingPage')).LandingPage }),
      },
      {
        // The optional tail is a topic's modal over the page (`chapter/TopicModal.tsx`).
        path: 'chapter/:documentId/:number/topic?/:topic?',
        lazy: async () => ({ Component: (await import('./chapter/ChapterPage')).ChapterPage }),
      },
      { path: '*', element: <Navigate to='/' replace /> },
    ],
  },
];

export { basenameFrom, routes };
