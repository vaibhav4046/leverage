'use client';

import dynamic from 'next/dynamic';

/**
 * The two canvases are decoration with nothing to hydrate: no text, no state
 * the server could render. Loading them client-only, after the page is
 * interactive, keeps their chunks and their first frames out of the path
 * between first paint and a usable page. Both render a static frame first and
 * pause off-screen, so nothing about them changes once they arrive.
 */
export const AuroraField = dynamic(() => import('./aurora-field').then((m) => m.AuroraField), {
  ssr: false,
});

export const WorkforceOrbit = dynamic(
  () => import('./workforce-orbit').then((m) => m.WorkforceOrbit),
  { ssr: false },
);
