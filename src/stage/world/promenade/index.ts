import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING_GLSL, lightingUniforms } from '../../engine/lighting';
import { seededRandom } from '../../engine/random';
import { worldBufferSize } from '../../engine/contract';
import type { AssetClass, AssetOption, StageContext } from '../../engine/contract';
import { createPaintedTree } from '../landscape/painted';
import type { PaintedKind } from '../landscape/painted';
import { createFlowers } from './flowers';
import { benchFor, KERB, lampFor, lampLight, PATH_HALF_WIDTH, plazaFor } from './layout';

/**
 * Promenade class — EXPERIMENT (2026-10-17, Deepak: "remove the chess floor
 * and pieces and instead have a bench, a beautiful medieval royal footpath,
 * some more trees besides the footpath and a magic street light
 * stylized"). The path itself is the floor's (`floor.ts` › `meadow`); this
 * class stands things beside it:
 *
 *  - a BENCH on the left, facing the path: stone ends, an oak seat and back;
 *  - a MAGIC STREET LAMP on the right: a turned iron post with gold rings, an
 *    open lantern cage, and inside it a slowly turning crystal glowing pale
 *    cyan, a soft halo round it and gold sparkles rising round the lantern —
 *    its light pools on the path and the lawn (the floor's `uLamp`) and
 *    reaches the bench;
 *  - an AVENUE of painted trees (the scene's own kind: oak or blossom) in
 *    pairs along both sides, from beyond the plaza into the mist — far
 *    enough that their crowns stay under the hero text;
 *  - WILDFLOWERS in patches on the lawn (`flowers.ts`): none on the LOW tier,
 *    fewer on medium, and hidden as soon as the runtime quality ladder steps
 *    down for frame rate (`setQualityLevel`).
 *
 * Options: `none`, `oak`, `blossom` (the avenue's trees).
 */

const OPTIONS: readonly AssetOption[] = [
  { id: 'none', label: 'None', description: 'No promenade.' },
  { id: 'oak', label: 'Oak avenue', description: 'Bench, magic street lamp and an avenue of painted oaks along the royal path.' },
  { id: 'blossom', label: 'Blossom avenue', description: 'Bench, magic street lamp and an avenue of painted blossom trees along the royal path.' },
];

const LAMP_COLOUR = new THREE.Color('#9fe6ff');

const PROP_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const PROP_FRAGMENT = /* glsl */ `${LIGHTING_GLSL}
uniform vec3 uAlbedo;
uniform float uGloss, uSpecular, uEmissive;
uniform vec4 uLamp;
uniform vec3 uLampColour;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 toEye = cameraPosition - vWorld;
  vec3 n = normalize(vNormal);
  vec3 colour = shadeSurface(uAlbedo, n, toEye, uGloss, uSpecular);
  // The magic lamp's light.
  vec3 toLamp = uLamp.xyz - vWorld;
  float d2 = dot(toLamp, toLamp);
  colour += uAlbedo * uLampColour * uLamp.w * max(dot(n, toLamp * inversesqrt(d2 + 1e-4)), 0.0) / (1.0 + d2 * 0.09);
  colour += uAlbedo * uEmissive;
  gl_FragColor = vec4(fogFromEye(colour, toEye), 1.0);
}
`;

function propMaterial(context: StageContext, lamp: { value: THREE.Vector4 }, albedo: string, gloss: number, specular: number, emissive = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...lightingUniforms(context.palette),
      uAlbedo: { value: new THREE.Color(albedo) },
      uGloss: { value: gloss },
      uSpecular: { value: specular },
      uEmissive: { value: emissive },
      uLamp: lamp,
      uLampColour: { value: LAMP_COLOUR },
    },
    vertexShader: PROP_VERTEX,
    fragmentShader: PROP_FRAGMENT,
  });
}

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  if (rx) geometry.rotateX(rx);
  geometry.translate(x, y, z);
  return geometry;
}

/** A bench 1.9 m long, its seat 0.46 m up, facing +z: stone ends, oak seat, back and arms. */
function benchGeometry(): { stone: THREE.BufferGeometry; wood: THREE.BufferGeometry } {
  const stone: THREE.BufferGeometry[] = [];
  const wood: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    stone.push(boxAt(0.2, 0.42, 0.56, side * 0.86, 0.21, 0));
    stone.push(boxAt(0.26, 0.06, 0.62, side * 0.86, 0.45, 0));
    // A scrolled foot: a short drum along the end's front.
    const drum = new THREE.CylinderGeometry(0.09, 0.09, 0.26, 12).rotateZ(Math.PI / 2);
    drum.translate(side * 0.86, 0.09, 0.28);
    stone.push(drum);
    wood.push(boxAt(0.06, 0.24, 0.06, side * 0.86, 0.6, 0.2));
    wood.push(boxAt(0.1, 0.05, 0.56, side * 0.86, 0.72, 0.02));
    wood.push(boxAt(0.08, 0.6, 0.08, side * 0.76, 0.75, -0.25, -0.12));
  }
  for (const z of [-0.17, -0.01, 0.15]) wood.push(boxAt(1.9, 0.05, 0.14, 0, 0.48, z));
  for (const y of [0.66, 0.82, 0.98]) wood.push(boxAt(1.7, 0.11, 0.04, 0, y, -0.28 + (y - 0.66) * -0.12, -0.12));
  const merge = (parts: THREE.BufferGeometry[]) => {
    const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
    for (const part of flat) part.deleteAttribute('uv');
    const merged = mergeGeometries(flat);
    for (const part of [...parts, ...flat]) part.dispose();
    return merged;
  };
  return { stone: merge(stone), wood: merge(wood) };
}

/** The lamp's ironwork and gold, its foot at the origin. */
function lampGeometry(height: number): { iron: THREE.BufferGeometry; gold: THREE.BufferGeometry; lanternY: number } {
  const iron: THREE.BufferGeometry[] = [];
  const gold: THREE.BufferGeometry[] = [];
  const s = height / 4.4;
  // The post: a turned profile — plinth, swelling foot, long shaft, a collar under the lantern.
  const profile = [
    [0, 0],
    [0.3, 0],
    [0.3, 0.12],
    [0.24, 0.16],
    [0.24, 0.34],
    [0.15, 0.4],
    [0.12, 0.62],
    [0.085, 0.95],
    [0.06, 2.9],
    [0.085, 3.0],
    [0.065, 3.12],
    [0.13, 3.24],
    [0, 3.25],
  ].map(([r, y]) => new THREE.Vector2(r * s, y * s));
  iron.push(new THREE.LatheGeometry(profile, 20));
  for (const y of [0.4, 2.95]) gold.push(new THREE.TorusGeometry(0.11 * s, 0.018 * s, 6, 20).rotateX(Math.PI / 2).translate(0, y * s, 0));
  // Four scrolled brackets under the lantern.
  for (let k = 0; k < 4; k++) {
    const arc = new THREE.TorusGeometry(0.16 * s, 0.014 * s, 5, 12, Math.PI * 0.75);
    arc.rotateZ(-Math.PI * 0.1).translate(0.16 * s, 3.1 * s, 0).rotateY((k * Math.PI) / 2 + Math.PI / 4);
    iron.push(arc);
  }
  // The lantern: a floor, four corner bars, a pyramid roof, a gold finial.
  const lanternY = 3.62 * s;
  iron.push(new THREE.CylinderGeometry(0.25 * s, 0.2 * s, 0.06 * s, 4, 1, false, Math.PI / 4).translate(0, 3.3 * s, 0));
  for (const [x, z] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    iron.push(boxAt(0.03 * s, 0.68 * s, 0.03 * s, x * 0.165 * s, lanternY, z * 0.165 * s));
  }
  iron.push(new THREE.CylinderGeometry(0.27 * s, 0.27 * s, 0.05 * s, 4, 1, false, Math.PI / 4).translate(0, 3.97 * s, 0));
  iron.push(new THREE.ConeGeometry(0.3 * s, 0.38 * s, 4, 1, false, Math.PI / 4).translate(0, 4.18 * s, 0));
  gold.push(new THREE.SphereGeometry(0.05 * s, 10, 8).translate(0, 4.4 * s, 0));
  gold.push(new THREE.ConeGeometry(0.025 * s, 0.14 * s, 6).translate(0, 4.5 * s, 0));
  const merge = (parts: THREE.BufferGeometry[]) => {
    const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
    for (const part of flat) part.deleteAttribute('uv');
    const merged = mergeGeometries(flat);
    for (const part of [...parts, ...flat]) part.dispose();
    return merged;
  };
  return { iron: merge(iron), gold: merge(gold), lanternY };
}

const HALO_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uTime;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float pulse = 0.9 + 0.1 * sin(uTime * 1.7) + 0.05 * sin(uTime * 4.3);
  float glow = exp(-d * d * 7.0) * 0.9 + exp(-d * 3.2) * 0.25;
  // Additive: the light is in rgb, alpha 1.
  gl_FragColor = vec4(uColour * glow * pulse * (1.0 - smoothstep(0.85, 1.0, d)), 1.0);
}
`;

const SPARKLE_VERTEX = /* glsl */ `
attribute vec4 aSpark; // orbit radius, phase, rise speed, seed
uniform float uTime;
uniform vec3 uCentre;
uniform vec2 uViewport;
varying float vFade;
varying vec2 vCorner;
void main() {
  float t = uTime * (0.25 + aSpark.z) + aSpark.y * 10.0;
  float rise = fract(t * 0.18);
  float angle = aSpark.y * 6.2831853 + uTime * (0.4 + aSpark.z);
  vec3 p = uCentre + vec3(cos(angle) * aSpark.x, -0.35 + rise * 1.6, sin(angle) * aSpark.x);
  vec4 view = viewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * view;
  float px = mix(1.2, 2.6, fract(aSpark.w * 7.0)) * uViewport.y / 900.0;
  clip.xy += position.xy * px / (uViewport * 0.5) * clip.w;
  gl_Position = clip;
  vCorner = position.xy;
  vFade = sin(rise * 3.14159) * (0.6 + 0.4 * sin(uTime * 6.0 + aSpark.w * 40.0));
}
`;

const SPARKLE_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
varying float vFade;
varying vec2 vCorner;
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  gl_FragColor = vec4(uColour * (1.0 - d) * (1.0 - d) * vFade * 2.2, 1.0);
}
`;

const CRYSTAL_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uTime;
varying vec3 vNormal;
void main() {
  float facet = 0.75 + 0.25 * abs(dot(normalize(vNormal), normalize(vec3(0.4, 0.8, 0.3))));
  float pulse = 0.85 + 0.15 * sin(uTime * 1.7);
  gl_FragColor = vec4(uColour * 3.2 * facet * pulse, 1.0);
}
`;

type Built = { group: THREE.Group; place(aspect: number): void; update(viewport: THREE.Vector2): void; setQualityLevel(level: number): void; dispose(): void };

function build(context: StageContext, kind: PaintedKind): Built {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const time = context.uniforms.uTime;
  const lampUniform = { value: new THREE.Vector4(...lampLight(16 / 9), 2.4) };

  // ── the bench ──
  const bench = new THREE.Group();
  const benchParts = benchGeometry();
  const stoneMat = propMaterial(context, lampUniform, '#7a756c', 12, 0.05);
  const woodMat = propMaterial(context, lampUniform, '#5c3f29', 20, 0.12);
  bench.add(new THREE.Mesh(benchParts.stone, stoneMat), new THREE.Mesh(benchParts.wood, woodMat));
  disposables.push(benchParts.stone, benchParts.wood, stoneMat, woodMat);
  group.add(bench);

  // ── the magic lamp ──
  const lamp = new THREE.Group();
  const lampParts = lampGeometry(4.4);
  const ironMat = propMaterial(context, lampUniform, '#1b1a22', 60, 0.5);
  const goldMat = propMaterial(context, lampUniform, '#b08a3e', 80, 0.9, 0.08);
  lamp.add(new THREE.Mesh(lampParts.iron, ironMat), new THREE.Mesh(lampParts.gold, goldMat));
  disposables.push(lampParts.iron, lampParts.gold, ironMat, goldMat);
  const crystalGeometry = new THREE.OctahedronGeometry(0.13, 0).scale(1, 1.5, 1);
  const crystalMat = new THREE.ShaderMaterial({
    uniforms: { uColour: { value: LAMP_COLOUR }, uTime: time },
    vertexShader: 'varying vec3 vNormal; void main() { vNormal = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: CRYSTAL_FRAGMENT,
  });
  const crystal = new THREE.Mesh(crystalGeometry, crystalMat);
  crystal.position.y = lampParts.lanternY;
  lamp.add(crystal);
  disposables.push(crystalGeometry, crystalMat);
  // The halo: a camera-facing glow round the crystal (additive, after the world's opaque draw).
  const haloGeometry = new THREE.PlaneGeometry(2.2, 2.2);
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uColour: { value: LAMP_COLOUR.clone().multiplyScalar(0.55) }, uTime: time },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); gl_Position = projectionMatrix * (centre + vec4(position.xy, 0.0, 0.0)); }',
    fragmentShader: HALO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(haloGeometry, haloMat);
  halo.position.y = lampParts.lanternY;
  halo.frustumCulled = false;
  lamp.add(halo);
  disposables.push(haloGeometry, haloMat);
  // Gold sparkles rising round the lantern.
  const sparkQuad = new THREE.PlaneGeometry(2, 2);
  const sparkGeometry = new THREE.InstancedBufferGeometry();
  sparkGeometry.index = sparkQuad.index;
  sparkGeometry.setAttribute('position', sparkQuad.getAttribute('position'));
  const random = seededRandom(97);
  const sparks = new Float32Array(28 * 4);
  for (let i = 0; i < 28; i++) sparks.set([0.25 + random() * 0.55, random(), random() * 0.6, random()], i * 4);
  sparkGeometry.setAttribute('aSpark', new THREE.InstancedBufferAttribute(sparks, 4));
  sparkGeometry.instanceCount = 28;
  const viewport = { value: new THREE.Vector2(1, 1) };
  const sparkCentre = { value: new THREE.Vector3() };
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uCentre: sparkCentre, uViewport: viewport, uColour: { value: new THREE.Color('#ffd98a') } },
    vertexShader: SPARKLE_VERTEX,
    fragmentShader: SPARKLE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparkMesh = new THREE.Mesh(sparkGeometry, sparkMat);
  sparkMesh.frustumCulled = false;
  group.add(sparkMesh);
  disposables.push(sparkQuad, sparkGeometry, sparkMat);
  group.add(lamp);

  // ── the avenue: painted trees in pairs, four variants shared ──
  const variants = [0, 1, 2, 3].map((v) => {
    const tree = createPaintedTree(kind, 900 + v * 41, context.palette, time, 0.0035, context.tier.tier === 'low' ? 0.22 : 0.32, 1.7);
    disposables.push(tree);
    return tree;
  });
  // From beyond the plaza, far enough that the crowns stay under the Start button.
  const rows = [-33, -43, -55, -69, -86, -108, -138];
  const avenueRandom = seededRandom(131);
  const trunks: [number, number][] = [];
  rows.forEach((z, row) => {
    for (const side of [-1, 1]) {
      const variant = variants[(row * 2 + (side > 0 ? 1 : 0)) % variants.length];
      const tree = variant.group.clone();
      const height = 6.8 + avenueRandom() * 1.6;
      tree.scale.setScalar(height / variant.height);
      tree.position.set(side * (PATH_HALF_WIDTH + KERB + 3.4 + avenueRandom() * 0.8), 0, z + (avenueRandom() - 0.5) * 2);
      trunks.push([tree.position.x, tree.position.z]);
      tree.rotation.y = avenueRandom() * Math.PI * 2;
      group.add(tree);
    }
  });

  // ── wildflowers: none on the LOW tier, fewer on medium ──
  const flowerCount = context.tier.tier === 'high' ? 2200 : context.tier.tier === 'medium' ? 1000 : 0;
  let flowers: ReturnType<typeof createFlowers> | null = null;
  if (flowerCount > 0) {
    // Off the path and its kerbs, the plaza (both layouts), the bench and the lamp (both layouts), the trunks.
    const plazas = [plazaFor(16 / 9), plazaFor(9 / 16)];
    const spots = [lampFor(16 / 9), lampFor(9 / 16), benchFor(16 / 9), benchFor(9 / 16)];
    const clear = PATH_HALF_WIDTH + KERB + 0.45;
    flowers = createFlowers(
      flowerCount,
      context.palette,
      time,
      lampUniform,
      (x, z) =>
        Math.abs(x) < clear ||
        plazas.some((plaza) => Math.hypot(x, z - plaza.z) < plaza.radius + KERB + 0.5) ||
        spots.some((spot) => Math.hypot(x - spot.x, z - spot.z) < 1.3) ||
        trunks.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 0.9),
    );
    disposables.push(flowers);
    group.add(flowers.mesh);
  }

  return {
    group,
    setQualityLevel(level) {
      // The first thing to go when the frame rate drops.
      if (flowers) flowers.mesh.visible = level === 0;
    },
    place(aspect) {
      const lampAt = lampFor(aspect);
      lamp.position.set(lampAt.x, 0, lampAt.z);
      const [lx, ly, lz] = lampLight(aspect);
      lampUniform.value.set(lx, ly, lz, lampUniform.value.w);
      sparkCentre.value.set(lampAt.x, lampParts.lanternY, lampAt.z);
      const benchAt = benchFor(aspect);
      bench.position.set(benchAt.x, 0, benchAt.z);
      // Facing the path (its front, +z, turned toward +x).
      bench.rotation.y = Math.PI / 2;
    },
    update(next) {
      viewport.value.copy(next);
      crystal.rotation.y += 0.01;
    },
    dispose() {
      for (const item of disposables) item.dispose();
    },
  };
}

function create(context: StageContext): AssetClass {
  const root = new THREE.Group();
  root.name = 'promenade';
  context.scene.add(root);
  let built: Built | null = null;
  let current = '';
  let aspect = 16 / 9;
  let qualityLevel = 0;
  const viewport = new THREE.Vector2();
  const setOption = (id: string) => {
    if (id === current) return;
    if (!OPTIONS.some((option) => option.id === id)) throw new Error(`[promenade] unknown option "${id}"`);
    built?.dispose();
    root.clear();
    built = null;
    current = id;
    if (id === 'none') return;
    built = build(context, id === 'blossom' ? 'blossom' : 'oak');
    root.add(built.group);
    built.place(aspect);
    built.setQualityLevel(qualityLevel);
  };
  setOption('none');
  return {
    id: 'promenade',
    label: 'Promenade',
    options: OPTIONS,
    current: () => current,
    setOption,
    setAspect(next) {
      aspect = next;
      built?.place(aspect);
    },
    setQualityLevel(level) {
      qualityLevel = level;
      built?.setQualityLevel(level);
    },
    update() {
      built?.update(worldBufferSize(context, viewport));
    },
    dispose() {
      built?.dispose();
      context.scene.remove(root);
    },
  };
}

export { create };
