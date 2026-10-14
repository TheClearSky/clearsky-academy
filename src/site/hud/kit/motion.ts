import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Small motion helpers shared by the HUD designs (TECHNIQUES.md §3.7, §3.16,
 * §4.4). Every one honours reduced motion by jumping to the end state.
 */

/** True once the element has come within 100 px of the screen (sticky: a
 *  boot-in plays once), and `visible` while it is on screen (loops pause off it). */
function useInView(ref: RefObject<Element | null>): { entered: boolean; visible: boolean } {
  const [state, setState] = useState({ entered: false, visible: false });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setState({ entered: true, visible: true });
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setState((previous) => ({ entered: previous.entered || entry.isIntersecting, visible: entry.isIntersecting })),
      { rootMargin: '100px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return state;
}

const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;

/** A number that counts up to `target` over `duration` ms once `run` is true
 *  (and again from its current value whenever the target changes). */
function useCountUp(target: number, run: boolean, reducedMotion: boolean, duration = 900): number {
  const [value, setValue] = useState(reducedMotion ? target : 0);
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    if (reducedMotion) {
      setValue(target);
      return undefined;
    }
    if (!run) return undefined;
    const from = valueRef.current;
    if (from === target) return undefined;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(from + (target - from) * easeOutCubic(p));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, run, reducedMotion, duration]);
  return value;
}

const SCRAMBLE_GLYPHS = '!<>-_\\/[]{}=+*^?#ABCDEF0123456789';

/** Text that decodes from random glyphs into `text` once `run` is true
 *  (left to right over `duration` ms). Render it `aria-hidden` beside an
 *  sr-only copy of the real text (or inside an element that carries it). */
function useScramble(text: string, run: boolean, reducedMotion: boolean, duration = 700): string {
  const [shown, setShown] = useState(reducedMotion ? text : '');
  useEffect(() => {
    if (reducedMotion) {
      setShown(text);
      return undefined;
    }
    if (!run) return undefined;
    const start = performance.now();
    let frame = 0;
    let last = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // ~30 updates a second is plenty for glyph noise.
      if (now - last > 33 || p >= 1) {
        last = now;
        const settled = Math.floor(text.length * p);
        let out = text.slice(0, settled);
        for (let index = settled; index < text.length; index++) out += text[index] === ' ' ? ' ' : SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];
        setShown(out);
      }
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text, run, reducedMotion, duration]);
  return shown;
}

export { useCountUp, useInView, useScramble };
