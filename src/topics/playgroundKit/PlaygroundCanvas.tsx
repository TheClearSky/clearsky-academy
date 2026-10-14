import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * One three.js canvas for a topic's playground (`contract.ts`): it owns the
 * renderer and its lifetime so a playground only writes its scene.
 *
 *   setup(ctx) → { update(t, dt), resize?(w, h), dispose() }
 *
 * - `setup` runs once per mount (it should read live control values from
 *   refs, not be re-created per render — the canvas does not re-run it).
 * - `update` runs every frame while the canvas is `active` and on screen,
 *   with `t` in seconds since mount; with reduced motion it still runs
 *   (a playground follows its controls), but should not idle-animate.
 * - The renderer is sized to the element (DPR capped at 2), disposed on
 *   unmount, and a lost WebGL context shows a plain message, not a crash.
 * - No WebGL at all: the message says so.
 */

type SetupContext = { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement; width: number; height: number };
type PlaygroundScene = { update(t: number, dt: number): void; resize?(width: number, height: number): void; dispose(): void };

type PlaygroundCanvasProps = {
  active: boolean;
  reducedMotion: boolean;
  /** What the canvas shows, for screen readers (the controls carry the values). */
  label: string;
  /** Width / height (default 16 / 10). */
  aspect?: number;
  setup: (context: SetupContext) => PlaygroundScene;
};

function PlaygroundCanvas({ active, label, aspect = 16 / 10, setup }: PlaygroundCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setupRef = useRef(setup);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (error) {
      console.warn('[playground] no WebGL', error);
      setFailure('This playground needs WebGL, which this browser has turned off.');
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const size = () => ({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) });
    let { width, height } = size();
    renderer.setSize(width, height, false);
    const scene = setupRef.current({ renderer, canvas, width, height });

    let visible = true;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(host);
    const ro = new ResizeObserver(() => {
      ({ width, height } = size());
      renderer.setSize(width, height, false);
      scene.resize?.(width, height);
    });
    ro.observe(host);

    const onLost = (event: Event) => {
      event.preventDefault();
      setFailure('The 3D view was interrupted. Close and reopen the topic to restart it.');
    };
    canvas.addEventListener('webglcontextlost', onLost);

    const start = performance.now();
    let last = start;
    let frame = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!activeRef.current || !visible) return;
      scene.update((now - start) / 1000, dt);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      scene.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={hostRef} className='pg-canvas' style={{ aspectRatio: String(aspect) }}>
      <canvas ref={canvasRef} role='img' aria-label={label} />
      {failure && <p className='pg-failure'>{failure}</p>}
    </div>
  );
}

export { PlaygroundCanvas };
export type { PlaygroundCanvasProps, PlaygroundScene, SetupContext };
