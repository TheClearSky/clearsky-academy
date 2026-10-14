import { describe, expect, it } from 'vitest';
import { matchRoutes } from 'react-router';
import { basenameFrom, routes } from '../routes';

/** The leaf route a URL resolves to (the root layout is always matched first). */
function leaf(url: string) {
  const matches = matchRoutes(routes, url);
  return matches?.[matches.length - 1]?.route;
}

describe('site routes', () => {
  it('serves the landing page at /', () => {
    const route = leaf('/');
    expect(route?.index).toBe(true);
    expect(typeof route?.lazy).toBe('function');
  });

  it('routes a chapter page by syllabus and number', () => {
    expect(leaf('/chapter/cbse-11-physics/2')?.path).toBe('chapter/:documentId/:number/topic?/:topic?');
    expect(leaf('/chapter/cbse-11-physics/2/topic/3')?.path).toBe('chapter/:documentId/:number/topic?/:topic?');
  });

  it('sends any other path home', () => {
    for (const url of ['/nope', '/learn', '/learn/extra', '/app', '/landing']) expect(leaf(url)?.path).toBe('*');
  });

  it('never loads a page eagerly (every page is code-split)', () => {
    const children = routes[0].children ?? [];
    expect(children.filter((route) => route.lazy).map((route) => route.path ?? 'index')).toEqual(['index', 'chapter/:documentId/:number/topic?/:topic?']);
    expect(children.some((route) => route.Component)).toBe(false);
  });
});

describe('basenameFrom', () => {
  it('strips the trailing slash of a sub-path base', () => {
    expect(basenameFrom('/clearsky-academy/')).toBe('/clearsky-academy');
  });

  it('keeps the root as the root', () => {
    expect(basenameFrom('/')).toBe('/');
  });

  it('refuses a relative base', () => {
    expect(() => basenameFrom('./')).toThrow(/absolute path/);
  });
});
