import { memo, useId, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { HudChapter as Chapter } from '../../contract';
import { CrystalShape } from '../../kit/parts';
import type { Moment } from '../../kit/progressMoments';
import { arrivalMs, dashFor, litIntervals, pointAt, raceMs } from '../../kit/litPath';
import type { Burst } from '../../kit/LitPathLayers';
import { LitPath } from '../../kit/LitPathLayers';
import { halfOrbit, orbitGems } from './logic';
import type { Line, Station } from './logic';

/**
 * The Crystal Line's board (round 2 §3.12; shared since round 4): Route
 * Map's rail — the lit-path engine with its comet — laid out the Mini Metro
 * way, carrying Crystarium stations: magic-circle rings whose topics are
 * gems on a half-orbit that fills with gold. The crystal rides the line as
 * the train, parked at the frontier.
 *
 * Two lines use it: the HUD's chapter line (`CrystallineHud`) and the
 * chapter page's topic line (`src/chapter/`). Each item is a `HudChapter`
 * (a topic is one with `total` 1). The caller draws each station's label
 * (`renderLabel`) — a progressbar on the HUD, a checkbox on the chapter
 * page — and spreads `slot.bind` on it, so hovering or focusing the label
 * or its node lights the station (`data-hover`): the node lifts, a rune
 * circle turns round it and sparks flare (Deepak, round 4: "nodes need
 * amazing hover styles").
 *
 * Earned moments: a short comet runs into each newly advanced station (the
 * first two), which then lights — its orbit draws, and a finished station
 * blooms gold with a shockwave. `instant` keys light at once, without a
 * comet (a topic just ticked on the page).
 */

const BURST_MS = 1000;
const MAX_BURSTS = 2;

function sparkle(size: number): string {
  const w = size * 0.28;
  return `M0 ${-size}L${w} ${-w}L${size} 0L${w} ${w}L0 ${size}L${-w} ${w}L${-size} 0L${-w} ${-w}Z`;
}

type StationProps = {
  chapter: Chapter;
  line: Line;
  frontier: boolean;
  hovered: boolean;
  gems: boolean;
  moment: Moment | undefined;
  pop: number;
  delay: number;
  bloom: string;
  onHover: (index: number) => void;
  onActivate: ((index: number) => void) | undefined;
};

const StationMark = memo(function StationMark({ chapter, line, frontier, hovered, gems: withGems, moment, pop, delay, bloom, onHover, onActivate }: StationProps) {
  const station = line.stations[chapter.index];
  const { radius: r, orbit } = line;
  const arc = halfOrbit(orbit, station.up);
  const gems = withGems && chapter.total <= (line.compact ? 14 : 20) ? orbitGems(chapter.total, orbit, station.up) : [];
  const gem = line.compact ? 2.4 : 3.2;
  const state = chapter.complete ? 'done' : chapter.done > 0 ? 'part' : 'none';
  const spark = r * 0.42;
  return (
    <g
      className='crl-station'
      data-state={state}
      data-frontier={frontier || undefined}
      data-hover={hovered || undefined}
      data-moment={moment}
      transform={`translate(${station.x.toFixed(1)} ${station.y.toFixed(1)})`}
      style={{ '--crl-pop': `${pop}ms`, '--crl-m': `${delay}ms`, '--crl-f': chapter.fraction } as CSSProperties}
    >
      <g className='crl-in'>
        {/* the hover aura: a bloom, two counter-turning rune circles and four sparks */}
        <g className='crl-aura'>
          <circle r={orbit + 14} fill={`url(#${bloom})`} className='crl-bloom' />
          <circle r={r + 8} className='crl-runes' />
          <circle r={orbit + 7} className='crl-runes crl-runes-outer' />
          {[45, 135, 225, 315].map((angle, k) => (
            <g key={angle} transform={`rotate(${angle}) translate(${orbit + 9} 0) rotate(${-angle})`}>
              <path d={sparkle(spark)} className='crl-spark' style={{ '--crl-k': k } as CSSProperties} />
            </g>
          ))}
        </g>
        {withGems && (
          <>
            <path d={arc} className='crl-orbit' />
            {chapter.fraction > 0 && (
              <>
                <path d={arc} pathLength={1} className='crl-orbit-glow' strokeDasharray={`${chapter.fraction} 2`} />
                <path d={arc} pathLength={1} className='crl-orbit-lit' strokeDasharray={`${chapter.fraction} 2`} />
              </>
            )}
            {gems.length === 0 && <path d={arc} pathLength={chapter.total} className='crl-orbit-ticks' strokeDasharray='0.14 0.86' />}
          </>
        )}
        {gems.map((point, topic) => (
          <path
            key={topic}
            d={`M${point.x.toFixed(1)} ${(point.y - gem).toFixed(1)}l${gem} ${gem}l${-gem} ${gem}l${-gem} ${-gem}Z`}
            className='crl-gem'
            style={{ '--crl-gi': topic } as CSSProperties}
            data-lit={topic < chapter.done || undefined}
            data-next={(frontier && topic === chapter.done) || undefined}
          />
        ))}
        <g className='crl-node'>
          <circle r={r + 3.5} className='crl-halo' />
          <circle r={r} className='crl-ring' />
          <circle r={r - 3} className='crl-disc' />
          {chapter.complete && <path d={sparkle(r * 0.55)} className='crl-mark' />}
          {chapter.done > 0 && !chapter.complete && <circle r={r - 3} pathLength={1} transform='rotate(-90)' className='crl-fill' strokeDasharray={`${chapter.fraction} 2`} />}
          {moment && (
            <>
              <circle r={r} className='crl-shock' />
              {moment === 'complete' && <circle r={r} className='crl-shock crl-shock-2' />}
            </>
          )}
        </g>
      </g>
      {/* the node's own hit area (the label is the keyboard control) */}
      <circle
        r={orbit + 4}
        className='crl-hit'
        data-active={onActivate ? '' : undefined}
        onPointerEnter={() => onHover(chapter.index)}
        onPointerLeave={() => onHover(-1)}
        onClick={onActivate ? () => onActivate(chapter.index) : undefined}
      />
    </g>
  );
});

/** What `renderLabel` gets for one station. */
type LabelSlot = {
  index: number;
  station: Station;
  state: 'done' | 'part' | 'none';
  frontier: boolean;
  hovered: boolean;
  /** Position, size and entrance timing — put on the label element. */
  style: CSSProperties;
  /** Hover and focus wiring — spread on the label element. */
  bind: { onPointerEnter: () => void; onPointerLeave: () => void; onFocus: () => void; onBlur: () => void };
};

type BoardProps = {
  line: Line;
  chapters: Chapter[];
  frontier: number;
  moments: ReadonlyMap<string, Moment>;
  /** Moments that play at once, with no comet. */
  instant?: ReadonlySet<string>;
  play: boolean;
  entrance: boolean;
  reduced: boolean;
  switched: boolean;
  /** Topic gems on each station's half-orbit (the chapter line; topics have none). */
  gems?: boolean;
  renderLabel: (chapter: Chapter, slot: LabelSlot) => ReactNode;
  /** A click on a station's node. */
  onActivate?: (index: number) => void;
  /** The station being hovered or focused changed (-1: none). */
  onHoverChange?: (index: number) => void;
};

const CrystalBoard = memo(function CrystalBoard({ line, chapters, frontier, moments, instant, play, entrance, reduced, switched, gems = true, renderLabel, onActivate, onHoverChange }: BoardProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const tail = `crl-tail-${uid}`;
  const bloom = `crl-bloom-${uid}`;
  const [hover, setHoverState] = useState(-1);
  const setHover = useMemo(
    () => (index: number) => {
      setHoverState(index);
      onHoverChange?.(index);
    },
    [onHoverChange],
  );
  const intervals = useMemo(() => litIntervals(line.stops, chapters), [line, chapters]);
  const lit = dashFor(intervals, line.trace.length);
  const race = raceMs(line.trace.length);
  const pops = line.stops.map((stop) => (entrance ? arrivalMs(stop.at, line.trace.length, race) : 0));
  const inLit = (along: number) => intervals.some(([a, b]) => along >= a && along <= b);

  // The train: the crystal on the frontier's stretch, as far in as it is learnt (at least 40 %).
  const stop = frontier >= 0 ? line.stops[frontier] : line.stops[line.stops.length - 1];
  const trainAlong = frontier >= 0 ? stop.start + (stop.end - stop.start) * Math.max(0.4, chapters[frontier].fraction) : stop.at;
  const train = pointAt(line.trace, trainAlong);
  const back = pointAt(line.trace, Math.max(0, trainAlong - (line.compact ? 40 : 56)));
  const trainAt = entrance ? race + 150 : 80;

  // Moments: a comet into each newly advanced station (the first two), then the station lights.
  const bursts: Burst[] = [];
  let order = 0;
  const delays = chapters.map((chapter, index) => {
    if (instant?.has(chapter.key)) return 0;
    if (!moments.has(chapter.key)) return 0;
    const k = order++;
    if (k < MAX_BURSTS) {
      // A short comet runs FORWARD down the station's own stretch into it.
      // (It used to race from the crystal back across the whole line to
      // every station at once, which read as random pulses — Deepak, round 3.)
      const delay = trainAt + 500 + k * 420;
      bursts.push({ from: line.stops[index].start, to: line.stops[index].at, delay });
      return delay + BURST_MS - 120;
    }
    return entrance ? pops[index] + 400 : 260 + k * 70;
  });

  return (
    <div className='crl-board' style={{ height: line.height, '--lp-burst-ms': `${BURST_MS}ms` } as CSSProperties} data-entrance={entrance || undefined} data-swap={switched || undefined} data-hovering={hover >= 0 || undefined}>
      <LitPath
        trace={line.trace}
        lit={lit}
        // Idle motes drift only along the unbroken lit run from the terminus,
        // never across dark track between learnt stretches.
        extent={intervals.length > 0 && intervals[0][0] <= 1 ? intervals[0][1] : 0}
        width={line.width}
        height={line.height}
        play={play}
        entrance={entrance}
        reduced={reduced}
        race={race}
        bursts={bursts}
        className='crl-lit'
        under={
          <path
            d={line.sleepers
              .filter((sleeper) => !inLit(sleeper.along))
              .map((sleeper) => sleeper.d)
              .join('')}
            className='crl-sleeper'
          />
        }
      >
        <path
          d={line.sleepers
            .filter((sleeper) => inLit(sleeper.along))
            .map((sleeper) => sleeper.d)
            .join('')}
          className='crl-sleeper-lit'
        />
      </LitPath>
      <svg className='crl-svg' width={line.width} height={line.height} viewBox={`0 0 ${line.width} ${line.height}`} aria-hidden='true'>
        <defs>
          <linearGradient id={tail} gradientUnits='userSpaceOnUse' x1={back.x} y1={back.y} x2={train.x} y2={train.y}>
            <stop offset='0' stopColor='#6fe3ff' stopOpacity='0' />
            <stop offset='1' stopColor='#e8fbff' stopOpacity='0.95' />
          </linearGradient>
          <radialGradient id={bloom}>
            <stop offset='0' stopColor='#fff4cc' stopOpacity='0.42' />
            <stop offset='0.45' stopColor='#d9a93c' stopOpacity='0.16' />
            <stop offset='1' stopColor='#6fe3ff' stopOpacity='0' />
          </radialGradient>
        </defs>
        {chapters.map((chapter, index) => (
          <StationMark
            key={chapter.key}
            chapter={chapter}
            line={line}
            frontier={index === frontier}
            hovered={index === hover}
            gems={gems}
            moment={instant?.has(chapter.key) ? (chapter.complete ? 'complete' : 'advanced') : moments.get(chapter.key)}
            pop={pops[index]}
            delay={delays[index]}
            bloom={bloom}
            onHover={setHover}
            onActivate={onActivate}
          />
        ))}
        <g className='crl-train' style={{ '--crl-t': `${trainAt}ms` } as CSSProperties}>
          <path d={`M${back.x.toFixed(1)} ${back.y.toFixed(1)}L${train.x.toFixed(1)} ${train.y.toFixed(1)}`} stroke={`url(#${tail})`} className='crl-tail' />
          <circle cx={train.x} cy={train.y} r={line.compact ? 9 : 12} className='crl-train-glow' />
          <g transform={`translate(${train.x.toFixed(1)} ${(train.y - (line.compact ? 1 : 2)).toFixed(1)}) scale(${line.compact ? 1 : 1.3})`}>
            <g className='crl-crystal'>
              <CrystalShape />
            </g>
          </g>
        </g>
      </svg>
      <ol className='crl-labels'>
        {chapters.map((chapter, index) => {
          const station = line.stations[index];
          const slot: LabelSlot = {
            index,
            station,
            state: chapter.complete ? 'done' : chapter.done > 0 ? 'part' : 'none',
            frontier: index === frontier,
            hovered: index === hover,
            style: {
              left: station.label.left,
              top: station.label.top,
              width: station.label.width,
              height: station.label.height,
              '--crl-pop': `${pops[index]}ms`,
            } as CSSProperties,
            bind: {
              onPointerEnter: () => setHover(index),
              onPointerLeave: () => setHover(-1),
              onFocus: () => setHover(index),
              onBlur: () => setHover(-1),
            },
          };
          return <li key={chapter.key}>{renderLabel(chapter, slot)}</li>;
        })}
      </ol>
    </div>
  );
});

export { CrystalBoard };
export type { LabelSlot };
