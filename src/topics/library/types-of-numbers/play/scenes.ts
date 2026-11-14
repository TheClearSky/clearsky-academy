import { NUMBER_FX } from '../../../videoKit/anime/fx/colours';
import type { NumberKind } from '../../../videoKit/anime/fx/colours';
import { insideShape, SETS } from '../../../videoKit/anime/explain/venn';
import type { Ellipse, Point, RoundRect, SetId, Shape } from '../../../videoKit/anime/explain/venn';
import { drawFlatCompass } from '../rootFlatTools';
import { BIG_SQUARE, PIECES, SLIDE_ORDER, SQUARE_1, SQUARE_2, triAt } from '../rootGeometry';
import type { P2 } from '../rootGeometry';
import { checkMark, chip, clamp01, crossMark, dot, fadeIn, fraction, glass, glyph, INK, inkLine, lineGlow, lineX, minJerk, mix, mixHex, night, numberLine, outCubic, QUIET, ramp, ring, ringFill, ringMark, setSymbol, smooth, statement, token, widthOf } from './paint';
import type { LineGeo, Pen } from './paint';
import { QUESTIONS, regionOf, smallestSet } from './questions';
import type { ChooseQuestion, ChooseResponse, LineQuestion, LineResponse, Num, PlaceQuestion, PlaceResponse, Question, Response, Verdict } from './questions';

/**
 * THE TEN SCENES (M13.X1): for each question, where everything sits (two layouts: `wide` 1000 × 625 design units for
 * the modal on a desktop, `tall` 540 × 800 for a phone), how the answer looks while the learner works, and the SOLUTION:
 * a timeline `u` (seconds from Submit) in the film's own language that plays whatever the answer was. Pure functions of
 * their arguments: the Stage paints `paint(pen, view)` each frame.
 *
 * Style rules kept (GUIDEBOOK + the puzzle's quiet restyle):
 *   - MATH-04: owner colours only for their kinds. A number whose kind IS the question is drawn in the quiet ink until
 *     the solution names it, then it takes its owner colour as it lands (the colour is the answer);
 *   - EYE-01: one thing moves at a time in a solution (staggered arrivals, ANIM-04), results hold (ANIM-06);
 *   - every mark (a picked ring, a mistake, a strike, an underline) is the one off-white ink (sectionsSubset.ts › QUIET);
 *   - MATH-03: the number line runs positive to the right; MATH-01: set statements come with their rings.
 */

type Layout = 'wide' | 'tall';
const DESIGN: Record<Layout, { w: number; h: number }> = { wide: { w: 1000, h: 625 }, tall: { w: 540, h: 800 } };

type Hit = { id: string; role: 'token' | 'region' | 'option' | 'slider' | 'tray'; x: number; y: number; w: number; h: number; label: string; slot?: string; pressed?: boolean };
/**
 * `u`: the solution's own clock (seconds). `t`: seconds since Submit. They differ only for a wrong answer, whose solution
 * waits for the correction prelude (the mistake circled, then crossed: PRELUDE seconds) before it starts.
 */
type Solution = { u: number; t: number; response: Response; verdict: Verdict };
type View = {
  layout: Layout;
  response: Response;
  selected: string | null;
  drag: { id: string; x: number; y: number } | null;
  /** The region under a dragged token (lit as a drop target). */
  hover: string | null;
  solution: Solution | null;
};
type Step = { at: number; caption: string };
type Scene = {
  /** A layout's design size when the scene needs less than the default (a number line on a phone). */
  design?: Partial<Record<Layout, { w: number; h: number }>>;
  duration: number;
  steps: Step[];
  paint(pen: Pen, view: View): void;
  hits(layout: Layout, response: Response, selected: string | null): Hit[];
  /** Place questions: the region at a design point (null: none). */
  regionAt?(layout: Layout, p: Point): string | null;
  /** Line questions: the line's geometry. */
  line?(layout: Layout): LineGeo;
};

const kindOfSet: Record<SetId, NumberKind> = { N: 'natural', W: 'zero', Z: 'negative', Q: 'fraction', I: 'irrational', R: 'zero' };
const kindOf = (v: Num): NumberKind => kindOfSet[smallestSet(v)];
const ell = (cx: number, cy: number, rx: number, ry: number): Ellipse => ({ kind: 'ellipse', cx, cy, rx, ry });
const rect = (x0: number, y0: number, x1: number, y1: number, r: number): RoundRect => ({ kind: 'rect', x0, y0, x1, y1, r });
const arc = (from: Point, to: Point, k: number, lift: number): Point => {
  const e = minJerk(k);
  return { x: mix(from.x, to.x, e), y: mix(from.y, to.y, e) - Math.sin(Math.PI * e) * lift };
};
const pulse = (u: number, at: number, d = 0.8) => Math.sin(Math.PI * clamp01((u - at) / d));

// === THE CORRECTION (Deepak 2026-11-14) ===
// "when the answer is wrong, show a cross over what's wrong after the circle and then move it to correct place, then show
// a tick on it". A wrong answer's solution starts with a PRELUDE: each wrong thing is circled, then crossed out, where the
// learner left it. Then the solution plays; when it reaches a wrong thing, that thing moves to its right place (its marks
// fade as it leaves) and a tick is drawn on it there. All in the one quiet ink: no red, no green.

const PRELUDE = 1.1;
const preludeOf = (v: Verdict) => (v.correct ? 0 : PRELUDE);
/** The circle (t 0.1..0.45 after Submit), then the cross (0.55..0.95), round (x, y); `leave` 0..1 fades both away. */
function mistakeMarks(pen: Pen, x: number, y: number, rx: number, ry: number, t: number, leave = 0, circle = true) {
  const a = 1 - smooth(clamp01(leave));
  if (a <= 0) return;
  if (circle) ringMark(pen, x, y, rx, ry, 0.85 * a, ramp(t, 0.1, 0.45));
  crossMark(pen, x, y, Math.min(rx, ry) * 0.6, 0.95 * a, ramp(t, 0.55, 0.95));
}
/** The tick on a thing that has just reached its right place (`at`: when it arrived). */
function arrivedTick(pen: Pen, x: number, y: number, s: number, u: number, at: number) {
  checkMark(pen, x, y, s, 0.95, ramp(u, at + 0.1, at + 0.45));
}

// ═══ PLACE: tokens into rings ════════════════════════════════════════════════════════════════════════════════════════

type RingDef = { shape: Shape; look: SetId | 'quiet'; region?: string; symbol?: { id: SetId; at: Point; size: number } };
type PlaceGeo = {
  rings: RingDef[];
  /** Innermost first: the first region whose shape holds a point owns it. */
  regions: { id: string; shape: Shape; slots: Point[]; button: Point }[];
  tray: Point[];
  trayBox: { x: number; y: number; w: number; h: number };
  size: number;
};
type PlaceExtras = {
  /** The colour a token is drawn in while answering (null: the quiet ink). */
  answerColour?(tokenId: string): string | null;
  /** The solution's own drawing, over the rings, under the tokens (u = seconds from Submit). */
  under?(pen: Pen, geo: PlaceGeo, u: number, view: View): void;
  /** The solution's own drawing over everything. */
  over?(pen: Pen, geo: PlaceGeo, u: number, view: View): void;
  /** Override where a token's flight ends and its label (e.g. −8⁄4 becomes −2). */
  flight?(tokenId: string, u: number): { label?: string; at?: number } | null;
  /** The rings' looks in the solution (Q2: the quiet rings take their colours). */
  ringLook?(def: RingDef, u: number, geo: PlaceGeo): { look: SetId | 'quiet'; alpha: number }[] | null;
  /** The token flights' start and stagger. */
  fly?: { at: number; stagger: number; dur: number };
};

function placeScene(q: PlaceQuestion, geos: Record<Layout, PlaceGeo>, steps: Step[], duration: number, extras: PlaceExtras = {}): Scene {
  const fly = extras.fly ?? { at: 0.35, stagger: 0.22, dur: 0.75 };
  const truthOf = (geo: PlaceGeo) => {
    const counts: Record<string, number> = {};
    const out: Record<string, Point> = {};
    q.tokens.forEach((t, i) => {
      const reg = q.answer[t.id];
      if (reg === 'tray') {
        out[t.id] = geo.tray[i];
        return;
      }
      const r = geo.regions.find((g) => g.id === reg)!;
      const n = counts[reg] ?? 0;
      counts[reg] = n + 1;
      out[t.id] = r.slots[Math.min(n, r.slots.length - 1)];
    });
    return out;
  };
  const positionsOf = (geo: PlaceGeo, r: PlaceResponse) => {
    const out: Record<string, Point> = {};
    const counts: Record<string, number> = {};
    for (const id of r.order) {
      const reg = r.at[id];
      const region = geo.regions.find((g) => g.id === reg);
      if (!region) continue;
      const n = counts[reg] ?? 0;
      counts[reg] = n + 1;
      out[id] = region.slots[Math.min(n, region.slots.length - 1)];
    }
    q.tokens.forEach((t, i) => {
      if (!out[t.id]) out[t.id] = geo.tray[i];
    });
    return out;
  };
  const tokenColour = (t: PlaceQuestion['tokens'][number]) => (t.set ? SETS[t.set].text : t.value ? NUMBER_FX[kindOf(t.value)].text : INK);
  const regionAt = (layout: Layout, p: Point) => {
    const geo = geos[layout];
    for (const r of geo.regions) if (insideShape(r.shape, p)) return r.id;
    const b = geo.trayBox;
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return 'tray';
    return null;
  };
  return {
    duration,
    steps,
    regionAt,
    hits(layout, response, selected) {
      const geo = geos[layout];
      const r = response as PlaceResponse;
      const pos = positionsOf(geo, r);
      const hits: Hit[] = [{ id: 'tray', role: 'tray', ...geo.trayBox, label: 'Back to the start row' }];
      for (const reg of geo.regions) {
        const def = q.regions.find((g) => g.id === reg.id);
        hits.push({ id: reg.id, role: 'region', x: reg.button.x - 46, y: reg.button.y - 34, w: 92, h: 68, label: `Put ${selected ? 'it' : 'the picked number'} in ${def?.aria ?? reg.id}` });
      }
      for (const t of q.tokens) {
        const p = pos[t.id];
        const w = Math.max(geo.size * 1.5, Array.from(t.label).length * geo.size * 0.5 + geo.size * 0.7);
        const where = regionOf(r, t.id);
        const inside = q.regions.find((g) => g.id === where)?.aria;
        hits.push({ id: t.id, role: 'token', x: p.x - w / 2, y: p.y - geo.size * 0.75, w, h: geo.size * 1.5, label: `${t.aria}${inside ? `, now in ${inside}` : ', not placed'}`, pressed: selected === t.id });
      }
      return hits;
    },
    paint(pen, view) {
      const geo = geos[view.layout];
      const sol = view.solution;
      const u = sol ? sol.u : -1;
      const answering = (sol ? sol.response : view.response) as PlaceResponse;
      // ── rings (outer first), their tints, the drop target lit ──
      for (const def of geo.rings) {
        const looks = sol && extras.ringLook ? extras.ringLook(def, u, geo) : null;
        const landed = sol ? q.tokens.some((t, i) => q.answer[t.id] === def.region && u >= fly.at + i * fly.stagger + fly.dur) : false;
        const flash = sol && def.region ? Math.max(0, ...q.tokens.map((t, i) => (q.answer[t.id] === def.region ? pulse(u, fly.at + i * fly.stagger + fly.dur - 0.1, 0.7) : 0))) : 0;
        const lit = !sol && view.hover && view.hover === def.region ? 1 : 0;
        for (const { look, alpha } of looks ?? [{ look: def.look, alpha: 1 }]) {
          // 𝕀 = ℝ ∖ ℚ has no ring of its own (venn.ts): only its tint; its edges are ℝ's and ℚ's rings.
          ringFill(pen, def.shape, look, { lit: lit + (landed ? 0.3 : 0), alpha });
          if (def.shape.kind !== 'minus') ring(pen, def.shape, look, { lit, flash, alpha });
        }
      }
      for (const def of geo.rings) if (def.symbol) setSymbol(pen, def.symbol.id, def.symbol.at.x, def.symbol.at.y, def.symbol.size);
      if (sol) extras.under?.(pen, geo, u, view);
      // ── tokens ──
      const pos = positionsOf(geo, answering);
      const truth = truthOf(geo);
      q.tokens.forEach((t, i) => {
        const from = pos[t.id];
        const owner = tokenColour(t);
        if (!sol) {
          if (view.drag?.id === t.id) return;
          const c = extras.answerColour?.(t.id) ?? (t.set ? owner : INK);
          token(pen, t.label, from.x, from.y, geo.size, c, 1, { lift: view.selected === t.id ? 1 : 0 });
          return;
        }
        const f = extras.flight?.(t.id, u);
        const at = f?.at ?? fly.at + i * fly.stagger;
        const k = ramp(u, at, at + fly.dur);
        const to = truth[t.id];
        const lift = Math.min(90, 30 + Math.hypot(to.x - from.x, to.y - from.y) * 0.25);
        const p = arc(from, to, k, lift);
        const colour = t.set ? owner : mixHex('#fbf3dc', owner.startsWith('#') ? owner : '#fbf3dc', smooth(ramp(u, at + fly.dur * 0.3, at + fly.dur)));
        const wrong = sol.verdict.wrong.includes(t.id);
        const label = f?.label ?? t.label;
        token(pen, label, p.x, p.y, geo.size, colour, 1);
        if (wrong) {
          // Circled and crossed where the learner left it; the marks fade as it flies; a tick where it lands.
          const half = widthOf(pen, t.label, geo.size) / 2;
          mistakeMarks(pen, from.x, from.y, half + geo.size * 0.42, geo.size * 0.66, sol.t, ramp(u, at, at + fly.dur * 0.5));
          if (k >= 1) arrivedTick(pen, to.x + widthOf(pen, label, geo.size) / 2 + geo.size * 0.2, to.y - geo.size * 0.62, geo.size * 0.2, u, at + fly.dur);
        } else if (k >= 1) dot(pen, p.x + geo.size * 0.55, p.y - geo.size * 0.55, 5, t.value ? kindOf(t.value) : 'natural', pulse(u, at + fly.dur, 0.6));
      });
      if (view.drag && !sol) {
        const t = q.tokens.find((x) => x.id === view.drag!.id);
        if (t) token(pen, t.label, view.drag.x, view.drag.y, geo.size, extras.answerColour?.(t.id) ?? (t.set ? tokenColour(t) : INK), 1, { lift: 1 });
      }
      if (sol) extras.over?.(pen, geo, u, view);
    },
  };
}

// The three nested rings of Q2 / Q3 (ℕ ⊂ 𝕎 ⊂ ℤ), left-anchored as the film's chain (venn.ts › ELLIPSES).
const NEST: Record<Layout, { inner: Ellipse; middle: Ellipse; outer: Ellipse }> = {
  wide: { outer: ell(500, 262, 420, 212), middle: ell(400, 262, 300, 158), inner: ell(300, 262, 180, 104) },
  tall: { outer: ell(270, 330, 240, 300), middle: ell(270, 262, 182, 216), inner: ell(270, 192, 122, 132) },
};

// ─── Q1 naturals ─────────────────────────────────────────────────────────────────────────────────────────────────────

const qNaturals = QUESTIONS[0] as PlaceQuestion;
const NAT: Record<Layout, PlaceGeo> = {
  wide: {
    rings: [{ shape: ell(500, 262, 270, 165), look: 'N', region: 'N', symbol: { id: 'N', at: { x: 500, y: 142 }, size: 58 } }],
    regions: [{ id: 'N', shape: ell(500, 262, 270, 165), slots: [{ x: 405, y: 250 }, { x: 595, y: 250 }, { x: 500, y: 250 }, { x: 445, y: 335 }, { x: 555, y: 335 }], button: { x: 500, y: 142 } }],
    tray: [260, 380, 500, 620, 740].map((x) => ({ x, y: 528 })),
    trayBox: { x: 180, y: 488, w: 640, h: 80 },
    size: 50,
  },
  tall: {
    rings: [{ shape: ell(270, 318, 228, 192), look: 'N', region: 'N', symbol: { id: 'N', at: { x: 270, y: 190 }, size: 56 } }],
    regions: [{ id: 'N', shape: ell(270, 318, 228, 192), slots: [{ x: 185, y: 300 }, { x: 355, y: 300 }, { x: 270, y: 300 }, { x: 222, y: 392 }, { x: 318, y: 392 }], button: { x: 270, y: 190 } }],
    tray: [70, 170, 270, 370, 470].map((x) => ({ x, y: 600 })),
    trayBox: { x: 20, y: 560, w: 500, h: 80 },
    size: 48,
  },
};
const SCENE_NATURALS = placeScene(
  qNaturals,
  NAT,
  [
    { at: 0.3, caption: 'Counting starts at 1: 1, 2, 3, … are ℕ.' },
    { at: 1.6, caption: '3 and 7 count things: 3, 7 ∈ ℕ.' },
    { at: 2.8, caption: '0, −2 and ½ are not counted: 0 ∈ 𝕎, −2 ∈ ℤ, ½ ∈ ℚ.' },
  ],
  5.2,
  {
    fly: { at: 0.4, stagger: 0.2, dur: 0.75 },
    over(pen, geo, u, view) {
      // Under each number left outside: its own first home (its set's symbol, in that set's colour).
      qNaturals.tokens.forEach((t, i) => {
        if (qNaturals.answer[t.id] !== 'tray' || !t.value) return;
        const p = geo.tray[i];
        setSymbol(pen, smallestSet(t.value) as SetId, p.x, p.y + geo.size * 0.95, geo.size * 0.62, fadeIn(u, 2.8 + i * 0.12, 0.35));
      });
      const y = view.layout === 'wide' ? 52 : 52;
      statement(pen, '3, 7 ∈ ℕ', view.layout === 'wide' ? 500 : 270, y, 40, (k) => fadeIn(u, 1.7 + k * 0.08, 0.3), {}, { members: { 3: 'N', 7: 'N' } });
    },
  },
);

// ─── Q2 nest ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const qNest = QUESTIONS[1] as PlaceQuestion;
const nestGeo = (layout: Layout): PlaceGeo => {
  const n = NEST[layout];
  const wide = layout === 'wide';
  const slot = wide ? { inner: { x: 300, y: 262 }, middle: { x: 590, y: 262 }, outer: { x: 810, y: 262 } } : { inner: { x: 270, y: 192 }, middle: { x: 270, y: 405 }, outer: { x: 270, y: 560 } };
  return {
    rings: [
      { shape: n.outer, look: 'quiet', region: 'outer' },
      { shape: n.middle, look: 'quiet', region: 'middle' },
      { shape: n.inner, look: 'quiet', region: 'inner' },
    ],
    regions: [
      { id: 'inner', shape: n.inner, slots: [slot.inner], button: slot.inner },
      { id: 'middle', shape: n.middle, slots: [slot.middle], button: slot.middle },
      { id: 'outer', shape: n.outer, slots: [slot.outer], button: slot.outer },
    ],
    tray: wide ? [380, 500, 620].map((x) => ({ x, y: 560 })) : [170, 270, 370].map((x) => ({ x, y: 712 })),
    trayBox: wide ? { x: 300, y: 515, w: 400, h: 90 } : { x: 90, y: 668, w: 360, h: 90 },
    size: 60,
  };
};
const NEST_WITNESS: Record<string, { label: string; set: SetId; dx: number; dy: number }> = {
  inner: { label: '1', set: 'N', dx: 0, dy: 62 },
  middle: { label: '0', set: 'W', dx: 0, dy: 62 },
  outer: { label: '−1', set: 'Z', dx: 0, dy: 62 },
};
const SCENE_NEST = placeScene(
  qNest,
  { wide: nestGeo('wide'), tall: nestGeo('tall') },
  [
    { at: 0.3, caption: 'Every counting number is whole: ℕ goes inside 𝕎.' },
    { at: 1.4, caption: 'Every whole number is an integer: 𝕎 goes inside ℤ.' },
    { at: 2.9, caption: 'ℕ ⊂ 𝕎 ⊂ ℤ: each group sits inside the next.' },
  ],
  5.0,
  {
    fly: { at: 0.4, stagger: 0.45, dur: 0.75 },
    flight(id) {
      // Inner ring first (ℕ, 𝕎, ℤ), whatever order the tokens were listed in.
      const order = ['N', 'W', 'Z'].indexOf(id);
      return { at: 0.4 + order * 0.5 };
    },
    ringLook(def, u) {
      const order = ['inner', 'middle', 'outer'].indexOf(def.region ?? '');
      const set = (['N', 'W', 'Z'] as SetId[])[order];
      const c = smooth(ramp(u, 0.4 + order * 0.5 + 0.6, 0.4 + order * 0.5 + 1.0));
      return [
        { look: 'quiet', alpha: 1 - c },
        { look: set, alpha: c },
      ];
    },
    over(pen, geo, u, view) {
      // A witness drops into each pocket (1 ∈ ℕ, 0 ∈ 𝕎, −1 ∈ ℤ), then the chain is written.
      ['inner', 'middle', 'outer'].forEach((id, k) => {
        const w = NEST_WITNESS[id];
        const s = geo.regions.find((r) => r.id === id)!.slots[0];
        const a = fadeIn(u, 2.0 + k * 0.18, 0.3);
        const y = s.y + w.dy - 24 * (1 - outCubic(ramp(u, 2.0 + k * 0.18, 2.4 + k * 0.18)));
        glyph(pen, w.label, s.x + w.dx, y, 36, SETS[w.set].text, a);
      });
      const at = view.layout === 'wide' ? { x: 500, y: 562 } : { x: 270, y: 712 };
      statement(pen, 'ℕ ⊂ 𝕎 ⊂ ℤ', at.x, at.y, 52, (k) => fadeIn(u, 2.9 + k * 0.1, 0.3));
    },
  },
);

// ─── Q3 first home ───────────────────────────────────────────────────────────────────────────────────────────────────

const qFirst = QUESTIONS[2] as PlaceQuestion;
const firstGeo = (layout: Layout): PlaceGeo => {
  const n = NEST[layout];
  const wide = layout === 'wide';
  const sym = wide ? { N: { x: 300, y: 205 }, W: { x: 590, y: 200 }, Z: { x: 810, y: 200 } } : { N: { x: 270, y: 135 }, W: { x: 270, y: 358 }, Z: { x: 270, y: 506 } };
  const slot = wide ? { N: { x: 300, y: 298 }, W: { x: 590, y: 292 }, Z: { x: 810, y: 292 } } : { N: { x: 270, y: 228 }, W: { x: 270, y: 430 }, Z: { x: 270, y: 580 } };
  return {
    rings: [
      { shape: n.outer, look: 'Z', region: 'Z', symbol: { id: 'Z', at: sym.Z, size: 50 } },
      { shape: n.middle, look: 'W', region: 'W', symbol: { id: 'W', at: sym.W, size: 50 } },
      { shape: n.inner, look: 'N', region: 'N', symbol: { id: 'N', at: sym.N, size: 50 } },
    ],
    regions: [
      { id: 'N', shape: n.inner, slots: [slot.N, { x: slot.N.x + 70, y: slot.N.y }, { x: slot.N.x - 70, y: slot.N.y }], button: sym.N },
      { id: 'W', shape: n.middle, slots: [slot.W, { x: slot.W.x + (wide ? 0 : 75), y: slot.W.y + (wide ? 62 : 0) }, { x: slot.W.x - (wide ? 0 : 75), y: slot.W.y - (wide ? 0 : 0) + (wide ? 124 : 0) }], button: sym.W },
      { id: 'Z', shape: n.outer, slots: [slot.Z, { x: slot.Z.x + (wide ? 0 : 75), y: slot.Z.y + (wide ? 62 : 0) }, { x: slot.Z.x - (wide ? 0 : 75), y: slot.Z.y + (wide ? 124 : 0) }], button: sym.Z },
    ],
    tray: wide ? [380, 500, 620].map((x) => ({ x, y: 562 })) : [170, 270, 370].map((x) => ({ x, y: 712 })),
    trayBox: wide ? { x: 300, y: 517, w: 400, h: 90 } : { x: 90, y: 668, w: 360, h: 90 },
    size: 50,
  };
};
const SCENE_FIRST = placeScene(
  qFirst,
  { wide: firstGeo('wide'), tall: firstGeo('tall') },
  [
    { at: 0.3, caption: '5 counts things: its first home is ℕ.' },
    { at: 1.3, caption: '0 is not counted, but it is whole: 0 ∈ 𝕎, 0 ∉ ℕ.' },
    { at: 2.3, caption: '−3 is a debt: the integers ℤ hold it first.' },
  ],
  5.0,
  {
    fly: { at: 0.4, stagger: 0.5, dur: 0.75 },
    flight(id) {
      const order = ['five', 'zero', 'minus-three'].indexOf(id);
      return { at: 0.4 + order * 0.95 };
    },
    over(pen, _geo, u, view) {
      const at = view.layout === 'wide' ? { x: 500, y: 568 } : { x: 270, y: 716 };
      statement(pen, '5 ∈ ℕ    0 ∈ 𝕎    −3 ∈ ℤ', at.x, at.y, view.layout === 'wide' ? 44 : 36, (k) => fadeIn(u, 3.5 + k * 0.07, 0.3), {}, { members: { 5: 'N', 0: 'W', '−3': 'Z' } });
    },
  },
);

// ─── Q5 the trick (−8⁄4) ─────────────────────────────────────────────────────────────────────────────────────────────

const qTrick = QUESTIONS[4] as PlaceQuestion;
const chainGeo = (layout: Layout): PlaceGeo => {
  const wide = layout === 'wide';
  const R = wide ? rect(30, 28, 970, 500, 34) : rect(25, 25, 515, 700, 30);
  const Q = wide ? ell(395, 264, 345, 212) : ell(270, 300, 232, 266);
  const Z = wide ? ell(330, 264, 265, 166) : ell(270, 255, 194, 219);
  const W = wide ? ell(265, 264, 190, 126) : ell(270, 212, 158, 173);
  const N = wide ? ell(205, 264, 120, 86) : ell(270, 170, 120, 126);
  const sym = wide
    ? { N: { x: 205, y: 232 }, W: { x: 390, y: 222 }, Z: { x: 525, y: 216 }, Q: { x: 668, y: 212 }, I: { x: 855, y: 200 }, R: { x: 70, y: 70 } }
    : { N: { x: 270, y: 128 }, W: { x: 196, y: 340 }, Z: { x: 196, y: 428 }, Q: { x: 196, y: 518 }, I: { x: 196, y: 630 }, R: { x: 64, y: 64 } };
  const slot = wide
    ? { N: { x: 205, y: 298 }, W: { x: 390, y: 302 }, Z: { x: 525, y: 302 }, Q: { x: 668, y: 302 }, I: { x: 855, y: 302 } }
    : { N: { x: 270, y: 212 }, W: { x: 336, y: 340 }, Z: { x: 336, y: 428 }, Q: { x: 336, y: 518 }, I: { x: 336, y: 630 } };
  const rings: RingDef[] = [
    { shape: R, look: 'R', symbol: { id: 'R', at: sym.R, size: 44 } },
    { shape: { kind: 'minus', outer: R, hole: Q }, look: 'I', region: 'I', symbol: { id: 'I', at: sym.I, size: 44 } },
    { shape: Q, look: 'Q', region: 'Q', symbol: { id: 'Q', at: sym.Q, size: 44 } },
    { shape: Z, look: 'Z', region: 'Z', symbol: { id: 'Z', at: sym.Z, size: 44 } },
    { shape: W, look: 'W', region: 'W', symbol: { id: 'W', at: sym.W, size: 44 } },
    { shape: N, look: 'N', region: 'N', symbol: { id: 'N', at: sym.N, size: 44 } },
  ];
  return {
    rings,
    regions: [
      { id: 'N', shape: N, slots: [slot.N], button: sym.N },
      { id: 'W', shape: W, slots: [slot.W], button: sym.W },
      { id: 'Z', shape: Z, slots: [slot.Z], button: sym.Z },
      { id: 'Q', shape: Q, slots: [slot.Q], button: sym.Q },
      { id: 'I', shape: R, slots: [slot.I], button: sym.I },
    ],
    tray: [wide ? { x: 500, y: 566 } : { x: 270, y: 754 }],
    trayBox: wide ? { x: 380, y: 526, w: 240, h: 84 } : { x: 160, y: 712, w: 220, h: 84 },
    size: 40,
  };
};
const SCENE_TRICK = placeScene(
  qTrick,
  { wide: chainGeo('wide'), tall: chainGeo('tall') },
  [
    { at: 0.3, caption: 'Simplify it first: −8 ÷ 4 = −2.' },
    { at: 1.9, caption: '−2 is a whole debt, an integer: −2 ∈ ℤ.' },
    { at: 3.2, caption: 'It is in ℚ too, but ℤ ⊂ ℚ: ℤ is its first home.' },
  ],
  5.4,
  {
    // The token rises to the start row, is simplified there, then drops into ℤ.
    flight(_id, u) {
      return { label: u < 1.4 ? '−8⁄4' : '−2', at: 1.9 };
    },
    under(pen, geo, u, view) {
      const tray = geo.tray[0];
      const a = fadeIn(u, 0.3, 0.3) * (1 - fadeIn(u, 2.9, 0.3));
      statement(pen, '−8⁄4 = −2', tray.x, tray.y + (view.layout === 'wide' ? 0 : 0), 40, (k) => a * fadeIn(u, 0.3 + k * 0.12, 0.3), {}, { members: { '−2': 'Z' } });
      // ℚ lights a little too ("it is in ℚ as well").
      const q = geo.regions.find((r) => r.id === 'Q')!;
      if (u > 3.2) ring(pen, q.shape, 'Q', { lit: pulse(u, 3.2, 1.0), alpha: 0.9 });
      statement(pen, '−2 ∈ ℤ ⊂ ℚ', tray.x, tray.y, 40, (k) => fadeIn(u, 3.3 + k * 0.1, 0.3), {}, { members: { '−2': 'Z' } });
    },
    fly: { at: 1.9, stagger: 0, dur: 0.8 },
  },
);

// ─── Q8 decimals ─────────────────────────────────────────────────────────────────────────────────────────────────────

const qDec = QUESTIONS[7] as PlaceQuestion;
const decGeo = (layout: Layout): PlaceGeo => {
  const wide = layout === 'wide';
  const R = wide ? rect(30, 28, 970, 468, 34) : rect(25, 25, 515, 612, 30);
  const Q = wide ? ell(300, 248, 268, 192) : ell(270, 196, 226, 152);
  const qs = wide ? [190, 262, 334].map((y) => ({ x: 250, y })) : [158, 214, 270].map((y) => ({ x: 200, y }));
  const is = wide ? [190, 262, 334].map((y) => ({ x: 775, y })) : [452, 506, 560].map((y) => ({ x: 270, y }));
  return {
    rings: [
      { shape: R, look: 'R', symbol: { id: 'R', at: wide ? { x: 70, y: 430 } : { x: 62, y: 578 }, size: 40 } },
      { shape: { kind: 'minus', outer: R, hole: Q }, look: 'I', region: 'I', symbol: { id: 'I', at: wide ? { x: 775, y: 110 } : { x: 270, y: 396 }, size: 46 } },
      { shape: Q, look: 'Q', region: 'Q', symbol: { id: 'Q', at: wide ? { x: 300, y: 108 } : { x: 270, y: 82 }, size: 46 } },
    ],
    regions: [
      { id: 'Q', shape: Q, slots: qs, button: wide ? { x: 300, y: 108 } : { x: 270, y: 82 } },
      { id: 'I', shape: R, slots: is, button: wide ? { x: 775, y: 110 } : { x: 270, y: 396 } },
    ],
    tray: wide ? [{ x: 200, y: 552 }, { x: 420, y: 552 }, { x: 720, y: 552 }] : [{ x: 270, y: 660 }, { x: 270, y: 712 }, { x: 270, y: 764 }],
    trayBox: wide ? { x: 60, y: 508, w: 880, h: 90 } : { x: 40, y: 628, w: 460, h: 168 },
    size: wide ? 38 : 32,
  };
};
const SCENE_DECIMALS = placeScene(
  qDec,
  { wide: decGeo('wide'), tall: decGeo('tall') },
  [
    { at: 0.3, caption: '0.333… repeats for ever: it is 1⁄3, so it is in ℚ.' },
    { at: 1.4, caption: '0.75 stops: it is 75⁄100 = 3⁄4, in ℚ.' },
    { at: 2.5, caption: '0.1010010001… never repeats: no fraction makes it, so it is in 𝕀.' },
  ],
  5.6,
  {
    fly: { at: 0.4, stagger: 1.1, dur: 0.8 },
    over(pen, geo, u, view) {
      const wide = view.layout === 'wide';
      const qs = geo.regions[0].slots;
      const off = wide ? 112 : 96;
      statement(pen, '= 1⁄3', qs[0].x + off, qs[0].y, geo.size, (k) => fadeIn(u, 1.25 + k * 0.1, 0.3), { 1: NUMBER_FX.fraction.text }, { align: 'left' });
      statement(pen, '= 3⁄4', qs[1].x + off - (wide ? 30 : 24), qs[1].y, geo.size, (k) => fadeIn(u, 2.35 + k * 0.1, 0.3), { 1: NUMBER_FX.fraction.text }, { align: 'left' });
      // The irrational's pattern: one more 0 each time (a quiet ink underline under each run of zeros, in turn).
      const i = geo.regions[1].slots[0];
      const label = '0.1010010001…';
      const w = widthOf(pen, label, geo.size);
      const left = i.x - w / 2;
      const runs = [[3, 4], [5, 7], [8, 11]];
      runs.forEach(([a, b], k) => {
        const x0 = left + widthOf(pen, label.slice(0, a), geo.size);
        const x1 = left + widthOf(pen, label.slice(0, b), geo.size);
        const y = i.y + geo.size * 0.62;
        inkLine(pen, [{ x: x0 + 2, y }, { x: x1 - 2, y }], 0.85, ramp(u, 3.5 + k * 0.35, 3.85 + k * 0.35), 2);
      });
      glyph(pen, 'never repeats', i.x, i.y + geo.size * 1.35, geo.size * 0.78, INK, fadeIn(u, 4.6, 0.35), { words: true, italic: true });
    },
  },
);

// ═══ LINE: a point on the number line ════════════════════════════════════════════════════════════════════════════════

type LineScene = { /** When the solution's point lands on the answer (a wrong point slides there to meet it). */ land: number; geo: Record<Layout, LineGeo>; design?: Scene['design']; /** The target written as a stacked fraction (the film's way), else as text. */ stacked?: [string, string]; paintFixed?(pen: Pen, L: LineGeo, layout: Layout, u: number): void; paintSolution(pen: Pen, L: LineGeo, layout: Layout, u: number, sol: Solution): void; guide?(pen: Pen, L: LineGeo, value: number): void; steps: Step[]; duration: number; labelSize: number };

function lineScene(q: LineQuestion, s: LineScene): Scene {
  const pointAt = (pen: Pen, L: LineGeo, value: number, lifted: number) => {
    const x = lineX(L, value);
    inkLine(pen, Array.from({ length: 41 }, (_, i) => ({ x: x + Math.cos((i / 40) * Math.PI * 2) * 15, y: L.y + Math.sin((i / 40) * Math.PI * 2) * 15 })), 0.85 + 0.15 * lifted, 1, 2);
    const g = pen.g;
    g.save();
    g.fillStyle = QUIET(0.95);
    g.beginPath();
    g.arc(x, L.y, 5.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  const labelColour = q.id === 'root-three' ? NUMBER_FX.irrational.text : NUMBER_FX.fraction.text;
  return {
    design: s.design,
    duration: s.duration,
    steps: s.steps,
    line: (layout) => s.geo[layout],
    hits(layout, response) {
      const L = s.geo[layout];
      const r = response as LineResponse;
      const x = lineX(L, r.value);
      return [{ id: 'point', role: 'slider', x: x - 32, y: L.y - 32, w: 64, h: 64, label: `The point for ${q.target}` }];
    },
    paint(pen, view) {
      const L = s.geo[view.layout];
      const sol = view.solution;
      const u = sol ? sol.u : -1;
      s.paintFixed?.(pen, L, view.layout, u);
      numberLine(pen, L, s.labelSize);
      const r = (sol ? sol.response : view.response) as LineResponse;
      if (!sol) {
        s.guide?.(pen, L, r.value);
        pointAt(pen, L, r.value, view.drag ? 1 : 0);
        if (s.stacked) fraction(pen, s.stacked[0], s.stacked[1], lineX(L, r.value), L.y - 74, s.labelSize * 0.95, labelColour, 1);
        else glyph(pen, q.target, lineX(L, r.value), L.y - 58, s.labelSize * 1.15, labelColour, 1);
        return;
      }
      if (sol.verdict.correct) {
        // A right answer stays where it was put; the solution draws the truth over it.
        pointAt(pen, L, r.value, 0);
        s.paintSolution(pen, L, view.layout, u, sol);
        return;
      }
      // A wrong point: circled and crossed where it was put, it waits while the solution works; then it slides along the
      // line to the answer as the solution's point lands there, and gets its tick.
      const move = minJerk(ramp(u, s.land - 0.7, s.land));
      if (move < 1) pointAt(pen, L, mix(r.value, q.answer, move), 0);
      s.paintSolution(pen, L, view.layout, u, sol);
      mistakeMarks(pen, lineX(L, r.value), L.y, 27, 27, sol.t, ramp(u, s.land - 0.7, s.land - 0.4));
      arrivedTick(pen, lineX(L, q.answer) + 34, L.y - 28, 10, u, s.land);
    },
  };
}

// ─── Q4 ¾ ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const qQuarter = QUESTIONS[3] as LineQuestion;
const SCENE_QUARTER = lineScene(qQuarter, {
  geo: { wide: { x0: 140, x1: 860, y: 360, v0: 0, v1: 2 }, tall: { x0: 60, x1: 480, y: 300, v0: 0, v1: 2 } },
  design: { tall: { w: 540, h: 480 } },
  labelSize: 34,
  stacked: ['3', '4'],
  land: 3.1,
  duration: 5.6,
  steps: [
    { at: 0.3, caption: 'Cut the space from 0 to 1 into 4 equal parts.' },
    { at: 1.7, caption: 'Take 3 of those parts: three quarters.' },
    { at: 3.1, caption: '¾ is three quarters of the way from 0 to 1.' },
  ],
  paintSolution(pen, L, _layout, u) {
    const lilac = NUMBER_FX.fraction.text;
    // The quarters: three ticks between 0 and 1, one after another.
    // The quarters as the film's "Fractions" line (film 11:42): a lilac dot on the line at each quarter, its stacked
    // fraction above it, one after another.
    const top = L.y - 70;
    ['1/4', '1/2', '3/4'].forEach((label, k) => {
      const v = (k + 1) / 4;
      const a = fadeIn(u, 0.4 + k * 0.3, 0.3);
      dot(pen, lineX(L, v), L.y, 4.5, 'fraction', a);
      const [n, d] = label.split('/');
      const last = k === 2 ? fadeIn(u, 3.1, 0.3) : 0;
      fraction(pen, n, d, lineX(L, v), top, 26 + 8 * last, lilac, a, last > 0 ? NUMBER_FX.fraction.halo : undefined);
    });
    // Three hops of a quarter, low arcs just over the line (ANIM-05), 0 → ¼ → ½ → ¾.
    for (let k = 0; k < 3; k++) {
      const at = 1.7 + k * 0.42;
      const d = ramp(u, at, at + 0.4);
      if (d <= 0) continue;
      const x0 = lineX(L, k / 4);
      const x1 = lineX(L, (k + 1) / 4);
      const h = Math.min(26, (x1 - x0) * 0.3);
      const pts = Array.from({ length: 25 }, (_, i) => {
        const t = i / 24;
        return { x: mix(x0, x1, t), y: L.y - 6 - Math.sin(Math.PI * t) * h };
      });
      lineGlow(pen, (g) => {
        const n = Math.max(2, Math.round(pts.length * minJerk(d)));
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < n; i++) g.lineTo(pts[i].x, pts[i].y);
      }, 'fraction', 0.9, 2);
    }
    const land = fadeIn(u, 3.1, 0.3);
    const x = lineX(L, 0.75);
    if (land > 0) {
      dot(pen, x, L.y, 7, 'fraction', land);
      lineGlow(pen, (g) => g.arc(x, L.y, 16 + 12 * (1 - land), 0, Math.PI * 2), 'fraction', land, 2.2);
    }
  },
});

// ─── Q10 √3 by the compass ───────────────────────────────────────────────────────────────────────────────────────────

const qRoot = QUESTIONS[9] as LineQuestion;
const ROOT2 = Math.SQRT2;
const ROOT3 = Math.sqrt(3);
const THETA = Math.atan2(1, ROOT2);
const SCENE_ROOT = lineScene(qRoot, {
  geo: { wide: { x0: 150, x1: 870, y: 500, v0: 0, v1: 2 }, tall: { x0: 55, x1: 485, y: 440, v0: 0, v1: 2 } },
  design: { tall: { w: 540, h: 620 } },
  labelSize: 32,
  land: 3.2,
  duration: 6.4,
  steps: [
    { at: 0.3, caption: 'The slanted side: (√2)² + 1² = 2 + 1 = 3, so it is √3 long.' },
    { at: 1.8, caption: 'The compass keeps that length and swings it down onto the line.' },
    { at: 3.6, caption: '√3 ≈ 1.73: it lands between 1.7 and 1.8.' },
  ],
  paintFixed(pen, L, layout, u) {
    const unit = lineX(L, 1) - lineX(L, 0);
    // Tenths between 1 and 2 (faint), so 1.7 and 1.8 can be found.
    for (let k = 1; k < 10; k++) {
      const x = lineX(L, 1 + k / 10);
      inkLine(pen, [{ x, y: L.y - 7 }, { x, y: L.y + 7 }], k === 7 || k === 8 ? 0.45 + 0.4 * (u > 3.6 ? fadeIn(u, 3.6, 0.3) : 0) : 0.32, 1, 1.2);
    }
    // √2 on the line (the film's rose point), the unit upright on it, the slanted side from 0.
    const x2 = lineX(L, ROOT2);
    const top = { x: x2, y: L.y - unit };
    dot(pen, x2, L.y, 6, 'irrational', 1);
    glyph(pen, '√2', x2 + (layout === 'wide' ? 0 : 0), L.y + 32 * 1.95, 30, NUMBER_FX.irrational.text, 1);
    inkLine(pen, [{ x: x2, y: L.y }, top], 0.8, 1, 2);
    inkLine(pen, [{ x: x2 - 16, y: L.y }, { x: x2 - 16, y: L.y - 16 }, { x: x2, y: L.y - 16 }], 0.6, 1, 1.4);
    glyph(pen, '1', x2 + 20, L.y - unit / 2, 30, NUMBER_FX.natural.text, 1, { align: 'left' });
    inkLine(pen, [{ x: lineX(L, 0), y: L.y }, top], 0.7, 1, 1.8, [9, 7]);
  },
  guide(pen, L, value) {
    // The compass's trace: an arc from the point, round 0, up past the slanted side.
    const cx = lineX(L, 0);
    const r = lineX(L, value) - cx;
    if (r < 4) return;
    const pts = Array.from({ length: 41 }, (_, i) => {
      const a = (i / 40) * (THETA + 0.12);
      return { x: cx + Math.cos(a) * r, y: L.y - Math.sin(a) * r };
    });
    inkLine(pen, pts, 0.55, 1, 1.4, [5, 6]);
  },
  paintSolution(pen, L, layout, u) {
    const unit = lineX(L, 1) - lineX(L, 0);
    const needle: P2 = [lineX(L, 0), L.y];
    const rose = NUMBER_FX.irrational;
    // The slanted side lights rose (its length is √3), with the sum.
    const side = fadeIn(u, 0.3, 0.4);
    const top = { x: lineX(L, ROOT2), y: L.y - unit };
    lineGlow(pen, (g) => (g.moveTo(needle[0], needle[1]), g.lineTo(top.x, top.y)), 'irrational', side * 0.9, 2);
    const head = layout === 'wide' ? { x: 500, y: 56 } : { x: 270, y: 62 };
    statement(pen, '(√2)² + 1² = 3', head.x, head.y, layout === 'wide' ? 44 : 36, (k) => fadeIn(u, 0.5 + k * 0.06, 0.3) * (1 - fadeIn(u, 3.5, 0.3)));
    // The compass opens to the slanted side, then swings down to the line (the pencil draws the arc).
    const span = ROOT3 * unit * outCubic(ramp(u, 1.0, 1.7));
    const swing = minJerk(ramp(u, 1.9, 3.2));
    const angle = THETA * (1 - swing);
    const compassA = fadeIn(u, 0.9, 0.3) * (1 - fadeIn(u, 4.0, 0.4));
    if (swing > 0) {
      const r = ROOT3 * unit;
      lineGlow(pen, (g) => {
        g.arc(needle[0], needle[1], r, -THETA, -angle);
      }, 'irrational', 0.95, 2.2);
    }
    if (compassA > 0) drawFlatCompass(pen.g, needle, angle, Math.max(2, span), ROOT3 * unit * 0.54, compassA);
    const land = fadeIn(u, 3.2, 0.3);
    const x3 = lineX(L, ROOT3);
    if (land > 0) {
      dot(pen, x3, L.y, 7, 'irrational', land);
      lineGlow(pen, (g) => g.arc(x3, L.y, 16 + 12 * (1 - land), 0, Math.PI * 2), 'irrational', land, 2.2);
      glyph(pen, '√3', x3 + 4, L.y - 62, 44, rose.text, land, { glow: rose.halo });
    }
    // 1.7 and 1.8: their labels (gold, as the film's 1.4 and 1.5), the bracket between, the inequality.
    const z = fadeIn(u, 3.7, 0.3);
    // 0.1 apart is narrow (on a phone ~13 px): 1.7 reads to the left of its tick, 1.8 to the right of its own.
    glyph(pen, '1.7', lineX(L, 1.7) - 4, L.y + 98, 26, NUMBER_FX.natural.text, z, { align: 'right' });
    glyph(pen, '1.8', lineX(L, 1.8) + 4, L.y + 98, 26, NUMBER_FX.natural.text, z, { align: 'left' });
    const by = L.y + 74;
    inkLine(pen, [{ x: lineX(L, 1.7), y: by - 10 }, { x: lineX(L, 1.7), y: by }, { x: lineX(L, 1.8), y: by }, { x: lineX(L, 1.8), y: by - 10 }], 0.75, ramp(u, 3.8, 4.2), 1.6);
    statement(pen, '1.7 < √3 < 1.8', head.x, head.y, layout === 'wide' ? 44 : 36, (k) => fadeIn(u, 4.1 + k * 0.08, 0.3));
  },
});

// ═══ CHOOSE: one option per slot ═════════════════════════════════════════════════════════════════════════════════════

type OptionBox = { slot: string; option: string; x: number; y: number; w: number; h: number };

// ─── Q6 the film's puzzle: which is wrong ───────────────────────────────────────────────────────────────────────────

const qWrong = QUESTIONS[5] as ChooseQuestion;
const PANEL_LAYOUT: Record<Layout, { panels: { x: number; y: number }[]; w: number; h: number; size: number; small: number }> = {
  wide: { panels: [{ x: 40, y: 40 }, { x: 520, y: 40 }, { x: 40, y: 330 }, { x: 520, y: 330 }], w: 440, h: 255, size: 64, small: 50 },
  tall: { panels: [0, 1, 2, 3].map((i) => ({ x: 25, y: 22 + i * 192 })), w: 490, h: 174, size: 56, small: 44 },
};
/** Each claim's picture (shown only in the solution: before it, drawing it would give the answer away). */
const PICTURES: Record<string, { outer: SetId; inner: SetId | null; member: { label: string; set: SetId; where: 'inner' | 'outer' | 'out' } | null }> = {
  A: { outer: 'W', inner: 'N', member: { label: '0', set: 'W', where: 'outer' } },
  B: { outer: 'Q', inner: 'Z', member: { label: '−5', set: 'Z', where: 'inner' } },
  C: { outer: 'Q', inner: null, member: { label: '√2', set: 'I', where: 'out' } },
  D: { outer: 'Z', inner: 'W', member: null },
};
const WRONG_STEPS: Step[] = [
  { at: 0.4, caption: 'A: 0 is not a counting number. 0 ∈ 𝕎, so 0 ∉ ℕ. This is the wrong one.' },
  { at: 1.6, caption: 'B: −5 = −5⁄1 is a fraction of integers: −5 ∈ ℚ. True.' },
  { at: 2.8, caption: 'C: √2 is not a fraction: √2 ∉ ℚ. True.' },
  { at: 4.0, caption: 'D: every whole number is an integer: 𝕎 ⊂ ℤ. True.' },
];
function paintPicture(pen: Pen, id: string, box: { x: number; y: number; w: number; h: number }, k: number) {
  const pic = PICTURES[id];
  const cy = box.y + box.h / 2;
  const draw = smooth(ramp(k, 0, 0.45));
  if (pic.inner) {
    const outer = ell(box.x + box.w * 0.5, cy, box.w * 0.47, box.h * 0.44);
    const inner = ell(box.x + box.w * 0.3, cy, box.w * 0.24, box.h * 0.3);
    ringFill(pen, outer, pic.outer, { fill: draw });
    ring(pen, outer, pic.outer, { draw });
    ringFill(pen, inner, pic.inner, { fill: smooth(ramp(k, 0.2, 0.6)) });
    ring(pen, inner, pic.inner, { draw: smooth(ramp(k, 0.2, 0.6)) });
    setSymbol(pen, pic.inner, box.x + box.w * 0.3, cy - box.h * 0.13, box.h * 0.2, fadeIn(k, 0.45, 0.2));
    setSymbol(pen, pic.outer, box.x + box.w * 0.75, cy - box.h * 0.16, box.h * 0.2, fadeIn(k, 0.3, 0.2));
  } else {
    const q = ell(box.x + box.w * 0.38, cy, box.w * 0.34, box.h * 0.42);
    ringFill(pen, q, pic.outer, { fill: draw });
    ring(pen, q, pic.outer, { draw });
    setSymbol(pen, pic.outer, box.x + box.w * 0.38, cy - box.h * 0.13, box.h * 0.22, fadeIn(k, 0.3, 0.2));
  }
  if (pic.member) {
    const m = pic.member;
    const at = m.where === 'inner' ? { x: box.x + box.w * 0.3, y: cy + box.h * 0.13 } : m.where === 'outer' ? { x: box.x + box.w * 0.75, y: cy + box.h * 0.13 } : { x: box.x + box.w * 0.86, y: cy };
    const drop = outCubic(ramp(k, 0.55, 0.85));
    glyph(pen, m.label, at.x, at.y - 20 * (1 - drop), box.h * 0.22, SETS[m.set].text, fadeIn(k, 0.55, 0.2));
  }
}
const SCENE_WRONG: Scene = {
  duration: 5.8,
  steps: WRONG_STEPS,
  hits(layout, response) {
    const P = PANEL_LAYOUT[layout];
    const r = response as ChooseResponse;
    return qWrong.slots[0].options.map((o, i) => ({ id: o.id, role: 'option' as const, slot: 'claim', x: P.panels[i].x, y: P.panels[i].y, w: P.w, h: P.h, label: o.aria, pressed: r.pick.claim === o.id }));
  },
  paint(pen, view) {
    const P = PANEL_LAYOUT[view.layout];
    const sol = view.solution;
    const u = sol ? sol.u : -1;
    const r = (sol ? sol.response : view.response) as ChooseResponse;
    const answer = qWrong.slots[0].answer;
    const wrongPick = !!sol && r.pick.claim !== answer;
    // The picked letter's ring moves to A while A is being shown wrong (its statement is struck at 1.4..1.7).
    const MOVE = 1.3;
    const move = wrongPick ? minJerk(ramp(u, MOVE, MOVE + 0.6)) : 0;
    const letterAt = (id: string) => {
      const p = P.panels[qWrong.slots[0].options.findIndex((o) => o.id === id)];
      return { x: p.x + 35, y: p.y + 38 };
    };
    const circle = (c: Point) => inkLine(pen, Array.from({ length: 41 }, (_, j) => ({ x: c.x + Math.cos((j / 40) * Math.PI * 2) * 22, y: c.y + Math.sin((j / 40) * Math.PI * 2) * 22 })), 0.85, 1, 1.6);
    qWrong.slots[0].options.forEach((o, i) => {
      const p = P.panels[i];
      const picked = r.pick.claim === o.id ? (wrongPick ? 1 - move : 1) : wrongPick && o.id === answer ? move : 0;
      const at = 0.4 + i * 1.2;
      const k = sol ? ramp(u, at, at + 1.0) : 0;
      const isWrong = o.id === 'A';
      glass(pen, p.x, p.y, P.w, P.h, 1, sol ? (isWrong ? 0.6 * fadeIn(u, at + 0.9, 0.3) : 0) + 0.4 * picked : picked);
      // The letter; the picked one gets the quiet ring round it.
      glyph(pen, o.id, p.x + 34, p.y + 38, 34, QUIET(1), 0.9, { words: true, italic: true, rim: 0 });
      if (r.pick.claim === o.id && !wrongPick) circle(letterAt(o.id));
      // The statement: centred while answering; in the solution it moves left and its picture draws beside it.
      const slide = minJerk(ramp(k, 0, 0.35));
      const wideRow = view.layout === 'wide';
      const sx = mix(p.x + P.w / 2, p.x + (wideRow ? 130 : 150), slide);
      const sy = mix(p.y + P.h / 2 + (wideRow ? 6 : 4), p.y + P.h / 2 - (wideRow ? 18 : 10), slide);
      const size = mix(P.size, P.small, slide);
      // Written in the quiet ink while answering (as the film's puzzle: a number's colour would hint at its group); the
      // solution colours each number by its kind.
      const line = statement(pen, o.label, sx, sy, size, () => 1, {}, sol ? { members: { 0: 'W', '−5': 'Z', '√2': 'I' } } : {});
      if (sol) {
        const box = wideRow ? { x: p.x + 240, y: p.y + 24, w: 186, h: P.h - 48 } : { x: p.x + 286, y: p.y + 14, w: 190, h: P.h - 28 };
        if (k > 0) paintPicture(pen, o.id, box, ramp(u, at + 0.3, at + 1.1));
        const verdictY = sy + size * (wideRow ? 0.95 : 0.85);
        if (isWrong) {
          const strike = ramp(u, at + 1.0, at + 1.3);
          inkLine(pen, [{ x: line.left - 6, y: sy + size * 0.08 }, { x: line.right + 6, y: sy - size * 0.12 }], 0.95, strike, 2.4);
          statement(pen, '0 ∉ ℕ', sx, verdictY, size * 0.72, (j) => fadeIn(u, at + 1.25 + j * 0.08, 0.3), {}, { members: { 0: 'W' } });
        } else {
          glyph(pen, 'true', sx, verdictY, size * 0.6, INK, fadeIn(u, at + 1.0, 0.3) * 0.9, { words: true, italic: true });
        }
      }
    });
    if (sol && wrongPick && r.pick.claim) {
      const from = letterAt(r.pick.claim);
      const to = letterAt(answer);
      circle(arc(from, to, move, 40));
      mistakeMarks(pen, from.x, from.y, 22, 22, sol.t, ramp(u, MOVE, MOVE + 0.3), false);
      if (move >= 1) arrivedTick(pen, to.x + 44, to.y, 10, u, MOVE + 0.6);
    }
  },
};

// ─── Q7 set-builder ──────────────────────────────────────────────────────────────────────────────────────────────────

const qBuilder = QUESTIONS[6] as ChooseQuestion;
type BuilderGeo = { lines: { y: number; parts: (string | { blank: string })[] }[]; size: number; rows: { slot: string; label: string; labelAt: Point; chips: Point[] }[]; examplesY: number; examplesX: number[] };
const BUILDER: Record<Layout, BuilderGeo> = {
  wide: {
    lines: [{ y: 170, parts: ['ℚ = { p⁄q : p, q ∈ ', { blank: 'from' }, ' ,  q ≠ ', { blank: 'not' }, ' }'] }],
    size: 52,
    rows: [
      { slot: 'from', label: 'p, q ∈', labelAt: { x: 230, y: 340 }, chips: [380, 490, 600, 710].map((x) => ({ x, y: 340 })) },
      { slot: 'not', label: 'q ≠', labelAt: { x: 230, y: 450 }, chips: [380, 490, 600].map((x) => ({ x, y: 450 })) },
    ],
    examplesY: 560,
    examplesX: [260, 500, 740],
  },
  tall: {
    lines: [
      { y: 96, parts: ['ℚ = { p⁄q :'] },
      { y: 176, parts: ['p, q ∈ ', { blank: 'from' }, ' ,  q ≠ ', { blank: 'not' }, ' }'] },
    ],
    size: 46,
    rows: [
      { slot: 'from', label: 'p, q ∈', labelAt: { x: 270, y: 300 }, chips: [105, 215, 325, 435].map((x) => ({ x, y: 370 })) },
      { slot: 'not', label: 'q ≠', labelAt: { x: 270, y: 470 }, chips: [160, 270, 380].map((x) => ({ x, y: 540 })) },
    ],
    examplesY: 690,
    examplesX: [100, 270, 440],
  },
};
const CHIP_SIZE = 40;
/** When the solution reaches each blank (its underline): a wrong pick there is replaced then. */
const BUILDER_FIX: Record<string, number> = { from: 1.7, not: 2.9 };
function builderBoxes(layout: Layout): OptionBox[] {
  const B = BUILDER[layout];
  return B.rows.flatMap((row) => {
    const slot = qBuilder.slots.find((s) => s.id === row.slot)!;
    return slot.options.map((o, i) => ({ slot: row.slot, option: o.id, x: row.chips[i].x - 46, y: row.chips[i].y - 34, w: 92, h: 68 }));
  });
}
const SCENE_BUILDER: Scene = {
  duration: 6.6,
  steps: [
    { at: 0.3, caption: '{ p⁄q : … } is the set of all fractions p⁄q, such that …' },
    { at: 1.5, caption: 'p, q ∈ ℤ: the top and the bottom are integers.' },
    { at: 2.7, caption: 'q ≠ 0: nothing can be shared among 0 people.' },
    { at: 3.9, caption: 'So 3⁄4 and −5 = −5⁄1 are in ℚ, and 7⁄0 is not a number at all.' },
  ],
  hits(layout, response) {
    const r = response as ChooseResponse;
    return builderBoxes(layout).map((b) => {
      const slot = qBuilder.slots.find((s) => s.id === b.slot)!;
      const o = slot.options.find((x) => x.id === b.option)!;
      return { id: `${b.slot}:${b.option}`, role: 'option' as const, slot: b.slot, x: b.x, y: b.y, w: b.w, h: b.h, label: `${slot.aria} ${o.aria}`, pressed: r.pick[b.slot] === b.option };
    });
  },
  paint(pen, view) {
    const B = BUILDER[view.layout];
    const sol = view.solution;
    const u = sol ? sol.u : -1;
    const r = (sol ? sol.response : view.response) as ChooseResponse;
    const size = B.size;
    const blankW = size * 1.25;
    const spans: Record<string, { x0: number; x1: number; y: number }> = {};
    // The right choices flying into wrong blanks (painted over the chips).
    const flights: { label: string; from: Point; to: Point; k: number; size0: number; size1: number }[] = [];
    // The formula, part by part (MATH-02): every piece measured, the blanks as quiet glass boxes holding the pick.
    for (const line of B.lines) {
      const widths = line.parts.map((p) => (typeof p === 'string' ? widthOf(pen, p, size) : blankW));
      const total = widths.reduce((a, b) => a + b, 0);
      let x = (view.layout === 'wide' ? 500 : 270) - total / 2;
      line.parts.forEach((p, i) => {
        if (typeof p === 'string') {
          statement(pen, p, x, line.y, size, () => 1, {}, { align: 'left', pool: false });
          // Remember the parts the solution underlines.
          const marks: [string, string][] = [['{', 'brace'], ['p⁄q', 'pq'], [':', 'colon']];
          for (const [needle, key] of marks) {
            const at = p.indexOf(needle);
            if (at >= 0) {
              const x0 = x + widthOf(pen, p.slice(0, at), size);
              spans[key] = { x0, x1: x0 + widthOf(pen, needle, size), y: line.y };
            }
          }
          if (p.includes('p, q ∈')) {
            const at = p.indexOf('p, q ∈');
            spans.pqIn = { x0: x + widthOf(pen, p.slice(0, at), size), x1: x + widthOf(pen, p.slice(0, at + 6), size), y: line.y };
          }
          if (p.includes('q ≠')) {
            const at = p.indexOf('q ≠');
            spans.qNot = { x0: x + widthOf(pen, p.slice(0, at), size), x1: x + widthOf(pen, p.slice(0, at + 3), size), y: line.y };
          }
        } else {
          const slot = qBuilder.slots.find((s) => s.id === p.blank)!;
          const cx = x + blankW / 2;
          spans[p.blank] = { x0: x, x1: x + blankW, y: line.y };
          glass(pen, x + 4, line.y - size * 0.62, blankW - 8, size * 1.24, 1, 0, 10);
          const picked = r.pick[p.blank];
          const wrong = !!sol && picked !== slot.answer;
          const at = BUILDER_FIX[p.blank];
          const move = wrong ? minJerk(ramp(u, at, at + 0.6)) : 0;
          if (picked) {
            const o = slot.options.find((x2) => x2.id === picked)!;
            statement(pen, o.label, cx, line.y, size * 0.9, () => (wrong ? 1 - smooth(ramp(u, at, at + 0.25)) : 1), {}, { pool: false });
          } else if (!sol) inkLine(pen, [{ x: cx - 12, y: line.y + size * 0.3 }, { x: cx + 12, y: line.y + size * 0.3 }], 0.5, 1, 2);
          if (sol && wrong) {
            mistakeMarks(pen, cx, line.y, blankW * 0.62, size * 0.78, sol.t, ramp(u, at, at + 0.3));
            const row = B.rows.find((rw) => rw.slot === p.blank)!;
            const from = row.chips[slot.options.findIndex((x2) => x2.id === slot.answer)];
            flights.push({ label: slot.options.find((x2) => x2.id === slot.answer)!.label, from, to: { x: cx, y: line.y }, k: move, size0: CHIP_SIZE, size1: size * 0.9 });
            if (move >= 1) arrivedTick(pen, x + blankW - 2, line.y - size * 0.66, 9, u, at + 0.6);
          }
        }
        x += widths[i];
      });
    }
    // The chips (two rows), each row with its own label so it is clear which gap it fills.
    for (const row of B.rows) {
      const slot = qBuilder.slots.find((s) => s.id === row.slot)!;
      // In the solution the choices step back a little (EYE-01: the formula is the focus), never below 0.85: faded type
      // still reads at >= 7:1 (contrast.py).
      const fade = sol ? 1 - 0.15 * smooth(ramp(u, 0.2, 0.6)) : 1;
      statement(pen, row.label, row.labelAt.x, row.labelAt.y, view.layout === 'wide' ? 36 : 32, () => Math.min(0.85, fade), {}, { pool: false });
      const pick = r.pick[row.slot];
      const wrongRow = !!sol && pick !== slot.answer;
      const mv = wrongRow ? minJerk(ramp(u, BUILDER_FIX[row.slot], BUILDER_FIX[row.slot] + 0.6)) : 0;
      slot.options.forEach((o, i) => chip(pen, o.label, row.chips[i].x, row.chips[i].y, CHIP_SIZE, fade, { picked: o.id === pick ? 1 - mv : o.id === slot.answer && wrongRow ? mv : 0, minW: 76 }));
    }
    for (const f of flights) {
      if (f.k <= 0 || f.k >= 1) {
        if (f.k >= 1) statement(pen, f.label, f.to.x, f.to.y, f.size1, () => 1, {}, { pool: false });
        continue;
      }
      const at = arc(f.from, f.to, f.k, 50);
      statement(pen, f.label, at.x, at.y, mix(f.size0, f.size1, f.k), () => 1, {}, { pool: false });
    }
    if (!sol) return;
    // MATH-02: the parts in turn, a quiet underline under each as its step is said.
    const under = (key: string, at: number) => {
      const s = spans[key];
      if (!s) return;
      inkLine(pen, [{ x: s.x0, y: s.y + size * 0.62 }, { x: s.x1, y: s.y + size * 0.62 }], 0.9, ramp(u, at, at + 0.35), 2.2);
    };
    under('brace', 0.4);
    under('pq', 0.75);
    under('colon', 1.1);
    under('pqIn', 1.5);
    under('from', 1.7);
    under('qNot', 2.7);
    under('not', 2.9);
    // Examples arrive: 3⁄4 and −5⁄1 are in; 7⁄0 is refused (struck in the quiet ink).
    const ex: { text: string; members: Record<string, SetId> }[] = [
      { text: '3⁄4', members: { '3⁄4': 'Q' } },
      { text: '−5⁄1 = −5', members: { '−5⁄1': 'Z', '−5': 'Z' } },
      { text: '7⁄0', members: {} },
    ];
    ex.forEach((e, i) => {
      const at = 3.9 + i * 0.5;
      const a = fadeIn(u, at, 0.3);
      const y = B.examplesY - 18 * (1 - outCubic(ramp(u, at, at + 0.4)));
      const line = statement(pen, e.text, B.examplesX[i], y, view.layout === 'wide' ? 44 : 34, () => a, {}, { members: e.members });
      if (i === 2) inkLine(pen, [{ x: line.left - 8, y: y + 8 }, { x: line.right + 8, y: y - 10 }], 0.95, ramp(u, at + 0.5, at + 0.8), 2.4);
    });
  },
};

// ─── Q9 the square of area 2 ─────────────────────────────────────────────────────────────────────────────────────────

const qArea = QUESTIONS[8] as ChooseQuestion;
type AreaGeo = { U: number; OX: number; OY: number; rows: { slot: string; label: string; labelAt: Point; chips: Point[] }[]; maths: Point[]; mathSize: number };
const AREA: Record<Layout, AreaGeo> = {
  wide: {
    U: 132,
    OX: 330,
    OY: 312,
    rows: [
      { slot: 'side', label: 'side =', labelAt: { x: 780, y: 112 }, chips: [630, 730, 830, 930].map((x) => ({ x, y: 182 })) },
      { slot: 'fraction', label: 'side  ?  ℚ', labelAt: { x: 780, y: 300 }, chips: [710, 850].map((x) => ({ x, y: 370 })) },
    ],
    maths: [{ x: 780, y: 470 }, { x: 780, y: 524 }, { x: 780, y: 586 }],
    mathSize: 38,
  },
  tall: {
    U: 96,
    OX: 318,
    OY: 214,
    rows: [
      { slot: 'side', label: 'side =', labelAt: { x: 270, y: 370 }, chips: [115, 218, 322, 425].map((x) => ({ x, y: 432 })) },
      { slot: 'fraction', label: 'side  ?  ℚ', labelAt: { x: 270, y: 520 }, chips: [200, 340].map((x) => ({ x, y: 584 })) },
    ],
    maths: [{ x: 270, y: 668 }, { x: 270, y: 716 }, { x: 270, y: 768 }],
    mathSize: 32,
  },
};
/** When the solution reaches each row: the side at 2.9 (once √2 is drawn), the fraction at 5.0 (√2 ∉ ℚ). */
const AREA_FIX: Record<string, number> = { side: 2.9, fraction: 5.0 };
const SCENE_AREA: Scene = {
  duration: 7.0,
  steps: [
    { at: 0.3, caption: 'Cut two unit squares along their diagonals: the four halves make a square of area 2.' },
    { at: 2.7, caption: 'Side × side = 2, so the side is √2.' },
    { at: 3.7, caption: '1.4² = 1.96 and 1.5² = 2.25: no number you can write as a fraction squares to exactly 2.' },
    { at: 5.0, caption: 'So √2 is not a fraction: √2 ∉ ℚ.' },
  ],
  hits(layout, response) {
    const A = AREA[layout];
    const r = response as ChooseResponse;
    return A.rows.flatMap((row) => {
      const slot = qArea.slots.find((s) => s.id === row.slot)!;
      return slot.options.map((o, i) => ({ id: `${row.slot}:${o.id}`, role: 'option' as const, slot: row.slot, x: row.chips[i].x - 46, y: row.chips[i].y - 34, w: 92, h: 68, label: `${slot.aria}: ${o.aria}`, pressed: r.pick[row.slot] === o.id }));
    });
  },
  paint(pen, view) {
    const A = AREA[view.layout];
    const sol = view.solution;
    const u = sol ? sol.u : -1;
    const r = (sol ? sol.response : view.response) as ChooseResponse;
    const fig = (p: P2): Point => ({ x: A.OX + p[0] * A.U, y: A.OY - p[1] * A.U });
    const poly = (pts: readonly P2[]) => [...pts.map(fig), fig(pts[0])];
    const fill = (pts: readonly P2[], colour: string, a: number) => {
      if (a <= 0) return;
      const g = pen.g;
      g.save();
      g.globalAlpha = a;
      g.fillStyle = colour;
      g.beginPath();
      pts.map(fig).forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
      g.closePath();
      g.fill();
      g.restore();
    };
    const lit = (pts: readonly P2[], kind: NumberKind, a: number, w = 2.4) => lineGlow(pen, (g) => poly(pts).forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))), kind, a, w);
    const gold = 'rgba(255, 211, 107, 0.13)';
    const formed = sol ? smooth(ramp(u, 2.5, 2.9)) : 0;
    // The big square: quiet dashed ink (its side unknown) until the solution forms it in rose (the film's colours).
    inkLine(pen, poly(BIG_SQUARE), 0.75 * (1 - formed), 1, 2, [10, 8]);
    if (formed > 0) {
      fill(BIG_SQUARE, 'rgba(255, 150, 190, 0.12)', formed);
      lit(BIG_SQUARE, 'irrational', formed * 0.9, 2.6);
    }
    // The two unit squares, gold (area 1 each); in the solution they are cut and the halves slide (rootGeometry.ts).
    const cut = sol ? ramp(u, 0.3, 0.7) : 0;
    const pieceK = (id: string) => (sol ? minJerk(ramp(u, 0.8 + SLIDE_ORDER.indexOf(id as never) * 0.42, 1.25 + SLIDE_ORDER.indexOf(id as never) * 0.42)) : 0);
    if (!sol || cut < 1) {
      for (const sq of [SQUARE_1, SQUARE_2]) {
        fill(sq, gold, 1);
        lit(sq, 'natural', 0.9);
      }
      if (cut > 0) {
        inkLine(pen, [fig([0, 0]), fig([-1, -1])], 0.9, cut, 2);
        inkLine(pen, [fig([1, 0]), fig([0, 1])], 0.9, cut, 2);
      }
    } else {
      for (const id of Object.keys(PIECES)) {
        const tri = triAt(PIECES[id as keyof typeof PIECES], pieceK(id));
        fill(tri, gold, 1 - 0.4 * formed);
        lit(tri, 'natural', 0.9 * (1 - 0.6 * formed), 2);
      }
    }
    const labelA = sol ? 1 - fadeIn(u, 0.3, 0.3) : 1;
    glyph(pen, '1', fig([-0.5, -0.5]).x, fig([-0.5, -0.5]).y, A.U * 0.36, NUMBER_FX.natural.text, labelA);
    glyph(pen, '1', fig([0.5, 0.5]).x, fig([0.5, 0.5]).y, A.U * 0.36, NUMBER_FX.natural.text, labelA);
    // "area 2" inside the big square; the side marked "?" until √2 replaces it.
    const c = fig([-1, 1]);
    glyph(pen, 'area 2', c.x, c.y, A.U * 0.26, INK, sol ? fadeIn(u, 2.7, 0.3) : 1, { words: true, italic: true, pool: true });
    const pq = { a: fig([-1, 0]), b: fig([0, 1]) };
    const mid = { x: (pq.a.x + pq.b.x) / 2, y: (pq.a.y + pq.b.y) / 2 };
    const out = { x: 0.7071, y: 0.7071 };
    const sideLabel = { x: mid.x + out.x * A.U * 0.32, y: mid.y + out.y * A.U * 0.32 };
    const rootIn = sol ? fadeIn(u, 2.8, 0.3) : 0;
    glyph(pen, '?', sideLabel.x, sideLabel.y, A.U * 0.32, INK, 1 - rootIn);
    if (rootIn > 0) {
      lineGlow(pen, (g) => (g.moveTo(pq.a.x, pq.a.y), g.lineTo(pq.b.x, pq.b.y)), 'irrational', rootIn, 3.4);
      glyph(pen, '√2', sideLabel.x + 6, sideLabel.y, A.U * 0.32, NUMBER_FX.irrational.text, rootIn, { glow: NUMBER_FX.irrational.halo });
    }
    // The choices.
    for (const row of A.rows) {
      const slot = qArea.slots.find((s) => s.id === row.slot)!;
      const fade = sol ? 1 - 0.15 * smooth(ramp(u, 3.4, 3.8)) : 1;
      statement(pen, row.label, row.labelAt.x, row.labelAt.y, view.layout === 'wide' ? 38 : 34, () => Math.min(0.9, fade), {}, { pool: false });
      const pick = r.pick[row.slot];
      const wrongRow = !!sol && pick !== slot.answer;
      const at = AREA_FIX[row.slot];
      const mv = wrongRow ? minJerk(ramp(u, at, at + 0.6)) : 0;
      slot.options.forEach((o, i) => {
        const p = row.chips[i];
        chip(pen, o.label, p.x, p.y, CHIP_SIZE, fade, { picked: o.id === pick ? 1 - mv : o.id === slot.answer && wrongRow ? mv : 0, minW: 76 });
      });
      if (sol && wrongRow && pick) {
        const from = row.chips[slot.options.findIndex((o) => o.id === pick)];
        const to = row.chips[slot.options.findIndex((o) => o.id === slot.answer)];
        const c = arc(from, to, mv, 34);
        // The circle is the mistake's mark; it travels to the right chip, then the tick.
        ringMark(pen, c.x, c.y, 52, 38, 0.85, view.solution!.t < PRELUDE ? ramp(view.solution!.t, 0.1, 0.45) : 1);
        mistakeMarks(pen, from.x, from.y, 52, 38, view.solution!.t, ramp(u, at, at + 0.3), false);
        if (mv >= 1) arrivedTick(pen, to.x + 50, to.y - 34, 10, u, at + 0.6);
      }
    }
    if (!sol) return;
    // The squares of the near guesses, then the verdict in symbols.
    statement(pen, '1.4 × 1.4 = 1.96', A.maths[0].x, A.maths[0].y, A.mathSize, (k) => fadeIn(u, 3.7 + k * 0.06, 0.3));
    statement(pen, '1.5 × 1.5 = 2.25', A.maths[1].x, A.maths[1].y, A.mathSize, (k) => fadeIn(u, 4.2 + k * 0.06, 0.3));
    statement(pen, '√2 ∉ ℚ', A.maths[2].x, A.maths[2].y, A.mathSize * 1.2, (k) => fadeIn(u, 5.0 + k * 0.1, 0.3), {}, { members: { '√2': 'I' } });
  },
};

// ═══ the registry ════════════════════════════════════════════════════════════════════════════════════════════════════

const SCENES: Record<string, Scene> = {
  naturals: SCENE_NATURALS,
  nest: SCENE_NEST,
  'first-home': SCENE_FIRST,
  'three-quarters': SCENE_QUARTER,
  trick: SCENE_TRICK,
  'which-wrong': SCENE_WRONG,
  'set-builder': SCENE_BUILDER,
  decimals: SCENE_DECIMALS,
  'area-two': SCENE_AREA,
  'root-three': SCENE_ROOT,
};

/** A solution's whole length from Submit (a wrong answer's correction prelude first). */
const durationOf = (scene: Scene, verdict: Verdict) => scene.duration + preludeOf(verdict);

/** The still frame of solution step `k` (reduced motion), in seconds from Submit: just before the next step, or the end. */
function stepStill(scene: Scene, k: number, verdict: Verdict): number {
  const next = scene.steps[k + 1];
  return next ? next.at + preludeOf(verdict) - 0.05 : durationOf(scene, verdict);
}

/** The step a time from Submit is in. */
function stepAt(scene: Scene, t: number, verdict: Verdict): number {
  const u = t - preludeOf(verdict);
  let k = 0;
  scene.steps.forEach((s, i) => {
    if (u >= s.at) k = i;
  });
  return k;
}

/** The design size of a question's stage in a layout. */
const designOf = (id: string, layout: Layout) => SCENES[id].design?.[layout] ?? DESIGN[layout];

/** Paints a whole frame: the quiet night, then the scene. */
function paintFrame(pen: Pen, q: Question, view: View) {
  const d = designOf(q.id, view.layout);
  night(pen, d.w, d.h);
  const sol = view.solution;
  // The scene paints on its own clock `u`; the correction marks read `t` (seconds from Submit).
  SCENES[q.id].paint(pen, sol ? { ...view, solution: { ...sol, t: sol.t, u: Math.max(0, sol.t - preludeOf(sol.verdict)) } } : view);
}

export { DESIGN, designOf, durationOf, paintFrame, PRELUDE, SCENES, stepAt, stepStill };
export type { Hit, Layout, Scene, Solution, Step, View };
