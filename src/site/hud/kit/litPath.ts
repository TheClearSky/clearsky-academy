/**
 * THE LIT-PATH ENGINE (round-2 brief §2 "Shared kit", REFERENCES-R2 §2.1):
 * the part of Route Map Deepak loved ("does the path better"), lifted out of
 * `designs/metro/route.ts › litDashes` so any design can draw a path that is
 * LIT BY WHAT IS LEARNT. Pure and unit-tested (`src/__tests__/hud-litPath.test.ts`);
 * the React layers are `LitPathLayers.tsx`.
 *
 *  - `tracePath`   a polyline with filleted corners → its SVG `d`, its EXACT
 *                  length (lines + circular arcs, no `getTotalLength`) and how
 *                  far along each input point sits; `pointAt` walks it.
 *  - `stopsAlong`  per node: the stretch of path leading into it and its centre.
 *  - `litIntervals` / `dashFor` / `litExtent`  "lit by what is learnt": each
 *                  node's stretch is lit as far as its topics are learnt, a
 *                  finished node lights its own disc span, and the track on
 *                  from a finished node lights once the next one is started.
 *  - `timeToReach` the time at which an EASED draw reaches a fraction of its
 *                  length (review X5: nodes pop exactly when the light gets
 *                  there, not on a linear clock against an eased stroke).
 *  - `frontierOf`  where the light is heading: the unfinished chapter closest
 *                  to done (review X9: real learners skip around).
 */

type Point = { x: number; y: number };

type LineSegment = { kind: 'line'; start: number; length: number; x0: number; y0: number; x1: number; y1: number };
type ArcSegment = { kind: 'arc'; start: number; length: number; cx: number; cy: number; r: number; a0: number; dir: 1 | -1 };
type Segment = LineSegment | ArcSegment;

type Trace = {
  /** The SVG path data (one continuous subpath, so dash patterns never restart). */
  d: string;
  /** Exact length in px. */
  length: number;
  segments: Segment[];
  /** Distance along the path of each input point (a filleted corner: its arc's midpoint). */
  vertices: number[];
};

const f1 = (value: number) => (Math.abs(value) < 0.005 ? '0' : value.toFixed(2).replace(/\.?0+$/, ''));

/**
 * A polyline through `points`, each corner rounded with a circular arc of
 * `radius` (shrunk where the legs are short). Collinear points add no arc,
 * so a node placed on a straight run sits exactly at its own distance.
 */
function tracePath(points: readonly Point[], radius = 0): Trace {
  const segments: Segment[] = [];
  const vertices: number[] = [];
  if (points.length === 0) return { d: '', length: 0, segments, vertices };
  const parts: string[] = [`M${f1(points[0].x)} ${f1(points[0].y)}`];
  let cursor: Point = points[0];
  let length = 0;
  vertices.push(0);
  const line = (to: Point) => {
    const run = Math.hypot(to.x - cursor.x, to.y - cursor.y);
    if (run > 1e-6) {
      segments.push({ kind: 'line', start: length, length: run, x0: cursor.x, y0: cursor.y, x1: to.x, y1: to.y });
      parts.push(`L${f1(to.x)} ${f1(to.y)}`);
      length += run;
    }
    cursor = to;
  };
  for (let index = 1; index < points.length; index++) {
    const corner = points[index];
    const next = points[index + 1];
    if (!next || radius <= 0) {
      line(corner);
      vertices.push(length);
      continue;
    }
    const inLength = Math.hypot(corner.x - cursor.x, corner.y - cursor.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (inLength < 1e-6 || outLength < 1e-6) {
      line(corner);
      vertices.push(length);
      continue;
    }
    const u = { x: (corner.x - cursor.x) / inLength, y: (corner.y - cursor.y) / inLength };
    const v = { x: (next.x - corner.x) / outLength, y: (next.y - corner.y) / outLength };
    const dot = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
    const turn = Math.acos(dot);
    const cross = u.x * v.y - u.y * v.x;
    if (turn < 1e-4 || turn > Math.PI - 1e-3) {
      line(corner);
      vertices.push(length);
      continue;
    }
    const half = Math.tan(turn / 2);
    // The tangent length, kept within half of each full leg (the neighbouring corner gets the other half).
    const fullIn = Math.hypot(corner.x - points[index - 1].x, corner.y - points[index - 1].y);
    const tangent = Math.min(radius * half, index === 1 ? inLength : Math.min(inLength, fullIn * 0.5), outLength * 0.5);
    const r = tangent / half;
    const a = { x: corner.x - u.x * tangent, y: corner.y - u.y * tangent };
    const b = { x: corner.x + v.x * tangent, y: corner.y + v.y * tangent };
    line(a);
    const dir: 1 | -1 = cross > 0 ? 1 : -1;
    const normal = dir > 0 ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
    const cx = a.x + normal.x * r;
    const cy = a.y + normal.y * r;
    const arcLength = r * turn;
    segments.push({ kind: 'arc', start: length, length: arcLength, cx, cy, r, a0: Math.atan2(a.y - cy, a.x - cx), dir });
    parts.push(`A${f1(r)} ${f1(r)} 0 0 ${dir > 0 ? 1 : 0} ${f1(b.x)} ${f1(b.y)}`);
    vertices.push(length + arcLength / 2);
    length += arcLength;
    cursor = b;
  }
  return { d: parts.join(''), length, segments, vertices };
}

/** The point at distance `s` along the trace, with the heading in degrees. */
function pointAt(trace: Trace, s: number): Point & { angle: number } {
  const { segments } = trace;
  if (segments.length === 0) return { x: 0, y: 0, angle: 0 };
  const clamped = Math.max(0, Math.min(trace.length, s));
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (segments[middle].start <= clamped) low = middle;
    else high = middle - 1;
  }
  const segment = segments[low];
  const local = Math.max(0, Math.min(segment.length, clamped - segment.start));
  if (segment.kind === 'line') {
    const p = segment.length === 0 ? 0 : local / segment.length;
    return { x: segment.x0 + (segment.x1 - segment.x0) * p, y: segment.y0 + (segment.y1 - segment.y0) * p, angle: (Math.atan2(segment.y1 - segment.y0, segment.x1 - segment.x0) * 180) / Math.PI };
  }
  const angle = segment.a0 + (segment.dir * local) / segment.r;
  return { x: segment.cx + segment.r * Math.cos(angle), y: segment.cy + segment.r * Math.sin(angle), angle: ((angle + (segment.dir * Math.PI) / 2) * 180) / Math.PI };
}

/** Where one node sits on the path (px along it): the stretch that leads into it, and its centre. */
type Stop = { start: number; end: number; at: number };

/**
 * Stops for nodes at distances `ats` along a path: each node's stretch runs
 * from `gap` past the previous node to `gap` short of this one (the first
 * from `leadIn` before it, or the path's start).
 */
function stopsAlong(ats: readonly number[], gap: number, leadIn = 0): Stop[] {
  return ats.map((at, index) => {
    const start = index === 0 ? Math.max(0, at - Math.max(leadIn, gap)) : ats[index - 1] + gap;
    const end = Math.max(start, at - gap);
    return { start: Math.min(start, end), end, at };
  });
}

type Progress = { fraction: number; complete: boolean; done: number };

/** The lit runs of the path (merged, sorted): what is learnt, as light. */
function litIntervals(stops: readonly Stop[], progress: readonly Progress[]): [number, number][] {
  const intervals: [number, number][] = [];
  stops.forEach((stop, index) => {
    const chapter = progress[index];
    if (!chapter) return;
    const { start, end, at } = stop;
    if (chapter.fraction > 0) intervals.push([start, start + (end - start) * Math.min(1, chapter.fraction)]);
    if (chapter.complete) {
      intervals.push([end, at]);
      const next = stops[index + 1];
      const nextChapter = progress[index + 1];
      if (next && nextChapter && nextChapter.done > 0) intervals.push([at, next.start]);
    }
  });
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of intervals) {
    if (b - a <= 0) continue;
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 0.5) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/** Intervals → an SVG `stroke-dasharray` (px) over a path of `length`. */
function dashFor(intervals: readonly [number, number][], length: number): string {
  if (intervals.length === 0) return `0 ${(length + 1).toFixed(1)}`;
  const parts: number[] = [0, intervals[0][0]];
  intervals.forEach(([a, b], index) => {
    parts.push(b - a);
    const next = intervals[index + 1];
    parts.push(next ? next[0] - b : length + 1);
  });
  return parts.map((value) => value.toFixed(1)).join(' ');
}

/** The farthest lit point (px along), or 0. Idle motes travel up to it. */
function litExtent(intervals: readonly [number, number][]): number {
  return intervals.length === 0 ? 0 : intervals[intervals.length - 1][1];
}

/** Total lit length (px). */
function litLength(intervals: readonly [number, number][]): number {
  return intervals.reduce((sum, [a, b]) => sum + (b - a), 0);
}

/* ── eased timing ──────────────────────────────────────────────────── */

/** A CSS `cubic-bezier(x1, y1, x2, y2)`. */
type Ease = readonly [number, number, number, number];

/** The race's easing (Route Map's), shared by the CSS (`--lp-ease`) and the pop clock. */
const RACE_EASE: Ease = [0.5, 0, 0.3, 1];
const easeCss = (ease: Ease) => `cubic-bezier(${ease.join(', ')})`;

const bezier = (p1: number, p2: number, u: number) => 3 * (1 - u) * (1 - u) * u * p1 + 3 * (1 - u) * u * u * p2 + u * u * u;

/** The eased progress at time `x` (0..1), as CSS computes it. */
function easeAt(ease: Ease, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (bezier(ease[0], ease[2], middle) < x) low = middle;
    else high = middle;
  }
  return bezier(ease[1], ease[3], (low + high) / 2);
}

/** The time (0..1) at which an eased draw has covered `fraction` of its length. */
function timeToReach(ease: Ease, fraction: number): number {
  if (fraction <= 0) return 0;
  if (fraction >= 1) return 1;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (bezier(ease[1], ease[3], middle) < fraction) low = middle;
    else high = middle;
  }
  return bezier(ease[0], ease[2], (low + high) / 2);
}

/** How long the entrance race takes for a path of `length` px (ms). */
function raceMs(length: number): number {
  return Math.round(Math.max(1400, Math.min(3200, 900 + length * 0.32)));
}

/** When (ms) the racing light reaches distance `along` on a path of `length`. */
function arrivalMs(along: number, length: number, race: number, ease: Ease = RACE_EASE): number {
  return Math.round(timeToReach(ease, length > 0 ? along / length : 0) * race);
}

/* ── the frontier ──────────────────────────────────────────────────── */

/**
 * The chapter the light heads for: the unfinished one closest to done
 * (earliest on ties); if none is started, the first unfinished; -1 when all
 * are complete.
 */
function frontierOf(progress: readonly Progress[]): number {
  let best = -1;
  for (let index = 0; index < progress.length; index++) {
    const chapter = progress[index];
    if (chapter.complete || chapter.done <= 0) continue;
    if (best < 0 || chapter.fraction > progress[best].fraction) best = index;
  }
  if (best >= 0) return best;
  return progress.findIndex((chapter) => !chapter.complete);
}

/* ── seeded randomness (stable decoration) ─────────────────────────── */

/** A small deterministic PRNG (mulberry32) seeded from a string. */
function seeded(seed: string): () => number {
  let hash = 2166136261;
  for (const character of seed) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  let state = hash || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points along the lit runs every `step` px (± `jitter` across the path): dust, powder, motes at rest. */
function sprinkle(trace: Trace, intervals: readonly [number, number][], step: number, jitter: number, seed: string): (Point & { size: number; lit: boolean })[] {
  const random = seeded(seed);
  const out: (Point & { size: number; lit: boolean })[] = [];
  for (let s = step * random(); s < trace.length; s += step * (0.6 + random() * 0.8)) {
    const point = pointAt(trace, s);
    const across = (random() - 0.5) * 2 * jitter;
    const radians = ((point.angle + 90) * Math.PI) / 180;
    const lit = intervals.some(([a, b]) => s >= a && s <= b);
    out.push({ x: point.x + Math.cos(radians) * across, y: point.y + Math.sin(radians) * across, size: random(), lit });
  }
  return out;
}

export { arrivalMs, dashFor, easeAt, easeCss, frontierOf, litExtent, litIntervals, litLength, pointAt, RACE_EASE, raceMs, seeded, sprinkle, stopsAlong, timeToReach, tracePath };
export type { Ease, Point, Progress, Segment, Stop, Trace };
