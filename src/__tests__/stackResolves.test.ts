import { describe, expect, it } from 'vitest';

/**
 * The libraries this app carries over from Nodestra's stack resolve and
 * expose their entry points. Nothing in the app uses some of them yet; this
 * keeps a broken install or a renamed export from hiding until the first
 * feature that needs one.
 */
describe('carried-over stack', () => {
  it('easy-tutorial-builder (guided tours)', async () => {
    const tutorials = await import('@theclearsky/easy-tutorial-builder');
    expect(typeof tutorials.createTutorial).toBe('function');
  });

  it('headless-tree, radix context menu, three, zod', async () => {
    const [tree, contextMenu, three, zod] = await Promise.all([
      import('@headless-tree/core'),
      import('@radix-ui/react-context-menu'),
      import('three'),
      import('zod'),
    ]);
    expect(typeof tree.syncDataLoaderFeature).toBe('object');
    expect(contextMenu.Root).toBeDefined();
    expect(typeof three.WebGLRenderer).toBe('function');
    expect(typeof zod.z.object).toBe('function');
  });
});
