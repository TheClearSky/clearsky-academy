import * as THREE from 'three';
import { AIR_GLSL, airUniforms } from '../engine/air';
import { NOISE_GLSL } from '../engine/glsl';
import { seededRandom } from '../engine/random';
import { worldBufferSize } from '../engine/contract';
import type { AssetClass, AssetOption, StageContext } from '../engine/contract';

/**
 * Sky class: the deep-blue nebula night of the scene reference.
 *
 * The nebula is domain-warped fbm (iq's two-level warp) in CYLINDRICAL
 * (azimuth, elevation) coordinates, so the cloud masses stand upright like a
 * painted backdrop instead of smearing into streaks toward the horizon
 * (`.claude/research/stage/SCENE-PROPS-LOGO.md` › Sky). A second fbm a step
 * toward the light gives each billow a lit rim; a third carves big dark
 * voids; the zenith is darkened, as in the reference. Stars are round,
 * sized in pixels from `fwidth`, and twinkle; two layers.
 *
 * The horizon is the hellscape dome's "lip and swallow" (Nodestra
 * `hell-04-sky-dome-glsl.ts`): a haze lip above the horizon, and the bottom
 * ~4° swallowed into the shared air's horizon colour (`engine/air.ts`) —
 * the colour the far floor and props fog into, so they meet without a line.
 * The ground mist's horizon glow (`airMistGlow`) rises a few degrees above
 * it — the far mist sheet seen edge-on; `airHorizon` carries it too.
 *
 * Options:
 *  - `nebula` — the warp evaluated live every frame (about 25 noise
 *    evaluations per pixel): the clouds drift.
 *  - `baked` — the same nebula rendered ONCE into a 2048×512 texture over
 *    (azimuth, elevation); the dome then costs one texture fetch per pixel.
 *    The low tier's sky. Its stars are NOT the procedural grid: on a phone
 *    GPU the grid broke each star into square and L-shaped outlines along
 *    its cell's edges (Deepak's phone, 2026-10-17; desktop GPUs draw it
 *    clean). They are the same two layers as instanced round dots instead —
 *    the motes' technique, which that phone draws clean — with the grid's
 *    sizes, twinkle and cloud dimming.
 *
 * The dome is a unit sphere drawn without the camera's translation and at
 * the far plane, so it is always around the eye and behind everything.
 */

const OPTIONS: readonly AssetOption[] = [
  { id: 'nebula', label: 'Live nebula', description: 'Domain-warped fbm clouds that slowly drift, lit rims, dark voids, round twinkling stars.' },
  { id: 'baked', label: 'Baked nebula', description: 'The same nebula baked once into a texture (one fetch per pixel); stars stay live. For phones.' },
];

/** Elevation range the baked texture covers (radians): a little below the
 *  horizon to the zenith. */
const BAKE_ELEVATION_MIN = -0.25;
const BAKE_ELEVATION_MAX = Math.PI / 2;
/** The drift clock frozen into the baked texture. */
const BAKE_TIME = 12;

const SKY_UNIFORMS_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSkyDeep, uSkyBody, uSkyLit, uStar;
${AIR_GLSL}
`;

/** rgb = the nebula, a = cloud density (stars dim inside bright cloud). */
const NEBULA_GLSL = /* glsl */ `
vec4 nebula(vec2 azimuthElevation, float time) {
  vec2 p = azimuthElevation * vec2(1.5, 1.9);
  float t = time * 0.012;
  vec2 warpQ = vec2(fbm3(p + vec2(0.0, t)), fbm3(p + vec2(5.2, 1.3) - t));
  vec2 warpR = vec2(fbm3(p + 1.4 * warpQ + vec2(1.7, 9.2) + t * 0.7), fbm3(p + 1.4 * warpQ + vec2(8.3, 2.8)));
  vec2 warped = p * 1.3 + 1.1 * warpR;
  float density = fbm5(warped);
  float towardLight = fbm5(warped + vec2(-0.06, 0.09));
  float body = smoothstep(0.40, 0.68, density);
  float rim = clamp((density - towardLight) * 9.0 + 0.5, 0.0, 1.0);
  float voids = fbm3(p * 0.6 + 1.6 * warpQ + 11.0);
  vec3 colour = mix(uSkyDeep, mix(uSkyBody, uSkyLit, rim * smoothstep(0.5, 0.9, density)), body);
  colour *= mix(0.25, 1.0, smoothstep(0.30, 0.58, voids));
  colour *= 0.8 + 0.4 * smoothstep(0.0, 0.9, 1.0 - abs(azimuthElevation.x) * 0.5);
  colour *= mix(1.0, 0.45, smoothstep(0.15, 0.6, azimuthElevation.y));
  return vec4(colour, density);
}
`;

const STARS_GLSL = /* glsl */ `
float starLayer(vec2 p, float cells, float density, float sizePx, float seed) {
  vec2 grid = p * cells;
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;
  float h = hash12(cell + seed);
  if (h > density) return 0.0;
  vec2 offset = (vec2(hash12(cell + seed + 1.3), hash12(cell + seed + 7.1)) - 0.5) * 0.6;
  float d = length(local - offset);
  float pixel = fwidth(grid.x);
  float magnitude = pow(hash12(cell + seed + 3.7), 4.0);
  float halfSize = (0.5 + sizePx * magnitude) * pixel;
  float disc = 1.0 - smoothstep(halfSize, halfSize + pixel, d);
  float twinkle = 0.6 + 0.4 * sin(uTime * (0.7 + 2.5 * h / density) + h * 90.0);
  return disc * twinkle * (0.25 + 1.6 * magnitude);
}
vec3 finishSky(vec3 colour, float density, vec2 azimuthElevation) {
#ifndef NO_GRID_STARS
  vec2 p = azimuthElevation * vec2(1.5, 1.9);
  float stars = starLayer(p, 40.0, 0.045, 1.6, 0.0) + starLayer(p, 110.0, 0.03, 0.4, 17.0) * 0.5;
  stars *= 1.0 - 0.6 * smoothstep(0.6, 0.9, density);
  colour += uStar * stars;
#endif
  float elevation = azimuthElevation.y;
  // The hellscape's "torn" dome: lip 0.2, swallow 0.5.
  colour = mix(colour, uAirHaze, exp(-max(elevation, 0.0) * 14.0) * 0.2);
  // The ground mist's horizon glow (engine/air.ts): the same glow the far floor ends in.
  colour += airMistGlow(elevation);
  vec3 low = airHorizon();
  colour = mix(colour, low, (1.0 - smoothstep(0.0, 0.07, elevation)) * 0.5);
  // Below the horizon only a sub-pixel sliver shows past the floor's far
  // edge: exactly the colour the far floor ends in, or it draws a dark line.
  if (elevation < 0.0) colour = low;
  return colour;
}
`;

const DOME_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  // The camera's rotation only: the dome is always around the eye.
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = clip.xyww;
}
`;

const DIRECTION_GLSL = /* glsl */ `
vec2 azimuthElevationOf(vec3 direction) {
  vec3 d = normalize(direction);
  return vec2(atan(d.x, -d.z), asin(clamp(d.y, -1.0, 1.0)));
}
`;

function liveFragment(): string {
  return `${SKY_UNIFORMS_GLSL}${NOISE_GLSL}${NEBULA_GLSL}${STARS_GLSL}${DIRECTION_GLSL}
varying vec3 vDirection;
void main() {
  vec2 azimuthElevation = azimuthElevationOf(vDirection);
  vec4 sky = nebula(azimuthElevation, uTime);
  gl_FragColor = vec4(finishSky(sky.rgb, sky.a, azimuthElevation), 1.0);
}`;
}

function bakedFragment(): string {
  return `${SKY_UNIFORMS_GLSL}${NOISE_GLSL}
#define NO_GRID_STARS
${STARS_GLSL}${DIRECTION_GLSL}
uniform sampler2D uBaked;
uniform vec2 uElevationRange;
varying vec3 vDirection;
void main() {
  vec2 azimuthElevation = azimuthElevationOf(vDirection);
  vec2 uv = vec2(azimuthElevation.x / 6.2831853 + 0.5, (azimuthElevation.y - uElevationRange.x) / (uElevationRange.y - uElevationRange.x));
  vec4 sky = texture2D(uBaked, clamp(uv, vec2(0.0, 0.0), vec2(1.0, 1.0)));
  gl_FragColor = vec4(finishSky(sky.rgb, sky.a, azimuthElevation), 1.0);
}`;
}

/** The baked sky's stars: the grid's two layers as instanced round dots (see the header). */
const STAR_DOT_VERTEX = /* glsl */ `
attribute vec4 aStar; // azimuth, elevation, disc radius (px), brightness
attribute vec2 aTwinkle; // rate, phase
uniform float uTime;
uniform vec2 uViewport;
uniform float uRadiusScale;
uniform sampler2D uBaked;
uniform vec2 uElevationRange;
varying vec2 vPx;
varying float vRadius;
varying float vLight;
void main() {
  float azimuth = aStar.x;
  float elevation = aStar.y;
  vec3 direction = vec3(sin(azimuth) * cos(elevation), sin(elevation), -cos(azimuth) * cos(elevation));
  // As the dome: the camera's rotation only, at the far plane.
  vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * direction, 1.0);
  float radius = max(0.5, aStar.z * uRadiusScale);
  float extent = radius + 1.5;
  clip.xy += position.xy * extent / (uViewport * 0.5) * clip.w;
  gl_Position = clip.xyww;
  vPx = position.xy * extent;
  vRadius = radius;
  // The grid's dimming inside bright cloud, then finishSky's haze lip and horizon swallow.
  float density = texture2D(uBaked, vec2(azimuth / 6.2831853 + 0.5, (elevation - uElevationRange.x) / (uElevationRange.y - uElevationRange.x))).a;
  float twinkle = 0.6 + 0.4 * sin(uTime * aTwinkle.x + aTwinkle.y);
  float horizon = (1.0 - exp(-max(elevation, 0.0) * 14.0) * 0.2) * (1.0 - (1.0 - smoothstep(0.0, 0.07, elevation)) * 0.5) * step(0.0, elevation);
  vLight = aStar.w * twinkle * (1.0 - 0.6 * smoothstep(0.6, 0.9, density)) * horizon;
}
`;

const STAR_DOT_FRAGMENT = /* glsl */ `
uniform vec3 uStar;
varying vec2 vPx;
varying float vRadius;
varying float vLight;
void main() {
  float disc = 1.0 - smoothstep(vRadius, vRadius + 1.0, length(vPx));
  if (disc <= 0.0) discard;
  // Premultiplied over with alpha 0: purely additive, as the grid's stars add to the sky.
  gl_FragColor = vec4(uStar * disc * vLight, 0.0);
}
`;

/** The sky the dots are scattered over (rad): the camera's reach (yaw ±0.6
 *  plus a landscape screen's half width), horizon to near the zenith. */
const STAR_AZIMUTH = 2.0;
const STAR_ELEVATION = 1.45;

/**
 * The grid's layers as lists of stars at the grid's densities (a cell is
 * 1/(1.5·cells) × 1/(1.9·cells) rad, lit with the layer's probability), each
 * with a magnitude m = u⁴, a disc of 0.5 + size·m px and a brightness of
 * 0.25 + 1.6·m, the fine layer at half.
 */
function starDots(): { stars: Float32Array; twinkles: Float32Array; count: number } {
  const random = seededRandom(23);
  const layers = [
    { cells: 40, density: 0.045, size: 1.6, gain: 1 },
    { cells: 110, density: 0.03, size: 0.4, gain: 0.5 },
  ];
  const stars: number[] = [];
  const twinkles: number[] = [];
  for (const layer of layers) {
    const perSquareRadian = layer.cells * 1.5 * layer.cells * 1.9 * layer.density;
    const count = Math.round(perSquareRadian * STAR_AZIMUTH * 2 * STAR_ELEVATION);
    for (let index = 0; index < count; index++) {
      const magnitude = Math.pow(random(), 4);
      const h = random();
      stars.push((random() * 2 - 1) * STAR_AZIMUTH, random() * STAR_ELEVATION, 0.5 + layer.size * magnitude, (0.25 + 1.6 * magnitude) * layer.gain);
      twinkles.push(0.7 + 2.5 * h, h * 90);
    }
  }
  return { stars: new Float32Array(stars), twinkles: new Float32Array(twinkles), count: stars.length / 4 };
}

/** The bake pass: a full-screen quad whose uv is (azimuth, elevation). */
function bakeFragment(): string {
  return `${SKY_UNIFORMS_GLSL}${NOISE_GLSL}${NEBULA_GLSL}
uniform vec2 uElevationRange;
varying vec2 vUv;
void main() {
  vec2 azimuthElevation = vec2((vUv.x - 0.5) * 6.2831853, mix(uElevationRange.x, uElevationRange.y, vUv.y));
  gl_FragColor = nebula(azimuthElevation, ${BAKE_TIME.toFixed(1)});
}`;
}

function create(context: StageContext): AssetClass {
  const { palette, renderer, uniforms } = context;
  const shared = {
    uTime: uniforms.uTime,
    uSkyDeep: { value: palette.skyDeep },
    uSkyBody: { value: palette.skyBody },
    uSkyLit: { value: palette.skyLit },
    ...airUniforms(palette),
    uStar: { value: palette.star },
  };
  const geometry = new THREE.SphereGeometry(1, 64, 32);
  const dome = new THREE.Mesh(geometry);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  context.scene.add(dome);

  let material: THREE.ShaderMaterial | null = null;
  let baked: THREE.WebGLRenderTarget | null = null;
  let current = '';

  // The baked sky's stars (hidden on the live sky, whose grid draws them).
  const dots = starDots();
  const dotQuad = new THREE.PlaneGeometry(2, 2);
  const dotGeometry = new THREE.InstancedBufferGeometry();
  dotGeometry.index = dotQuad.index;
  dotGeometry.setAttribute('position', dotQuad.getAttribute('position'));
  dotGeometry.setAttribute('aStar', new THREE.InstancedBufferAttribute(dots.stars, 4));
  dotGeometry.setAttribute('aTwinkle', new THREE.InstancedBufferAttribute(dots.twinkles, 2));
  dotGeometry.instanceCount = dots.count;
  const dotViewport = { value: new THREE.Vector2(1, 1) };
  const dotUniforms = {
    uTime: uniforms.uTime,
    uStar: shared.uStar,
    uViewport: dotViewport,
    uRadiusScale: { value: 1 },
    uBaked: { value: null as THREE.Texture | null },
    uElevationRange: { value: new THREE.Vector2(BAKE_ELEVATION_MIN, BAKE_ELEVATION_MAX) },
  };
  // In the OPAQUE list right after the dome (three draws the transparent
  // list after every opaque object), so the props cover them.
  const dotMaterial = new THREE.ShaderMaterial({
    uniforms: dotUniforms,
    vertexShader: STAR_DOT_VERTEX,
    fragmentShader: STAR_DOT_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const starMesh = new THREE.Mesh(dotGeometry, dotMaterial);
  starMesh.frustumCulled = false;
  starMesh.renderOrder = -9;
  starMesh.visible = false;
  context.scene.add(starMesh);
  const drawingBuffer = new THREE.Vector2();

  const bake = (target: THREE.WebGLRenderTarget) => {
    const bakeMaterial = new THREE.ShaderMaterial({
      uniforms: { ...shared, uElevationRange: { value: new THREE.Vector2(BAKE_ELEVATION_MIN, BAKE_ELEVATION_MAX) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: bakeFragment(),
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMaterial);
    const bakeScene = new THREE.Scene();
    bakeScene.add(quad);
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(bakeScene, new THREE.Camera());
    renderer.setRenderTarget(previousTarget);
    quad.geometry.dispose();
    bakeMaterial.dispose();
  };

  const setOption = (id: string) => {
    if (id === current) return;
    if (!OPTIONS.some((option) => option.id === id)) throw new Error(`[sky] unknown option "${id}"`);
    material?.dispose();
    baked?.dispose();
    baked = null;
    if (id === 'baked') {
      baked = new THREE.WebGLRenderTarget(2048, 512, { type: THREE.HalfFloatType, wrapS: THREE.RepeatWrapping });
      bake(baked);
      material = new THREE.ShaderMaterial({
        uniforms: { ...shared, uBaked: { value: baked.texture }, uElevationRange: { value: new THREE.Vector2(BAKE_ELEVATION_MIN, BAKE_ELEVATION_MAX) } },
        vertexShader: DOME_VERTEX,
        fragmentShader: bakedFragment(),
      });
      dotUniforms.uBaked.value = baked.texture;
    } else {
      material = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: DOME_VERTEX, fragmentShader: liveFragment() });
    }
    material.side = THREE.BackSide;
    material.depthWrite = false;
    material.depthTest = false;
    dome.material = material;
    starMesh.visible = id === 'baked';
    current = id;
  };

  setOption(context.tier.liveSky ? 'nebula' : 'baked');

  return {
    id: 'sky',
    label: 'Sky',
    options: OPTIONS,
    current: () => current,
    setOption,
    update() {
      if (!starMesh.visible) return;
      dotViewport.value.copy(worldBufferSize(context, drawingBuffer));
      // The grid sizes its stars in the world's pixels, drawn at 1.5 per CSS
      // px on desktop; a phone's world pixels are coarser (0.75 per CSS px),
      // so the dots are scaled to keep the desktop's size on screen.
      const worldRatio = dotViewport.value.x / Math.max(1, renderer.domElement.clientWidth);
      dotUniforms.uRadiusScale.value = Math.min(1, worldRatio / 1.5);
    },
    restore() {
      if (baked) bake(baked);
    },
    dispose() {
      context.scene.remove(dome, starMesh);
      geometry.dispose();
      dotQuad.dispose();
      dotGeometry.dispose();
      dotMaterial.dispose();
      material?.dispose();
      baked?.dispose();
    },
  };
}

export { create };
