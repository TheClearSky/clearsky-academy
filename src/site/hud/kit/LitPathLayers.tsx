import { useEffect, useId, useLayoutEffect, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useInView } from './motion';
import { easeCss, RACE_EASE } from './litPath';
import type { Ease, Trace } from './litPath';

/**
 * THE LIT PATH, drawn (pure maths in `litPath.ts`). The six layers of the
 * round-2 recipe (REFERENCES-R2 §2.1), bottom to top:
 *
 *   1. bed     a dark engraved groove            (always)
 *   2. thread  the dormant 1 px line             (always)
 *   3. halo    a wide, soft ice-blue bloom   ┐
 *   4. glow    a narrower bright bloom       │  lit by what is learnt
 *   5. core    a gold under-stroke + a white-hot beam ┘  (`dashFor`)
 *   6. motes   small lights drifting to the frontier (idle), and a comet
 *              that races the whole path on the entrance (and on moments).
 *              The comet's head is an `offset-path` element; its TAIL is
 *              drawn ON the path (dashes of the trace sliding along it), so
 *              it bends round corners with the rail (Deepak, 2026-10-17: a
 *              straight tail stuck out of the bends).
 *
 * The entrance is ONE eased draw: a mask path reveals the lit layers while
 * the bed and thread draw on with the same timing and the comet rides the
 * leading edge (`offset-path`, same easing). Nodes pop on `arrivalMs`.
 * There is NO infinite `stroke-dashoffset` loop (review X3): the idle flow
 * is three motes moved by `offset-distance` (transform-level) with opacity.
 *
 * Tones are CSS custom properties on any ancestor (`--lp-*`, see the CSS).
 * The engine's CSS is hoisted once by React (`<style href precedence>`).
 */

const LIT_PATH_CSS = `
.lp{position:absolute;left:0;top:0;pointer-events:none}
.lp>svg{position:absolute;left:0;top:0;overflow:visible}
.lp-bed,.lp-thread,.lp-halo,.lp-glow,.lp-under,.lp-core,.lp-reveal{fill:none;stroke-linejoin:round}
.lp-bed{stroke:var(--lp-bed,#140f2e);stroke-width:var(--lp-bed-w,9px);stroke-linecap:round}
.lp-thread{stroke:var(--lp-thread,#3a2f6b);stroke-width:var(--lp-thread-w,1.4px);stroke-linecap:round}
.lp-halo{stroke:var(--lp-halo,#8fd3ff);stroke-opacity:var(--lp-halo-o,.14);stroke-width:var(--lp-halo-w,18px)}
.lp-glow{stroke:var(--lp-glow,#a9dcff);stroke-opacity:var(--lp-glow-o,.32);stroke-width:var(--lp-glow-w,7px)}
.lp-under{stroke:var(--lp-under,#e9d3a8);stroke-width:var(--lp-under-w,3.6px)}
.lp-core{stroke:var(--lp-core,#fbf8ff);stroke-width:var(--lp-core-w,1.6px)}
.lp-reveal{stroke:#fff;stroke-width:var(--lp-reveal-w,44px);stroke-linecap:round}
.lp[data-entrance] .lp-reveal,.lp[data-entrance] .lp-bed,.lp[data-entrance] .lp-thread{stroke-dasharray:1;stroke-dashoffset:1}
.lp[data-entrance][data-play] .lp-reveal,.lp[data-entrance][data-play] .lp-bed,.lp[data-entrance][data-play] .lp-thread{animation:lp-draw var(--lp-race) var(--lp-ease) both}
.lp-comet,.lp-burst{position:absolute;left:0;top:0;width:var(--lp-comet-len,64px);height:3px;offset-rotate:auto;offset-anchor:100% 50%;opacity:0}
.lp-trail{fill:none;stroke-linecap:round;opacity:0}
.lp-trail-tail{stroke:var(--lp-comet-tail,rgb(190 196 249 / .55));stroke-opacity:.45;stroke-width:3px}
.lp-trail-mid{stroke:var(--lp-comet-tail,rgb(190 196 249 / .55));stroke-width:3px}
.lp-trail-hot{stroke:#fff;stroke-width:2.4px}
.lp[data-entrance][data-play] .lp-trail-race{animation:lp-trail var(--lp-race) var(--lp-ease) both}
.lp[data-play] .lp-trail-burst{animation:lp-trail-burst var(--lp-burst-ms,1000ms) cubic-bezier(.45,0,.2,1) var(--lp-delay,0ms) both}
.lp-comet::after,.lp-burst::after{content:'';position:absolute;right:-6px;top:50%;width:13px;height:13px;margin-top:-6.5px;border-radius:50%;background:radial-gradient(circle,#fff 0 22%,var(--lp-comet-glow,rgb(111 227 255 / .85)) 42%,transparent 70%)}
.lp[data-entrance][data-play] .lp-comet{animation:lp-comet var(--lp-race) var(--lp-ease) both}
.lp[data-play] .lp-burst{animation:lp-burst var(--lp-burst-ms,1000ms) cubic-bezier(.45,0,.2,1) var(--lp-delay,0ms) both}
.lp-mote{position:absolute;left:0;top:0;width:var(--lp-mote-size,7px);height:var(--lp-mote-size,7px);border-radius:50%;offset-rotate:0deg;background:radial-gradient(circle,#fff 0 24%,var(--lp-mote,#f4e2a6) 46%,transparent 72%);opacity:0}
.lp[data-play] .lp-mote{animation:lp-mote var(--lp-mote-ms) linear var(--lp-mote-delay) infinite backwards}
@keyframes lp-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes lp-comet{0%{offset-distance:0%;opacity:1}90%{opacity:1}100%{offset-distance:100%;opacity:0}}
@keyframes lp-burst{0%{offset-distance:var(--lp-from);opacity:0}8%{opacity:1}88%{opacity:1}100%{offset-distance:var(--lp-to);opacity:0}}
@keyframes lp-trail{0%{stroke-dashoffset:var(--lp-o0);opacity:1}90%{opacity:1}100%{stroke-dashoffset:var(--lp-o1);opacity:0}}
@keyframes lp-trail-burst{0%{stroke-dashoffset:var(--lp-o0);opacity:0}8%{opacity:1}88%{opacity:1}100%{stroke-dashoffset:var(--lp-o1);opacity:0}}
@keyframes lp-mote{0%{offset-distance:0%;opacity:0}12%{opacity:var(--lp-mote-o,.9)}86%{opacity:var(--lp-mote-o,.9)}100%{offset-distance:var(--lp-to);opacity:0}}
[data-reduced] .lp-comet,[data-reduced] .lp-burst,[data-reduced] .lp-mote,[data-reduced] .lp-trail{display:none}
@media (prefers-reduced-motion:reduce){.lp-comet,.lp-burst,.lp-mote,.lp-trail{display:none}.lp .lp-reveal,.lp .lp-bed,.lp .lp-thread{animation:none!important;stroke-dasharray:none!important}}
`;

/** One comet for a moment: from → to (px along), after `delay` ms. */
type Burst = { from: number; to: number; delay: number };

/** The comet's tail (px along the path). */
const COMET_PX = 64;
/** The tail's three strokes, all ending at the head: the full tail faint, the
 *  back half's fade, a white-hot stub — together the old bar's gradient. */
const TRAIL_LAYERS = [
  { share: 1, className: 'lp-trail-tail' },
  { share: 0.55, className: 'lp-trail-mid' },
  { share: 0.2, className: 'lp-trail-hot' },
] as const;

/**
 * One trail stroke: a dash of `share` of the tail on the trace (pathLength 1)
 * whose head runs from `from` to `to` (fractions of the path). The dash
 * offset that puts the dash's head at p is c − p (the dash covers p − c … p);
 * running back down the path the tail is ahead in path terms, so −p.
 */
function TrailStroke({ d, tail, from, to, className, style }: { d: string; tail: number; from: number; to: number; className: string; style?: CSSProperties }) {
  const offset = (p: number) => (to >= from ? tail - p : -p).toFixed(5);
  return <path d={d} pathLength={1} className={`lp-trail ${className}`} strokeDasharray={`${tail.toFixed(5)} 2`} style={{ ...style, '--lp-o0': offset(from), '--lp-o1': offset(to) } as CSSProperties} />;
}

type LitPathProps = {
  trace: Trace;
  /** `dashFor(litIntervals(...), trace.length)`. */
  lit: string;
  /** How far the idle motes travel (px along; `litExtent`). 0 → no motes. */
  extent: number;
  width: number;
  height: number;
  /** The design is in view (animations may run). */
  play: boolean;
  /** Play the race (first reveal only — not on a subject switch). */
  entrance: boolean;
  reduced: boolean;
  /** Race duration (ms; `raceMs`). */
  race: number;
  /** The race's easing (default `RACE_EASE`); the pop clock must use the same. */
  ease?: Ease;
  /** Idle motes (default 3; 0 for none). */
  motes?: number;
  /** One-shot comets for moments. */
  bursts?: readonly Burst[];
  /** Drawn under the lit layers (unmasked), e.g. dormant ticks. */
  under?: ReactNode;
  /** Drawn inside the reveal mask with the lit layers, e.g. lit ticks. */
  children?: ReactNode;
  /** Skip the gold under-stroke (a pure-light beam). */
  noUnder?: boolean;
  className?: string;
};

function LitPath({ trace, lit, extent, width, height, play, entrance, reduced, race, ease = RACE_EASE, motes = 3, bursts = [], under, children, noUnder, className }: LitPathProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const mask = `lp-reveal-${id}`;
  const path = `path('${trace.d}')`;
  const length = Math.max(1, trace.length);
  // Idle motes: a slow, constant drift (~55 px/s, 6–20 s a trip), three a loop.
  const moteMs = Math.round(Math.max(6000, Math.min(20000, (extent / 55) * 1000)));
  const startAfter = entrance ? race + 400 : 300;
  const showMotes = !reduced && motes > 0 && extent > 24;
  const style = {
    width,
    height,
    '--lp-race': `${race}ms`,
    '--lp-ease': easeCss(ease),
    '--lp-to': `${((extent / length) * 100).toFixed(2)}%`,
    '--lp-mote-ms': `${moteMs}ms`,
  } as CSSProperties;
  return (
    <div className={`lp${className ? ` ${className}` : ''}`} data-entrance={(entrance && !reduced) || undefined} data-play={play || undefined} style={style} aria-hidden='true'>
      <style href='hud-lit-path' precedence='default'>
        {LIT_PATH_CSS}
      </style>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <mask id={mask} maskUnits='userSpaceOnUse' x={-40} y={-40} width={width + 80} height={height + 80}>
            <path d={trace.d} pathLength={1} className='lp-reveal' />
          </mask>
        </defs>
        <path d={trace.d} pathLength={1} className='lp-bed' />
        <path d={trace.d} pathLength={1} className='lp-thread' />
        {under}
        <g mask={`url(#${mask})`}>
          <path d={trace.d} className='lp-halo' strokeDasharray={lit} />
          <path d={trace.d} className='lp-glow' strokeDasharray={lit} />
          {!noUnder && <path d={trace.d} className='lp-under' strokeDasharray={lit} />}
          <path d={trace.d} className='lp-core' strokeDasharray={lit} />
          {children}
        </g>
        {entrance && !reduced && TRAIL_LAYERS.map((layer) => <TrailStroke key={layer.className} d={trace.d} tail={(COMET_PX * layer.share) / length} from={0} to={1} className={`${layer.className} lp-trail-race`} />)}
        {!reduced &&
          bursts.map((burst, index) =>
            TRAIL_LAYERS.map((layer) => (
              <TrailStroke
                key={`${index}-${layer.className}`}
                d={trace.d}
                tail={(COMET_PX * layer.share) / length}
                from={burst.from / length}
                to={burst.to / length}
                className={`${layer.className} lp-trail-burst`}
                style={{ '--lp-delay': `${Math.round(burst.delay)}ms` } as CSSProperties}
              />
            )),
          )}
      </svg>
      {entrance && !reduced && <span className='lp-comet' style={{ offsetPath: path }} />}
      {!reduced &&
        bursts.map((burst, index) => (
          <span
            key={index}
            className='lp-burst'
            style={
              {
                offsetPath: path,
                // Running back down the path, the comet turns round so its tail trails.
                offsetRotate: burst.to < burst.from ? 'reverse' : 'auto',
                '--lp-from': `${((burst.from / length) * 100).toFixed(2)}%`,
                '--lp-to': `${((burst.to / length) * 100).toFixed(2)}%`,
                '--lp-delay': `${Math.round(burst.delay)}ms`,
              } as CSSProperties
            }
          />
        ))}
      {showMotes &&
        Array.from({ length: motes }, (_, index) => (
          <span key={index} className='lp-mote' style={{ offsetPath: path, '--lp-mote-delay': `${Math.round(startAfter + (index * moteMs) / motes)}ms` } as CSSProperties} />
        ))}
    </div>
  );
}

/* ── hooks every path design needs ─────────────────────────────────── */

/** The element's content width (px), kept up to date. 0 until measured. */
function useMeasuredWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    setWidth(Math.round(element.clientWidth));
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * The entrance plays ONCE per mount, when the design first scrolls into
 * view, for the subject shown then. After a subject switch `entrance` is
 * false for good (designs cross-fade instead) and `switched` is true.
 * `play` = in view at least once (or reduced motion: end states at once).
 */
function useEntrance(rootRef: RefObject<Element | null>, subjectId: string, reduced: boolean) {
  const { entered, visible } = useInView(rootRef);
  const [entry, setEntry] = useState<string | null>(null);
  const [switched, setSwitched] = useState(false);
  useEffect(() => {
    if (entered && entry === null) setEntry(subjectId);
  }, [entered, entry, subjectId]);
  const isSwitched = switched || (entry !== null && entry !== subjectId);
  useEffect(() => {
    if (isSwitched && !switched) setSwitched(true);
  }, [isSwitched, switched]);
  return { entered, visible, play: entered || reduced, entrance: entered && !reduced && !isSwitched, switched: isSwitched };
}

export { LitPath, useEntrance, useMeasuredWidth };
export type { Burst, LitPathProps };
