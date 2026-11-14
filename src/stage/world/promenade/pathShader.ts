import { AIR_GLSL } from '../../engine/air';
import { NOISE_GLSL } from '../../engine/glsl';

/**
 * The royal footpath and the lawn round it, drawn into the meadow floor
 * (`world/floor.ts` › `path`).
 *
 * The path is BRICK in a basket weave (2026-10-17: of five styles Deepak
 * picked "brick weave" — the others are archived in
 * `themes/clearsky-path-styles-v1` — and "dont have ununiformity it looks
 * bad"): true courses, one even brick colour, an even mortar, no wear or
 * stains. What gives it depth is light, not dirt:
 *
 *  - RELIEF (a procedural normal map): each brick's surface is a small bevel
 *    over its distance to the joint; the normal is that height's slope by
 *    finite differences, the step never smaller than half a pixel so it can't
 *    alias. The moon, the sky and the magic lamp light it.
 *  - The brick darkens into its joint (a cheap ambient occlusion).
 *  - NO PIXELS: the joints are anti-aliased over the pixel's footprint, and
 *    once a brick is only a few pixels across the pattern fades to its mean
 *    colour and the relief to flat.
 *
 * THE LAWN ("make the grass around the footpath have some large level
 * variation and some small scale variations too"): the ground rolls in
 * broad, gentle swells (a slow height field whose slope shades the grass, so
 * it reads as lumps of ground in the moonlight, not a flat plane), with
 * patches of deeper and lighter green across it; up close it breaks into
 * clumps and tufts (a finer height field and colour), which fade out with
 * distance so they never crawl.
 *
 * Performance: no textures. The brick work runs only on path, plaza and
 * kerb pixels; the lawn's fine detail only where a clump is bigger than a
 * pixel. On the LOW tier (`LOW_DETAIL`) the reliefs are skipped.
 */

const PATH_GLSL = /* glsl */ `${AIR_GLSL}
${NOISE_GLSL}
uniform vec4 uPath;   // half width, kerb, inlay inset, -
uniform vec2 uPlaza;  // centre z, radius
uniform vec4 uLamp;   // x, y, z, strength
uniform vec3 uLampColour;
uniform vec3 uKeyDirection, uKeyColour, uAmbientSky;

// ── the brick: a basket weave of 0.4 m cells, a pair of 0.4 × 0.2 m bricks in each, turned alternately ──

const vec3 BRICK = vec3(0.43, 0.22, 0.15);
const vec3 MORTAR = vec3(0.24, 0.21, 0.19);
const float BRICK_SIZE = 0.36;
const float JOINT = 0.008;
const float SHADE = 0.03;

/** Distance (m) to the nearest joint (> 0 inside a brick) and the brick's id. */
float brickField(vec2 p, out vec2 id) {
  float size = 0.4;
  vec2 cell = floor(p / size);
  vec2 local = fract(p / size) * size;
  if (mod(cell.x + cell.y, 2.0) > 0.5) local = local.yx;
  float brick = floor(local.y / (size * 0.5));
  float ly = local.y - brick * size * 0.5;
  id = cell * 2.0 + vec2(brick, 0.0);
  return min(min(local.x, size - local.x), min(ly, size * 0.5 - ly));
}
float brickHeight(float edge) { return smoothstep(0.0, 0.02, edge) * 0.012; }

/** The kerb: granite blocks 0.6 m long; s across it (0 at the path's edge … kerb), t along it (m). */
float kerbField(float s, float t) {
  float along = fract(t / 0.6) * 0.6;
  return min(min(along, 0.6 - along), min(s, uPath.y - s));
}

// ── the lawn ──

/** The ground's broad swells (m), ~20 m across. */
float swell(vec2 p) {
  return vnoise(p * 0.05) * 1.8 + vnoise(p * 0.13 + 4.2) * 0.7;
}
/** Clumps and tufts (m), ~0.4 m across. */
float tufts(vec2 p) {
  return vnoise(p * 2.4) * 0.045 + vnoise(p * 7.0 + 1.7) * 0.015;
}

/** The lawn's colour and its normal at p (the pixel's footprint decides how fine). */
vec3 lawn(vec3 p, float footprint, out vec3 n) {
  // Patches of deeper and lighter green, at two scales.
  float broad = vnoise(p.xz * 0.04 + 9.0);
  float patches = vnoise(p.xz * 0.22);
  vec3 grass = mix(vec3(0.035, 0.100, 0.060), vec3(0.085, 0.190, 0.095), broad);
  grass = mix(grass, grass * vec3(1.15, 1.1, 0.8), smoothstep(0.55, 0.8, patches) * 0.6);
  // Up close: clumps, faded out once a clump is about a pixel.
  float fine = 1.0 - smoothstep(0.04, 0.16, footprint);
  grass *= 1.0 + (vnoise(p.xz * 2.4) - 0.5) * 0.35 * fine + (vnoise(p.xz * 9.0) - 0.5) * 0.25 * (1.0 - smoothstep(0.01, 0.05, footprint));
  n = vec3(0.0, 1.0, 0.0);
  #ifndef LOW_DETAIL
    float e = 0.6;
    float h = swell(p.xz);
    vec2 slope = vec2(swell(p.xz + vec2(e, 0.0)) - h, swell(p.xz + vec2(0.0, e)) - h) / e;
    if (fine > 0.01) {
      float t0 = tufts(p.xz);
      float et = max(0.02, footprint * 0.5);
      slope += vec2(tufts(p.xz + vec2(et, 0.0)) - t0, tufts(p.xz + vec2(0.0, et)) - t0) / et * fine;
    }
    n = normalize(vec3(-slope.x, 1.0, -slope.y));
  #endif
  return grass;
}

/** Moonlight, sky and the magic lamp on a surface of normal n; gloss and spec for the glint. */
vec3 lightGround(vec3 albedo, vec3 n, vec3 p, float gloss, float spec) {
  vec3 l = normalize(uKeyDirection);
  vec3 v = normalize(cameraPosition - p);
  vec3 colour = albedo * (uAmbientSky * (0.9 + 0.7 * n.y) + uKeyColour * max(dot(n, l), 0.0) * 1.25);
  vec3 toLamp = uLamp.xyz - p;
  float d2 = dot(toLamp, toLamp);
  vec3 ld = toLamp * inversesqrt(d2 + 1e-4);
  float lamp = uLamp.w / (1.0 + d2 * 0.09);
  colour += albedo * uLampColour * lamp * max(dot(n, ld), 0.0);
  float glintMoon = pow(max(dot(n, normalize(l + v)), 0.0), gloss);
  float glintLamp = pow(max(dot(n, normalize(ld + v)), 0.0), gloss);
  colour += (uKeyColour * 0.35 * glintMoon + uLampColour * lamp * glintLamp) * spec;
  return colour;
}

/** The meadow floor at p: lawn, kerbs, the path and the plaza, lit. */
vec3 meadowGround(vec3 p) {
  float halfWidth = uPath.x;
  float kerb = uPath.y;
  float footprint = length(fwidth(p.xz));
  float dPath = abs(p.x) - halfWidth;
  float plazaR = length(p.xz - vec2(0.0, uPlaza.x)) - uPlaza.y;
  float pathAhead = step(p.z, 1.0);
  bool onPlaza = plazaR < 0.0;
  bool onPath = dPath < 0.0 && pathAhead > 0.5 && !onPlaza;
  bool onKerb = !onPlaza && !onPath && ((dPath < kerb && plazaR > 0.0 && pathAhead > 0.5) || (plazaR < kerb && dPath > 0.0));
  if (!onPlaza && !onPath && !onKerb) {
    vec3 n;
    vec3 grass = lawn(p, footprint, n);
    return lightGround(grass, n, p, 1.0, 0.0);
  }
  vec2 id = vec2(0.0);
  float edge = 0.0;
  vec2 kerbST = vec2(0.0);
  float size = BRICK_SIZE;
  if (onKerb) {
    bool alongPath = dPath > 0.0 && plazaR > 0.0;
    kerbST = alongPath ? vec2(dPath, -p.z) : vec2(plazaR, atan(p.z - uPlaza.x, p.x) * uPlaza.y);
    edge = kerbField(kerbST.x, kerbST.y);
    size = 0.3;
  } else {
    edge = brickField(p.xz, id);
  }
  float detail = 1.0 - smoothstep(size * 0.08, size * 0.3, footprint);
  vec3 stone = onKerb ? vec3(0.15, 0.15, 0.17) : BRICK;
  // The joint, anti-aliased over the footprint; the brick darkens into it.
  float aa = footprint * 0.75 + 1e-4;
  float joint = (1.0 - smoothstep(JOINT - aa, JOINT + aa, edge)) * detail;
  vec3 albedo = mix(stone, onKerb ? vec3(0.05) : MORTAR, joint);
  float shadeWidth = onKerb ? 0.05 : SHADE;
  albedo *= mix(1.0, mix(0.6, 1.0, smoothstep(JOINT, JOINT + shadeWidth, edge)), detail);
  // The relief: the brick's height by finite differences (a procedural normal map).
  vec3 n = vec3(0.0, 1.0, 0.0);
  #ifndef LOW_DETAIL
  if (detail > 0.01) {
    float e = max(0.006, footprint * 0.5);
    vec2 other = vec2(0.0);
    float h0 = 0.0;
    float hx = 0.0;
    float hz = 0.0;
    if (onKerb) {
      h0 = smoothstep(0.0, 0.03, edge) * 0.015;
      hx = smoothstep(0.0, 0.03, kerbField(kerbST.x + e, kerbST.y)) * 0.015;
      hz = smoothstep(0.0, 0.03, kerbField(kerbST.x, kerbST.y + e)) * 0.015;
    } else {
      h0 = brickHeight(edge);
      hx = brickHeight(brickField(p.xz + vec2(e, 0.0), other));
      hz = brickHeight(brickField(p.xz + vec2(0.0, e), other));
    }
    n = normalize(mix(n, normalize(vec3(-(hx - h0) / e, 1.0, -(hz - h0) / e)), detail));
  }
  #endif
  // Gold: a line inside each kerb, a ring inside the plaza's edge, lozenges down the middle.
  float px = footprint + 1e-4;
  float gold = 0.0;
  if (onPath) {
    float line = 1.0 - smoothstep(0.025, 0.025 + px, abs(dPath + uPath.z));
    vec2 lozenge = vec2(abs(p.x), abs(fract(-p.z / 4.0) - 0.5) * 4.0);
    float diamond = 1.0 - smoothstep(0.0, px * 2.0, lozenge.x / 0.3 + lozenge.y / 0.5 - 1.0);
    gold = max(line, diamond * 0.9);
  } else if (onPlaza) {
    gold = 1.0 - smoothstep(0.03, 0.03 + px, abs(plazaR + uPath.z * 2.0));
  }
  albedo = mix(albedo, vec3(0.62, 0.48, 0.22), gold);
  if (gold > 0.5) n = vec3(0.0, 1.0, 0.0);
  return lightGround(albedo, n, p, mix(16.0, 40.0, gold), mix(0.08 * (1.0 - joint), 0.6, gold));
}
`;

export { PATH_GLSL };
