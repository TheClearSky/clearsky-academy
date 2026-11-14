import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from '../../engine/random';
import type { StagePalette } from '../../engine/palette';
import { at, box, cone, createLandMaterial, gable, LANDSCAPE_GLSL, landUniforms, Parts, prism, TAU, UP } from './kit';
import type { LandMaterialOptions } from './kit';

/**
 * THE ACADEMY — ClearSky Academy itself, on the horizon: the scene's anchor
 * (Deepak, 2026-10-17: "the scene seems devoid of a giant object in the
 * background … no huge anchor"; of the six concepts: "acedemy seems great").
 *
 * Massed after OUR logo (`site/brand/clearsky-mark.svg`), never the films'
 * castle (the research's avoid list: no Hogwarts silhouette — no lake, no
 * cliff, no viaduct, no cluster of many spires): one tall great tower under
 * a steep pointed spire, two flanking towers whose conical roofs splay
 * outward, a crenellated curtain wall with a lit gate between them. Around
 * that core, for a believable school seen from 480 m: a long library wing
 * of tall lit lancets (dark academia's candlelit library), a lecture wing
 * ending in a domed OBSERVATORY (a science academy), a few towers behind
 * for depth, chimneys and buttresses.
 *
 * Built like Nodestra's citadel (`scene/pillar-citadel.ts`): simple stone
 * parts merged into one mesh per tone, plus one instanced mesh of lancet
 * windows that glow warm and flicker slowly — the warm-against-cold note
 * the all-blue scene lacked. Metres, the foot's centre at the origin, the
 * front facing +z (the camera). About 390 m wide and 256 m to the spire tip.
 */

type Tone = 'wall' | 'trim' | 'roof';

type WindowSpec = { matrix: THREE.Matrix4; lit: number; seed: number; mullion: number };

/**
 * The castle's look (Deepak, 2026-10-17: "castle colored texture doesnt look
 * medieval and amazing, the details are too much, it needs a better design.
 * Do 5 designs" — of the five, "pick royal"; the other four are archived in
 * `themes/clearsky-castle-designs-v2`). Painted the way anime backgrounds
 * paint castles (`.claude/research/castle/REFERENCES.md`): flat colour masses
 * in soft gradients, masonry only indicated, the roofs carrying the colour,
 * warm windows against the cool night —
 *
 *   royal   ivory stone, cobalt roofs, gold trim (the fairy-tale castle)
 *
 * `night` is the original dark night stone.
 */
type CastleDesign = 'night' | 'royal';

type Design = { foot: string; top: string; trim: string; trimTop: string; roof: string; ridge: string; joint: string; uplight: [number, number, number] };

const CASTLE_DESIGNS: Record<Exclude<CastleDesign, 'night'>, Design> = {
  royal: { foot: '#c7bba4', top: '#efe7d6', trim: '#c9a65a', trimTop: '#e2c27a', roof: '#2d4f9e', ridge: '#1b2f6b', joint: '#9a8f78', uplight: [0.9, 0.6, 0.28] },
};

function designTones(design: Design, haze: number): Record<Tone, LandMaterialOptions> {
  return {
    wall: { albedo: design.foot, rim: 0.4, haze, pattern: { kind: 'wall', second: design.top, joint: design.joint, block: [6, 3], indicate: 0.55 }, uplight: [...design.uplight, 40] },
    trim: { albedo: design.trim, rim: 0.45, haze, pattern: { kind: 'wall', second: design.trimTop, joint: design.joint, block: [4, 2], indicate: 0.3 }, uplight: [...design.uplight, 40] },
    roof: { albedo: design.roof, rim: 0.65, haze, pattern: { kind: 'roof', second: design.ridge, joint: design.ridge, block: [3, 2.2], indicate: 0.5 }, uplight: [design.uplight[0] * 0.4, design.uplight[1] * 0.4, design.uplight[2] * 0.4, 60] },
  };
}

/** The spire tip above the foot (m). */
const ACADEMY_TOP = 256;
/** Half its width (m): the library wing's end turret to the observatory. */
const ACADEMY_HALF_WIDTH = 200;

const WINDOW_VERTEX = /* glsl */ `
attribute vec3 aWindow; // lit, seed, mullion
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vWindow;
void main() {
  vUv = uv;
  vWindow = aWindow;
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const WINDOW_FRAGMENT = /* glsl */ `${LANDSCAPE_GLSL}
uniform vec3 uRecess;
uniform vec3 uLamp;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vWindow;
void main() {
  // A lancet: a rectangle under a pointed arch (two arcs meeting at the apex).
  vec2 p = vUv - vec2(0.5, 0.0);
  float spring = 0.66;
  float d;
  if (vUv.y < spring) d = abs(p.x) - 0.5;
  else d = length(vec2(abs(p.x) + 0.35, (vUv.y - spring) * 2.4)) - 0.85;
  d = max(d, -vUv.y);
  float aa = fwidth(d) + 1e-4;
  if (1.0 - smoothstep(-aa, aa, d) < 0.02) discard;
  float bar = vWindow.z * max(1.0 - smoothstep(0.035, 0.035 + fwidth(p.x) * 1.5, abs(p.x)), 1.0 - smoothstep(0.02, 0.02 + fwidth(vUv.y) * 1.5, abs(vUv.y - 0.42)));
  // Lit rooms: warm toward the sill, flickering slowly, a few dim.
  float flicker = 0.84 + 0.16 * sin(uTime * (0.6 + vWindow.y * 1.3) + vWindow.y * 40.0);
  float level = mix(0.55, 1.3, vWindow.y) * flicker * vWindow.x;
  vec3 lamp = uLamp * level * (0.8 + 0.5 * (1.0 - vUv.y)) * (1.0 - bar * 0.85);
  vec3 recess = landFog(uRecess, vWorld);
  gl_FragColor = vec4(recess + lamp * landLight(vWorld), 1.0);
}
`;

/** A window on a wall: centre (x, y, z), outward normal n, w × h. Proud of the wall by 0.6 m. */
function windowAt(list: WindowSpec[], x: number, y: number, z: number, n: THREE.Vector3, w: number, h: number, lit: number, seed: number, mullion = 0) {
  const zAxis = n.clone().normalize();
  const xAxis = new THREE.Vector3().crossVectors(UP, zAxis).normalize();
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
  const matrix = new THREE.Matrix4().makeBasis(xAxis.multiplyScalar(w), yAxis.multiplyScalar(h), zAxis);
  matrix.setPosition(x + n.x * 0.6, y, z + n.z * 0.6);
  list.push({ matrix, lit, seed, mullion });
}

/** Windows on the faces of a prism standing at (cx, cz), turned so face k's normal is at angle turn + (k + 0.5)·τ/sides. */
function prismWindows(list: WindowSpec[], random: () => number, cx: number, cz: number, R: number, sides: number, turn: number, rows: number[], per: number, w: number, h: number, litShare: number) {
  for (let k = 0; k < sides; k++) {
    const theta = turn + ((k + 0.5) * TAU) / sides;
    // Faces turned away from the camera are never seen.
    if (Math.cos(theta) < -0.2) continue;
    const apothem = R * Math.cos(Math.PI / sides);
    const side = 2 * R * Math.sin(Math.PI / sides);
    const normal = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
    const tangent = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta));
    for (const y of rows) {
      for (let i = 0; i < per; i++) {
        const along = ((i + 0.5) / per - 0.5) * side * 0.7;
        windowAt(list, cx + normal.x * apothem + tangent.x * along, y, cz + normal.z * apothem + tangent.z * along, normal, w, h, random() < litShare ? 1 : 0, random(), w > 5 ? 1 : 0);
      }
    }
  }
}

/** Merlons along a straight wall top from (x0, z0) to (x1, z1) at height y. */
function merlons(parts: Parts<Tone>, x0: number, z0: number, x1: number, z1: number, y: number, size: [number, number, number], step: number) {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const theta = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
  const count = Math.floor(length / step);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    parts.add('trim', box(...size), at(x0 + (x1 - x0) * t, y + size[1] / 2, z0 + (z1 - z0) * t, theta));
  }
}

/** A round tower with a cone roof; `lean` tilts it (splay). Returns nothing — parts and windows collect it. */
function roundTower(parts: Parts<Tone>, windows: WindowSpec[], random: () => number, x: number, z: number, r: number, height: number, roofHeight: number, lean = 0, rows: number[] = [], litShare = 0.4) {
  const tilt = at(x, 0, z, 0, 1, lean);
  parts.add('wall', prism(r, r * 0.92, 0, height, 10), tilt);
  parts.add('trim', prism(r * 1.12, r * 1.12, height - 4, height, 10), tilt);
  parts.add('roof', cone(r * 1.22, height, roofHeight, 10), tilt);
  // A finial.
  parts.add('trim', prism(0.6, 0.2, height + roofHeight, height + roofHeight + 6, 4), tilt);
  for (const y of rows) {
    // Two windows on the front of a round tower (the lean shifts them by y·sin(lean)).
    for (const a of [-0.45, 0.45]) {
      const normal = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      windowAt(windows, x + normal.x * r * 0.96 - Math.sin(lean) * y, y, z + normal.z * r * 0.96, normal, r * 0.32, r * 0.75, random() < litShare ? 1 : 0, random());
    }
  }
}

type Academy = {
  group: THREE.Group;
  /** The stone (all tones merged per tone) — for growing greenery over it. */
  stone: THREE.BufferGeometry[];
  dispose(): void;
};

function createAcademy(palette: StagePalette, time: { value: number }, haze: number, seed = 3, design: CastleDesign = 'night'): Academy {
  const random = seededRandom(seed);
  const parts = new Parts<Tone>();
  const windows: WindowSpec[] = [];

  // ── the great tower (the logo's centre): square, a steep pointed spire ──
  const towerZ = -12;
  const half = 20;
  parts.add('wall', prism(half * Math.SQRT2, 18 * Math.SQRT2, 0, 172, 4, Math.PI / 4), at(0, 0, towerZ));
  for (const y of [62, 112, 162]) parts.add('trim', prism(21.5 * Math.SQRT2, 21.5 * Math.SQRT2, y, y + 3.5, 4, Math.PI / 4), at(0, 0, towerZ));
  // Corner turrets round the spire's foot.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    parts.add('wall', prism(3.6, 3.2, 150, 192, 8), at(sx * 18.5, 0, towerZ + sz * 18.5));
    parts.add('roof', cone(4.4, 192, 17, 8), at(sx * 18.5, 0, towerZ + sz * 18.5));
  }
  parts.add('roof', cone(27 * Math.SQRT2 * 0.82, 170, ACADEMY_TOP - 176, 4, Math.PI / 4), at(0, 0, towerZ));
  parts.add('trim', prism(0.9, 0.2, ACADEMY_TOP - 6, ACADEMY_TOP + 6, 4), at(0, 0, towerZ));
  // Dormers on the spire's front face.
  for (const y of [192, 214]) {
    parts.add('wall', box(5, 7, 4), at(0, y, towerZ + (half - 3) * (1 - (y - 170) / 90)));
    parts.add('roof', gable(5.6, 6, 4, y + 3.5), at(0, 0, towerZ + (half - 3) * (1 - (y - 170) / 90), Math.PI / 2));
  }
  prismWindows(windows, random, 0, towerZ, half * Math.SQRT2, 4, Math.PI / 4, [34, 58, 86, 108, 134], 2, 3.6, 8, 0.5);
  // The belfry: one tall lit opening each face.
  prismWindows(windows, random, 0, towerZ, 19.2 * Math.SQRT2, 4, Math.PI / 4, [146], 1, 7, 15, 1);

  // ── the flanking towers, splayed outward like the logo's ──
  for (const side of [-1, 1]) roundTower(parts, windows, random, side * 74, 10, 14, 118, 56, -side * 0.045, [28, 52, 78, 100], 0.45);

  // ── the curtain wall, the gatehouse and the gate ──
  parts.add('wall', box(134, 46, 9), at(0, 23, 30));
  merlons(parts, -66, 30, 66, 30, 46, [4.2, 5.5, 10], 8.2);
  parts.add('trim', box(136, 3, 10), at(0, 40, 30));
  for (const side of [-1, 1]) roundTower(parts, windows, random, side * 15, 33, 7.5, 66, 24, 0, [38, 52], 0.6);
  windowAt(windows, 0, 14, 34.6, new THREE.Vector3(0, 0, 1), 13, 24, 1, 0.9, 1);
  // Wall walk windows (arrow slits, a few lit).
  for (let i = 0; i < 9; i++) windowAt(windows, -56 + i * 14, 28, 34.6, new THREE.Vector3(0, 0, 1), 1.6, 6, random() < 0.3 ? 1 : 0, random());

  // ── the library wing (left): a long hall of tall lit lancets ──
  const libraryX = -140;
  parts.add('wall', box(96, 58, 34), at(libraryX, 29, -4));
  parts.add('roof', gable(98, 38, 30, 58), at(libraryX, 0, -4));
  parts.add('trim', box(98, 3, 36), at(libraryX, 57, -4));
  for (let i = 0; i < 8; i++) {
    const x = libraryX - 42 + i * 12;
    windowAt(windows, x, 30, 13.2, new THREE.Vector3(0, 0, 1), 6.5, 24, random() < 0.85 ? 1 : 0, 0.6 + random() * 0.4, 1);
    if (i < 7) parts.add('wall', box(3, 46, 6), at(x + 6, 23, 15));
  }
  // Chimneys.
  for (const dx of [-30, 8, 34]) parts.add('wall', box(3.5, 16, 3.5), at(libraryX + dx, 76, -10));
  roundTower(parts, windows, random, libraryX - 54, -2, 9, 98, 36, 0.02, [30, 56, 80], 0.5);

  // ── the lecture wing (right) and the observatory ──
  const lectureX = 128;
  parts.add('wall', box(72, 50, 30), at(lectureX, 25, -2));
  parts.add('roof', gable(74, 34, 24, 50), at(lectureX, 0, -2));
  for (let i = 0; i < 5; i++) windowAt(windows, lectureX - 28 + i * 14, 26, 13.6, new THREE.Vector3(0, 0, 1), 5, 16, random() < 0.6 ? 1 : 0, random(), 1);
  parts.add('wall', box(3.5, 14, 3.5), at(lectureX + 12, 64, -8));
  const observatoryX = 182;
  parts.add('wall', prism(14, 13, 0, 90, 12), at(observatoryX, 0, 2));
  parts.add('trim', prism(15, 15, 86, 90, 12), at(observatoryX, 0, 2));
  const dome = new THREE.SphereGeometry(14.5, 16, 8, 0, TAU, 0, Math.PI / 2);
  dome.translate(0, 90, 0);
  parts.add('roof', dome, at(observatoryX, 0, 2));
  // The telescope's slit, lit cool.
  windowAt(windows, observatoryX, 96, 2 + 13.6, new THREE.Vector3(0, 0.5, 1), 2.6, 12, 1, 0.3);
  for (const y of [30, 58]) windowAt(windows, observatoryX, y, 2 + 13.6, new THREE.Vector3(0, 0, 1), 4, 10, random() < 0.6 ? 1 : 0, random());

  // ── towers behind, for depth ──
  roundTower(parts, windows, random, -44, -58, 10, 138, 40, 0.01, [100, 120], 0.3);
  roundTower(parts, windows, random, 50, -52, 9, 116, 34, -0.015, [86], 0.3);
  parts.add('wall', box(70, 70, 26), at(0, 35, -50));
  parts.add('roof', gable(72, 30, 22, 70), at(0, 0, -50));

  // ── merge per tone, one material each ──
  // Night stone: darker than the sky near the horizon, so the Academy reads as a moonlit mass, its edges caught by the rim.
  const plain: Record<Tone, LandMaterialOptions> = {
    wall: { albedo: '#262b4f', rim: 0.7, grain: 0.7, haze },
    trim: { albedo: '#363c66', rim: 0.75, grain: 0.4, haze },
    roof: { albedo: '#151935', rim: 0.9, grain: 0.5, haze },
  };
  const tones = design === 'night' ? plain : designTones(CASTLE_DESIGNS[design], haze);
  const group = new THREE.Group();
  group.name = 'academy';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  for (const [tone, list] of parts.lists) {
    const geometry = mergeGeometries(list);
    for (const part of list) part.dispose();
    const material = createLandMaterial(palette, time, tones[tone]);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    group.add(mesh);
    geometries.push(geometry);
    materials.push(material);
  }

  // ── the windows ──
  const pane = new THREE.PlaneGeometry(1, 1);
  const flags = new Float32Array(windows.length * 3);
  windows.forEach((spec, index) => flags.set([spec.lit, spec.seed, spec.mullion], index * 3));
  pane.setAttribute('aWindow', new THREE.InstancedBufferAttribute(flags, 3));
  const windowMaterial = new THREE.ShaderMaterial({
    uniforms: { ...landUniforms(palette, time, haze), uRecess: { value: new THREE.Color('#0b0d1f') }, uLamp: { value: palette.candleFlame.clone().multiplyScalar(1.15) } },
    vertexShader: WINDOW_VERTEX,
    fragmentShader: WINDOW_FRAGMENT,
    side: THREE.DoubleSide,
  });
  const panes = new THREE.InstancedMesh(pane, windowMaterial, windows.length);
  windows.forEach((spec, index) => panes.setMatrixAt(index, spec.matrix));
  panes.frustumCulled = false;
  group.add(panes);

  return {
    group,
    stone: geometries,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      pane.dispose();
      windowMaterial.dispose();
      panes.dispose();
    },
  };
}

/**
 * Points on the Academy's camera-facing stone, area-weighted (for the castle greenery's ivy):
 * faces turned toward +z or sideways, below `maxHeight`, in a noise-clustered
 * pattern so the green grows in patches, not evenly.
 */
function stonePoints(stone: THREE.BufferGeometry[], count: number, random: () => number, accept: (point: THREE.Vector3, normal: THREE.Vector3) => boolean): { point: THREE.Vector3; normal: THREE.Vector3 }[] {
  const triangles: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; normal: THREE.Vector3; area: number }[] = [];
  let total = 0;
  for (const geometry of stone) {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(position, i);
      const b = new THREE.Vector3().fromBufferAttribute(position, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(position, i + 2);
      const cross = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const area = cross.length() / 2;
      if (area < 1) continue;
      const normal = cross.normalize();
      if (normal.z < 0.15 && Math.abs(normal.x) < 0.6) continue;
      if (Math.abs(normal.y) > 0.6) continue;
      triangles.push({ a, b, c, normal, area });
      total += area;
    }
  }
  // Area-weighted picks by binary search over the running total.
  const running: number[] = [];
  let sum = 0;
  for (const triangle of triangles) running.push((sum += triangle.area));
  const points: { point: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  let guard = count * 40;
  while (points.length < count && guard-- > 0) {
    const pick = random() * total;
    let low = 0;
    let high = running.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (running[middle] < pick) low = middle + 1;
      else high = middle;
    }
    const triangle = triangles[low];
    let u = random();
    let v = random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const point = triangle.a.clone().addScaledVector(new THREE.Vector3().subVectors(triangle.b, triangle.a), u).addScaledVector(new THREE.Vector3().subVectors(triangle.c, triangle.a), v);
    if (accept(point, triangle.normal)) points.push({ point, normal: triangle.normal });
  }
  return points;
}

export { ACADEMY_HALF_WIDTH, ACADEMY_TOP, CASTLE_DESIGNS, createAcademy, stonePoints };
export type { CastleDesign };
export type { Academy };
