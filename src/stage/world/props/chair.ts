import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE_GLSL } from '../../engine/glsl';
import { LIGHTING_GLSL, lightingUniforms } from '../../engine/lighting';
import type { StageContext } from '../../engine/contract';
import type { Placement } from './propLayout';

/**
 * An old wooden classroom chair, standing on the checker at the left edge of
 * the frame (the near "wing" — it frames the cards, never sits behind them).
 *
 * Built from primitives and merged into ONE draw: a bevelled seat with a
 * shallow saddle, four turned legs (`LatheGeometry` of a spindle profile),
 * stretchers, two back posts leaning back a little, a bent top rail and
 * three slats. Every part records its own grain coordinates (`aGrain`, x =
 * along the grain) BEFORE it is moved into place, so the procedural wood —
 * growth rings, streaks and pores under a varnish highlight — follows each
 * piece. A soft blob shadow grounds it on the floor.
 */

const SEAT_HEIGHT = 0.46;

function withGrain(geometry: THREE.BufferGeometry, grainAxis: 'x' | 'y' | 'z', place: THREE.Matrix4): THREE.BufferGeometry {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute('position');
  const grain = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const [along, a, b] = grainAxis === 'x' ? [x, y, z] : grainAxis === 'y' ? [y, x, z] : [z, x, y];
    grain.set([along, a, b], index * 3);
  }
  source.setAttribute('aGrain', new THREE.BufferAttribute(grain, 3));
  source.applyMatrix4(place);
  // Keep only what every part has, so the merge lines up.
  for (const name of Object.keys(source.attributes)) if (!['position', 'normal', 'aGrain'].includes(name)) source.deleteAttribute(name);
  return source;
}

function legProfile(height: number): THREE.Vector2[] {
  const points: [number, number][] = [
    [0.0, 0],
    [0.016, 0],
    [0.02, 0.03],
    [0.017, 0.12],
    [0.026, 0.17],
    [0.018, 0.21],
    [0.021, 0.3],
    [0.024, height - 0.03],
    [0.02, height],
    [0.0, height],
  ];
  return points.map(([radius, y]) => new THREE.Vector2(radius, y));
}

function chairGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const m = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

  // Seat: a rounded rectangle extruded with a bevel, laid flat, saddled.
  const seatShape = new THREE.Shape();
  const w = 0.21;
  const d = 0.2;
  const r = 0.04;
  seatShape.moveTo(-w + r, -d);
  seatShape.lineTo(w - r, -d);
  seatShape.quadraticCurveTo(w, -d, w, -d + r);
  seatShape.lineTo(w, d - r);
  seatShape.quadraticCurveTo(w, d, w - r, d);
  seatShape.lineTo(-w + r, d);
  seatShape.quadraticCurveTo(-w, d, -w, d - r);
  seatShape.lineTo(-w, -d + r);
  seatShape.quadraticCurveTo(-w, -d, -w + r, -d);
  const seat = new THREE.ExtrudeGeometry(seatShape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 6 });
  seat.rotateX(-Math.PI / 2);
  const seatPosition = seat.getAttribute('position');
  for (let index = 0; index < seatPosition.count; index++) {
    const x = seatPosition.getX(index);
    const z = seatPosition.getZ(index);
    seatPosition.setY(index, seatPosition.getY(index) - 0.012 * Math.cos((x / w) * 1.4) * Math.cos((z / d) * 1.4));
  }
  seat.computeVertexNormals();
  parts.push(withGrain(seat, 'x', m(0, SEAT_HEIGHT - 0.028, 0)));

  // Legs at the corners; the back legs go on up as posts.
  const leg = new THREE.LatheGeometry(legProfile(SEAT_HEIGHT - 0.02), 12);
  for (const [x, z] of [
    [-0.18, 0.17],
    [0.18, 0.17],
    [-0.18, -0.17],
    [0.18, -0.17],
  ]) parts.push(withGrain(leg.clone(), 'y', m(x, 0, z)));
  const post = new THREE.CylinderGeometry(0.017, 0.02, 0.46, 12).translate(0, 0.23, 0);
  for (const x of [-0.18, 0.18]) parts.push(withGrain(post.clone(), 'y', m(x, SEAT_HEIGHT - 0.02, -0.17, -0.12)));

  // Stretchers between the legs.
  const sideStretcher = new THREE.CylinderGeometry(0.011, 0.011, 0.34, 8);
  for (const x of [-0.18, 0.18]) parts.push(withGrain(sideStretcher.clone(), 'y', m(x, 0.15, 0, Math.PI / 2)));
  const frontStretcher = new THREE.CylinderGeometry(0.011, 0.011, 0.36, 8);
  parts.push(withGrain(frontStretcher, 'y', m(0, 0.2, 0.17, 0, 0, Math.PI / 2)));

  // Top rail, bent back into a gentle curve.
  const rail = new THREE.BoxGeometry(0.42, 0.08, 0.022, 12, 1, 1);
  const railPosition = rail.getAttribute('position');
  for (let index = 0; index < railPosition.count; index++) {
    const x = railPosition.getX(index);
    railPosition.setZ(index, railPosition.getZ(index) - 0.035 * (x / 0.21) ** 2);
  }
  rail.computeVertexNormals();
  const backTop = SEAT_HEIGHT - 0.02 + 0.46 * Math.cos(0.12) - 0.05;
  const backZ = -0.17 - 0.46 * Math.sin(0.12) + 0.03;
  parts.push(withGrain(rail, 'x', m(0, backTop, backZ + 0.02, -0.12)));

  // Three slats from the seat up to the rail.
  const slat = new THREE.BoxGeometry(0.04, backTop - SEAT_HEIGHT - 0.06, 0.012);
  for (const x of [-0.1, 0, 0.1]) {
    parts.push(withGrain(slat.clone(), 'y', m(x, (SEAT_HEIGHT + backTop) / 2 - 0.02, -0.17 - ((backTop - SEAT_HEIGHT) / 2) * Math.sin(0.12) + 0.01, -0.12)));
  }

  const merged = mergeGeometries(parts);
  for (const part of [...parts, seat, leg, post, sideStretcher, rail, slat]) part.dispose();
  if (!merged) throw new Error('[chair] could not merge the chair geometry');
  return merged;
}

const WOOD_FRAGMENT = /* glsl */ `${NOISE_GLSL}${LIGHTING_GLSL}
varying vec3 vGrain;
varying vec3 vNormal;
varying vec3 vToEye;
varying float vDistance;
float fbm3Local(vec2 p) { return fbm3(p); }
void main() {
  vec3 q = vGrain;
  float rings = length(q.yz + vec2(0.31, 0.17)) * 38.0 + fbm3Local(q.xy * vec2(0.6, 4.0)) * 3.0;
  float ring = smoothstep(0.15, 0.85, fract(rings));
  float streak = vnoise(vec2(q.x * 3.0, q.y * 90.0 + q.z * 90.0));
  vec3 wood = mix(vec3(0.30, 0.17, 0.08), vec3(0.52, 0.32, 0.16), ring * 0.7 + streak * 0.3);
  wood *= 0.9 + 0.2 * vnoise(q.xz * 400.0);
  vec3 colour = shadeSurface(wood, vNormal, vToEye, 40.0, 0.35);
  gl_FragColor = vec4(fogFromEye(colour, vToEye), 1.0);
}
`;

const WOOD_VERTEX = /* glsl */ `
attribute vec3 aGrain;
varying vec3 vGrain;
varying vec3 vNormal;
varying vec3 vToEye;
varying float vDistance;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vGrain = aGrain;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vToEye = cameraPosition - worldPosition.xyz;
  vDistance = length(vToEye);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

type Chair = {
  group: THREE.Group;
  place(placement: Placement): void;
  dispose(): void;
};

function createChair(context: StageContext): Chair {
  const group = new THREE.Group();
  const geometry = chairGeometry();
  const material = new THREE.ShaderMaterial({ uniforms: lightingUniforms(context.palette), vertexShader: WOOD_VERTEX, fragmentShader: WOOD_FRAGMENT });
  const chair = new THREE.Mesh(geometry, material);
  group.add(chair);

  // A soft contact shadow on the floor.
  const shadowGeometry = new THREE.PlaneGeometry(0.9, 0.8).rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; void main() { float d = length((vUv - 0.5) * vec2(1.0, 1.1)) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.02, 0.55 * (1.0 - smoothstep(0.2, 1.0, d))); }',
  });
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.position.y = 0.003;
  group.add(shadow);

  return {
    group,
    place(placement) {
      group.position.set(placement.x, placement.y, placement.z);
      group.rotation.set(0, placement.yaw, 0);
      group.scale.setScalar(placement.scale);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
    },
  };
}

export { createChair };
export type { Chair };
