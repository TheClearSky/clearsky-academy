import * as THREE from 'three';

/**
 * Four-point star sparkles (the poker-effects reference: long thin arms, a
 * hot core, a faint 45° second cross) — one instanced draw from a ring
 * buffer pool. A sparkle is fire-and-forget: `spawn` writes its birth time,
 * place, drift and size into the next slot; the shader ages it, so the CPU
 * does nothing per frame. HDR (×3) and additive: the bloom gives each a halo.
 *
 * Space: the card table's pixel space (x right, y up, z toward the viewer).
 */

type SparkleBurst = {
  x: number;
  y: number;
  z?: number;
  count: number;
  /** Radius (px) the sparkles start within. */
  spread: number;
  /** Size range (px): the arm length. */
  size?: [number, number];
  /** Seconds each lives. */
  life?: [number, number];
  /** Drift speed (px/s). */
  speed?: number;
  colour?: THREE.Color;
};

type Sparkles = {
  mesh: THREE.Mesh;
  spawn(burst: SparkleBurst): void;
  update(time: number): void;
  dispose(): void;
};

const VERTEX = /* glsl */ `
attribute vec3 aOrigin;
attribute vec2 aVelocity;
attribute vec4 aTiming; // birth, life, size, angle
attribute vec3 aColour;
uniform float uTime;
varying vec2 vCorner;
varying float vEnvelope;
varying vec3 vColour;
void main() {
  float age = (uTime - aTiming.x) / aTiming.y;
  if (age < 0.0 || age > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vEnvelope = pow(max(sin(3.14159265 * age), 0.0), 0.6);
  float angle = aTiming.w + age * 0.6;
  mat2 spin = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
  vec3 centre = aOrigin + vec3(aVelocity * age * aTiming.y, 0.0);
  vec3 world = centre + vec3(spin * position.xy * aTiming.z * (0.6 + 0.4 * vEnvelope), 0.0);
  vCorner = position.xy;
  vColour = aColour;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
varying vec2 vCorner;
varying float vEnvelope;
varying vec3 vColour;
float arms(vec2 p) {
  return max(0.0, 1.0 - abs(p.x) * 9.0) * (1.0 - abs(p.y)) + max(0.0, 1.0 - abs(p.y) * 9.0) * (1.0 - abs(p.x));
}
void main() {
  vec2 p = vCorner;
  float d = length(p);
  if (d > 1.0) discard;
  vec2 diagonal = mat2(0.7071, 0.7071, -0.7071, 0.7071) * p * 1.9;
  float star = arms(p) + arms(diagonal) * 0.35 * step(max(abs(diagonal.x), abs(diagonal.y)), 1.0);
  float core = (0.012 / (d + 0.012)) * (1.0 - d) * (1.0 - d);
  float intensity = (star * star + core) * vEnvelope;
  gl_FragColor = vec4(vColour * intensity * 2.4, 0.0);
}
`;

const CAPACITY = 256;
const WARM = new THREE.Color('#ffe7b8');

function createSparkles(): Sparkles {
  const quad = new THREE.PlaneGeometry(2, 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  const origin = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
  const velocity = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 2), 2);
  const timing = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4).fill(-1000), 4);
  const colour = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
  for (const attribute of [origin, velocity, timing, colour]) attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aOrigin', origin);
  geometry.setAttribute('aVelocity', velocity);
  geometry.setAttribute('aTiming', timing);
  geometry.setAttribute('aColour', colour);
  geometry.instanceCount = CAPACITY;
  const uniforms = { uTime: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    // Pure additive (One, One): three's AdditiveBlending scales by the source
    // alpha, and a light writes alpha 0.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 50;
  let next = 0;
  let dirty = false;

  return {
    mesh,
    spawn(burst) {
      const [sizeLow, sizeHigh] = burst.size ?? [10, 26];
      const [lifeLow, lifeHigh] = burst.life ?? [0.5, 1.1];
      const speed = burst.speed ?? 30;
      const tint = burst.colour ?? WARM;
      for (let index = 0; index < burst.count; index++) {
        const slot = next;
        next = (next + 1) % CAPACITY;
        const direction = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * burst.spread;
        origin.setXYZ(slot, burst.x + Math.cos(direction) * distance, burst.y + Math.sin(direction) * distance, burst.z ?? 40);
        velocity.setXY(slot, Math.cos(direction) * speed * Math.random(), Math.sin(direction) * speed * Math.random() + speed * 0.3);
        timing.setXYZW(slot, uniforms.uTime.value + Math.random() * 0.15, lifeLow + Math.random() * (lifeHigh - lifeLow), sizeLow + Math.random() * (sizeHigh - sizeLow), Math.random() * Math.PI);
        colour.setXYZ(slot, tint.r, tint.g, tint.b);
      }
      dirty = true;
    },
    update(time) {
      uniforms.uTime.value = time;
      if (!dirty) return;
      for (const attribute of [origin, velocity, timing, colour]) attribute.needsUpdate = true;
      dirty = false;
    },
    dispose() {
      quad.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

export { createSparkles };
export type { SparkleBurst, Sparkles };
