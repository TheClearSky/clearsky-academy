import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blob, cone, fbm3, plain, prism } from './kit';

/**
 * The vegetation, all procedural:
 *
 *   species   unit-height trees for the far woods, drawn INSTANCED (one draw
 *             per species, hundreds of trees): a conifer of stacked, noise-
 *             broken tiers; a broadleaf of lumpy leaf masses on a trunk (the
 *             Ghibli-oak read, Nodestra `tree2.ts`, at a distance); a poplar;
 *   (the hero trees — oak, blossom — are `painted.ts`'s);
 *   petals    a drift of blossom petals in the near air.
 *
 * A per-vertex tint separates bark from leaves inside one geometry (the land
 * material multiplies its albedo by it): bark is darker and browner.
 */

const BARK_TINT: [number, number, number] = [0.42, 0.33, 0.38];

function tint(geometry: THREE.BufferGeometry, rgb: [number, number, number]): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colours.set(rgb, i * 3);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  return geometry;
}

/** Push a geometry's vertices about by noise (no two tiers alike). */
function jitter(geometry: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const n = fbm3(x * 9 + seed, y * 9, z * 9 - seed, 2) - 0.5;
    position.setXYZ(i, x * (1 + n * amount * 2), y, z * (1 + n * amount * 2));
  }
  geometry.computeVertexNormals();
  return geometry;
}

type Species = 'conifer' | 'broadleaf' | 'poplar';

/** One unit-height tree of a species (base at 0, top at ~1). */
function speciesGeometry(species: Species, seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (species === 'conifer') {
    parts.push(tint(prism(0.025, 0.018, -0.05, 0.2, 5), BARK_TINT));
    const tiers = [
      [0.3, 0.1, 0.36],
      [0.24, 0.3, 0.32],
      [0.18, 0.48, 0.3],
      [0.11, 0.66, 0.34],
    ];
    tiers.forEach(([r, y0, h], k) => parts.push(tint(jitter(cone(r, y0, h, 7, k * 0.9), 0.18, seed + k), [1, 1, 1])));
  } else if (species === 'broadleaf') {
    parts.push(tint(prism(0.045, 0.03, -0.05, 0.45, 6), BARK_TINT));
    const masses: [number, number, number, number][] = [
      [0, 0.66, 0, 0.3],
      [-0.2, 0.56, 0.06, 0.22],
      [0.21, 0.58, -0.04, 0.23],
      [0.04, 0.8, -0.08, 0.2],
      [-0.06, 0.55, -0.18, 0.2],
    ];
    masses.forEach(([x, y, z, r], k) => {
      const mass = blob(r, 1, seed + k * 3.1, 0.3, 0.82);
      mass.translate(x, y, z);
      parts.push(tint(mass, [1, 1, 1]));
    });
  } else {
    parts.push(tint(prism(0.03, 0.02, -0.05, 0.3, 5), BARK_TINT));
    const mass = blob(0.17, 1, seed, 0.28, 2.6);
    mass.translate(0, 0.6, 0);
    parts.push(tint(mass, [1, 1, 1]));
  }
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

type Planting = { x: number; y: number; z: number; scale: number; yaw: number; shade: number };

/** An instanced wood of one species. */
function plantWood(species: Species, plantings: Planting[], material: THREE.Material, seed: number): THREE.InstancedMesh {
  const geometry = speciesGeometry(species, seed);
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, plantings.length));
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  plantings.forEach((planting, index) => {
    // A little narrower or wider than tall; a conifer leans never, a broadleaf a hair.
    const width = planting.scale * (0.85 + ((index * 0.618) % 1) * 0.35);
    matrix.compose(
      new THREE.Vector3(planting.x, planting.y, planting.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), planting.yaw),
      new THREE.Vector3(width, planting.scale, width),
    );
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, colour.setScalar(planting.shade));
  });
  mesh.count = plantings.length;
  mesh.frustumCulled = false;
  return mesh;
}

const PETAL_VERTEX = /* glsl */ `
attribute vec4 aPetal; // x, y, z of its home, seed
uniform float uTime;
uniform vec2 uViewport;
varying vec2 vCorner;
varying float vSeed;
varying float vFade;
void main() {
  float seed = aPetal.w;
  vec3 p = aPetal.xyz;
  // Fall slowly, drift downwind, flutter; wrap through the volume (x ±40, y 0…14).
  float fall = uTime * (0.35 + 0.35 * fract(seed * 7.1));
  p.y = mod(p.y - fall, 14.0);
  p.x = mod(p.x + 40.0 + uTime * 0.6 + sin(uTime * 0.9 + seed * 30.0) * 1.2, 80.0) - 40.0;
  p.z += sin(uTime * 0.5 + seed * 11.0) * 0.8;
  vec4 view = viewMatrix * vec4(p, 1.0);
  float depth = max(-view.z, 0.1);
  float size = mix(0.05, 0.11, fract(seed * 3.7));
  float focal = projectionMatrix[1][1] * uViewport.y * 0.5;
  float radiusPx = clamp(size * focal / depth, 1.0, 7.0 * uViewport.y / 900.0);
  // The petal tumbles: its quad squashes along a turning axis.
  float turn = uTime * (1.0 + fract(seed * 5.3)) + seed * 20.0;
  vec2 corner = position.xy;
  vec2 axis = vec2(cos(turn), sin(turn));
  vec2 squashed = axis * dot(corner, axis) + vec2(-axis.y, axis.x) * dot(corner, vec2(-axis.y, axis.x)) * (0.35 + 0.65 * abs(sin(turn * 1.3)));
  vec4 clip = projectionMatrix * view;
  clip.xy += squashed * radiusPx / (uViewport * 0.5) * clip.w;
  gl_Position = clip;
  vCorner = corner;
  vSeed = seed;
  vFade = smoothstep(0.0, 1.5, p.y) * (1.0 - smoothstep(12.0, 14.0, p.y)) * smoothstep(2.0, 6.0, depth);
}
`;

const PETAL_FRAGMENT = /* glsl */ `
uniform vec3 uPetal;
varying vec2 vCorner;
varying float vSeed;
varying float vFade;
void main() {
  // A petal: an ellipse with a notch at its tip.
  vec2 p = vCorner * vec2(1.0, 1.5);
  float d = length(p);
  float notch = smoothstep(0.18, 0.0, length(vCorner - vec2(0.0, 0.66)));
  float alpha = (1.0 - smoothstep(0.82, 1.0, d)) * (1.0 - notch) * vFade;
  if (alpha < 0.01) discard;
  vec3 colour = uPetal * (0.85 + 0.3 * fract(vSeed * 13.0));
  gl_FragColor = vec4(colour * alpha * 0.9, alpha * 0.9);
}
`;

/** A drift of petals in the near air (premultiplied over; drawn with the world). */
function createPetals(count: number, colour: THREE.Color, time: { value: number }, random: () => number) {
  const quad = new THREE.PlaneGeometry(2, 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  const homes = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) homes.set([(random() - 0.5) * 80, random() * 14, -6 - random() * 60, random()], i * 4);
  geometry.setAttribute('aPetal', new THREE.InstancedBufferAttribute(homes, 4));
  geometry.instanceCount = count;
  const viewport = { value: new THREE.Vector2(1, 1) };
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uViewport: viewport, uPetal: { value: colour } },
    vertexShader: PETAL_VERTEX,
    fragmentShader: PETAL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    viewport,
    dispose() {
      quad.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

export { createPetals, plain, plantWood, speciesGeometry };
export type { Planting, Species };
