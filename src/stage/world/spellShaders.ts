import { AIR_GLSL } from '../engine/air';
import { NOISE_GLSL } from '../engine/glsl';

/**
 * GLSL for the spell (`world/spell.ts`), PORTED from Nodestra's hellscape
 * magic circle, hell-02 (`hell/hell-src/hell-02-circle-motion-glsl.ts`), and
 * re-coloured ice blue / lavender / white.
 *
 * Two stages, as in hell-02 (its header, lines 4-21):
 *
 *  1. BAKE (once, and again after a lost context): the design is drawn as 2D
 *     signed distances, one ring layer at a time, into a small POLAR texture
 *     (x = angle round the ring, y = radius across the layer's annulus):
 *       R = line coverage   G = soft halo
 *       B = stroke draw order (0 = "drawn by angle", else when the pen gets here)
 *       A = rune coverage (rune bands only, so runes can pop and scroll)
 *     `addLine`, `ring`, `stroke`, `glyphSD`, `band`, the bead chain, the tick
 *     ring and the outer band are hell-02's (lines 140-235, 256-336), with
 *     every line ×3.2 wider and a wider halo: hell-02 is seen face on in the
 *     sky, this circle lies on the floor 12 m away at a grazing angle. Two
 *     figures are new and kept neutral: a seed-of-life rosette in the centre
 *     (hell-02: a hexagram) and an eight-point star {8/3} with eight satellite
 *     seals (hell-02: a pentagram with five).
 *
 *  2. RUNTIME (every frame): ONE disc mesh draws all six layers (hell-02
 *     draws one annulus mesh per layer — six draw calls): each pixel reads
 *     only the layers whose annulus holds its radius, at (angle + that ring's
 *     turn, radius), so rotation is an offset in x. Draw-on by angle, stroke
 *     order, rune pop, pulse, flash, shock ring are hell-02's analytic masks
 *     (`CIRCLE_FRAG`, lines 344-517) — with its pen-tip NaN fix
 *     (`scene/circles-life.ts:28-36`: the exponent is clamped ≥ 0) applied
 *     to every exponential, and `atan(0, 0)` guarded at the centre.
 */

/** hell-02's line widths, widened for a circle seen at a grazing angle. */
const LINE_WIDTH_SCALE = 3.2;

/** Annulus each layer covers, in units of the radius (hell-02 `LAYER_SPAN`;
 *  layer 3 holds the star, so it is a disc). */
const SPELL_LAYER_SPANS: readonly (readonly [number, number])[] = [
  [0, 0.3],
  [0.22, 0.42],
  [0.31, 0.56],
  [0, 0.8],
  [0.69, 0.87],
  [0.78, 1.06],
];

/** The rune bands: which layer, its radii and cells (hell-02 `BANDS`). */
const SPELL_RUNE_BANDS = [
  { layer: 2, inner: 0.385, outer: 0.49, cells: 22 },
  { layer: 5, inner: 0.845, outer: 0.935, cells: 44 },
] as const;

/** The disc mesh's radius (units of the circle's): room for the shock ring
 *  and the glow on the floor round it. */
const SPELL_DISC_RADIUS = 1.6;

const COMMON_GLSL = /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
/** Clockwise position round the ring from 12 o'clock, 0..1. Never atan(0, 0)
 *  (NaN on some GPUs; the bloom would smear it over the whole frame). */
float clockU(vec2 q) {
  if (dot(q, q) < 1e-12) q = vec2(0.0, 1.0);
  return fract(0.25 - atan(q.y, q.x) / TAU);
}
float easeOutBack(float x) {
  float y = x - 1.0;
  return 1.0 + 2.70158 * y * y * y + 1.70158 * y * y;
}
`;

// ════════════════════════════════════════════════════════════════════════
// 1. BAKE
// ════════════════════════════════════════════════════════════════════════

const SPELL_BAKE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SPELL_BAKE_FRAGMENT = /* glsl */ `${NOISE_GLSL}${COMMON_GLSL}
#define WIDTH ${LINE_WIDTH_SCALE.toFixed(2)}
uniform int uBakeLayer;
uniform float uR0;
uniform float uR1;
uniform float uPx;
uniform float uSeed;
varying vec2 vUv;

float gPx;
float gCov;
float gHalo;
float gBest;
float gT;
float gGly;

// Draw order t (0..1) is stored as 0.04 + 0.96 t, so 0 can mean "a ring".
float enc(float t) { return 0.04 + 0.96 * clamp(t, 0.0, 1.0); }

// One line: d = distance to its centre line, w = half width, b = strength.
void addLine(float d, float w, float b, float t) {
  if (b <= 0.0) return;
  w = max(w * WIDTH, 0.55 * gPx);
  float cov = clamp((w - d) / gPx + 0.5, 0.0, 1.0) * b;
  float influence = exp(-max(d - w, 0.0) * 42.0) * b;
  gCov = max(gCov, cov);
  gHalo += influence * 0.16;
  if (influence > gBest + 1e-4) { gBest = influence; gT = t; }
}

void ring(vec2 q, float radius, float w, float b) {
  float d = abs(length(q) - radius);
  if (d > 0.12) return;
  addLine(d, w, b, 0.0);
}

float sdSegH(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}
float sdSeg(vec2 p, vec2 a, vec2 b) { float h; return sdSegH(p, a, b, h); }

// A straight pen stroke from a to c, drawn during draw order t0..t1.
void stroke(vec2 q, vec2 a, vec2 c, float w, float b, float t0, float t1) {
  float h;
  float d = sdSegH(q, a, c, h);
  if (d > 0.12) return;
  addLine(d, w, b, enc(mix(t0, t1, h)));
}

// A rune: strokes on a 3x3 grid, picked by hash (hell-02 glyphSD).
float glyphSD(vec2 g, float id) {
  float d = 1e3;
  float spine = hash12(vec2(id, 91.0));
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float on = step(hash12(vec2(id * 1.37 + 0.5, fi * 7.1)), 0.34);
    if (i == 8 && spine < 0.5) on = 1.0;
    if (i == 2 && spine >= 0.5) on = 1.0;
    if (on < 0.5) continue;
    vec2 a;
    vec2 c;
    if (i < 6) {
      float row = float(i / 2) - 1.0;
      float col = float(i - (i / 2) * 2) - 1.0;
      a = vec2(col, row);
      c = vec2(col + 1.0, row);
    } else if (i < 12) {
      int j = i - 6;
      float col = float(j / 2) - 1.0;
      float row = float(j - (j / 2) * 2) - 1.0;
      a = vec2(col, row);
      c = vec2(col, row + 1.0);
    } else {
      int j = i - 12;
      a = vec2(0.0);
      c = vec2((j == 0 || j == 2) ? 1.0 : -1.0, j < 2 ? 1.0 : -1.0);
    }
    d = min(d, sdSeg(g, a * 0.3, c * 0.3));
  }
  if (hash12(vec2(id, 47.0)) > 0.78) d = min(d, abs(length(g) - 0.16));
  return d;
}

// A rune band between r0 and r1: border rings (by angle) and one rune per cell (A).
void band(vec2 q, float r0, float r1, float cells, float bandId) {
  float r = length(q);
  ring(q, r0, 0.003, 1.0);
  ring(q, r1, 0.003, 1.0);
  if (r < r0 + 0.006 || r > r1 - 0.006) return;
  float cellF = clockU(q) * cells;
  float c = floor(cellF);
  float H = r1 - r0;
  float rc = 0.5 * (r0 + r1);
  float cellW = TAU * rc / cells;
  vec2 g = vec2((0.5 - fract(cellF)) * cellW, r - rc) / H;
  float d = glyphSD(g, c + bandId * 101.0 + uSeed * 13.0) * H;
  float w = max(0.0028 * WIDTH, 0.55 * gPx);
  gGly = max(gGly, clamp((w - d) / gPx + 0.5, 0.0, 1.0));
}

// Centre: two rings round a seed-of-life rosette, its seven circles traced
// one after another by the pen, and a small eye last.
void layer0(vec2 q) {
  float r = length(q);
  ring(q, 0.215, 0.0045, 1.0);
  ring(q, 0.19, 0.0022, 1.0);
  for (int i = 0; i < 7; i++) {
    float angle = float(i) * TAU / 6.0 + PI * 0.5;
    vec2 centre = i == 0 ? vec2(0.0) : 0.085 * vec2(cos(angle), sin(angle));
    vec2 local = q - centre;
    float d = abs(length(local) - 0.085);
    if (d > 0.12) continue;
    addLine(d, 0.0022, 1.0, enc((float(i) + clockU(local)) / 7.0 * 0.85));
  }
  addLine(abs(r - 0.03), 0.0025, 1.0, enc(0.95));
  addLine(r, 0.008, 1.0, enc(0.95));
}

// A bead chain between two rings (hell-02 layer1).
void layer1(vec2 q) {
  float r = length(q);
  ring(q, 0.300, 0.0035, 1.0);
  ring(q, 0.345, 0.0022, 1.0);
  float cellF = clockU(q) * 36.0;
  float x = (fract(cellF) - 0.5) * TAU * 0.3225 / 36.0;
  float dd = length(vec2(x, r - 0.3225));
  bool big = mod(floor(cellF), 3.0) < 0.5;
  addLine(dd, big ? 0.0055 : 0.0028, 1.0, 0.0);
}

vec2 starV(float j) {
  float a = PI * 0.5 - TAU * j / 8.0;
  return 0.66 * vec2(cos(a), sin(a));
}

// The eight-point star {8/3} — one unicursal pen path, stroke s drawn during
// t = s/8..(s+1)/8 — on a double ring, with a small seal at each point that
// lights when the pen reaches it (hell-02 layer3, re-figured).
void layer3(vec2 q) {
  float r = length(q);
  float v = mod(floor(clockU(q) * 8.0 + 0.5), 8.0);
  vec2 lq = q - starV(v);
  float lr = length(lq);
  float cut = smoothstep(0.058, 0.066, lr);
  ring(q, 0.66, 0.005, cut);
  ring(q, 0.635, 0.0022, cut);
  if (r < 0.70) {
    float bandCut = 1.0 - smoothstep(0.372, 0.382, r) * (1.0 - smoothstep(0.488, 0.498, r));
    for (int s = 0; s < 8; s++) {
      vec2 A = starV(float((3 * s) % 8));
      vec2 B = starV(float((3 * s + 3) % 8));
      stroke(q, A, B, 0.0032, bandCut * cut, float(s) / 8.0, float(s + 1) / 8.0);
    }
  }
  if (lr < 0.1) {
    // The pen reaches point v at the start of stroke o, where 3·o ≡ v (mod 8).
    float o = mod(3.0 * v, 8.0);
    float t = enc(o / 8.0 + 0.01);
    vec2 sq = rot2(-v * 1.3) * lq;
    float sr = length(sq);
    addLine(abs(sr - 0.056), 0.003, 1.0, t);
    addLine(abs(sr - 0.037), 0.0017, 1.0, t);
    addLine(sr, 0.008, 1.0, t);
    for (int i = 0; i < 3; i++) {
      float aa = TAU * float(i) / 3.0;
      addLine(sdSeg(sq, vec2(0.0), 0.037 * vec2(cos(aa), sin(aa))), 0.0015, 1.0, t);
    }
  }
}

// 72 ticks between two rings, every sixth long (hell-02 layer4).
void layer4(vec2 q) {
  float r = length(q);
  ring(q, 0.765, 0.0025, 1.0);
  ring(q, 0.805, 0.0025, 1.0);
  float cellF = clockU(q) * 72.0;
  float c = floor(cellF);
  float x = abs(fract(cellF) - 0.5) * TAU * r / 72.0;
  bool isLong = mod(c, 6.0) < 0.5;
  float r0 = isLong ? 0.75 : 0.772;
  float r1 = isLong ? 0.82 : 0.798;
  float dy = max(max(r0 - r, r - r1), 0.0);
  addLine(length(vec2(x, dy)), isLong ? 0.0026 : 0.0015, 1.0, 0.0);
}

// The outer rune band and a double rim (hell-02 layer5).
void layer5(vec2 q) {
  band(q, 0.845, 0.935, 44.0, 2.0);
  ring(q, 0.968, 0.0065, 1.0);
  ring(q, 0.995, 0.0022, 1.0);
}

void main() {
  // Texel → circle-plane point: x is the clockwise angle from 12 o'clock, y the radius.
  float r = max(mix(uR0, uR1, vUv.y), 1e-5);
  float a = TAU * (0.25 - vUv.x);
  vec2 q = r * vec2(cos(a), sin(a));
  gPx = uPx;
  gCov = 0.0;
  gHalo = 0.0;
  gBest = 0.0;
  gT = 0.0;
  gGly = 0.0;
  if (uBakeLayer == 0) layer0(q);
  else if (uBakeLayer == 1) layer1(q);
  else if (uBakeLayer == 2) band(q, 0.385, 0.49, 22.0, 1.0);
  else if (uBakeLayer == 3) layer3(q);
  else if (uBakeLayer == 4) layer4(q);
  else layer5(q);
  gl_FragColor = vec4(gCov, min(gHalo, 1.0), gT, gGly);
}
`;

// ════════════════════════════════════════════════════════════════════════
// 2. RUNTIME — the circle on the floor (one disc, all six layers)
// ════════════════════════════════════════════════════════════════════════

const SPELL_CIRCLE_VERTEX = /* glsl */ `
varying vec2 vP;
varying vec3 vWorld;
void main() {
  vP = position.xy;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

function bandUniformValues(layer: number): { cells: number; bandV: number; bandHalfV: number; scrollIndex: number } {
  const band = SPELL_RUNE_BANDS.find((entry) => entry.layer === layer);
  if (!band) return { cells: 0, bandV: 0, bandHalfV: 0, scrollIndex: 0 };
  const [r0, r1] = SPELL_LAYER_SPANS[layer];
  return {
    cells: band.cells,
    bandV: ((band.inner + band.outer) / 2 - r0) / (r1 - r0),
    bandHalfV: (band.outer - band.inner) / 2 / (r1 - r0),
    scrollIndex: SPELL_RUNE_BANDS.indexOf(band),
  };
}

/** One `addLayer` call per layer, with its constants written in. */
function layerCalls(): string {
  return SPELL_LAYER_SPANS.map(([r0, r1], layer) => {
    const band = bandUniformValues(layer);
    const args = [
      `uLayer${layer}`,
      `vec2(${r0.toFixed(4)}, ${r1.toFixed(4)})`,
      `uTheta[${layer}]`,
      `uReveal[${layer}]`,
      layer === 3 ? 'uStar' : `uReveal[${layer}]`,
      band.cells.toFixed(1),
      band.bandV.toFixed(5),
      band.bandHalfV.toFixed(5),
      `uScroll[${band.scrollIndex}]`,
    ].join(', ');
    return `  if (r > ${(r0 - 0.01).toFixed(4)} && r < ${(r1 + 0.01).toFixed(4)}) addLayer(${args}, base, r, dux, duy, drx, dry, gPx);`;
  }).join('\n');
}

const SPELL_CIRCLE_FRAGMENT = /* glsl */ `${NOISE_GLSL}${AIR_GLSL}${COMMON_GLSL}
uniform sampler2D uLayer0;
uniform sampler2D uLayer1;
uniform sampler2D uLayer2;
uniform sampler2D uLayer3;
uniform sampler2D uLayer4;
uniform sampler2D uLayer5;
uniform float uTheta[6];
uniform float uReveal[6];
uniform float uScroll[2];
uniform float uStar;
uniform float uGlyphT;
uniform float uGain;
uniform float uBreath;
uniform float uSwell;
uniform float uFlash;
uniform float uShockR;
uniform float uShockAmp;
uniform float uPulseR;
uniform float uPulseAmp;
uniform float uFloorGlow;
uniform float uTime;
uniform vec3 uLineColour;
uniform vec3 uHaloColour;
uniform vec3 uHotColour;
varying vec2 vP;
varying vec3 vWorld;

vec3 gAcc; // x line coverage, y halo, z pen-tip / pop heat

void addLayer(sampler2D tex, vec2 span, float theta, float P, float strokeP, float cells, float bandV, float bandHalfV, float scroll,
              float base, float r, float dux, float duy, float drx, float dry, float gPx) {
  float height = max(span.y - span.x, 1e-3);
  float v = (r - span.x) / height;
  vec2 gx = vec2(dux, drx / height);
  vec2 gy = vec2(duy, dry / height);
  float uRing = fract(base + theta / TAU);
  vec4 s = textureGrad(tex, vec2(uRing, v), gx, gy);
  // Draw-on by angle: rings appear where the angle is behind the pen.
  float du = gPx / max(r, 0.02) / TAU;
  float ang = P >= 1.0 ? 1.0 : (P <= 0.0 ? 0.0 : 1.0 - smoothstep(P - du, P, uRing));
  float hotA = (P > 0.0 && P < 1.0) ? ang * exp(-max(P - uRing, 0.0) * TAU * r * 30.0) : 0.0;
  // Strokes follow their own pen order.
  float isStroke = step(0.02, s.b);
  float tt = (s.b - 0.04) / 0.96;
  float st = strokeP >= 1.0 ? 1.0 : (strokeP <= 0.0 ? 0.0 : 1.0 - smoothstep(strokeP - 0.012, strokeP, tt));
  float hotS = (strokeP > 0.0 && strokeP < 1.0) ? st * exp(-max(strokeP - tt, 0.0) * 28.0) : 0.0;
  float m = mix(ang, st, isStroke);
  float cov = s.r * m;
  float halo = s.g * m;
  float hot = mix(hotA, hotS, isStroke) * (s.r + 0.3 * s.g) * 1.4;
  if (cells > 0.0) {
    // Runes slide inside their ring and pop in one after another.
    float uText = fract(base + (theta + scroll) / TAU);
    float c = floor(uText * cells);
    float uc = (c + 0.5) / cells;
    float pop = 1.0;
    float flare = 0.0;
    float shown = 1.0;
    if (uGlyphT < 100.0) {
      float tc = (c / cells) * 1.3;
      float k = clamp((uGlyphT - tc) / 0.2, 0.0, 1.0);
      shown = step(0.0001, k);
      pop = max(easeOutBack(k), 0.05);
      flare = shown * exp(-max(uGlyphT - tc, 0.0) * 10.0);
    }
    float uu = uc + (uText - uc) / pop;
    float vv = bandV + (v - bandV) / pop;
    float inCell = step(abs(uu - uc) * cells, 0.5) * step(abs(vv - bandV), bandHalfV);
    float rune = textureGrad(tex, vec2(uu, vv), gx / pop, gy / pop).a * inCell * shown;
    rune *= P >= 1.0 ? 1.0 : step(uRing, P);
    cov = max(cov, rune * (1.0 + 2.5 * flare));
    halo += rune * 0.3;
    hot += rune * flare;
  }
  gAcc += vec3(cov, halo, hot);
}

// Ignition temperature ramp: white-hot → pale ice → lavender → the rest colour.
vec3 flashRamp(float F, vec3 rest) {
  if (F > 0.66) return mix(vec3(1.6, 2.0, 2.6), vec3(2.4, 2.6, 3.0), (F - 0.66) / 0.34);
  if (F > 0.33) return mix(vec3(1.0, 0.9, 2.2), vec3(1.6, 2.0, 2.6), (F - 0.33) / 0.33);
  return mix(rest, vec3(1.0, 0.9, 2.2), F / 0.33);
}

void main() {
  vec2 p = vP;
  float r = length(p);
  float gPx = max(length(fwidth(p)), 1e-5);
  // Texture-space derivatives before any branch. The angle wraps at 12
  // o'clock, so use whichever of u and u + 0.5 is continuous here.
  float base = clockU(p);
  float baseB = fract(base + 0.5);
  float dux = abs(dFdx(base)) < abs(dFdx(baseB)) ? dFdx(base) : dFdx(baseB);
  float duy = abs(dFdy(base)) < abs(dFdy(baseB)) ? dFdy(base) : dFdy(baseB);
  float drx = dFdx(r);
  float dry = dFdy(r);
  gAcc = vec3(0.0);
  if (uGain > 0.0) {
${layerCalls()}
  }
  float cov = min(gAcc.x, 1.5) * (1.0 + uSwell);
  float halo = gAcc.y * (1.0 + 2.0 * uSwell);
  float hot = gAcc.z;
  // The pulse wave lifts the lines it passes.
  float pr = (r - uPulseR) / 0.07;
  float wave = uPulseAmp * exp(-pr * pr);
  float lift = uBreath * (1.0 + 3.0 * wave);
  vec3 colour = (uLineColour * cov + uHaloColour * halo) * lift + uHotColour * hot;
  if (uFlash > 0.0) {
    vec3 flashColour = flashRamp(uFlash, uLineColour);
    colour = mix(colour, flashColour * (cov * 0.75 + halo * 0.1) + uHotColour * hot, smoothstep(0.0, 0.35, uFlash));
  }
  // Light on the floor: a soft pool under the circle, the pulse's faint fill,
  // the ignition's glow and the shock ring racing out.
  float inDisc = 1.0 - smoothstep(1.0, 1.04, r);
  float pool = exp(-r * r * 1.4) * (1.0 - smoothstep(1.1, ${SPELL_DISC_RADIUS.toFixed(2)}, r));
  colour += uHaloColour * uFloorGlow * pool * 0.55;
  colour += uHaloColour * wave * 0.35 * inDisc;
  if (uFlash > 0.0) colour += flashRamp(uFlash, uLineColour) * uFlash * 0.08 * exp(-r * 2.6) * inDisc;
  if (uShockAmp > 0.0) {
    float sk = (r - uShockR) / 0.03;
    colour += uHotColour * uShockAmp * exp(-sk * sk) * 0.55 * (1.0 - smoothstep(1.3, 1.58, r));
  }
  // The pool: inside the circle the bright checker sinks into a deep
  // night-blue (premultiplied alpha darkens what is behind), so the light
  // lines read on light tiles too — hell-02's "ink mode" darkening
  // (\`CIRCLE_FRAG\`, line 513), here a portal of night with a few stars.
  float poolMask = (1.0 - smoothstep(0.86, 1.1, r)) * uFloorGlow;
  vec2 starCell = floor(p * 26.0);
  float starSeed = hash12(starCell + 3.7);
  vec2 starOffset = fract(p * 26.0) - 0.5 - (vec2(hash12(starCell + 1.3), hash12(starCell + 8.1)) - 0.5) * 0.6;
  float star = step(0.93, starSeed) * exp(-dot(starOffset, starOffset) * 60.0) * (0.6 + 0.4 * sin(uTime * 2.3 + starSeed * 90.0));
  colour += (uLineColour * 0.25 + vec3(0.6)) * star * poolMask * 1.4;
  colour += uHaloColour * 0.08 * poolMask;
  colour *= uGain;
  float darkness = 0.62 * poolMask * uGain;
  // Clamped: a glow, never a sun. An additive light only dims in the air.
  float clear = airLightTransmission(vWorld);
  colour = min(colour, vec3(3.0)) * clear;
  gl_FragColor = vec4(colour, darkness * clear);
}
`;

// ════════════════════════════════════════════════════════════════════════
// The light column over the circle
// ════════════════════════════════════════════════════════════════════════

/**
 * An open cylinder, front faces only, additive. A volume of light is
 * brightest where the eye looks through most of it — the column's middle —
 * and that path length is |n·v| on the front face (both flattened to the
 * floor plane), so the column reads as a soft volume with no hard edge. It
 * fades with height, rises from the floor as it charges, and drifting
 * streaks of noise climb it.
 */
const SPELL_COLUMN_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(modelMatrix) * normal;
  vHeight = position.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SPELL_COLUMN_FRAGMENT = /* glsl */ `${NOISE_GLSL}${AIR_GLSL}
uniform float uAmount;
uniform float uTime;
uniform vec3 uCore;
uniform vec3 uEdge;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
void main() {
  vec2 eyeFlat = (cameraPosition - vWorld).xz;
  vec2 normalFlat = vNormal.xz;
  float facing = abs(dot(normalFlat, eyeFlat)) / max(length(normalFlat) * length(eyeFlat), 1e-4);
  float body = facing * facing;
  float h = clamp(vHeight, 0.0, 1.0);
  // It rises from the floor as it charges, and fades upward.
  float reach = uAmount * 1.1;
  float risen = 1.0 - smoothstep(reach - 0.3, reach, h);
  float fall = exp(-h * 3.0);
  float streak = 0.5 + 0.5 * vnoise(vec2(vWorld.x * 2.2 + vWorld.z * 1.3, h * 3.0 - uTime * 0.7));
  vec3 colour = mix(uEdge, uCore, body) * body * fall * streak * risen * uAmount * 0.8;
  colour = min(colour, vec3(3.0)) * airLightTransmission(vWorld);
  gl_FragColor = vec4(colour, 0.0);
}
`;

// ════════════════════════════════════════════════════════════════════════
// Rising sparkles
// ════════════════════════════════════════════════════════════════════════

/**
 * Instanced camera-facing quads (the motes' and hell-10's way — never
 * `THREE.Points`, which stalled ANGLE/D3D11 in Nodestra), each a pure
 * function of time: it is born on the circle, spirals up and fades. A seeded
 * share of them shows, by the timeline's `sparkles` amount, so a low amount
 * is a few embers rather than many faint ones. Four-point star shape: the
 * hellscape sky circles' sparkle (`scene/circles-clockwork.ts:322-335`).
 */
const SPELL_SPARKLE_VERTEX = /* glsl */ `${AIR_GLSL}
#define TAU 6.28318530718
attribute vec4 aSeed;
uniform float uTime;
uniform float uAmount;
uniform float uRadius;
uniform vec3 uCentre;
uniform vec2 uViewport;
varying vec2 vCorner;
varying float vBright;
varying float vWhite;
void main() {
  float life = mix(1.8, 3.6, aSeed.x);
  float age = fract(uTime / life + aSeed.y);
  float share = fract(aSeed.y * 7.31 + aSeed.z * 3.17);
  float shown = step(share, uAmount);
  float twinkle = 0.65 + 0.35 * sin(uTime * (5.0 + 6.0 * aSeed.z) + aSeed.w * 40.0);
  vBright = shown * sin(3.14159265 * age) * twinkle;
  vWhite = fract(aSeed.w * 13.7);
  vCorner = position.xy;
  if (vBright <= 0.001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float angle = aSeed.z * TAU + age * mix(0.5, 1.6, aSeed.w) + uTime * 0.1;
  float spread = uRadius * mix(0.1, 1.0, sqrt(aSeed.w)) * (1.0 - 0.4 * age);
  float rise = age * mix(1.0, 4.8, aSeed.x * aSeed.x);
  vec3 world = uCentre + vec3(cos(angle) * spread, rise + 0.05, sin(angle) * spread);
  vec4 view = viewMatrix * vec4(world, 1.0);
  float depth = max(-view.z, 0.05);
  float size = mix(0.05, 0.12, fract(aSeed.x * 5.3));
  float focal = projectionMatrix[1][1] * uViewport.y * 0.5;
  float radiusPx = clamp(size * focal / depth, 1.5, 12.0 * uViewport.y / 900.0);
  vec4 clip = projectionMatrix * view;
  clip.xy += position.xy * radiusPx / (uViewport * 0.5) * clip.w;
  gl_Position = clip;
  vBright *= airLightTransmission(world);
}
`;

const SPELL_SPARKLE_FRAGMENT = /* glsl */ `
uniform vec3 uIce;
uniform vec3 uLavender;
varying vec2 vCorner;
varying float vBright;
varying float vWhite;
void main() {
  vec2 o = vCorner;
  float d = length(o);
  if (d > 1.0) discard;
  float core = exp(-d * 7.0);
  float rays = exp(-abs(o.x) * 16.0) * exp(-abs(o.y) * 3.2) + exp(-abs(o.y) * 16.0) * exp(-abs(o.x) * 3.2);
  float edge = 1.0 - smoothstep(0.7, 1.0, d);
  vec3 tint = mix(uLavender, uIce, step(0.4, vWhite));
  vec3 colour = (mix(tint, vec3(1.0), core) * core * 2.2 + tint * rays * 0.9) * edge * vBright;
  gl_FragColor = vec4(min(colour, vec3(3.0)), 0.0);
}
`;

// ════════════════════════════════════════════════════════════════════════
// The summoned book and candle: patches to the props' own shaders
// ════════════════════════════════════════════════════════════════════════

/**
 * Injected into the book's and the candle's fragment shaders (before their
 * `main`): they rise through the floor out of the circle and sink back into
 * it, so
 *  - a noise DISSOLVE (in a pattern anchored on the object) eats them away
 *    into light with a bright ice-blue edge — the hellscape's burn front
 *    (`hell-02-circle-motion-glsl.ts:476-486`) turned to light;
 *  - a SEAM glows where they cross the floor;
 *  - a spectral GLOW washes them white-blue while they are summoned and
 *    while they leave.
 * Everything stays finite: no pow, no division, `exp` of a non-positive.
 */
const SPELL_SURFACE_GLSL = /* glsl */ `
uniform float uSpellDissolve;
uniform float uSpellGlow;
uniform float uSpellFloorY;
uniform float uSpellPatternScale;
uniform vec3 uSpellColour;
uniform vec3 uSpellAnchor;
float spellPattern(vec3 worldPosition) {
  vec3 pattern = (worldPosition - uSpellAnchor) * uSpellPatternScale;
  return 0.65 * vnoise(pattern.xy * 3.0 + pattern.z * 1.7) + 0.35 * vnoise(pattern.zy * 7.0 + 11.0);
}
float spellThreshold() { return uSpellDissolve * 1.08 - 0.04; }
/** Discard what has dissolved. */
void spellDissolveTest(vec3 worldPosition) {
  if (spellPattern(worldPosition) < spellThreshold()) discard;
}
vec3 spellSurface(vec3 colour, vec3 worldPosition) {
  float n = spellPattern(worldPosition);
  float threshold = spellThreshold();
  if (n < threshold) discard;
  float edge = (1.0 - smoothstep(0.0, 0.07, n - threshold)) * step(0.001, uSpellDissolve);
  float seam = exp(-max(worldPosition.y - uSpellFloorY, 0.0) / 0.18);
  vec3 lit = mix(colour, uSpellColour * 0.8 + colour * 0.45, uSpellGlow * 0.75);
  return min(lit + uSpellColour * (edge * 2.4 + seam * 1.3 + uSpellGlow * 0.3), vec3(3.0));
}
`;

type ShaderEdit = readonly [from: string, to: string];

/**
 * Apply text edits to a shader string. Each anchor must occur EXACTLY once;
 * a missing or repeated anchor is reported (console.error) and that edit is
 * skipped, so a changed prop shader degrades the effect instead of breaking
 * the stage. `spell.test.ts` checks every anchor against the props' current
 * shaders.
 */
function patchShader(source: string, label: string, edits: readonly ShaderEdit[]): { source: string; missing: string[] } {
  let patched = source;
  const missing: string[] = [];
  for (const [from, to] of edits) {
    const count = patched.split(from).length - 1;
    if (count !== 1) {
      missing.push(from);
      console.error(`[spell] ${label}: shader anchor found ${count} times, expected once: ${from}`);
      continue;
    }
    patched = patched.replace(from, () => to);
  }
  return { source: patched, missing };
}

const MAIN_ANCHOR = 'void main() {';

/** The book body's and loose pages' edits (`props/books.ts`). */
const BOOK_SURFACE_EDITS: readonly ShaderEdit[] = [
  [MAIN_ANCHOR, `${SPELL_SURFACE_GLSL}\n${MAIN_ANCHOR}`],
  ['gl_FragColor = vec4(fogFromEye(colour, vToEye), 1.0);', 'colour = spellSurface(colour, cameraPosition - vToEye);\n  gl_FragColor = vec4(fogFromEye(colour, vToEye), 1.0);'],
];

/** The candle body's edits (`props/candles.ts`): the wax and the wick. */
const CANDLE_BODY_EDITS: readonly ShaderEdit[] = [
  [MAIN_ANCHOR, `${SPELL_SURFACE_GLSL}\n${MAIN_ANCHOR}`],
  ['if (vPart > 0.5) {', 'if (vPart > 0.5) {\n    spellDissolveTest(cameraPosition - vToEye);'],
  ['gl_FragColor = vec4(fogFromEye(min(colour, vec3(2.5)), vToEye), 1.0);', 'colour = spellSurface(colour, cameraPosition - vToEye);\n  gl_FragColor = vec4(fogFromEye(min(colour, vec3(2.5)), vToEye), 1.0);'],
];

/** The flame's edits: it grows from a spark as it ignites (`uIgnite`), its
 *  core is a cool white, and it fades with `uFlameGain`. */
const CANDLE_FLAME_EDITS: readonly ShaderEdit[] = [
  [MAIN_ANCHOR, `uniform float uIgnite;\nuniform float uFlameGain;\nuniform vec3 uFlameCore;\n${MAIN_ANCHOR}`],
  ['vec2 point = vFlame / 0.11;', 'vec2 point = vFlame / (0.11 * clamp(uIgnite, 0.06, 1.0));'],
  ['vec3(1.0, 0.92, 0.75) * core', 'uFlameCore * core'],
  ['gl_FragColor = vec4(min(colour * flicker, vec3(2.5)), 0.0);', 'gl_FragColor = vec4(min(colour * flicker * uFlameGain, vec3(2.5)), 0.0);'],
];

export {
  BOOK_SURFACE_EDITS,
  CANDLE_BODY_EDITS,
  CANDLE_FLAME_EDITS,
  LINE_WIDTH_SCALE,
  SPELL_BAKE_FRAGMENT,
  SPELL_BAKE_VERTEX,
  SPELL_CIRCLE_FRAGMENT,
  SPELL_CIRCLE_VERTEX,
  SPELL_COLUMN_FRAGMENT,
  SPELL_COLUMN_VERTEX,
  SPELL_DISC_RADIUS,
  SPELL_LAYER_SPANS,
  SPELL_RUNE_BANDS,
  SPELL_SPARKLE_FRAGMENT,
  SPELL_SPARKLE_VERTEX,
  SPELL_SURFACE_GLSL,
  patchShader,
};
export type { ShaderEdit };
