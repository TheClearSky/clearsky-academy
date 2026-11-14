import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE_GLSL } from '../../engine/glsl';
import { LIGHTING_GLSL, lightingUniforms, WORLD_VERTEX_GLSL } from '../../engine/lighting';
import { seededRandom } from '../../engine/random';
import type { StageContext } from '../../engine/contract';
import { orbitPoint } from './propLayout';
import type { Placement } from './propLayout';

/**
 * Floating candles: the warm gold against the blue night (research: "very
 * high impact, low cost"). Original, not any film's set dressing. Two draw
 * calls for all of them.
 *
 * BODIES (one instanced draw): a dense `LatheGeometry` of a cream pillar
 * whose top is a melted crater — a raised lip falling to a shallow pool —
 * merged with a short wick. Per instance (`aCandle`: height, seed, the side
 * the wax slumps toward) the vertex shader:
 *  - stretches the side to the candle's height (the crater keeps its size);
 *  - makes the rim uneven: noise around it, slumped low on one side, notched
 *    where each drip spilled over;
 *  - runs five wax drips down the side (seeded angles, lengths and widths):
 *    a rounded bead whose cross-section is a half-ellipse, tapering then
 *    swelling into a bulb at its end;
 *  - recomputes the side's normal by finite differences of that surface.
 * The fragment shader lights the wax, then adds a fake subsurface glow:
 * warm light soaking down from the flame, strongest in the thin lip and the
 * molten pool, flickering with the flame. The wick is charred, its tip an
 * ember.
 *
 * FLAMES (one instanced draw): a camera-facing quad per candle, upright in
 * world space (a flame rises whichever way the candle leans), drawing a
 * layered flame — a soft halo, a blue base, an orange body, a bright core
 * with a dark zone round the wick — swaying and flickering. Additive HDR,
 * CLAMPED at 2.5: an unclamped core once bloomed into an orange "sun".
 */

/** The pillar's radius and the crater's depth below the rim (metres, unscaled). */
const CANDLE_RADIUS = 0.045;
/** Profile rows with y below this are the side (stretched to the height);
 *  rows at or above it are the top, given as offsets from the rim (y = 1). */
const TOP_ROWS_FROM = 0.975;
/** The wick tip, above the rim. */
const WICK_TIP = 0.026;
const DRIPS = 5;
/** The side's top row: it meets the rim, wherever the rim has slumped to. */
const SIDE_TOP = 0.96;

function candleProfile(): THREE.Vector2[] {
  const radius = CANDLE_RADIUS;
  const points = [new THREE.Vector2(0, 0), new THREE.Vector2(radius * 0.92, 0), new THREE.Vector2(radius, 0.006)];
  const sideRows = 40;
  for (let row = 1; row <= sideRows; row++) points.push(new THREE.Vector2(radius, 0.006 + ((SIDE_TOP - 0.006) * row) / sideRows));
  // The top: offsets from the rim in metres (y = 1 + offset).
  points.push(
    new THREE.Vector2(radius, 1.0),
    new THREE.Vector2(radius * 0.985, 1.006),
    new THREE.Vector2(radius * 0.93, 1.009),
    new THREE.Vector2(radius * 0.84, 1.004),
    new THREE.Vector2(radius * 0.7, 0.99),
    new THREE.Vector2(radius * 0.45, 0.983),
    new THREE.Vector2(radius * 0.2, 0.981),
    new THREE.Vector2(0, 0.981),
  );
  return points;
}

function withPart(geometry: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(count).fill(part), 1));
  return geometry;
}

function candleGeometry(): THREE.BufferGeometry {
  const body = new THREE.LatheGeometry(candleProfile(), 40);
  // The wick: from inside the pool up to its tip, in the top's offset units.
  const wickLength = WICK_TIP + 0.022;
  const wick = new THREE.CylinderGeometry(0.0026, 0.0034, wickLength, 6, 4).translate(0, 1 + WICK_TIP - wickLength / 2, 0);
  const merged = mergeGeometries([withPart(body, 0), withPart(wick, 1)]);
  body.dispose();
  wick.dispose();
  if (!merged) throw new Error('[candles] could not merge the candle geometry');
  return merged;
}

const CANDLE_GLSL = /* glsl */ `
const float CANDLE_RADIUS = ${CANDLE_RADIUS.toFixed(4)};
const float TOP_ROWS_FROM = ${TOP_ROWS_FROM.toFixed(4)};
const float WICK_TIP = ${WICK_TIP.toFixed(4)};
const float SIDE_TOP = ${SIDE_TOP.toFixed(4)};
/** The flame's brightness wobble, shared by the flame and the wax glow. */
float candleFlicker(float time, float seed) {
  return 0.82 + 0.12 * vnoise(vec2(time * 7.0, seed * 50.0)) + 0.06 * vnoise(vec2(time * 17.0, seed * 31.0));
}
`;

const BODY_VERTEX = /* glsl */ `${WORLD_VERTEX_GLSL}${NOISE_GLSL}${CANDLE_GLSL}
attribute float aPart;
attribute vec4 aCandle;
varying vec3 vNormal;
varying vec3 vToEye;
varying float vBelowRim;
varying float vRadial;
varying float vDrip;
varying float vPart;
varying float vSeed;
varying float vWickHeight;
float height;
float seed;
/** How far the rim sits below its nominal height at this angle (metres). */
float rimDrop(float angle) {
  vec2 around = vec2(sin(angle), cos(angle));
  float slump = 0.016 * (0.5 + 0.5 * cos(angle - aCandle.z * 6.2831853));
  float ripple = 0.008 * vnoise(around * 2.6 + seed * 17.0) + 0.003 * vnoise(around * 7.0 + seed * 5.0);
  return slump + ripple;
}
/** The radial thickness of the drips at this angle, depth below the rim (metres). */
float dripBulge(float angle, float depth, out float dripAmount) {
  float bulge = 0.0;
  dripAmount = 0.0;
  for (int index = 0; index < ${DRIPS}; index++) {
    float key = seed * 91.7 + float(index) * 13.1;
    float dripAngle = hash12(vec2(key, 1.0)) * 6.2831853;
    float lengthPick = hash12(vec2(key, 2.0));
    float dripLength = mix(0.05, 0.62, lengthPick * lengthPick) * height;
    float dripWidth = mix(0.008, 0.015, hash12(vec2(key, 3.0)));
    float along = depth / dripLength;
    if (along < -0.02 || along > 1.0) continue;
    float separation = abs(mod(angle - dripAngle + 3.14159265, 6.2831853) - 3.14159265) * CANDLE_RADIUS;
    // Rounded end: a bulb that closes at along = 1.
    float bulb = smoothstep(0.62, 0.9, along);
    float pastBulb = max(along - 0.9, 0.0) / 0.1;
    float cap = sqrt(max(0.0, 1.0 - pastBulb * pastBulb));
    float width = (dripWidth * (1.0 - 0.4 * along) + 0.006 * bulb) * cap;
    float thickness = (0.0055 + 0.0045 * bulb) * cap;
    float across = separation / max(width, 0.0001);
    float profile = sqrt(max(0.0, 1.0 - across * across));
    bulge = max(bulge, thickness * profile);
    dripAmount = max(dripAmount, profile * cap);
  }
  return bulge;
}
/** A point on the displaced side at (angle, fraction of the way up to the
 *  rim) — the side follows the uneven rim, so it never folds over it. */
vec3 sidePoint(float angle, float upToRim, out float dripAmount) {
  float rim = height - rimDrop(angle);
  float y = upToRim * (rim - 0.002);
  float radius = CANDLE_RADIUS + dripBulge(angle, rim - y, dripAmount);
  return vec3(sin(angle) * radius, y, cos(angle) * radius);
}
void main() {
  height = aCandle.x;
  seed = aCandle.y;
  // Never atan(0, 0) (the lathe's axis vertices, the wick's caps): NaN on
  // some GPUs (Intel D3D11), and the bloom smears a NaN over the frame.
  vec2 around = position.xz;
  if (dot(around, around) < 1e-12) around = vec2(0.0, 1.0);
  float angle = atan(around.x, around.y);
  float radial = length(position.xz);
  vec3 local;
  vec3 localNormal = normal;
  float drip = 0.0;
  if (aPart > 0.5) {
    // The wick, bent a little near its tip.
    float above = position.y - 1.0;
    float bend = max(above, 0.0) / WICK_TIP;
    local = vec3(position.x + 0.012 * bend * bend * (hash12(vec2(seed, 9.0)) - 0.5), height + above, position.z);
  } else if (position.y >= TOP_ROWS_FROM) {
    // The crater and lip: offsets below the (uneven) rim.
    float lip = smoothstep(0.55, 0.95, radial / CANDLE_RADIUS);
    local = vec3(position.x, height + (position.y - 1.0) - rimDrop(angle) * mix(0.6, 1.0, lip), position.z);
  } else if (radial > CANDLE_RADIUS * 0.99) {
    float upToRim = position.y / SIDE_TOP;
    float epsilonAngle = 0.03;
    float epsilonUp = 0.006;
    float ignored;
    local = sidePoint(angle, upToRim, drip);
    vec3 alongAngle = sidePoint(angle + epsilonAngle, upToRim, ignored) - sidePoint(angle - epsilonAngle, upToRim, ignored);
    vec3 alongHeight = sidePoint(angle, upToRim + epsilonUp, ignored) - sidePoint(angle, upToRim - epsilonUp, ignored);
    vec3 sideNormal = cross(alongAngle, alongHeight);
    localNormal = dot(sideNormal, sideNormal) > 1e-14 ? sideNormal * inversesqrt(max(dot(sideNormal, sideNormal), 1e-14)) : normal;
  } else {
    local = vec3(position.x, position.y * height, position.z);
  }
  mat4 world = worldMatrix();
  vec4 worldPosition = world * vec4(local, 1.0);
  vNormal = normalize(mat3(world) * localNormal);
  vToEye = cameraPosition - worldPosition.xyz;
  vBelowRim = height - local.y;
  vRadial = radial / CANDLE_RADIUS;
  vDrip = drip;
  vPart = aPart;
  vSeed = seed;
  vWickHeight = (local.y - height) / WICK_TIP;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const BODY_FRAGMENT = /* glsl */ `${NOISE_GLSL}${LIGHTING_GLSL}${CANDLE_GLSL}
uniform vec3 uFlame;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vToEye;
varying float vBelowRim;
varying float vRadial;
varying float vDrip;
varying float vPart;
varying float vSeed;
varying float vWickHeight;
/** A varying read back inside [low, high], or the fallback when it is not
 *  (NaN fails both tests). The lathe's axis triangles are degenerate, and
 *  under MSAA a varying is extrapolated wildly there: a drip value of −10⁶
 *  made the specular exponent negative → Inf → NaN in the fog, which the
 *  bloom smeared over the whole frame. */
float saneVarying(float value, float low, float high, float fallback) {
  return (value >= low && value <= high) ? value : fallback;
}
void main() {
  float drip = saneVarying(vDrip, 0.0, 1.0, 0.0);
  float belowRim = saneVarying(vBelowRim, -1.0, 4.0, 1.0);
  float radial = saneVarying(vRadial, 0.0, 2.0, 1.0);
  float wickHeight = saneVarying(vWickHeight, -4.0, 4.0, 0.0);
  float flicker = candleFlicker(uTime, vSeed);
  if (vPart > 0.5) {
    // A charred wick with a glowing ember tip.
    vec3 charred = shadeSurface(vec3(0.03, 0.025, 0.02), vNormal, vToEye, 10.0, 0.1);
    float ember = smoothstep(0.55, 1.0, wickHeight);
    gl_FragColor = vec4(fogFromEye(charred + vec3(1.6, 0.45, 0.08) * ember * flicker, vToEye), 1.0);
    return;
  }
  vec3 wax = vec3(0.86, 0.81, 0.69) * (0.95 + 0.08 * vnoise(vec2(belowRim * 120.0, vSeed * 40.0)));
  // Drips are fresher, a touch more yellow and glossier.
  wax = mix(wax, vec3(0.9, 0.84, 0.68), drip * 0.5);
  vec3 colour = shadeSurface(wax, vNormal, vToEye, mix(14.0, 40.0, drip), mix(0.1, 0.3, drip));
  // Wax is translucent: light scattered through it softens the shading, so
  // a drip's underside never goes dirty-dark.
  colour += wax * (uAmbientSky * 0.45 + uKeyColour * 0.1);
  // Subsurface: light soaks down the wax from the flame; the thin lip and
  // the molten pool glow most.
  float soak = exp(-max(belowRim, 0.0) / 0.05);
  // (Only at the top: the base's cap is just as close to the axis.)
  float inCrater = (1.0 - smoothstep(0.75, 0.92, radial)) * step(-0.002, belowRim) * (1.0 - step(0.04, belowRim));
  float pool = inCrater * (0.9 + 0.3 * vnoise(vec2(radial * 6.0, uTime * 0.7 + vSeed * 9.0)));
  vec3 glow = uFlame * (soak * 0.7 + pool * 1.1);
  colour += glow * flicker;
  // Bright, never a sun (as the flame clamps itself).
  gl_FragColor = vec4(fogFromEye(min(colour, vec3(2.5)), vToEye), 1.0);
}
`;

/** The flame quad, in metres around the wick tip (scaled with the candle). */
const FLAME_HALF_WIDTH = 0.26;
const FLAME_BELOW = 0.24;
const FLAME_ABOVE = 0.36;

const FLAME_VERTEX = /* glsl */ `${WORLD_VERTEX_GLSL}${NOISE_GLSL}${CANDLE_GLSL}
attribute vec4 aCandle;
varying vec2 vFlame;
varying float vSeed;
void main() {
  mat4 world = worldMatrix();
  vec3 tip = (world * vec4(0.0, aCandle.x + WICK_TIP, 0.0, 1.0)).xyz;
  float size = length(world[0].xyz);
  // Upright in world space, turned about the vertical to face the camera.
  vec3 toCamera = cameraPosition - tip;
  vec3 right = normalize(vec3(toCamera.z, 0.0, -toCamera.x) + vec3(0.0001, 0.0, 0.0));
  vec2 offset = vec2(position.x * 2.0 * ${FLAME_HALF_WIDTH.toFixed(3)}, mix(-${FLAME_BELOW.toFixed(3)}, ${FLAME_ABOVE.toFixed(3)}, position.y + 0.5));
  vFlame = offset;
  vSeed = aCandle.y;
  vec3 worldPosition = tip + (right * offset.x + vec3(0.0, offset.y, 0.0)) * size;
  gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
}
`;

const FLAME_FRAGMENT = /* glsl */ `${NOISE_GLSL}${CANDLE_GLSL}
uniform float uTime;
uniform vec3 uFlame;
varying vec2 vFlame;
varying float vSeed;
/** 1 inside a teardrop of the given width and height whose base sits at
 *  baseY (all in flame units), soft over softness. */
float teardrop(vec2 point, float width, float baseY, float tipY, float softness) {
  float centreY = baseY + width;
  float halfWidth;
  if (point.y < centreY) halfWidth = sqrt(max(0.0, width * width - (point.y - centreY) * (point.y - centreY)));
  else halfWidth = width * sqrt(max(0.0, 1.0 - (point.y - centreY) / (tipY - centreY)));
  float inside = halfWidth - abs(point.x);
  // Fades out where the outline narrows to nothing (no seam above the tip).
  return smoothstep(-softness, softness, inside) * smoothstep(0.0, softness, halfWidth) * step(baseY - softness, point.y);
}
void main() {
  float flicker = candleFlicker(uTime, vSeed);
  // Flame units: 1 = 0.11 m; the wick tip is the origin.
  vec2 point = vFlame / 0.11;
  float stretch = 0.85 + 0.3 * vnoise(vec2(uTime * 6.0, vSeed * 13.0));
  float sway = (vnoise(vec2(uTime * 2.2, vSeed * 7.0)) - 0.5) * 0.5 + 0.08 * sin(uTime * 9.0 + vSeed * 20.0);
  float rise = max(point.y, 0.0);
  vec2 bent = vec2(point.x - sway * rise * rise * 0.25, point.y / stretch);
  float body = teardrop(bent, 0.15, -0.06, 1.0, 0.05);
  float core = teardrop(bent - vec2(0.0, 0.07), 0.08, -0.04, 0.62, 0.04);
  float blueBase = teardrop(bent, 0.16, -0.07, 0.42, 0.04) * (1.0 - smoothstep(0.02, 0.24, bent.y)) * (1.0 - core);
  // The dark zone round the wick, inside the core.
  float darkZone = 1.0 - smoothstep(0.0, 0.07, length(vec2(bent.x * 1.6, bent.y - 0.05)));
  vec3 orange = uFlame * mix(1.2, 1.8, smoothstep(0.2, 0.7, bent.y));
  vec3 colour = orange * body * (1.0 - core) * 1.4;
  colour += vec3(1.0, 0.92, 0.75) * core * 2.4 * (1.0 - 0.55 * darkZone);
  colour += vec3(0.12, 0.25, 0.9) * blueBase * 1.5;
  // The halo: a tight warm glow and a wide faint one, round the flame's heart.
  float fromHeart = length(vec2(point.x, point.y - 0.35));
  colour += uFlame * (exp(-fromHeart / 0.35) * 0.32 + exp(-fromHeart / 1.1) * 0.08) * smoothstep(2.3, 1.2, fromHeart);
  // Clamped: a flame is bright, never a sun. Measured: an unclamped core
  // (×5) fed the bloom a wide orange halo that swallowed a book cluster.
  gl_FragColor = vec4(min(colour * flicker, vec3(2.5)), 0.0);
}
`;

type Candles = {
  group: THREE.Group;
  place(placements: Placement[]): void;
  update(t: number): void;
  dispose(): void;
};

const scratch = new THREE.Object3D();

function createCandles(context: StageContext, capacity: number): Candles {
  const group = new THREE.Group();
  const uniforms = { ...lightingUniforms(context.palette), uFlame: { value: context.palette.candleFlame }, uTime: context.uniforms.uTime };
  const count = Math.max(1, capacity);
  const candleData = new Float32Array(count * 4);
  const candleAttribute = new THREE.InstancedBufferAttribute(candleData, 4);

  const bodyGeometry = candleGeometry();
  bodyGeometry.setAttribute('aCandle', candleAttribute);
  const bodyMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: BODY_VERTEX, fragmentShader: BODY_FRAGMENT });
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, count);
  bodies.frustumCulled = false;
  group.add(bodies);

  const flameGeometry = new THREE.PlaneGeometry(1, 1);
  flameGeometry.setAttribute('aCandle', candleAttribute);
  const flameMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FLAME_VERTEX,
    fragmentShader: FLAME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const flames = new THREE.InstancedMesh(flameGeometry, flameMaterial, count);
  flames.frustumCulled = false;
  group.add(flames);

  let placements: Placement[] = [];
  return {
    group,
    place(next) {
      placements = next.slice(0, capacity);
      bodies.count = placements.length;
      flames.count = placements.length;
      placements.forEach((placement, index) => {
        const random = seededRandom(Math.floor(placement.seed * 4294967296));
        // Height (m), seed, the side the wax slumps toward, spare.
        candleData.set([0.34 + random() * 0.46, random(), random(), 0], index * 4);
      });
      candleAttribute.needsUpdate = true;
    },
    update(t) {
      placements.forEach((placement, index) => {
        const phase = placement.seed * 6.2831853;
        const base = placement.orbit ? orbitPoint(placement.orbit, t, placement.y) : { x: placement.x, z: placement.z, rise: 0 };
        scratch.position.set(base.x, placement.y + base.rise + Math.sin(t * 0.45 + phase) * 0.12, base.z);
        scratch.rotation.set(0, placement.yaw, placement.roll + Math.sin(t * 0.33 + phase) * 0.03);
        scratch.scale.setScalar(placement.scale);
        scratch.updateMatrix();
        bodies.setMatrixAt(index, scratch.matrix);
        flames.setMatrixAt(index, scratch.matrix);
      });
      bodies.instanceMatrix.needsUpdate = true;
      flames.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      bodyGeometry.dispose();
      flameGeometry.dispose();
      bodyMaterial.dispose();
      flameMaterial.dispose();
      bodies.dispose();
      flames.dispose();
    },
  };
}

export { createCandles };
// The candle's parts, for the spell's summoned candle (`world/spellProps.ts`),
// which builds its own single candle from them with its own uniforms.
export { BODY_FRAGMENT as CANDLE_BODY_FRAGMENT, BODY_VERTEX as CANDLE_BODY_VERTEX, FLAME_FRAGMENT as CANDLE_FLAME_FRAGMENT, FLAME_VERTEX as CANDLE_FLAME_VERTEX, WICK_TIP as CANDLE_WICK_TIP, candleGeometry };
export type { Candles };
