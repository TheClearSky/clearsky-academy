/**
 * THE ROOT SECTION'S FLAT TOOLS (feedback 2, 2026-11-13). Deepak, on the whole video: "make the scissor more 2d" (shot 28) and "make the protractor more 2d" (shot 31, the
 * brass compass). The ceiling worlds draw their figures as flat light and ink on the night sky; the 3D props (rootProps.ts, lit bevelled steel and brass) stood apart from that.
 * These are the same two tools drawn flat in Canvas 2D: flat fills in two tones (a cel split, no gradients), one ink outline, a pale edge stripe, and one soft card shadow on the
 * sky. The proportions are the 3D models' (`scissorHalf`, `compassLeg`, `compassHead` in rootProps.ts), so poses and timings carry over unchanged.
 * Pure in the arguments (no time, no state; a scratch canvas is reused for the shadow), so any frame can be drawn alone.
 */

import type { P2 } from './rootGeometry';

const INK_LINE = '#15122a';
const SHADOW_ALPHA = 0.42;
const SHADOW_OFFSET: P2 = [8, 10];
const STEEL = { light: '#e6ebf4', mid: '#bcc6d8', edge: '#ffffff' };
const BRASS = { light: '#e9bc62', mid: '#c08a36', edge: '#fbe2a4', dark: '#6e4a1c' };
const LACQUER = { light: '#c4436a', mid: '#962c4d', edge: '#f39ab4' };
const PENCIL = { body: '#46528a', shade: '#323c6c', wood: '#e8cfa4', lead: '#2a2a3a' };

/** 'shadow': every shape filled black (the whole tool's silhouette, composited once at SHADOW_ALPHA so overlaps do not darken twice); 'body': the drawing itself. */
type Pass = 'shadow' | 'body';
type Path = (g: CanvasRenderingContext2D) => void;

/** One flat shape: its fill and its ink outline (or, in the shadow pass, its silhouette). `w` = the outline width in the current units. */
function shape(g: CanvasRenderingContext2D, pass: Pass, path: Path, fill: string, w: number) {
  g.fillStyle = pass === 'shadow' ? '#000' : fill;
  g.beginPath();
  path(g);
  g.fill();
  if (pass === 'shadow') return;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = w;
  g.strokeStyle = INK_LINE;
  g.stroke();
}

/** A stroked path with an ink edge on both sides (a tube or ring seen flat): ink at width + 2w, then the colour at width. */
function inkedStroke(g: CanvasRenderingContext2D, pass: Pass, path: Path, colour: string, width: number, w: number) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (pass === 'shadow') {
    g.strokeStyle = '#000';
    g.lineWidth = width + 2 * w;
    g.beginPath();
    path(g);
    g.stroke();
    return;
  }
  g.strokeStyle = INK_LINE;
  g.lineWidth = width + 2 * w;
  g.beginPath();
  path(g);
  g.stroke();
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.beginPath();
  path(g);
  g.stroke();
}

/** Fills `fill` clipped to `clipPath`, then re-inks the outline: the second (darker) tone of a cel split. Body pass only. */
function toneSplit(g: CanvasRenderingContext2D, clipPath: Path, region: Path, fill: string, w: number) {
  g.save();
  g.beginPath();
  clipPath(g);
  g.clip();
  g.fillStyle = fill;
  g.beginPath();
  region(g);
  g.fill();
  g.restore();
  g.lineJoin = 'round';
  g.lineWidth = w;
  g.strokeStyle = INK_LINE;
  g.beginPath();
  clipPath(g);
  g.stroke();
}

let scratch: HTMLCanvasElement | null = null;

/** Draws a tool twice: its silhouette offset down-right into a scratch canvas, composited once (the card's shadow on the sky), then the tool. */
function withShadow(g: CanvasRenderingContext2D, alpha: number, draw: (c: CanvasRenderingContext2D, pass: Pass) => void) {
  const { width, height } = g.canvas;
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== width || scratch.height !== height) (scratch.width = width, scratch.height = height);
  const s = scratch.getContext('2d')!;
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.clearRect(0, 0, width, height);
  s.setTransform(g.getTransform());
  s.translate(SHADOW_OFFSET[0], SHADOW_OFFSET[1]);
  s.save();
  draw(s, 'shadow');
  s.restore();
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = SHADOW_ALPHA * alpha;
  g.drawImage(scratch, 0, 0);
  g.restore();
  g.save();
  g.globalAlpha = alpha;
  draw(g, 'body');
  g.restore();
}

// ─── the scissors ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Half a pair (the 3D `scissorHalf`'s outline), pivot at the origin, the blade along +x, y up; sign +1 = the upper half (its bow crosses below). */
function scissorHalf(g: CanvasRenderingContext2D, pass: Pass, sign: 1 | -1, w: number) {
  const m = (y: number) => sign * y;
  const blade: Path = (p) => {
    p.moveTo(-0.14, m(0.02));
    p.lineTo(1.0, m(-0.008));
    p.bezierCurveTo(0.74, m(0.075), 0.32, m(0.165), -0.04, m(0.175));
    p.bezierCurveTo(-0.17, m(0.175), -0.22, m(0.09), -0.14, m(0.02));
    p.closePath();
  };
  const shank: Path = (p) => {
    p.moveTo(-0.1, m(0.05));
    p.bezierCurveTo(-0.34, m(-0.02), -0.6, m(-0.16), -0.86, m(-0.27));
  };
  const bowX = -1.02;
  const bowY = m(-0.36);
  const rx = 0.18 * 1.16;
  const ry = 0.18 * 0.92;
  const tilt = m(-0.38);
  const bow: Path = (p) => p.ellipse(bowX, bowY, rx, ry, tilt, 0, Math.PI * 2);
  inkedStroke(g, pass, shank, STEEL.mid, 0.075, w);
  inkedStroke(g, pass, bow, LACQUER.light, 0.1, w);
  if (pass === 'body') {
    // The ring's shaded outer half and a pale glint on its inner edge (two flat tones, no gradient).
    g.lineCap = 'butt';
    g.strokeStyle = LACQUER.mid;
    g.lineWidth = 0.045;
    g.beginPath();
    g.ellipse(bowX, bowY, rx + 0.028, ry + 0.028, tilt, sign > 0 ? Math.PI * 1.05 : Math.PI * 0.05, sign > 0 ? Math.PI * 1.95 : Math.PI * 0.95);
    g.stroke();
    g.strokeStyle = LACQUER.edge;
    g.lineWidth = 0.016;
    g.beginPath();
    g.ellipse(bowX, bowY, rx - 0.014, ry - 0.014, tilt, sign > 0 ? Math.PI * 0.15 : Math.PI * 1.15, sign > 0 ? Math.PI * 0.75 : Math.PI * 1.75);
    g.stroke();
  }
  // A brass collar where the bow meets the shank.
  shape(g, pass, (p) => p.ellipse(-0.8, m(-0.25), 0.03, 0.055, m(-0.48), 0, Math.PI * 2), BRASS.light, w);
  // The blade: the ground edge in the light tone, the spine half darker, a white stripe along the edge.
  shape(g, pass, blade, STEEL.light, w);
  if (pass === 'body') {
    toneSplit(g, blade, (p) => (p.moveTo(-0.3, m(0.07)), p.lineTo(1.05, m(0.025)), p.lineTo(1.05, m(0.3)), p.lineTo(-0.3, m(0.3)), p.closePath()), STEEL.mid, w);
    g.strokeStyle = STEEL.edge;
    g.lineCap = 'round';
    g.lineWidth = 0.014;
    g.beginPath();
    g.moveTo(0.04, m(0.014));
    g.lineTo(0.94, m(0.0));
    g.stroke();
  }
}

/**
 * A flat pair of scissors at `at` (canvas px), pointing along `angle` (radians, counter-clockwise on screen, as the 3D pose's), opened by `open` (radians between the blades),
 * `scale` = canvas px per model unit (a blade is 1 long), `alpha` 0..1.
 */
function drawFlatScissors(g: CanvasRenderingContext2D, at: P2, angle: number, open: number, scale: number, alpha = 1) {
  if (alpha <= 0) return;
  const w = 3.2 / scale;
  withShadow(g, alpha, (c, pass) => {
    c.translate(at[0], at[1]);
    c.scale(scale, -scale);
    for (const [sign, a] of [[-1, angle - open / 2], [1, angle + open / 2]] as const) {
      c.save();
      c.rotate(a);
      scissorHalf(c, pass, sign, w);
      c.restore();
    }
    // The pivot: a brass screw head, its shaded lower half, its slot.
    c.rotate(angle);
    const head: Path = (p) => p.arc(0, 0, 0.062, 0, Math.PI * 2);
    shape(c, pass, head, BRASS.light, w);
    if (pass === 'body') {
      toneSplit(c, head, (p) => p.rect(-0.1, -0.1, 0.2, 0.09), BRASS.mid, w);
      c.lineCap = 'round';
      c.strokeStyle = INK_LINE;
      c.lineWidth = 0.016;
      c.beginPath();
      c.moveTo(-0.038, 0.012);
      c.lineTo(0.038, -0.012);
      c.stroke();
    }
  });
}

// ─── the compass ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One leg, its hinge at the origin, hanging along −y (y up), L px long; the 3D `compassLeg`'s proportions. */
function compassLeg(g: CanvasRenderingContext2D, pass: Pass, tip: 'needle' | 'pencil', L: number, w: number) {
  const arm: Path = (p) => {
    p.moveTo(-0.06 * L, 0.02 * L);
    p.lineTo(0.06 * L, 0.02 * L);
    p.lineTo(0.032 * L, -0.74 * L);
    p.lineTo(-0.032 * L, -0.74 * L);
    p.closePath();
  };
  if (tip === 'needle') {
    // The holder, then the needle (a long taper to a point).
    shape(g, pass, (p) => p.rect(-0.026 * L, -0.86 * L, 0.052 * L, 0.13 * L), BRASS.mid, w);
    shape(g, pass, (p) => {
      p.moveTo(-0.012 * L, -0.85 * L);
      p.lineTo(0.012 * L, -0.85 * L);
      p.lineTo(0.0035 * L, -0.97 * L);
      p.lineTo(0, -1.0 * L);
      p.lineTo(-0.0035 * L, -0.97 * L);
      p.closePath();
    }, STEEL.light, w);
  } else {
    // The pencil: a hex body (two faces seen), a wood cone, the graphite point; the clamp and its screw.
    const body: Path = (p) => p.rect(-0.03 * L, -0.94 * L, 0.06 * L, 0.21 * L);
    shape(g, pass, body, PENCIL.body, w);
    if (pass === 'body') toneSplit(g, body, (p) => p.rect(0.004 * L, -0.95 * L, 0.03 * L, 0.23 * L), PENCIL.shade, w);
    shape(g, pass, (p) => (p.moveTo(-0.03 * L, -0.94 * L), p.lineTo(0.03 * L, -0.94 * L), p.lineTo(0.009 * L, -0.982 * L), p.lineTo(-0.009 * L, -0.982 * L), p.closePath()), PENCIL.wood, w);
    shape(g, pass, (p) => (p.moveTo(-0.009 * L, -0.982 * L), p.lineTo(0.009 * L, -0.982 * L), p.lineTo(0, -1.0 * L), p.closePath()), PENCIL.lead, w * 0.6);
    shape(g, pass, (p) => p.rect(0.02 * L, -0.73 * L, 0.08 * L, 0.018 * L), STEEL.mid, w);
    shape(g, pass, (p) => p.rect(-0.046 * L, -0.745 * L, 0.092 * L, 0.05 * L), BRASS.light, w);
  }
  // The arm: brass, its far half in the darker tone, the steel ridge as a pale stripe.
  shape(g, pass, arm, BRASS.light, w);
  if (pass === 'body') {
    toneSplit(g, arm, (p) => p.rect(0.004 * L, -0.8 * L, 0.1 * L, 0.9 * L), BRASS.mid, w);
    g.fillStyle = BRASS.edge;
    g.fillRect(-0.017 * L, -0.71 * L, 0.012 * L, 0.68 * L);
  }
}

/** The head: the hinge disc, the knurled handle and its knob (the 3D `compassHead`'s proportions), at the origin, y up. */
function compassHead(g: CanvasRenderingContext2D, pass: Pass, L: number, w: number) {
  shape(g, pass, (p) => (p.moveTo(-0.028 * L, 0.04 * L), p.lineTo(0.028 * L, 0.04 * L), p.lineTo(0.024 * L, 0.24 * L), p.lineTo(-0.024 * L, 0.24 * L), p.closePath()), BRASS.light, w);
  if (pass === 'body') {
    g.strokeStyle = BRASS.dark;
    g.lineCap = 'butt';
    g.lineWidth = Math.max(w * 0.6, 0.004 * L);
    for (let i = 0; i < 6; i++) {
      const y = (0.08 + i * 0.025) * L;
      g.beginPath();
      g.moveTo(-0.026 * L, y);
      g.lineTo(0.026 * L, y);
      g.stroke();
    }
  }
  shape(g, pass, (p) => p.arc(0, 0.25 * L, 0.036 * L, 0, Math.PI * 2), BRASS.light, w);
  const hinge: Path = (p) => p.arc(0, 0, 0.075 * L, 0, Math.PI * 2);
  shape(g, pass, hinge, BRASS.light, w);
  if (pass === 'body') toneSplit(g, hinge, (p) => p.rect(-0.1 * L, -0.1 * L, 0.2 * L, 0.085 * L), BRASS.mid, w);
  shape(g, pass, (p) => p.arc(0, 0, 0.018 * L, 0, Math.PI * 2), BRASS.dark, w * 0.7);
}

/**
 * A flat drafting compass. The needle's point at `needle` (canvas px); the legs, `L` px long, open so that the pencil's point stands `span` px from the needle along `angle`
 * (radians, counter-clockwise on screen); `alpha` 0..1. The 3D `compass().open(span)` geometry: the hinge at (span / 2, L cos β), β = asin(span / 2L).
 */
function drawFlatCompass(g: CanvasRenderingContext2D, needle: P2, angle: number, span: number, L: number, alpha = 1) {
  if (alpha <= 0) return;
  const half = Math.min(span / 2, L * 0.98);
  const beta = Math.asin(half / L);
  const h = L * Math.cos(beta);
  const w = 3.2;
  withShadow(g, alpha, (c, pass) => {
    c.translate(needle[0], needle[1]);
    c.scale(1, -1);
    c.rotate(angle);
    for (const [tip, b] of [['pencil', beta], ['needle', -beta]] as const) {
      c.save();
      c.translate(half, h);
      c.rotate(b);
      compassLeg(c, pass, tip, L, w);
      c.restore();
    }
    c.translate(half, h);
    compassHead(c, pass, L, w);
  });
}

export { drawFlatCompass, drawFlatScissors };
