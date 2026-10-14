import * as THREE from 'three';
import { createAirNoiseTexture } from './airNoise';
import type { StagePalette } from './palette';

/**
 * The air: ONE atmosphere for every world shader — the floor, the props, the
 * chess pieces, the spell, the motes. Two layers, evaluated per fragment in
 * `airFog` (no geometry, no slices, so nothing can show as a layered plane):
 *
 * 1. THE GROUND MIST (2026-10-12; replaces the hellscape "veils" — seven
 *    horizontal disc slices the owner saw as layered planes, only far off to
 *    the right and too small). A continuous exponential HEIGHT fog,
 *    density(y) = a · e^(−y / H), a ≈ 1 m thick sheet lying on the floor; the
 *    eye (2.4 m) looks DOWN into it. Its optical depth along the view ray is
 *    integrated analytically — iq, "Better fog" (iquilezles.org/articles/fog)
 *    and the hellscape's `hfTau` (Nodestra `hell-10-particles-and-mist-glsl.ts`)
 *    — written as the MEAN of e^(−y/H) between the segment's end heights,
 *        τ = a · length · (e^(−y0/H) − e^(−y1/H)) / ((y1 − y0) / H),
 *    whose flat-ray limit (y1 → y0) is a · length · e^(−y/H): no division by
 *    ~0 and no overflow (both exponentials are ≤ 1; heights clamp to the floor).
 *    Inside the mist slab (0 … `top`) the ray is cut into a few segments
 *    (tier: 4 / 3 / 2); each takes the analytic depth with its OWN density
 *    and thickness, read from a drifting world-space noise at the segment's
 *    midpoint (the hellscape mist's `march`, but every segment exact) — so
 *    the sheet breaks into rolling banks with clearer gaps and wind-stretched
 *    wisps that drift across the whole floor, near and far, left and right,
 *    and thicken toward the horizon because grazing rays cross more of it.
 *    The samples move continuously with the pixel: no slices, no banding.
 *    The noise is ONE shared tileable texture (`engine/airNoise.ts`).
 *    The mist is lavender-white moonlit air, brighter where thick, with a
 *    forward-scatter lobe toward the horizon glow.
 *
 * 2. THE DISTANCE HAZE (ported from Nodestra's hellscape, research
 *    `.claude/research/stage-v2/HELLSCAPE-PORT.md` › 1), applied OVER the
 *    mist:
 *  - exp² falloff (`1 - exp(-(ρd)²)`): near things stay crisp, only the
 *    distance is swallowed (the hellscape's FogExp2 maths);
 *  - it ends in the SKY BEHIND the object (the hellscape's `duneFog`), so
 *    far forms — and the far mist — dissolve into the exact colour behind
 *    them; the sky dome's foot is swallowed into the same `airSky` colour,
 *    so floor, mist, props and sky meet without a line.
 *
 * `airSky` is the hellscape's `hfSky`: horizon → zenith by `pow(h, 0.45)`
 * plus a haze lip.
 *
 * The uniforms are SHARED: `airUniforms(palette)` hands every material the
 * same uniform objects for one palette (one stage), so the fog class
 * (`world/veils.ts`) drives every shader with one setter.
 *
 * NaN rules (a NaN anywhere becomes a black page through the bloom): no
 * `pow` of a negative, no `normalize` of a possibly-zero vector, every
 * division guarded.
 */

/** The most noise samples per ray (the HIGH tier). A GLSL loop bound. */
const AIR_MIST_MAX_SAMPLES = 4;

/** The mean of the noise's density factor: the mist outside the noisy slab
 *  (and the `smooth` option, which reads no noise) uses this constant. */
const AIR_MIST_MEAN_DENSITY = 0.75;

const AIR_GLSL = /* glsl */ `
uniform vec3 uFogColour, uAirZenith, uAirHorizon, uAirHaze, uMistColour;
uniform float uFogDensity, uAirTime, uMistDensity, uMistHeight, uMistTop, uMistGlow;
uniform int uMistSamples;
// The spell's clearing: x, z of its centre, the clear radius, the feather (m).
uniform vec4 uMistClear;
uniform sampler2D uAirNoise;
/** The mist's glow on the horizon: the far sheet seen edge-on, lit by the
 *  moon. Part of the air's sky, so the far floor (which hazes into airSky)
 *  and the dome's foot (airHorizon) carry the same glow and still meet
 *  without a line; the dome adds it above the horizon too (world/sky.ts). */
vec3 airMistGlow(float elevation) {
  return uMistColour * (uMistGlow * exp(-max(elevation, 0.0) * 22.0));
}
vec3 airSky(vec3 direction) {
  float h = max(direction.y, 0.0);
  vec3 colour = mix(uAirHorizon, uAirZenith, smoothstep(0.0, 1.0, pow(h, 0.45)));
  return mix(colour, uAirHaze, exp(-h * 12.0) * 0.75) + airMistGlow(h);
}
/** The air's colour at the horizon: what the dome's foot and the farthest floor melt into. */
vec3 airHorizon() {
  return airSky(vec3(0.0, 0.015, -1.0));
}
/** The mean of exp(-y / height) between heights y0 and y1 (clamped to the floor).
 *  Both exponentials are at most 1 and the flat limit is taken explicitly. */
float airMistProfile(float y0, float y1, float height) {
  float low = max(y0, 0.0) / height;
  float high = max(y1, 0.0) / height;
  float span = high - low;
  return abs(span) < 1e-3 ? exp(-0.5 * (low + high)) : (exp(-low) - exp(-high)) / span;
}
/** The mist at p: x = density factor (banks about 2, gaps about 0.2), y = thickness
 *  factor (banks stand taller). World-space, drifting downwind. */
vec2 airMistNoise(vec3 p) {
  vec2 wind = vec2(1.0, 0.3);
  vec4 coarse = texture2D(uAirNoise, (p.xz - wind * uAirTime * 0.6) / 24.0 + 0.21);
  float bank = smoothstep(0.3, 0.7, coarse.b);
  // Domain warp (G) + a height skew, so neighbouring heights share one
  // leaning pattern: a volume, not stacked prints.
  vec2 q = p.xz - wind * uAirTime * 1.15 + (coarse.g - 0.5) * vec2(9.0, -6.0) + p.y * vec2(2.3, 1.1);
  float wisp = smoothstep(0.22, 0.82, texture2D(uAirNoise, q / vec2(24.0, 8.0) + 0.37).r);
  return vec2(mix(0.2, 2.0, bank) * (0.3 + 0.9 * wisp), 0.6 + 0.9 * bank);
}
/** How much mist stands at p: 0 inside the spell's clearing, rising softly
 *  over the feather to 1 (the spell opens and closes it, \`world/spell.ts\`). */
float airMistClearing(vec3 p) {
  return smoothstep(uMistClear.z, uMistClear.z + max(uMistClear.w, 0.01), length(p.xz - uMistClear.xy));
}
/** The mist's optical depth from the eye to worldPosition. */
float airMistDepth(vec3 worldPosition) {
  if (uMistDensity <= 0.0) return 0.0;
  vec3 toPoint = worldPosition - cameraPosition;
  float rayLength = max(length(toPoint), 1e-4);
  vec3 direction = toPoint / rayLength;
  float eyeY = cameraPosition.y;
  float height = max(uMistHeight, 0.05);
  // The slab 0 to uMistTop along the ray (a flat ray: never divided by 0).
  float rise = direction.y >= 0.0 ? max(direction.y, 1e-5) : min(direction.y, -1e-5);
  float tTop = (uMistTop - eyeY) / rise;
  float tFloor = -eyeY / rise;
  float tIn = clamp(min(tTop, tFloor), 0.0, rayLength);
  float tOut = clamp(max(tTop, tFloor), 0.0, rayLength);
  float yIn = eyeY + direction.y * tIn;
  float yOut = eyeY + direction.y * tOut;
  // Outside the slab: the analytic sheet at the mean density.
  float tau = ${AIR_MIST_MEAN_DENSITY.toFixed(2)} * (tIn * airMistProfile(eyeY, yIn, height)
            + (rayLength - tOut) * airMistProfile(yOut, eyeY + direction.y * rayLength, height));
  float span = tOut - tIn;
  if (uMistSamples <= 0) {
    tau += ${AIR_MIST_MEAN_DENSITY.toFixed(2)} * span * airMistProfile(yIn, yOut, height) * airMistClearing(worldPosition);
  } else {
    float piece = span / float(uMistSamples);
    for (int index = 0; index < ${AIR_MIST_MAX_SAMPLES}; index++) {
      if (index >= uMistSamples) break;
      float start = tIn + piece * float(index);
      vec3 middle = cameraPosition + direction * (start + 0.5 * piece);
      vec2 mist = airMistNoise(middle);
      tau += mist.x * airMistClearing(middle) * piece * airMistProfile(eyeY + direction.y * start, eyeY + direction.y * (start + piece), height * mist.y);
    }
  }
  return tau * uMistDensity;
}
/** The mist's colour seen along direction: moonlit lavender-white, brighter
 *  where thick, plus a forward-scatter lobe toward the horizon glow. */
vec3 airMistColour(vec3 direction, float tau) {
  float thick = 1.0 - exp(-tau);
  float forward = max(dot(direction, vec3(0.0, 0.03996804, -0.99920096)), 0.0);
  forward *= forward;
  forward *= forward;
  forward *= forward;
  return uMistColour * (0.7 + 0.45 * thick) + uAirHaze * 0.3 * forward;
}
/** The exp2 distance haze alone (0 to 1). */
float airHazeAmount(vec3 worldPosition) {
  float e = length(worldPosition - cameraPosition) * uFogDensity;
  return 1.0 - exp(-e * e);
}
/** How much of a thing at worldPosition the air hides (mist and haze, 0 to 1). */
float airFogAmount(vec3 worldPosition) {
  return 1.0 - (1.0 - airHazeAmount(worldPosition)) * exp(-airMistDepth(worldPosition));
}
/** How much of a LIGHT at worldPosition reaches the eye: the haze hides it
 *  as it hides anything, but a glow seen through mist scatters forward and
 *  shines through (only about a third of the mist's depth dims it), so the
 *  spell's circle glows in the mist instead of being swallowed by it. */
float airLightTransmission(vec3 worldPosition) {
  return (1.0 - airHazeAmount(worldPosition)) * exp(-0.35 * airMistDepth(worldPosition));
}
vec3 airFog(vec3 colour, vec3 worldPosition) {
  vec3 toPoint = worldPosition - cameraPosition;
  vec3 direction = toPoint / max(length(toPoint), 1e-4);
  float tau = airMistDepth(worldPosition);
  vec3 misted = mix(airMistColour(direction, tau), colour, exp(-tau));
  float amount = airHazeAmount(worldPosition);
  vec3 sky = airSky(normalize(vec3(direction.x, max(direction.y, 0.015), direction.z)));
  return mix(misted, mix(uFogColour, sky, mix(0.6, 1.0, amount * amount)), amount);
}
`;

/** exp² density (1/m). The hellscape's view runs kilometres deep; ours ends
 *  at a floor horizon 30–200 m out, so the density is raised until the far
 *  checker melts into the haze as in the scene reference: ~11 % at 30 m,
 *  ~30 % at 50 m, ~70 % at 100 m. */
const FOG_DENSITY = 0.011;

/** The ground mist's settings (all tunable live through the shared uniforms). */
type MistSettings = {
  /** Extinction at the floor, 1/m (0 = no mist). */
  density: number;
  /** Scale height H of e^(−y/H), metres: the sheet's thickness. */
  height: number;
  /** Top of the slab where the noise is sampled, metres (below the 2.4 m eye). */
  top: number;
  /** The horizon glow's strength (× the mist colour). */
  glow: number;
};

const MIST: MistSettings = { density: 0.28, height: 0.7, top: 2.0, glow: 0.8 };

/** The shared uniform objects for one palette (one stage). */
type AirUniforms = {
  uFogColour: { value: THREE.Color };
  uAirZenith: { value: THREE.Color };
  uAirHorizon: { value: THREE.Color };
  uAirHaze: { value: THREE.Color };
  uMistColour: { value: THREE.Color };
  uFogDensity: { value: number };
  uAirTime: { value: number };
  uMistDensity: { value: number };
  uMistHeight: { value: number };
  uMistTop: { value: number };
  uMistGlow: { value: number };
  /** Noise samples per ray: 0 = the smooth analytic sheet, 1 … 4 = banks. */
  uMistSamples: { value: number };
  uAirNoise: { value: THREE.DataTexture };
  /** The spell's clearing (x, z, radius, feather; a negative radius: none). */
  uMistClear: { value: THREE.Vector4 };
};

const sharedAir = new WeakMap<StagePalette, AirUniforms>();

/** The ONE set of air uniforms for this palette, made on first use. The
 *  mist starts off; the fog class (`world/veils.ts`) turns it on. */
function airState(palette: StagePalette): AirUniforms {
  let air = sharedAir.get(palette);
  if (!air) {
    air = {
      uFogColour: { value: palette.fog },
      uAirZenith: { value: palette.airZenith },
      uAirHorizon: { value: palette.airHorizon },
      uAirHaze: { value: palette.airHaze },
      uMistColour: { value: palette.mist },
      uFogDensity: { value: FOG_DENSITY },
      uAirTime: { value: 0 },
      uMistDensity: { value: 0 },
      uMistHeight: { value: MIST.height },
      uMistTop: { value: MIST.top },
      uMistGlow: { value: 0 },
      uMistSamples: { value: 0 },
      uAirNoise: { value: createAirNoiseTexture() },
      uMistClear: { value: new THREE.Vector4(0, 0, -10, 1) },
    };
    sharedAir.set(palette, air);
  }
  return air;
}

/** The air uniforms to spread into a material's uniforms. Every call for the
 *  same palette returns the SAME uniform objects (a fresh outer record, so a
 *  caller adding keys cannot touch the shared one). */
function airUniforms(palette: StagePalette): Record<string, THREE.IUniform> {
  return { ...airState(palette) };
}

/** Free the shared noise texture (the stage is being torn down). */
function disposeAir(palette: StagePalette): void {
  const air = sharedAir.get(palette);
  if (!air) return;
  air.uAirNoise.value.dispose();
  sharedAir.delete(palette);
}

// ── the mist's maths mirrored in TypeScript (tests; same formulas as the GLSL) ──

/** The mean of e^(−y/height) between heights y0 and y1, clamped to the floor
 *  (`airMistProfile`). */
function mistProfileMean(y0: number, y1: number, height: number): number {
  const low = Math.max(y0, 0) / height;
  const high = Math.max(y1, 0) / height;
  const span = high - low;
  return Math.abs(span) < 1e-3 ? Math.exp(-0.5 * (low + high)) : (Math.exp(-low) - Math.exp(-high)) / span;
}

/** The smooth sheet's optical depth (`airMistDepth` with no noise samples:
 *  every segment at the mean density) from eye to point. */
function mistOpticalDepth(eye: readonly [number, number, number], point: readonly [number, number, number], settings: MistSettings): number {
  if (settings.density <= 0) return 0;
  const toPoint = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
  const rayLength = Math.max(Math.hypot(toPoint[0], toPoint[1], toPoint[2]), 1e-4);
  const directionY = toPoint[1] / rayLength;
  const eyeY = eye[1];
  const height = Math.max(settings.height, 0.05);
  const rise = directionY >= 0 ? Math.max(directionY, 1e-5) : Math.min(directionY, -1e-5);
  const tTop = (settings.top - eyeY) / rise;
  const tFloor = -eyeY / rise;
  const clamp = (value: number) => Math.min(Math.max(value, 0), rayLength);
  const tIn = clamp(Math.min(tTop, tFloor));
  const tOut = clamp(Math.max(tTop, tFloor));
  const yIn = eyeY + directionY * tIn;
  const yOut = eyeY + directionY * tOut;
  const outside =
    tIn * mistProfileMean(eyeY, yIn, height) + (rayLength - tOut) * mistProfileMean(yOut, eyeY + directionY * rayLength, height);
  const inside = (tOut - tIn) * mistProfileMean(yIn, yOut, height);
  return AIR_MIST_MEAN_DENSITY * (outside + inside) * settings.density;
}

export {
  AIR_GLSL,
  AIR_MIST_MAX_SAMPLES,
  AIR_MIST_MEAN_DENSITY,
  airState,
  airUniforms,
  disposeAir,
  FOG_DENSITY,
  MIST,
  mistOpticalDepth,
  mistProfileMean,
};
export type { AirUniforms, MistSettings };
