import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING_GLSL, lightingUniforms, WORLD_VERTEX_GLSL } from '../../engine/lighting';
import { NOISE_GLSL } from '../../engine/glsl';
import type { StagePalette } from '../../engine/palette';

/**
 * The landscape's shared parts: its air, its night shading, and the
 * geometry helpers the Academy, the landforms and the trees are built from.
 *
 * THE AIR. The stage's distance haze (`engine/air.ts`, exp² 0.011 /m) is
 * tuned for a floor whose horizon is 30–200 m out: 450 m away it hides
 * everything. The landscape keeps the stage's ground MIST (so the Academy's
 * foot and the hills' bases sink into the same sheet the checker does) but
 * takes its own thinner haze — what Nodestra's citadel does ("its own
 * thinner fog … so it keeps its presence"). Each material carries its own
 * `uLandHaze`: the far Academy ~0.0011 /m (24 % at 480 m), a near hero tree
 * more, so the depth still reads.
 *
 * THE LIGHT. The stage's one rig (`engine/lighting.ts`: the moon key from
 * up-left-front, the sky / ground ambient, a haze rim) plus, for far forms,
 * a stronger cool rim from the sky behind them — the silhouette edge that
 * separates a dark mass from a dark sky — and a soft banding of the key
 * (two steps and a feather) for a painted, not plastic, read.
 */

const LANDSCAPE_GLSL = /* glsl */ `${LIGHTING_GLSL}
${NOISE_GLSL}
uniform float uLandHaze;
uniform float uTime;
/** The low valley mist far forms stand in: a height fog ~40 m deep that only
 *  gathers with distance (none on a near tree), so a far hill's foot and the
 *  Academy's base dissolve into the horizon's glow instead of standing on it. */
float landValleyMist(vec3 world, float dist) {
  float low = exp(-max(world.y, 0.0) / 24.0);
  return low * smoothstep(120.0, 420.0, dist) * 0.6;
}
/** The stage's mist, then the landscape's own exp² haze into the sky behind. */
vec3 landFog(vec3 colour, vec3 world) {
  vec3 toPoint = world - cameraPosition;
  float dist = max(length(toPoint), 1e-4);
  vec3 direction = toPoint / dist;
  float tau = airMistDepth(world);
  vec3 misted = mix(airMistColour(direction, tau), colour, exp(-tau));
  float e = dist * uLandHaze;
  float amount = 1.0 - exp(-e * e);
  // Into a colour half way from the sky behind to the deeper fog: far forms
  // dissolve, but stay a solid mass darker than the sky (Deepak: "arent they
  // too transparent?" — hazing all the way to the sky made them read glassy).
  vec3 sky = airSky(normalize(vec3(direction.x, max(direction.y, 0.015), direction.z)));
  vec3 hazed = mix(misted, mix(sky, uFogColour, 0.5), amount);
  return mix(hazed, mix(airHorizon(), uMistColour, 0.35), landValleyMist(world, dist));
}
/** How much of a LIGHT the landscape's air lets through (windows glow through the haze). */
float landLight(vec3 world) {
  float dist = length(world - cameraPosition);
  float e = dist * uLandHaze;
  return exp(-0.6 * e * e) * exp(-0.35 * airMistDepth(world)) * (1.0 - 0.7 * landValleyMist(world, dist));
}
/** Night shading for far forms: the moon key in soft bands, sky ambient, a cool rim. */
vec3 shadeLand(vec3 albedo, vec3 normal, vec3 toEye, float rimGain) {
  vec3 n = normalize(normal);
  vec3 v = normalize(toEye);
  vec3 l = normalize(uKeyDirection);
  float diffuse = max(dot(n, l), 0.0);
  float banded = mix(smoothstep(0.05, 0.25, diffuse) * 0.45 + smoothstep(0.45, 0.7, diffuse) * 0.55, diffuse, 0.35);
  vec3 ambient = mix(uAmbientGround, uAmbientSky, n.y * 0.5 + 0.5);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5);
  return albedo * (ambient * 1.1 + uKeyColour * banded * 0.9) + uRimColour * rim * rimGain;
}
`;

/** World-space varyings for a land material (instanced or not). */
const LAND_VERTEX = /* glsl */ `${WORLD_VERTEX_GLSL}
attribute vec3 color;
#ifdef SWAY
uniform float uTime;
uniform float uSway, uSwayHeight;
#endif
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTint;
#if defined(PAINTED_WALL) || defined(PAINTED_ROOF)
varying vec3 vLocal;
varying vec3 vLocalNormal;
#endif
void main() {
  #if defined(PAINTED_WALL) || defined(PAINTED_ROOF)
    vLocal = position;
    vLocalNormal = normal;
  #endif
  mat4 world = worldMatrix();
  vec4 position4 = world * vec4(position, 1.0);
  #ifdef SWAY
    // Wind: the tree bends more toward its top (local height / uSwayHeight), slowly, out of phase across the wood.
    float bend = uSway * pow(clamp(position.y / uSwayHeight, 0.0, 1.0), 1.5);
    position4.x += sin(uTime * 0.7 + position4.x * 0.021 + position4.z * 0.013) * bend;
    position4.z += cos(uTime * 0.53 + position4.x * 0.017) * bend * 0.4;
  #endif
  vWorld = position4.xyz;
  vNormal = normalize(mat3(world) * normal);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #else
    vTint = vec3(1.0);
  #endif
  #ifdef VERTEX_TINT
    vTint *= color;
  #endif
  gl_Position = projectionMatrix * viewMatrix * position4;
}
`;

const LAND_FRAGMENT = /* glsl */ `${LANDSCAPE_GLSL}
uniform vec3 uAlbedo;
uniform float uRim;
uniform float uGrain;
uniform float uGlow;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTint;
#if defined(PAINTED_WALL) || defined(PAINTED_ROOF)
uniform vec3 uAlbedoB;
uniform vec3 uJoint;
uniform vec2 uBlock;
uniform float uIndicate;
/** A warm floodlight from below (courtyard lanterns), strongest at the foot, fading up (colour, height m). */
uniform vec4 uUplight;
varying vec3 vLocal;
varying vec3 vLocalNormal;
/** A surface's own 2-D coordinates (m): along the face and up; a level face uses its plan. */
vec2 faceCoords(vec3 p, vec3 n) {
  if (abs(n.y) > 0.75) return p.xz;
  vec3 t = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-4, 0.0, 0.0));
  return vec2(dot(p, t), p.y);
}
/** How much of the pattern a pixel can show: 1 near, 0 once a block is ~3 px (no shimmer). */
float patternDetail(vec2 cells) {
  vec2 w = fwidth(cells);
  return 1.0 - smoothstep(0.3, 0.65, max(w.x, w.y));
}
#endif
#ifdef PAINTED_WALL
/**
 * A painted wall, as an anime background paints stone: one flat colour
 * rising softly from the foot's (uAlbedo) to the top's (uAlbedoB), a little
 * darker in the shade of the foot, and only an INDICATION of masonry — a few
 * big low-contrast blocks where a slow noise allows (corners, the foot), never
 * a full brick pattern. uIndicate sets how much shows.
 */
vec3 paintedWall(vec3 p, vec3 n) {
  vec2 q = faceCoords(p, n);
  vec3 colour = mix(uAlbedo, uAlbedoB, smoothstep(0.0, 140.0, p.y));
  // Soft weathering: long faint streaks under the cornices, a darker foot.
  colour *= 0.92 + 0.08 * fbm3(vec2(q.x * 0.05, q.y * 0.008));
  colour *= mix(0.82, 1.0, smoothstep(0.0, 22.0, p.y));
  // The indication: a few blocks, in patches.
  float rowF = q.y / uBlock.y;
  float row = floor(rowF);
  float u = q.x / uBlock.x + mod(row, 2.0) * 0.5;
  vec2 f = vec2(fract(u), fract(rowF));
  vec2 w = fwidth(vec2(u, rowF)) + 1e-4;
  float edge = 1.0 - smoothstep(0.03, 0.03 + w.x * 1.5, min(f.x, 1.0 - f.x)) * smoothstep(0.05, 0.05 + w.y * 1.5, min(f.y, 1.0 - f.y));
  float where = smoothstep(0.55, 0.75, fbm3(q * 0.035 + 3.1)) * max(smoothstep(30.0, 0.0, p.y), 0.6);
  float detail = patternDetail(vec2(u, rowF));
  float tone = (hash12(vec2(floor(u), row)) - 0.5) * 0.08;
  colour *= 1.0 + tone * where * detail;
  colour = mix(colour, uJoint, edge * where * detail * uIndicate);
  return colour;
}
#endif
#ifdef PAINTED_ROOF
/**
 * A painted roof: its colour (uAlbedo) deepening up the slope toward the
 * ridge (uAlbedoB), a pale band of moonlight along the eave, and the tile
 * courses only hinted — faint lines that vanish with distance.
 */
vec3 paintedRoof(vec3 p, vec3 n) {
  vec2 q = faceCoords(p, n);
  vec3 colour = mix(uAlbedo, uAlbedoB, smoothstep(0.0, 1.0, fract(p.y / 60.0) * 0.0 + smoothstep(40.0, 220.0, p.y)));
  colour *= 0.9 + 0.1 * fbm3(vec2(q.x * 0.08, q.y * 0.03));
  float rowF = q.y / uBlock.y;
  float detail = patternDetail(vec2(rowF, rowF));
  float course = 1.0 - smoothstep(0.0, 0.08 + fwidth(rowF) * 1.5, fract(rowF));
  colour = mix(colour, uJoint, course * detail * uIndicate * 0.6);
  return colour;
}
#endif
void main() {
  vec3 toEye = cameraPosition - vWorld;
  // A large-scale mottle so no surface reads as one flat paint.
  float mottle = mix(1.0, 0.75 + 0.5 * fbm3(vWorld.xz * 0.02 + vWorld.y * 0.015), uGrain);
  #if defined(PAINTED_WALL)
    vec3 albedo = paintedWall(vLocal, normalize(vLocalNormal)) * vTint;
  #elif defined(PAINTED_ROOF)
    vec3 albedo = paintedRoof(vLocal, normalize(vLocalNormal)) * vTint;
  #else
    vec3 albedo = uAlbedo * vTint * mottle;
  #endif
  vec3 colour = shadeLand(albedo, vNormal, toEye, uRim) + albedo * uGlow;
  #if defined(PAINTED_WALL) || defined(PAINTED_ROOF)
    // Facing the camera side most (the lanterns are in the courts in front).
    float facing = 0.35 + 0.65 * max(dot(normalize(vLocalNormal), vec3(0.0, 0.25, 0.97)), 0.0);
    colour += albedo * uUplight.rgb * exp(-max(vLocal.y, 0.0) / uUplight.a) * facing;
  #endif
  gl_FragColor = vec4(landFog(colour, vWorld), 1.0);
}
`;

type LandMaterialOptions = {
  albedo: string;
  /** Own haze density (exp², 1/m). */
  haze: number;
  rim?: number;
  /** 0..1: the large-scale mottle. */
  grain?: number;
  /** The geometry carries a per-vertex `color` tint. */
  vertexTint?: boolean;
  side?: THREE.Side;
  /** Wind: the top moves this far (m) at local height `height` (instanced: unit trees, height 1). */
  sway?: { amount: number; height: number };
  /** A faint glow of its own (blossom in moonlight), added before the fog. */
  glow?: number;
  /**
   * A painted surface in the geometry's own metres, as anime backgrounds
   * paint stone: `wall` (a soft gradient from `albedo` at the foot to
   * `second` up high, a few masonry blocks only indicated) or `roof` (deepening
   * toward the ridge, tile courses faintly hinted). `joint` is the indication
   * line colour, `block` the block length and course height (m), `indicate`
   * how much masonry shows (0..1).
   */
  pattern?: { kind: 'wall' | 'roof'; second: string; joint: string; block: [number, number]; indicate?: number };
  /** With a pattern: a warm floodlight from the foot — linear rgb and how high it reaches (m). */
  uplight?: [number, number, number, number];
};

function landUniforms(palette: StagePalette, time: { value: number }, haze: number): Record<string, THREE.IUniform> {
  return { ...lightingUniforms(palette), uTime: time, uLandHaze: { value: haze } };
}

function createLandMaterial(palette: StagePalette, time: { value: number }, options: LandMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...landUniforms(palette, time, options.haze),
      uAlbedo: { value: new THREE.Color(options.albedo) },
      uRim: { value: options.rim ?? 0.5 },
      uGrain: { value: options.grain ?? 0.6 },
      uGlow: { value: options.glow ?? 0 },
      uSway: { value: options.sway?.amount ?? 0 },
      uSwayHeight: { value: options.sway?.height ?? 1 },
      uAlbedoB: { value: new THREE.Color(options.pattern?.second ?? options.albedo) },
      uJoint: { value: new THREE.Color(options.pattern?.joint ?? '#000000') },
      uBlock: { value: new THREE.Vector2(...(options.pattern?.block ?? [1, 1])) },
      uIndicate: { value: options.pattern?.indicate ?? 0.5 },
      uUplight: { value: new THREE.Vector4(...(options.uplight ?? [0, 0, 0, 1])) },
    },
    defines: {
      ...(options.vertexTint ? { VERTEX_TINT: '' } : {}),
      ...(options.sway ? { SWAY: '' } : {}),
      ...(options.pattern?.kind === 'wall' ? { PAINTED_WALL: '' } : {}),
      ...(options.pattern?.kind === 'roof' ? { PAINTED_ROOF: '' } : {}),
    },
    side: options.side ?? THREE.FrontSide,
    vertexShader: LAND_VERTEX,
    fragmentShader: LAND_FRAGMENT,
  });
}

// ── geometry helpers (after Nodestra's citadel: simple parts, merged) ──────

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

/** Non-indexed, no uv, so every part merges with every other. */
function plain(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.deleteAttribute('uv');
  return flat;
}

/** A prism (flat facets) from radius r0 at y0 to r1 at y1; `turn` rotates its corners. */
function prism(r0: number, r1: number, y0: number, y1: number, sides: number, turn = 0): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(r1, r0, y1 - y0, sides, 1, false, turn);
  geometry.translate(0, (y0 + y1) / 2, 0);
  const flat = plain(geometry);
  flat.computeVertexNormals();
  return flat;
}

function cone(r: number, y0: number, h: number, sides: number, turn = 0): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(r, h, sides, 1, false, turn);
  geometry.translate(0, y0 + h / 2, 0);
  const flat = plain(geometry);
  flat.computeVertexNormals();
  return flat;
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return plain(new THREE.BoxGeometry(w, h, d));
}

/** A gable roof: a triangular prism `length` long (along x), `width` deep, `height` tall, its eaves at y0. */
function gable(length: number, width: number, height: number, y0: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geometry.translate(0, y0, -length / 2);
  geometry.rotateY(Math.PI / 2);
  const flat = plain(geometry);
  flat.computeVertexNormals();
  return flat;
}

/** A matrix: at (x, y, z), turned θ about the vertical, scaled, leaning `lean` rad about z. */
function at(x: number, y: number, z: number, theta = 0, scale = 1, lean = 0): THREE.Matrix4 {
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, theta, lean, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), rotation, new THREE.Vector3(scale, scale, scale));
}

/** Parts collected per tone, merged into one geometry per tone. */
class Parts<Tone extends string> {
  lists = new Map<Tone, THREE.BufferGeometry[]>();
  add(tone: Tone, geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
    const part = plain(geometry);
    if (matrix) part.applyMatrix4(matrix);
    const list = this.lists.get(tone) ?? [];
    list.push(part);
    this.lists.set(tone, list);
  }
}

/** Deterministic value noise in 3D (for displacing blobs and terrain on the CPU). */
function noise3(x: number, y: number, z: number): number {
  const hash = (i: number, j: number, k: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), u);
  const x10 = lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u);
  const x01 = lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u);
  const x11 = lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}

function fbm3(x: number, y: number, z: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let o = 0; o < octaves; o++) {
    value += amplitude * noise3(x * frequency, y * frequency, z * frequency);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

/** A lumpy blob: an icosphere pushed in and out by noise (a leaf mass, a rock). */
function blob(radius: number, detail: number, seed: number, roughness = 0.35, squash = 1): THREE.BufferGeometry {
  // Welded first, so the displaced surface shades smooth (an icosphere is non-indexed: its normals would be flat facets).
  const raw = new THREE.IcosahedronGeometry(radius, detail);
  raw.deleteAttribute('normal');
  raw.deleteAttribute('uv');
  const geometry = mergeVertices(raw);
  raw.dispose();
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const n = p.clone().normalize();
    const k = 1 + (fbm3(n.x * 1.7 + seed, n.y * 1.7 + seed * 0.37, n.z * 1.7 - seed, 3) - 0.5) * 2 * roughness;
    p.copy(n).multiplyScalar(radius * k);
    p.y *= squash;
    position.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  return plain(geometry);
}

export { at, blob, box, cone, createLandMaterial, fbm3, gable, LANDSCAPE_GLSL, landUniforms, Parts, plain, prism, TAU, UP };
export type { LandMaterialOptions };
