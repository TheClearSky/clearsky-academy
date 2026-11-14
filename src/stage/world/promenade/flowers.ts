import * as THREE from 'three';
import { AIR_GLSL, airUniforms } from '../../engine/air';
import { seededRandom } from '../../engine/random';
import type { StagePalette } from '../../engine/palette';

/**
 * Wildflowers on the lawn round the footpath (Deepak, 2026-10-17: "Have
 * some flowers too, see the other scene, make sure to keep it light, make
 * sure to disable it if fps drops, or gpu is not as powerful").
 *
 * After Nodestra's meadow (`meadow/env/scene-grass.ts` › createFlowerPatches,
 * `cardgrass.ts`): flowers grow in ragged elliptical PATCHES of varied size
 * and density — dense hearts, thinning edges — each patch its own mix of
 * three kinds: moonlit white daisies with a gold eye, small lilac
 * star-flowers, and pink cups. Each flower is a camera-facing head on a thin
 * stem, nodding in the breeze; the head's shape is drawn in the shader (no
 * texture), lit by the moon, the sky and the magic lamp, and fogged by the
 * shared air.
 *
 * Light: ONE instanced draw; opaque with a cut-out (no sorting, depth-tested,
 * so it costs only the pixels the flowers cover). The caller sizes the count
 * by the quality tier (none on low), and hides them as soon as the runtime
 * quality ladder steps down (`promenade/index.ts` › setQualityLevel).
 */

const FLOWER_VERTEX = /* glsl */ `
attribute vec4 aRoot;   // x, z, stem height, seed
attribute vec2 aStyle;  // kind (0 daisy, 1 star, 2 cup), head radius
uniform float uTime;
varying vec2 vCorner;
varying float vHead;
varying float vSeed;
varying float vKind;
varying vec3 vWorld;
void main() {
  float seed = aRoot.w;
  float height = aRoot.z;
  // The breeze: the head nods, the stem leans with it.
  vec2 nod = vec2(sin(uTime * 1.3 + seed * 30.0), cos(uTime * 1.1 + seed * 17.0)) * 0.035 * height;
  vec3 root = vec3(aRoot.x, 0.0, aRoot.y);
  vec3 head = root + vec3(nod.x, height, nod.y);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world;
  if (position.z > 0.5) {
    // The head: a camera-facing card.
    world = head + (right * position.x + up * position.y) * aStyle.y;
    vCorner = position.xy;
    vHead = 1.0;
  } else {
    // The stem: a thin card from the root to the head, facing the camera.
    vec3 along = head - root;
    world = root + along * (position.y * 0.5 + 0.5) + right * position.x * 0.007;
    vCorner = position.xy;
    vHead = 0.0;
  }
  vSeed = seed;
  vKind = aStyle.x;
  vWorld = world;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FLOWER_FRAGMENT = /* glsl */ `
${AIR_GLSL}
uniform vec3 uKeyDirection, uKeyColour, uAmbientSky;
uniform vec4 uLamp;
uniform vec3 uLampColour;
varying vec2 vCorner;
varying float vHead;
varying float vSeed;
varying float vKind;
varying vec3 vWorld;
void main() {
  vec3 albedo;
  if (vHead < 0.5) {
    albedo = vec3(0.05, 0.12, 0.05);
  } else {
    float r = length(vCorner);
    float a = atan(vCorner.y, vCorner.x) + vSeed * 6.2831853;
    float petals = vKind < 0.5 ? 9.0 : vKind < 1.5 ? 5.0 : 6.0;
    float shape = vKind < 0.5 ? 0.62 + 0.38 * pow(abs(cos(a * petals * 0.5)), 0.5)
                : vKind < 1.5 ? 0.45 + 0.55 * pow(abs(cos(a * petals * 0.5)), 2.0)
                : 0.8 + 0.2 * abs(cos(a * petals * 0.5));
    if (r > shape * 0.95) discard;
    float eye = 1.0 - smoothstep(0.2, 0.26, r);
    vec3 petal = vKind < 0.5 ? vec3(0.88, 0.88, 0.84) : vKind < 1.5 ? vec3(0.62, 0.52, 0.86) : vec3(0.90, 0.56, 0.68);
    petal *= 0.85 + 0.3 * fract(vSeed * 37.0);
    // Paler toward the petal tips, a touch of shade at the heart.
    petal *= 0.8 + 0.25 * smoothstep(0.2, 0.9, r);
    albedo = mix(petal, vKind < 0.5 ? vec3(0.85, 0.62, 0.15) : petal * 0.6, eye);
  }
  // Night light: the sky, the moon from above, the magic lamp, and a faint glow of its own so it reads.
  vec3 colour = albedo * (uAmbientSky * 1.5 + uKeyColour * max(uKeyDirection.y, 0.0) * 0.8 + 0.06 * vHead);
  vec3 toLamp = uLamp.xyz - vWorld;
  colour += albedo * uLampColour * uLamp.w / (1.0 + dot(toLamp, toLamp) * 0.09);
  gl_FragColor = vec4(airFog(colour, vWorld), 1.0);
}
`;

type FlowerField = {
  mesh: THREE.Mesh;
  dispose(): void;
};

type Exclude = (x: number, z: number) => boolean;

/**
 * `count` flowers in patches over the lawn ahead (x ±22 m, z −6 … −48 m),
 * outside `exclude` (the path, the plaza, the bench, the lamp, the trunks).
 */
function createFlowers(count: number, palette: StagePalette, time: { value: number }, lamp: { value: THREE.Vector4 }, exclude: Exclude, seed = 211): FlowerField {
  const random = seededRandom(seed);
  type Patch = { x: number; z: number; ax: number; az: number; a: number; b: number; keep: number; phase: number; mix: [number, number, number] };
  const patches: Patch[] = [];
  let guard = 0;
  while (patches.length < 26 && guard++ < 2000) {
    // Biased near (the far ones are small on screen), bigger further away.
    const z = -6 - 42 * Math.pow(random(), 1.3);
    const x = (random() * 2 - 1) * 22;
    if (exclude(x, z)) continue;
    const size = (0.8 + 2.0 * random()) * (0.7 - z / 60);
    if (patches.some((patch) => Math.hypot(patch.x - x, patch.z - z) < (patch.a + size) * 0.9)) continue;
    const t = random() * Math.PI;
    const weights: [number, number, number] = [0.3 + random(), random() * 0.8, random() * 0.6];
    const sum = weights[0] + weights[1] + weights[2];
    patches.push({ x, z, ax: Math.cos(t), az: Math.sin(t), a: size, b: size * (0.45 + 0.4 * random()), keep: 0.55 + 0.45 * random(), phase: random() * 6.28, mix: [weights[0] / sum, weights[1] / sum, weights[2] / sum] });
  }
  const roots: number[] = [];
  const styles: number[] = [];
  guard = 0;
  while (roots.length / 4 < count && guard++ < count * 40 && patches.length > 0) {
    const patch = patches[Math.floor(random() * patches.length)];
    const u = (random() * 2 - 1) * 1.3;
    const v = (random() * 2 - 1) * 1.3;
    const angle = Math.atan2(v, u);
    const edge = 1 + 0.2 * Math.sin(angle * 4 + patch.phase) + 0.1 * Math.sin(angle * 9 + patch.phase * 2);
    const d = Math.hypot(u, v) / edge;
    // A dense heart, a thinning edge, each patch its own density.
    if (d > 1 || random() > patch.keep * (1 - 0.55 * d * d)) continue;
    const x = patch.x + u * patch.a * patch.ax - v * patch.b * patch.az;
    const z = patch.z + u * patch.a * patch.az + v * patch.b * patch.ax;
    if (exclude(x, z)) continue;
    const pick = random();
    const kind = pick < patch.mix[0] ? 0 : pick < patch.mix[0] + patch.mix[1] ? 1 : 2;
    // Far flowers grow a little so the drifts still read as colour.
    const grow = 1 - z / 40;
    const radius = (kind === 1 ? 0.045 : kind === 2 ? 0.06 : 0.055) * (0.8 + 0.45 * random()) * grow;
    roots.push(x, z, 0.14 + 0.2 * random(), random());
    styles.push(kind, radius);
  }
  const instances = roots.length / 4;
  // One head quad (z = 1) and one stem quad (z = 0) per instance.
  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1, -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  base.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('aRoot', new THREE.InstancedBufferAttribute(new Float32Array(roots), 4));
  geometry.setAttribute('aStyle', new THREE.InstancedBufferAttribute(new Float32Array(styles), 2));
  geometry.instanceCount = instances;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...airUniforms(palette),
      uTime: time,
      uKeyDirection: { value: new THREE.Vector3(-0.45, 0.8, 0.4).normalize() },
      uKeyColour: { value: palette.moonlight },
      uAmbientSky: { value: palette.ambientSky },
      uLamp: lamp,
      uLampColour: { value: new THREE.Color('#9fe6ff') },
    },
    vertexShader: FLOWER_VERTEX,
    fragmentShader: FLOWER_FRAGMENT,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      base.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

export { createFlowers };
export type { FlowerField };
