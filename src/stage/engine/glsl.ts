/**
 * GLSL shared by the stage's shaders. Value noise and fbm as in the stage
 * prototype (`.claude/research/stage/proto/stage.html`); the hash is Dave
 * Hoskins' `hash12`, the fbm rotation the usual (1.6, 1.2) one.
 */

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 FBM_ROTATION = mat2(1.6, 1.2, -1.2, 1.6);
float fbm5(vec2 p) {
  float sum = 0.0, amplitude = 0.5;
  for (int i = 0; i < 5; i++) { sum += amplitude * vnoise(p); p = FBM_ROTATION * p; amplitude *= 0.5; }
  return sum / 0.96875;
}
float fbm3(vec2 p) {
  float sum = 0.0, amplitude = 0.5;
  for (int i = 0; i < 3; i++) { sum += amplitude * vnoise(p); p = FBM_ROTATION * p; amplitude *= 0.5; }
  return sum / 0.875;
}
`;

/** Interleaved gradient noise (Jimenez 2014): a per-pixel dither that kills
 *  the 8-bit banding a dark-blue gradient sky shows. */
const DITHER_GLSL = /* glsl */ `
float interleavedGradientNoise(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}
`;

export { DITHER_GLSL, NOISE_GLSL };
