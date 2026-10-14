import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import './parts.css';

/**
 * Shared HUD parts, lifted from the round-1 designs Deepak liked (review
 * round 2, "parts bin"), so the round-2 iterations and mixes reuse ONE copy:
 *
 *  - `TitleCard`  — Consensus's paper title card ("amazing header").
 *  - `WaxSeal`    — Codex's crimson wax seal and its stamp ("loved the stamp
 *                   that comes when progress happens, the red icon").
 *  - `Crystal`    — Sphere's blue-white crystal token ("especially the crystal").
 *  - `CountUp`    — a number that counts up in a LEAF (it writes its own text,
 *                   so the design around it does not re-render every frame —
 *                   review X2).
 *
 * Every SVG paint id comes from `useId`, so two parts on one page never share
 * one (review X8.5). Styles are in `parts.css` under `.hud-*` classes; the
 * motion honours `data-reduced` on any ancestor and the reduced-motion query.
 */

/* ── TitleCard ──────────────────────────────────────────────────────── */

type TitleCardProps = {
  /** Vertical strap at the left (decorative, aria-hidden), e.g. runes. */
  strap?: string;
  /** Tiny tracked line above the title (decorative). */
  kicker?: ReactNode;
  /** The heading text (rendered as the `<h2>`). */
  title: string;
  /** A line under the title. */
  sub?: ReactNode;
  /** The big outlined glyph at the right (the course's card rank). */
  rank?: string;
  className?: string;
  style?: CSSProperties;
};

/** A compressed serif line: squeezed to 76 % and its layout width trimmed to
 *  match, so no gap is left after it (the round-1 card left one). */
function Squeeze({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const fit = () => {
      element.style.marginRight = '';
      element.style.marginLeft = '';
      const lost = element.offsetWidth * (1 - 0.76);
      if (align === 'left') element.style.marginRight = `${-lost}px`;
      else element.style.marginLeft = `${-lost}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element.parentElement ?? element);
    return () => observer.disconnect();
  }, [align, children]);
  return (
    <span ref={ref} className='hud-squeeze' style={{ transformOrigin: `${align} center` }}>
      {children}
    </span>
  );
}

function TitleCard({ strap, kicker, title, sub, rank, className, style }: TitleCardProps) {
  return (
    <header className={`hud-titlecard${className ? ` ${className}` : ''}`} style={style}>
      {strap && (
        <span className='hud-titlecard-strap' aria-hidden='true'>
          {strap}
        </span>
      )}
      <div className='hud-titlecard-main'>
        {kicker && (
          <p className='hud-titlecard-kicker' aria-hidden='true'>
            {kicker}
          </p>
        )}
        <h2 className='hud-titlecard-title'>
          <Squeeze>{title}</Squeeze>
        </h2>
        {sub && <p className='hud-titlecard-sub'>{sub}</p>}
      </div>
      {rank && (
        <span className='hud-titlecard-rank' aria-hidden='true'>
          <Squeeze align='right'>{rank}</Squeeze>
        </span>
      )}
    </header>
  );
}

/* ── WaxSeal ────────────────────────────────────────────────────────── */

/** A wax blob: a circle whose rim wobbles, fixed once. */
const SEAL_PATH = (() => {
  const points: string[] = [];
  const steps = 28;
  for (let step = 0; step < steps; step++) {
    const angle = (step / steps) * Math.PI * 2;
    const radius = 13 + Math.sin(angle * 5) * 0.9 + Math.sin(angle * 9 + 1.3) * 0.6;
    points.push(`${(16 + radius * Math.cos(angle)).toFixed(2)} ${(16 + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join(' L')} Z`;
})();

/** The academy's four-point sparkle ✦ (the landing's star suit) and a five-point star. */
const SEAL_GLYPHS = {
  sparkle: 'M16 9.4 C16.6 13.6 17.4 14.4 21.6 15 C17.4 15.6 16.6 16.4 16 20.6 C15.4 16.4 14.6 15.6 10.4 15 C14.6 14.4 15.4 13.6 16 9.4 Z',
  star: 'M16 10.6 L17.35 14.14 L21.14 14.33 L18.19 16.71 L19.17 20.37 L16 18.3 L12.83 20.37 L13.81 16.71 L10.86 14.33 L14.65 14.14 Z',
} as const;

type WaxSealProps = {
  /** Size in px (default 30). */
  size?: number;
  /** Play the stamp (scale-down slam, squash, settle, flare) — for a REAL
   *  moment (`useProgressMoments`), not on every mount. */
  stamp?: boolean;
  /** Delay before the stamp (ms). */
  delay?: number;
  glyph?: keyof typeof SEAL_GLYPHS;
  /** Wax colours: highlight, body, shadow (default crimson). */
  wax?: [string, string, string];
  className?: string;
};

function WaxSeal({ size = 30, stamp = false, delay = 0, glyph = 'sparkle', wax = ['#d0423a', '#9a1b1f', '#4d0c0c'], className }: WaxSealProps) {
  const id = useId();
  const paint = `hud-wax-${id.replace(/:/g, '')}`;
  return (
    <span className={`hud-seal${className ? ` ${className}` : ''}`} data-stamp={stamp || undefined} style={{ width: size, height: size, '--hud-seal-delay': `${delay}ms` } as CSSProperties} aria-hidden='true'>
      {stamp && <span className='hud-seal-flare' />}
      <svg viewBox='0 0 32 32' className='hud-seal-art'>
        <defs>
          <radialGradient id={paint} cx='38%' cy='34%' r='75%'>
            <stop offset='0' stopColor={wax[0]} />
            <stop offset='.55' stopColor={wax[1]} />
            <stop offset='1' stopColor={wax[2]} />
          </radialGradient>
        </defs>
        <path d={SEAL_PATH} fill={`url(#${paint})`} />
        <circle cx='16' cy='16' r='9.2' fill='none' stroke='#5a0f10' strokeWidth='1.1' />
        <circle cx='16' cy='16' r='7.6' fill='none' stroke='#e0786d' strokeOpacity='.5' strokeWidth='.6' />
        {/* The glyph pressed into the wax: a dark impression with a lit lower edge. */}
        <path d={SEAL_GLYPHS[glyph]} fill='#f09a8e' fillOpacity='.45' transform='translate(.45 .6)' />
        <path d={SEAL_GLYPHS[glyph]} fill='#4a0a0b' />
      </svg>
    </span>
  );
}

/* ── Crystal ────────────────────────────────────────────────────────── */

type CrystalProps = {
  /** Height in px (default 22). */
  size?: number;
  /** Drop in, then bob (default true). */
  live?: boolean;
  className?: string;
};

/** The crystal as SVG paths centred on (0, 0), 18 high — for use inside an
 *  SVG (`<g transform=…><CrystalShape /></g>`). */
function CrystalShape() {
  return (
    <g className='hud-crystal-shape'>
      <path d='M0 -9 L6.5 0 L0 9 L-6.5 0 Z' className='hud-crystal-gem' />
      <path d='M0 -9 L6.5 0 L0 0 Z' className='hud-crystal-shine' />
      <path d='M0 0 L-6.5 0 L0 9 Z' className='hud-crystal-shade' />
    </g>
  );
}

/** The crystal as an inline element (an `<svg>` of its own). */
function Crystal({ size = 22, live = true, className }: CrystalProps) {
  return (
    <span className={`hud-crystal${className ? ` ${className}` : ''}`} data-live={live || undefined} style={{ height: size, width: size * 0.8 }} aria-hidden='true'>
      <svg viewBox='-8 -11 16 22' width='100%' height='100%' overflow='visible'>
        <CrystalShape />
      </svg>
    </span>
  );
}

/* ── CountUp ────────────────────────────────────────────────────────── */

type CountUpProps = {
  value: number;
  /** Start counting (e.g. once scrolled into view). */
  run: boolean;
  reducedMotion: boolean;
  duration?: number;
  format?: (value: number) => string;
  className?: string;
};

const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;

/** A number that counts up to `value`, writing its own text through a ref
 *  (no React state per frame). Decorative: give the true value in text or
 *  an accessible name nearby. */
function CountUp({ value, run, reducedMotion, duration = 1000, format = (shown) => String(Math.round(shown)), className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shownRef = useRef(reducedMotion ? value : 0);
  const formatRef = useRef(format);
  formatRef.current = format;
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const write = (shown: number) => {
      shownRef.current = shown;
      element.textContent = formatRef.current(shown);
    };
    if (reducedMotion) {
      write(value);
      return undefined;
    }
    if (!run) {
      write(shownRef.current);
      return undefined;
    }
    const from = shownRef.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      write(from + (value - from) * easeOutCubic(p));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, run, reducedMotion, duration]);
  return (
    <span ref={ref} className={className} aria-hidden='true'>
      {format(reducedMotion ? value : shownRef.current)}
    </span>
  );
}

export { CountUp, Crystal, CrystalShape, SEAL_GLYPHS, Squeeze, TitleCard, WaxSeal };
