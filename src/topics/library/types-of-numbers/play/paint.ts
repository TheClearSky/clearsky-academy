import { NUMBER_FX } from '../../../videoKit/anime/fx/colours';
import type { NumberKind } from '../../../videoKit/anime/fx/colours';
import { outline, SETS, tokenise } from '../../../videoKit/anime/explain/venn';
import type { Point, SetId, Shape } from '../../../videoKit/anime/explain/venn';

/**
 * THE PLAYGROUND'S PAINT KIT (M13.X1): the film's drawing language in Canvas2D, for the site, without three.js.
 *
 * Every look here is the video's own, ported line for line where the source module pulls in three.js or the bench
 * (which a lazy site chunk must not load):
 *   - `lineGlow`        bench/assets/explainKit.ts › lineGlow (light lines: the owner's halo, core, hot centre);
 *   - `ring`            explain/vennPaint.ts › starRing + fillRegion, the picked "constellation, small stars" look: a thin
 *                       line in the set's colour between a few small sky stars, a 0.07 tint inside;
 *   - `skyStar`         explain/vennPaint.ts › skyStar;
 *   - `glyph` / `statement`  sectionsKit.ts › say / statement (STIX symbols with a navy rim, set letters in their colour
 *                       with their halo, the soft dark pool behind a line of type);
 *   - `glass` / `inkLine` / QUIET  sectionsSubset.ts › the puzzle's quiet style (Deepak 2026-11-14: "can the puzzle use
 *                       less colors? We are deviating from our style"): dark glass, a thin light rim, one off-white ink;
 *   - the number line   rootPlace.ts › paintLine (a white-gold light line, ticks in their owner's light, STIX labels).
 * The set data (colours, symbols) and `tokenise` / `outline` are imported from the pure Venn kit itself (venn.ts).
 *
 * Units: the scene's design units. `Pen.k` is device pixels per design unit, for the few canvas properties that ignore the
 * transform (shadowBlur).
 */

type Pen = { g: CanvasRenderingContext2D; k: number };
type Kind = NumberKind;

const INK = '#fbf3dc';
const RIM = '#16123a';
const QUIET = (a: number) => `rgba(251, 243, 220, ${clamp01(a).toFixed(3)})`;
/** Q-T1: every symbol in STIX Two, every word in Cormorant Garamond. */
const SYM = (size: number, weight = 500) => `${weight} ${size}px "STIX Two Text", "STIX Two Math", Georgia, serif`;
const WORD = (size: number, weight = 600, italic = false) => `${italic ? 'italic ' : ''}${weight} ${size}px "Cormorant Garamond", Georgia, serif`;

// ─── timing ──────────────────────────────────────────────────────────────────────────────────────────────────────────

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
/** ANIM-02 named curves: outCubic for arrivals, min-jerk for moves; outBack with s <= 1.2 for pops (ANIM-08). */
const outCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const minJerk = (x: number) => {
  const u = clamp01(x);
  return u * u * u * (10 - 15 * u + 6 * u * u);
};
const outBack = (x: number, s = 1.2) => {
  const u = clamp01(x) - 1;
  return 1 + u * u * ((s + 1) * u + s);
};
const fadeIn = (u: number, at: number, d = 0.3) => smooth(ramp(u, at, at + d));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** A deterministic hash in [0, 1) (vennPaint.ts › hash). */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp01(a)})`;
}
/** A colour between two hex colours (k 0..1), as rgb(). */
function mixHex(a: string, b: string, k: number) {
  const p = parseInt(a.slice(1), 16);
  const q = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(mix((p >> s) & 255, (q >> s) & 255, clamp01(k)));
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

// ─── light lines ─────────────────────────────────────────────────────────────────────────────────────────────────────

type Light = { core: string; hot: string; halo: string };
const lightOf = (kind: Kind | Light): Light => (typeof kind === 'string' ? NUMBER_FX[kind] : kind);

/** A path drawn as light: a soft glow in the owner's halo, a core, a hot centre (explainKit.ts › lineGlow). */
function lineGlow(pen: Pen, path: (g: CanvasRenderingContext2D) => void, kind: Kind | Light, alpha = 1, width = 3) {
  if (alpha <= 0.003) return;
  const { g, k } = pen;
  const fx = lightOf(kind);
  g.save();
  g.globalAlpha = clamp01(alpha);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = fx.halo;
  g.shadowBlur = 16 * k;
  g.strokeStyle = fx.core;
  g.lineWidth = width + 2;
  g.beginPath();
  path(g);
  g.stroke();
  g.shadowBlur = 4 * k;
  g.strokeStyle = fx.hot;
  g.lineWidth = width * 0.6;
  g.beginPath();
  path(g);
  g.stroke();
  g.restore();
}

/** A polyline in the quiet ink, drawn on to `draw` (0..1) of its length, no glow (sectionsSubset.ts › inkLine). */
function inkLine(pen: Pen, pts: readonly Point[], a: number, draw = 1, width = 2, dash?: number[]) {
  if (a <= 0.003 || draw <= 0 || pts.length < 2) return;
  const { g } = pen;
  const lens = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  let left = lens.reduce((x, y) => x + y, 0) * clamp01(draw);
  g.save();
  g.strokeStyle = QUIET(a);
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (dash) g.setLineDash(dash);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const t = Math.min(1, left / Math.max(lens[i - 1], 1e-6));
    g.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t);
    left -= lens[i - 1];
  }
  g.stroke();
  g.restore();
}

/**
 * THE CORRECTION MARKS (Deepak 2026-11-14: "when the answer is wrong, show a cross over what's wrong after the circle and
 * then move it to correct place, then show a tick on it"). All three are the one quiet ink (no red / green), each stroke
 * over a dark under-stroke so it reads on top of a glyph of the same ink.
 */
function markLine(pen: Pen, pts: readonly Point[], a: number, draw: number, width: number) {
  if (a <= 0.003 || draw <= 0) return;
  const { g } = pen;
  g.save();
  g.globalAlpha = clamp01(a) * 0.8;
  inkLineRaw(g, pts, draw, width + 4, 'rgb(11, 9, 28)');
  g.restore();
  inkLine(pen, pts, a, draw, width);
}
function inkLineRaw(g: CanvasRenderingContext2D, pts: readonly Point[], draw: number, width: number, colour: string) {
  const lens = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  let left = lens.reduce((x, y) => x + y, 0) * clamp01(draw);
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const t = Math.min(1, left / Math.max(lens[i - 1], 1e-6));
    g.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t);
    left -= lens[i - 1];
  }
  g.stroke();
}
/** A quiet ink ellipse round (x, y), drawn on to `k` (0..1) from the top, clockwise. */
function ringMark(pen: Pen, x: number, y: number, rx: number, ry: number, a: number, k: number, width = 1.8) {
  inkLine(pen, Array.from({ length: 49 }, (_, i) => ({ x: x + Math.cos(-Math.PI / 2 + (i / 48) * Math.PI * 2) * rx, y: y + Math.sin(-Math.PI / 2 + (i / 48) * Math.PI * 2) * ry })), a, minJerk(k), width);
}
/** A cross (×) over (x, y), `s` its half-size, its two strokes one after the other (`k` 0..1). */
function crossMark(pen: Pen, x: number, y: number, s: number, a: number, k: number, width = 3) {
  markLine(pen, [{ x: x - s, y: y - s }, { x: x + s, y: y + s }], a, minJerk(clamp01(k * 2)), width);
  markLine(pen, [{ x: x + s, y: y - s }, { x: x - s, y: y + s }], a, minJerk(clamp01(k * 2 - 1)), width);
}
/** A tick (✓) centred on (x, y), `s` its half-width, drawn on (`k` 0..1). */
function checkMark(pen: Pen, x: number, y: number, s: number, a: number, k: number, width = 3) {
  markLine(pen, [{ x: x - s, y: y - s * 0.05 }, { x: x - s * 0.3, y: y + s * 0.65 }, { x: x + s, y: y - s * 0.75 }], a, minJerk(k), width);
}

/** A soft dot of light (sectionsKit.ts › dot): a member, a point, a glint. */
function dot(pen: Pen, x: number, y: number, r: number, kind: Kind, a: number) {
  if (a <= 0.003) return;
  const { g } = pen;
  const fx = NUMBER_FX[kind];
  g.save();
  g.globalAlpha = clamp01(a);
  const grad = g.createRadialGradient(x, y, 0, x, y, r * 3);
  grad.addColorStop(0, fx.hot);
  grad.addColorStop(0.3, fx.core);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r * 3, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// ─── the night ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** One sky star (vennPaint.ts › skyStar): a small hard core, a faint halo in `tint`, fine spikes when bright. */
function skyStar(pen: Pen, x: number, y: number, r: number, m: number, a: number, tint: string, spikes = false, hue = 0) {
  if (a <= 0.003) return;
  const { g } = pen;
  const core = hue < 0.15 ? '#cfd8ff' : hue < 0.24 ? '#fff4cc' : '#ffffff';
  g.save();
  const halo = g.createRadialGradient(x, y, 0, x, y, r * 4.2);
  halo.addColorStop(0, rgba(tint, 0.42 * a));
  halo.addColorStop(0.35, rgba(tint, 0.14 * a));
  halo.addColorStop(1, rgba(tint, 0));
  g.fillStyle = halo;
  g.fillRect(x - r * 4.2, y - r * 4.2, r * 8.4, r * 8.4);
  if (spikes) {
    g.globalAlpha = clamp01(0.5 * a);
    g.strokeStyle = core;
    g.lineWidth = Math.max(0.6, r * 0.35);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - r * 5, y);
    g.lineTo(x + r * 5, y);
    g.moveTo(x, y - r * 5);
    g.lineTo(x, y + r * 5);
    g.stroke();
  }
  g.globalAlpha = clamp01((0.25 + 0.75 * m) * a + 0.25 * a);
  g.fillStyle = core;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** The quiet night behind the puzzle: a few faint, still stars (the void, TXT-03 way 3; ambient stays low, EYE-03). */
function night(pen: Pen, w: number, h: number) {
  for (let i = 0; i < 46; i++) {
    const m = hash(i * 3.1 + 7) ** 3;
    skyStar(pen, hash(i * 1.7 + 1) * w, hash(i * 2.3 + 5) * h, 0.7 + 1.1 * m, m, 0.16 + 0.3 * m, '#8f9cc8', false, hash(i + 9));
  }
}

// ─── the Venn rings (the picked constellation look) ──────────────────────────────────────────────────────────────────

/** A ring's colours: a set of the chapter (its owner colours), or the quiet ink (an unnamed ring: Q2's empty nest). */
type RingLook = { line: string; fill: string; halo: string };
const QUIET_RING: RingLook = { line: '#e8e2d0', fill: '#e8e2d0', halo: '#6d6a8a' };
const ringLook = (id: SetId | 'quiet'): RingLook => (id === 'quiet' ? QUIET_RING : SETS[id]);

function pathOf(g: CanvasRenderingContext2D, shape: Shape) {
  if (shape.kind === 'ellipse') g.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
  else if (shape.kind === 'rect') g.roundRect(shape.x0, shape.y0, shape.x1 - shape.x0, shape.y1 - shape.y0, shape.r);
  else {
    pathOf(g, shape.outer);
    pathOf(g, shape.hole);
  }
}

type RingOpts = {
  /** 0..1 of the outline drawn (dashed while it draws, as the film's). */ draw?: number;
  /** 0..1 inside tint. */ fill?: number;
  /** 0..1 lit (a focus or a drop target). */ lit?: number;
  /** 0..1 a flash of the whole ring (the film's v3 'glow'). */ flash?: number;
  /** 0..1 dimmed (not the focus). */ dim?: number;
  alpha?: number;
  seed?: number;
};

/** A set's region tint (vennPaint.ts › fillRegion, constellation: 0.07 of its fill; ℝ half). */
function ringFill(pen: Pen, shape: Shape, id: SetId | 'quiet', o: RingOpts = {}) {
  const fill = o.fill ?? 1;
  if (fill <= 0) return;
  const { g } = pen;
  const look = ringLook(id);
  const lit = 1 + 1.2 * (o.lit ?? 0) + 1.4 * (o.flash ?? 0);
  const dim = 1 - 0.6 * (o.dim ?? 0);
  g.save();
  g.globalAlpha = o.alpha ?? 1;
  g.beginPath();
  pathOf(g, shape);
  g.fillStyle = rgba(look.fill, 0.07 * (id === 'R' ? 0.5 : 1) * fill * dim * lit);
  g.fill('evenodd');
  g.restore();
}

/** A constellation ring (vennPaint.ts › starRing, 'small' stars): a thin line in the set's colour between small sky stars. */
function ring(pen: Pen, shape: Shape, id: SetId | 'quiet', o: RingOpts = {}) {
  const { g, k } = pen;
  const look = ringLook(id);
  const draw = o.draw ?? 1;
  if (draw <= 0) return;
  const alpha = o.alpha ?? 1;
  const dim = 1 - 0.55 * (o.dim ?? 0);
  const lit = 1 + 0.6 * (o.lit ?? 0) + 1.1 * (o.flash ?? 0);
  const pts = outline(shape, 160);
  const n = pts.length;
  const cum = [0];
  for (let i = 0; i < n; i++) cum.push(cum[i] + Math.hypot(pts[(i + 1) % n].x - pts[i].x, pts[(i + 1) % n].y - pts[i].y));
  const P = cum[n];
  const pointAt = (s: number): Point => {
    const L = ((s % P) + P) % P;
    let i = 0;
    while (i < n - 1 && cum[i + 1] < L) i++;
    const f = (L - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]);
    const a = pts[i];
    const b = pts[(i + 1) % n];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  const head = draw * P;
  const seed = o.seed ?? (id === 'quiet' ? 81 : id.charCodeAt(0) * 31);
  const count = Math.max(6, Math.min(12, Math.round(P / 150)));
  const stars = Array.from({ length: count }, (_, j) => {
    const s = ((j + 0.5 + 0.55 * (hash(seed + j * 7) - 0.5)) / count) * P;
    const m = hash(seed + j * 13 + 5) ** 1.6;
    return { s, m, r: 1.5 + 1.3 * m, hue: hash(seed + j * 17 + 9), p: pointAt(s) };
  }).sort((a, b) => a.s - b.s);
  g.save();
  g.globalAlpha = clamp01(0.62 * dim * (1 + 0.45 * (lit - 1))) * alpha;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = look.line;
  g.shadowColor = look.halo;
  g.shadowBlur = 5 * k * lit;
  g.lineWidth = 1.6 * (1 + 0.5 * (lit - 1));
  if (draw < 1) g.setLineDash([12, 9]);
  g.beginPath();
  for (let j = 0; j < stars.length; j++) {
    const a = stars[j];
    const b = stars[(j + 1) % stars.length];
    const from = a.s + a.r * 2.6 + 3;
    const to = (j + 1 < stars.length ? b.s : b.s + P) - b.r * 2.6 - 3;
    let penDown = false;
    for (let s = from; s <= to; s += 5) {
      const along = Math.min(s, to);
      if (draw < 1 && along > head) break;
      const q = pointAt(along);
      if (penDown) g.lineTo(q.x, q.y);
      else g.moveTo(q.x, q.y);
      penDown = true;
    }
  }
  g.stroke();
  const flash = o.flash ?? 0;
  if (flash > 0.01 && draw >= 1) {
    g.setLineDash([]);
    g.globalAlpha = 0.5 * flash * dim * alpha;
    g.shadowBlur = 20 * k;
    g.lineWidth = 3.6;
    g.beginPath();
    pathOf(g, shape);
    g.stroke();
  }
  g.restore();
  for (const st of stars) {
    if (draw < 1 && st.s > head) continue;
    skyStar(pen, st.p.x, st.p.y, st.r * (1 + 0.15 * (lit - 1)), st.m, alpha * dim * Math.min(1.6, 1 + 0.5 * (lit - 1)), look.line, st.m > 0.55, st.hue);
  }
}

// ─── type ────────────────────────────────────────────────────────────────────────────────────────────────────────────

type GlyphOpts = { words?: boolean; italic?: boolean; weight?: number; align?: CanvasTextAlign; glow?: string; rim?: number; pool?: boolean };

/** A label in the night type (sectionsKit.ts › say): STIX symbols (or Cormorant words), a navy rim, optional halo glow. */
function glyph(pen: Pen, text: string, x: number, y: number, size: number, colour: string, a = 1, o: GlyphOpts = {}) {
  if (a <= 0.004) return;
  const { g, k } = pen;
  g.save();
  g.font = o.words ? WORD(size, o.weight ?? 600, o.italic ?? false) : SYM(size, o.weight ?? 500);
  g.textAlign = o.align ?? 'center';
  g.textBaseline = 'middle';
  if (o.pool) pool(pen, x, y, g.measureText(text).width, size, a, o.align);
  g.globalAlpha = clamp01(a);
  g.lineJoin = 'round';
  g.strokeStyle = RIM;
  g.lineWidth = o.rim ?? Math.max(4, size * 0.09);
  g.strokeText(text, x, y);
  if (o.glow) {
    g.shadowColor = o.glow;
    g.shadowBlur = size * 0.16 * k;
  }
  g.fillStyle = colour;
  g.fillText(text, x, y);
  g.restore();
}

/** The soft dark pool behind a line of type (sectionsKit.ts › statement's darkening, TXT-02). */
function pool(pen: Pen, x: number, y: number, w: number, size: number, a: number, align: CanvasTextAlign = 'center') {
  const { g } = pen;
  const cx = align === 'left' ? x + w / 2 : align === 'right' ? x - w / 2 : x;
  const rx = w / 2 + size * 0.5;
  const ry = size * 0.78;
  g.save();
  g.globalAlpha = clamp01(a);
  g.translate(cx, y);
  g.scale(rx / ry, 1);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, ry);
  grd.addColorStop(0, 'rgba(8, 7, 26, 0.86)');
  grd.addColorStop(0.65, 'rgba(8, 7, 26, 0.62)');
  grd.addColorStop(1, 'rgba(8, 7, 26, 0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, ry, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A stacked fraction in STIX (rootKit.ts › stackedFraction, as the film writes ¼ ½ ¾ on its line), centre (x, y), with the navy rim. */
function fraction(pen: Pen, top: string, bottom: string, x: number, y: number, size: number, colour: string, a = 1, glow?: string) {
  if (a <= 0.004) return;
  const { g } = pen;
  g.save();
  g.font = SYM(size);
  const w = Math.max(g.measureText(top).width, g.measureText(bottom).width, size * 0.7);
  g.restore();
  glyph(pen, top, x, y - size * 0.6, size, colour, a, { glow });
  glyph(pen, bottom, x, y + size * 0.62, size, colour, a, { glow });
  g.save();
  g.globalAlpha = clamp01(a);
  g.fillStyle = RIM;
  g.fillRect(x - w * 0.62, y - size * 0.1, w * 1.24, Math.max(4, size * 0.16));
  g.fillStyle = colour;
  g.fillRect(x - w * 0.56, y - size * 0.045, w * 1.12, Math.max(2, size * 0.055));
  g.restore();
}

/** A set's symbol where it names its region (vennPaint.ts › paintLabel, constellation: rim, its colour, its halo). */
function setSymbol(pen: Pen, id: SetId, x: number, y: number, size: number, a = 1, dim = 0) {
  const set = SETS[id];
  glyph(pen, set.symbol, x, y, size, set.text, a * (1 - 0.5 * dim), { glow: set.halo, rim: Math.max(4, size * 0.085) });
}

/** The width of a text in the symbol (or word) face. */
function widthOf(pen: Pen, text: string, size: number, words = false) {
  const { g } = pen;
  g.save();
  g.font = words ? WORD(size) : SYM(size);
  const w = g.measureText(text).width;
  g.restore();
  return w;
}

/**
 * A statement in the Venn's own type (sectionsKit.ts › statement): STIX, every set symbol in its set's colour with its
 * halo, a navy rim, a soft pool behind; built token by token (`reveal(k)` = the alpha of the k-th non-space token).
 * `tint` recolours token k (a member in its owner's colour). Returns each token's centre and the line's extent.
 */
function statement(pen: Pen, text: string, x: number, y: number, size: number, reveal: (k: number) => number, tint: Record<number, string> = {}, opts: { pool?: boolean; align?: 'center' | 'left'; members?: Record<string, SetId> } = {}) {
  const { g, k: px } = pen;
  const tokens = tokenise(text, opts.members);
  g.save();
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const fontOf = (role: string) => (role === 'word' ? WORD(size * 0.92, 600, true) : SYM(size));
  const widths = tokens.map((t) => {
    g.font = fontOf(t.role);
    return t.role === 'space' ? size * 0.28 * t.text.length : g.measureText(t.text).width;
  });
  const total = widths.reduce((a, b) => a + b, 0);
  const left = opts.align === 'left' ? x : x - total / 2;
  let shown = 0;
  for (let j = 0, n = tokens.filter((t) => t.role !== 'space').length; j < n; j++) shown = Math.max(shown, clamp01(reveal(j)));
  if (shown > 0.004 && opts.pool !== false) pool(pen, left + total / 2, y, total, size, shown);
  let cx = left;
  const centres: { x: number; w: number; text: string }[] = [];
  let j = 0;
  tokens.forEach((t, i) => {
    if (t.role !== 'space') {
      const a = clamp01(reveal(j));
      centres.push({ x: cx + widths[i] / 2, w: widths[i], text: t.text });
      if (a > 0.004) {
        const pop = outBack(a);
        g.save();
        g.globalAlpha = a;
        g.translate(cx + widths[i] / 2, y);
        g.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop);
        g.font = fontOf(t.role);
        g.lineJoin = 'round';
        g.strokeStyle = RIM;
        g.lineWidth = Math.max(4, size * 0.07);
        g.strokeText(t.text, -widths[i] / 2, 0);
        const colour = tint[j] ?? (t.set ? t.colour : INK);
        g.fillStyle = colour;
        if (t.set && tint[j] === undefined) {
          g.shadowColor = SETS[t.set].halo;
          g.shadowBlur = size * 0.13 * px;
        }
        g.fillText(t.text, -widths[i] / 2, 0);
        g.restore();
      }
      j++;
    }
    cx += widths[i];
  });
  g.restore();
  return { centres, left, right: left + total };
}

// ─── glass ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A dark-glass panel (sectionsSubset.ts › glass): dark glass, a thin light rim; `glow` only lifts the rim a little. */
function glass(pen: Pen, x: number, y: number, w: number, h: number, a = 1, glow = 0, r = 18) {
  if (a <= 0.003) return;
  const { g } = pen;
  g.save();
  g.globalAlpha = clamp01(a);
  g.fillStyle = 'rgba(11, 9, 28, 0.62)';
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
  g.strokeStyle = QUIET(0.26 + 0.42 * clamp01(glow));
  g.lineWidth = 1.5 + 0.8 * clamp01(glow);
  g.stroke();
  g.restore();
}

/**
 * A number token: its glyph in STIX with the navy rim. `colour` is the quiet ink while its kind is the question (a
 * colour would give the answer away), its owner colour once the solution names it. `lift` 0..1 = picked up (a thin quiet
 * ring round it and a slight scale), `ring` 0..1 = a quiet ink circle (marks a mistake in the solution).
 */
function token(pen: Pen, label: string, x: number, y: number, size: number, colour: string, a = 1, o: { lift?: number; mark?: number; glow?: string } = {}) {
  const lift = o.lift ?? 0;
  const s = size * (1 + 0.08 * lift);
  const w = widthOf(pen, label, s);
  if (lift > 0.01) {
    const { g } = pen;
    g.save();
    g.globalAlpha = clamp01(a * lift);
    g.fillStyle = 'rgba(11, 9, 28, 0.55)';
    g.beginPath();
    g.roundRect(x - w / 2 - s * 0.38, y - s * 0.62, w + s * 0.76, s * 1.24, s * 0.4);
    g.fill();
    g.strokeStyle = QUIET(0.75);
    g.lineWidth = 1.6;
    g.stroke();
    g.restore();
  }
  glyph(pen, label, x, y, s, colour, a, { glow: o.glow });
  const mark = o.mark ?? 0;
  if (mark > 0.01) {
    const rx = w / 2 + s * 0.42;
    const ry = s * 0.66;
    inkLine(pen, Array.from({ length: 49 }, (_, i) => ({ x: x + Math.cos(-Math.PI / 2 + (i / 48) * Math.PI * 2) * rx, y: y + Math.sin(-Math.PI / 2 + (i / 48) * Math.PI * 2) * ry })), a * 0.8, minJerk(mark), 1.6);
  }
}

/** A chip of a choice (the film's dark-glass chip in the quiet style): glass, a thin rim that lifts when picked. */
function chip(pen: Pen, label: string, x: number, y: number, size: number, a: number, o: { picked?: number; colourful?: boolean; minW?: number; words?: boolean } = {}) {
  const picked = o.picked ?? 0;
  const w = Math.max(o.minW ?? 0, widthOf(pen, label, size, o.words) + size * 1.1);
  const h = size * 1.5;
  const { g } = pen;
  g.save();
  g.globalAlpha = clamp01(a);
  g.fillStyle = `rgba(11, 9, 28, ${0.62 + 0.2 * picked})`;
  g.beginPath();
  g.roundRect(x - w / 2, y - h / 2, w, h, h * 0.3);
  g.fill();
  g.strokeStyle = QUIET(0.3 + 0.6 * picked);
  g.lineWidth = 1.5 + 1 * picked;
  g.stroke();
  g.restore();
  if (o.words) glyph(pen, label, x, y + size * 0.04, size, INK, a, { words: true });
  else statement(pen, label, x, y + size * 0.04, size, () => a, {}, { pool: false });
  return { w, h };
}

// ─── the number line (rootPlace.ts › paintLine) ──────────────────────────────────────────────────────────────────────

type LineGeo = { x0: number; x1: number; y: number; v0: number; v1: number };
const lineX = (L: LineGeo, v: number) => L.x0 + ((v - L.v0) / (L.v1 - L.v0)) * (L.x1 - L.x0);
const lineValue = (L: LineGeo, x: number) => L.v0 + ((x - L.x0) / (L.x1 - L.x0)) * (L.v1 - L.v0);

/** The line in white-gold light with an arrow to the right (MATH-03: positive to the right), ticks at the integers. */
function numberLine(pen: Pen, L: LineGeo, size: number, a = 1, draw = 1) {
  const pad = 26;
  const end = mix(L.x0 - pad, L.x1 + pad, draw);
  lineGlow(pen, (g) => (g.moveTo(L.x0 - pad, L.y), g.lineTo(end, L.y)), 'zero', a, 2.4);
  if (draw >= 1) lineGlow(pen, (g) => (g.moveTo(L.x1 + pad - 12, L.y - 8), g.lineTo(L.x1 + pad, L.y), g.lineTo(L.x1 + pad - 12, L.y + 8)), 'zero', a, 2.4);
  for (let v = Math.ceil(L.v0); v <= L.v1; v++) tick(pen, L, v, String(v), v === 0 ? 'zero' : v > 0 ? 'natural' : 'negative', size, a * fadeIn(draw, (v - L.v0) / (L.v1 - L.v0) * 0.8, 0.2));
}

/** A tick in its owner's light and its STIX label under the line. */
function tick(pen: Pen, L: LineGeo, v: number, label: string, kind: Kind, size: number, a = 1, len = 16, labelColour?: string) {
  if (a <= 0.003) return;
  const x = lineX(L, v);
  lineGlow(pen, (g) => (g.moveTo(x, L.y - len), g.lineTo(x, L.y + len)), kind, a, 2.2);
  if (label) glyph(pen, label, x, L.y + len + size * 0.75, size, labelColour ?? NUMBER_FX[kind].text, a);
}

export {
  chip,
  clamp01,
  dot,
  fadeIn,
  fraction,
  glass,
  glyph,
  hash,
  INK,
  inkLine,
  lineGlow,
  lineValue,
  lineX,
  minJerk,
  mix,
  mixHex,
  night,
  numberLine,
  outBack,
  outCubic,
  pathOf,
  checkMark,
  crossMark,
  ringMark,
  pool,
  QUIET,
  ramp,
  rgba,
  ring,
  ringFill,
  RIM,
  setSymbol,
  skyStar,
  smooth,
  statement,
  SYM,
  tick,
  token,
  widthOf,
  WORD,
};
export type { Kind, Light, LineGeo, Pen, RingOpts };
