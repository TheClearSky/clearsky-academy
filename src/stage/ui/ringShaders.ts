/**
 * The chapter progress rings — ONE instanced draw for every ring on the
 * page (`.claude/research/stage/CARDS-HUD.md` › HUD rings). Each instance is
 * a quad around a DOM anchor; the fragment shader draws, in polar distance
 * fields antialiased with `fwidth`:
 *
 *      · · ╷ · · · · ╷ · ·        ⑤ 60 ticks (every 5th long), slowly turning
 *        ╱  ╭────◆────╮  ╲        ④ dashed arc fragments, counter-rotating
 *       ·  ╭┤▓▓▓▓▓░░░░├╮  ·       ③ topic cells: N = topics, the done ones lit
 *       ╷  │╭─────────╮│  ╷       ② the fill arc with a hot comet head ◆
 *          ││  (DOM)  ││          ① a dim track
 *       ⌜  hover reticle: four corner brackets snap in            ⌝
 *
 * The angular antialiasing width is derived analytically (fwidth(p)/(r·τ)),
 * never `fwidth(atan(...))`, which smears a line at the 12 o'clock seam.
 * Styles (uStyle): 0 Astrolabe (gold and lavender hairlines, calm),
 * 1 Tactical HUD (cyan on indigo, chevron segments, a scanning wedge),
 * 2 Arcane Sigil (a star polygon of the topic count drawn on as it fills).
 * Completion: a shock ring expands (aBurst 0 → 1).
 */

const RING_VERTEX = /* glsl */ `
attribute vec2 aCentre;
attribute float aRadius;
attribute float aProgress;
attribute float aDone;
attribute float aTotal;
attribute float aHover;
attribute float aBurst;
attribute float aSeed;
uniform vec2 uViewport;
varying vec2 vQ;
varying float vProgress;
varying float vDone;
varying float vTotal;
varying float vHover;
varying float vBurst;
varying float vSeed;
varying float vRadiusPx;
const float EXTENT = 1.45;
void main() {
  vQ = position.xy * EXTENT;
  // CSS y points down: flip it when placing, so the quad keeps its winding
  // (a single y flip reverses it and the quad would be culled as a back face).
  vec2 screen = aCentre + vec2(position.x, -position.y) * EXTENT * aRadius;
  gl_Position = vec4(screen.x / uViewport.x * 2.0 - 1.0, 1.0 - screen.y / uViewport.y * 2.0, 0.0, 1.0);
  vProgress = aProgress;
  vDone = aDone;
  vTotal = max(aTotal, 1.0);
  vHover = aHover;
  vBurst = aBurst;
  vSeed = aSeed;
  vRadiusPx = aRadius;
}
`;

const RING_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uStyle;
uniform vec3 uGold;
uniform vec3 uLavender;
uniform vec3 uCyan;
varying vec2 vQ;
varying float vProgress;
varying float vDone;
varying float vTotal;
varying float vHover;
varying float vBurst;
varying float vSeed;
varying float vRadiusPx;
const float TAU = 6.2831853;
float band(float r, float r0, float width, float aa) { return 1.0 - smoothstep(-aa, aa, abs(r - r0) - width * 0.5); }
mat2 rotate(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// iq: an arc symmetric about +y, half-aperture sc = (sin, cos), radius ra, thickness rb.
float sdArc(vec2 p, vec2 sc, float ra, float rb) {
  p.x = abs(p.x);
  return ((sc.y * p.x > sc.x * p.y) ? length(p - sc * ra) : abs(length(p) - ra)) - rb;
}
float sdSegment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
void main() {
  vec2 p = vQ;
  float r = length(p);
  float aa = fwidth(r);
  // Hairlines never thinner than ~1.2 px.
  float hair = 1.2 / max(vRadiusPx, 1.0);
  float angle = fract(atan(p.x, p.y) / TAU + 1.0); // 0 at 12 o'clock, clockwise
  float angularAa = length(fwidth(p)) / max(r * TAU, 1e-4);
  bool tactical = uStyle > 0.5 && uStyle < 1.5;
  bool sigil = uStyle > 1.5;
  vec3 lineColour = tactical ? uCyan : uLavender;
  vec3 fillA = tactical ? uCyan * 0.6 : uLavender;
  vec3 fillB = tactical ? vec3(0.85, 1.0, 1.0) : uGold;
  bool complete = vProgress > 0.999;
  if (complete) { fillA = uGold; fillB = vec3(1.0, 0.95, 0.8); }

  vec3 colour = vec3(0.0);
  float alpha = 0.0;

  // ① track
  float track = band(r, 0.72, max(0.03, hair), aa);
  colour += lineColour * track * 0.22;

  // ② fill arc, from 12 o'clock clockwise, round caps, a comet head
  float h = 0.5 * vProgress * TAU;
  // rotate(a) turns clockwise; turning the point counter-clockwise by h puts
  // the arc's middle (clockwise angle h) on +y, where sdArc is symmetric.
  vec2 q = rotate(-h) * p;
  float fillD = sdArc(q, vec2(sin(h), cos(h)), 0.72, tactical ? 0.034 : 0.022);
  float fill = vProgress > 0.0005 ? 1.0 - smoothstep(-aa, aa, fillD) : 0.0;
  float along = clamp(angle / max(vProgress, 1e-4), 0.0, 1.0);
  vec3 fillColour = mix(fillA, fillB, along) * (1.0 + 2.2 * pow(along, 10.0));
  if (tactical) fill *= step(0.18, fract(angle * 48.0)); // chevron gaps
  colour += fillColour * fill;
  float halo = vProgress > 0.0005 ? exp(-pow(max(fillD, 0.0) * 16.0, 2.0)) * 0.35 : 0.0;
  colour += fillColour * halo;

  // ③ topic cells on an inner ring
  float cellCount = vTotal;
  float cellCoord = angle * cellCount;
  float cellFraction = fract(cellCoord);
  float gap = 0.06 * cellCount / (0.6 * TAU) * 0.6;
  float cellAa = angularAa * cellCount;
  float cell = smoothstep(gap - cellAa, gap + cellAa, cellFraction) * smoothstep(gap - cellAa, gap + cellAa, 1.0 - cellFraction);
  float cells = band(r, 0.6, 0.035, aa) * cell;
  float lit = step(floor(cellCoord) + 0.5, vDone);
  colour += mix(lineColour * 0.25, fillB * 1.2, lit) * cells;

  // ④⑤ ticks (rotate the angle, not the geometry) and dashed fragments
  float turn = uTime * (0.006 + vHover * 0.02) * (1.0 + vSeed * 0.3);
  float tickAngle = fract(angle + turn);
  float tickIndex = floor(tickAngle * 60.0);
  float major = step(0.5, 1.0 - step(0.01, fract(tickIndex / 5.0)));
  float tickPhase = abs(fract(tickAngle * 60.0) - 0.5) * 2.0;
  float tickAa = angularAa * 60.0 * 2.0;
  float tick = (1.0 - smoothstep(0.12 - tickAa, 0.12 + tickAa, tickPhase)) * band(r, 0.93, mix(0.04, 0.08, major), aa);
  colour += lineColour * tick * (0.35 + 0.5 * vHover);
  float dashAngle = fract(angle - uTime * 0.012);
  float dashes = step(0.5, fract(dashAngle * 7.0)) * band(r, 1.02, max(0.012, hair), aa);
  colour += (tactical ? uCyan : uGold) * dashes * 0.45;

  if (tactical) {
    // A scanning wedge.
    float scan = fract(angle - uTime * 0.25);
    colour += uCyan * smoothstep(0.92, 1.0, scan) * band(r, 0.82, 0.18, aa) * 0.35;
  }
  if (sigil) {
    // A star polygon of the topic count, drawn on as the chapter fills.
    float n = clamp(vTotal, 3.0, 16.0);
    float skip = n > 6.0 ? 3.0 : 2.0;
    float sigilLines = 0.0;
    for (int i = 0; i < 16; i++) {
      if (float(i) >= n) break;
      float a0 = float(i) / n * TAU;
      float a1 = mod(float(i) + skip, n) / n * TAU;
      vec2 v0 = vec2(sin(a0), cos(a0)) * 0.5;
      vec2 v1 = vec2(sin(a1), cos(a1)) * 0.5;
      float drawn = step(float(i) + 0.5, vProgress * n + 0.5);
      sigilLines = max(sigilLines, (1.0 - smoothstep(0.0, aa * 1.5 + 0.004, sdSegment(p, v0, v1))) * mix(0.18, 1.0, drawn));
    }
    colour += uGold * sigilLines * 0.9;
  }

  // Hover reticle: four corner brackets that snap in.
  float snap = mix(1.35, 1.12, vHover);
  vec2 corner = abs(p) - vec2(snap * 0.92);
  float bracket = max(band(max(abs(p.x), abs(p.y)), snap * 0.92 + 0.0, 0.03, aa) * step(0.0, corner.x + 0.22) * step(0.0, corner.y + 0.22), 0.0);
  colour += lineColour * bracket * vHover * 0.9;

  // ⑥ completion: an expanding shock ring.
  float burst = clamp(vBurst, 0.0, 1.0);
  colour += uGold * band(r, 0.72 + burst * 0.55, 0.03 * (1.0 - burst), aa) * (1.0 - burst) * step(0.001, vBurst) * 3.0;

  // A soft disc behind the DOM label so the number reads on any background.
  float disc = (1.0 - smoothstep(0.5, 0.56, r));
  alpha = disc * 0.55;
  gl_FragColor = vec4(colour, alpha);
  // Straight to the canvas (the \`none\` post) three tone-maps and encodes a
  // ShaderMaterial only through these chunks (review G1).
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export { RING_FRAGMENT, RING_VERTEX };
