import * as THREE from 'three';
import { STUDIO_GLSL } from '../cards/studioEnv';

/**
 * Poker chips (the poker-effects reference): a lathed chip with a rounded
 * rim, its pattern drawn procedurally in the shader — eight white inlay
 * spots round the rim, a dashed white ring and a fine circle on each face,
 * and the academy's white four-point star in the centre — lit by the cards'
 * studio environment (glossy rim). ONE instanced draw for every chip; the
 * colour is per instance.
 *
 * `toss` throws a handful from a point: each flies up and out on a
 * ballistic arc, tumbling, then drops away and shrinks out. Plain CPU
 * physics (a few dozen chips), instance matrices written per frame.
 *
 * Space: the card table's pixel space (x right, y up, z toward the viewer).
 */

type ChipToss = { x: number; y: number; count: number; size: number };

type Chips = {
  mesh: THREE.InstancedMesh;
  toss(toss: ChipToss): void;
  update(dt: number): void;
  dispose(): void;
};

const CHIP_COLOURS = ['#b8333f', '#3e4fb0', '#3f8a4e', '#6a3fd1'];
const CAPACITY = 64;
const GRAVITY = -1400;
const LIFE = 2.4;

const VERTEX = /* glsl */ `
attribute vec3 aColour;
varying vec3 vLocal;
varying vec3 vLocalNormal;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColour;
void main() {
  vLocal = position;
  vLocalNormal = normal;
  vColour = aColour;
  mat4 world = modelMatrix * instanceMatrix;
  vec4 worldPosition = world * vec4(position, 1.0);
  vWorld = worldPosition.xyz;
  vNormal = normalize(mat3(world) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const FRAGMENT = /* glsl */ `${STUDIO_GLSL}
varying vec3 vLocal;
varying vec3 vLocalNormal;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColour;
float starShape(vec2 p, float size) {
  vec2 q = abs(p) / size;
  // A four-point star: the region under 1 - x^0.5 - y^0.5 style curve.
  return 1.0 - smoothstep(0.95, 1.05, sqrt(q.x) + sqrt(q.y));
}
void main() {
  vec3 white = vec3(0.93, 0.92, 0.95);
  vec3 colour = vColour;
  float radius = length(vLocal.xz);
  float angle = atan(vLocal.z, vLocal.x + 1e-5);
  bool face = abs(vLocalNormal.y) > 0.9;
  if (face) {
    float ring = step(0.6, radius) * step(radius, 0.72) * step(0.5, fract(angle / 6.2831853 * 16.0));
    float line = 1.0 - smoothstep(0.008, 0.02, abs(radius - 0.52));
    float star = starShape(vLocal.xz, 0.34);
    colour = mix(colour, white, max(max(ring, line), star));
  } else {
    // Eight rectangular inlay spots round the rim.
    float spot = step(0.62, fract(angle / 6.2831853 * 8.0)) * step(abs(vLocal.y), 0.07);
    colour = mix(colour, white, spot);
  }
  vec3 view = normalize(cameraPosition - vWorld);
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(vec3(-0.4, 0.6, 0.8));
  float diffuse = max(dot(normal, light), 0.0);
  float facing = clamp(dot(normal, view), 0.0, 1.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  colour = colour * (0.35 + 0.75 * diffuse) + studio(reflect(-view, normal), 0.25) * (0.12 + fresnel * 0.6);
  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function chipGeometry(): THREE.BufferGeometry {
  const profile = [
    [0, 0.08],
    [0.9, 0.08],
    [0.965, 0.074],
    [0.995, 0.05],
    [1, 0],
    [0.995, -0.05],
    [0.965, -0.074],
    [0.9, -0.08],
    [0, -0.08],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  const geometry = new THREE.LatheGeometry(profile, 48);
  geometry.computeVertexNormals();
  return geometry;
}

type Chip = {
  alive: boolean;
  age: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  axis: THREE.Vector3;
  spin: number;
  angle: number;
  size: number;
};

function createChips(): Chips {
  const geometry = chipGeometry();
  const colours = new Float32Array(CAPACITY * 3);
  const colourAttribute = new THREE.InstancedBufferAttribute(colours, 3);
  geometry.setAttribute('aColour', colourAttribute);
  const material = new THREE.ShaderMaterial({ uniforms: {}, vertexShader: VERTEX, fragmentShader: FRAGMENT });
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 40;
  const chips: Chip[] = Array.from({ length: CAPACITY }, () => ({
    alive: false,
    age: 0,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    axis: new THREE.Vector3(1, 0, 0),
    spin: 0,
    angle: 0,
    size: 1,
  }));
  const tint = new THREE.Color();
  const scratch = new THREE.Object3D();
  let next = 0;

  return {
    mesh,
    toss({ x, y, count, size }) {
      for (let index = 0; index < count; index++) {
        const chip = chips[next];
        const slot = next;
        next = (next + 1) % CAPACITY;
        chip.alive = true;
        chip.age = 0;
        chip.position.set(x + (Math.random() - 0.5) * size, y, 60 + Math.random() * 40);
        const direction = (Math.random() - 0.5) * 1.6;
        const speed = 650 + Math.random() * 450;
        chip.velocity.set(Math.sin(direction) * speed * 0.7, Math.cos(direction) * speed, Math.random() * 120);
        chip.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        chip.spin = 6 + Math.random() * 8;
        chip.angle = Math.random() * Math.PI * 2;
        chip.size = size * (0.85 + Math.random() * 0.3);
        tint.set(CHIP_COLOURS[Math.floor(Math.random() * CHIP_COLOURS.length)]);
        colours[slot * 3] = tint.r;
        colours[slot * 3 + 1] = tint.g;
        colours[slot * 3 + 2] = tint.b;
      }
      colourAttribute.needsUpdate = true;
    },
    update(dt) {
      let highest = 0;
      chips.forEach((chip, index) => {
        if (!chip.alive) {
          scratch.scale.setScalar(0);
          scratch.updateMatrix();
          mesh.setMatrixAt(index, scratch.matrix);
          return;
        }
        chip.age += dt;
        if (chip.age > LIFE) chip.alive = false;
        chip.velocity.y += GRAVITY * dt;
        chip.position.addScaledVector(chip.velocity, dt);
        chip.angle += chip.spin * dt;
        const shrink = 1 - THREE.MathUtils.smoothstep(chip.age, LIFE * 0.7, LIFE);
        scratch.position.copy(chip.position);
        scratch.quaternion.setFromAxisAngle(chip.axis, chip.angle);
        scratch.scale.setScalar(chip.alive ? chip.size * shrink : 0);
        scratch.updateMatrix();
        mesh.setMatrixAt(index, scratch.matrix);
        highest = index + 1;
      });
      mesh.count = highest;
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

export { createChips };
export type { ChipToss, Chips };
