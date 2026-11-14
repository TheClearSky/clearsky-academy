import * as THREE from 'three';
import { stageFov } from '../../engine/lensShift';
import { seededRandom } from '../../engine/random';
import { worldBufferSize } from '../../engine/contract';
import { worldXForScreen } from '../../engine/screenSpace';
import type { AssetClass, AssetOption, StageContext } from '../../engine/contract';
import { createAcademy, stonePoints } from './academy';
import type { CastleDesign } from './academy';
import { createLandMaterial, fbm3 } from './kit';
import { createHill } from './terrain';
import type { Ground } from './terrain';
import { createPaintedClumps, createPaintedTree } from './painted';
import type { Clump, PaintedKind } from './painted';
import { createPetals, plantWood, speciesGeometry } from './trees';
import type { Planting, Species } from './trees';

/**
 * Landscape class: the scene's ANCHOR — ClearSky Academy on the horizon —
 * and the land and vegetation it grows from (Deepak, 2026-10-17: "acedemy
 * seems great, can we also explore some prodedural tree or vegitation and
 * its combination with the acedemy? I want it to look organic and not
 * forced, create 5 scenes"). Of the five, Deepak kept two ("keep groove and
 * blossom, and give user a toggle at top right" — the visitor switches them,
 * `site/LandscapeToggle.tsx`; the other three are archived in
 * `themes/clearsky-landscape-v1`):
 *
 *  - `grove`     on a gentle rise in a broadleaf wood, framed by a giant old
 *                oak in the near left (the painter's repoussoir);
 *  - `blossom`   among pale blossom trees glowing in the moonlight, a near
 *                blossom tree, petals drifting through the near air.
 *
 * Placement (the anchor brief's Q2 recommendation, (c)): on a wide screen
 * the Academy stands off-centre on the right third, cropped by nothing but
 * its own woods; on a portrait screen it is centred and smaller (there is no
 * room for an off-centre mass). It stands 480 m out, behind everything the
 * stage already has; the stage's ground mist swallows its foot, its own thin
 * haze keeps it present (`kit.ts`).
 */

const OPTIONS: readonly AssetOption[] = [
  { id: 'none', label: 'None', description: 'No landscape: the open horizon.' },
  { id: 'grove', label: 'Oak grove', description: 'The Academy on a rise in a broadleaf wood, framed by a giant old oak near the left.' },
  { id: 'blossom', label: 'Blossom', description: 'Pale blossom trees in moonlight, a near blossom tree, petals drifting through the air.' },
];

/** The Academy's distance (m) and haze (exp², 1/m); a near hero tree's. */
const ACADEMY_DISTANCE = 480;
const FAR_HAZE = 0.0011;
const NEAR_HAZE = 0.003;

const COLOURS = {
  conifer: '#183333',
  broadleaf: '#2c5a4a',
  poplar: '#1b3935',
  blossom: '#e3b6cf',
  bark: '#241e24',
};

type Built = {
  /** Positioned with the Academy (480 m out). */
  far: THREE.Group;
  /** Positioned in camera terms (hero trees near the frame's edge). */
  near: THREE.Group;
  place(aspect: number): void;
  update?(viewport: THREE.Vector2): void;
  dispose(): void;
};

type Kit = {
  context: StageContext;
  time: { value: number };
  /** Plant counts scale with the tier (phones draw fewer). */
  density: number;
  disposables: { dispose(): void }[];
  /** The mid-ground bands (re-laid out with the aspect). */
  bands: Band[];
};

function material(kit: Kit, albedo: string, haze: number, extra: Partial<Parameters<typeof createLandMaterial>[2]> = {}) {
  const made = createLandMaterial(kit.context.palette, kit.time, { albedo, haze, ...extra });
  kit.disposables.push(made);
  return made;
}

function mesh(kit: Kit, geometry: THREE.BufferGeometry, made: THREE.Material): THREE.Mesh {
  kit.disposables.push(geometry);
  const result = new THREE.Mesh(geometry, made);
  result.frustumCulled = false;
  return result;
}

/** Trees over a ground: n tries, kept where it is not too steep, above the floor and off the Academy's footprint. */
function plantings(ground: Ground, count: number, random: () => number, area: { radius: number; depth: number; inner?: number }, scale: [number, number], avoidAcademy = true): Planting[] {
  const result: Planting[] = [];
  let guard = count * 12;
  while (result.length < count && guard-- > 0) {
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(THREE.MathUtils.lerp((area.inner ?? 0) ** 2, area.radius ** 2, random()));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * area.depth;
    if (avoidAcademy && Math.abs(x) < 215 && z > -75 && z < 48) continue;
    const y = ground.heightAt(x, z);
    if (y < -1 || ground.slopeAt(x, z) > 0.45) continue;
    // Woods grow in stands, with glades between.
    if (fbm3(x * 0.006 + 3, z * 0.006, 1.3, 3) < 0.38) continue;
    result.push({ x, y: y - 0.5, z, scale: THREE.MathUtils.lerp(scale[0], scale[1], random() ** 1.5), yaw: random() * Math.PI * 2, shade: 0.75 + random() * 0.4 });
  }
  return result;
}

function wood(kit: Kit, group: THREE.Group, species: Species, list: Planting[], albedo: string, haze = FAR_HAZE, seed = 1, glow = 0) {
  if (list.length === 0) return;
  const made = material(kit, albedo, haze, { vertexTint: true, rim: 0.7, grain: 0.35, sway: { amount: 0.012, height: 1 }, glow });
  const trees = plantWood(species, list, made, seed);
  kit.disposables.push(trees.geometry, trees);
  group.add(trees);
}

/** A painted hero tree (`painted.ts`, Nodestra's trees) `height` m tall, its foot at the origin. */
function heroTree(kit: Kit, kind: PaintedKind, height: number, seed: number, haze: number): THREE.Group {
  const tree = createPaintedTree(kind, seed, kit.context.palette, kit.time, haze, kit.density < 1 ? 0.65 : 1);
  kit.disposables.push(tree);
  tree.group.scale.setScalar(height / tree.height);
  const holder = new THREE.Group();
  holder.add(tree.group);
  return holder;
}

/** The Academy on its plateau. */
function academyOn(kit: Kit, group: THREE.Group, footY: number, scale = 1, haze = FAR_HAZE, design: CastleDesign = 'night') {
  const academy = createAcademy(kit.context.palette, kit.time, haze, 3, design);
  academy.group.position.y = footY;
  academy.group.scale.setScalar(scale);
  kit.disposables.push(academy);
  group.add(academy.group);
  return academy;
}

function hill(kit: Kit, group: THREE.Group, options: Parameters<typeof createHill>[0], at: THREE.Vector3 = new THREE.Vector3()): Ground {
  const ground = createHill(options);
  const land = mesh(kit, ground.geometry, material(kit, '#ffffff', FAR_HAZE, { vertexTint: true, rim: 0.45, grain: 0.8 }));
  land.position.copy(at);
  group.add(land);
  return { ...ground, heightAt: (x, z) => ground.heightAt(x - at.x, z - at.z) + at.y, slopeAt: (x, z) => ground.slopeAt(x - at.x, z - at.z) };
}

/** Plantings that belong to a hill placed at `at` (positions in the group's frame). */
function plantOn(ground: Ground, at: THREE.Vector3, count: number, random: () => number, radius: number, depth: number, scale: [number, number]): Planting[] {
  const shifted: Ground = { ...ground, heightAt: (x, z) => ground.heightAt(x + at.x, z + at.z), slopeAt: (x, z) => ground.slopeAt(x + at.x, z + at.z) };
  return plantings(shifted, count, random, { radius, depth }, scale, false).map((p) => ({ ...p, x: p.x + at.x, z: p.z + at.z }));
}

// ── the mid-ground woods ────────────────────────────────────────────────

/**
 * A band of trees 160–340 m out, standing in stands either side of the
 * centre column (the logo, the title, the button and the summoning circle
 * stay clear) and in front of the Academy's foot. At the Academy's scale
 * (a 256 m spire) its own woods are moss; these are what make the
 * vegetation READ, rising out of the mist between the board and the
 * Academy. Placed by screen position, so they re-lay out with the aspect.
 */
type BandItem = { fromLeft: number; distance: number; scale: number; yaw: number; shade: number };
/** A band's trees: one instanced mesh (conifers) or painted trees (broadleaf, blossom). */
type Band = { items: BandItem[]; set(index: number, position: THREE.Vector3, rotation: THREE.Quaternion, scale: THREE.Vector3): void; done(): void };

const BAND_HAZE = 0.0018;
/** The centre column the band keeps clear (fraction of the width, each side of centre). */
const BAND_CLEAR = 0.15;

function bandItems(count: number, random: () => number, options: { distance: [number, number]; scale: [number, number]; right?: number }): BandItem[] {
  const items: BandItem[] = [];
  let guard = count * 30;
  while (items.length < count && guard-- > 0) {
    // More on the right (in front of the Academy's foot) than the left, by `right`.
    const onRight = random() < (options.right ?? 0.6);
    const fromLeft = onRight ? 0.5 + BAND_CLEAR + random() * (0.58 - BAND_CLEAR) : 0.5 - BAND_CLEAR - random() * (0.58 - BAND_CLEAR);
    const distance = THREE.MathUtils.lerp(options.distance[0], options.distance[1], random() ** 0.7);
    // In stands, with glades between.
    if (fbm3(fromLeft * 9 + 2.1, distance * 0.012, 4.4, 3) < 0.42) continue;
    items.push({ fromLeft, distance, scale: THREE.MathUtils.lerp(options.scale[0], options.scale[1], random() ** 1.3), yaw: random() * Math.PI * 2, shade: 0.75 + random() * 0.4 });
  }
  return items;
}

/** An instanced band of one species (the conifers). */
function band(kit: Kit, species: Species, count: number, colour: string, random: () => number, options: { distance: [number, number]; scale: [number, number]; glow?: number; right?: number }) {
  const items = bandItems(count, random, options);
  const made = material(kit, colour, BAND_HAZE, { vertexTint: true, rim: 0.7, grain: 0.35, sway: { amount: 0.015, height: 1 }, glow: options.glow ?? 0 });
  const trees = new THREE.InstancedMesh(speciesGeometry(species, items.length + 7), made, Math.max(1, items.length));
  trees.count = items.length;
  trees.frustumCulled = false;
  const colours = new THREE.Color();
  items.forEach((item, index) => trees.setColorAt(index, colours.setScalar(item.shade)));
  kit.disposables.push(trees.geometry, trees);
  const matrix = new THREE.Matrix4();
  kit.bands.push({
    items,
    set(index, position, rotation, scale) {
      // A little narrower or wider than tall.
      scale.x *= 0.85 + ((index * 0.618) % 1) * 0.35;
      scale.z = scale.x;
      trees.setMatrixAt(index, matrix.compose(position, rotation, scale));
    },
    done() {
      trees.instanceMatrix.needsUpdate = true;
    },
  });
  return trees;
}

/**
 * A band of PAINTED trees (broadleaf → oak, blossom): four variants, shared
 * by every tree in the band, with a quarter of the hero tree's cards at
 * twice the size — at 170–340 m a leaf is sub-pixel, the crown reads the same.
 */
function paintedBand(kit: Kit, kind: PaintedKind, count: number, random: () => number, options: { distance: [number, number]; scale: [number, number]; right?: number }) {
  const items = bandItems(count, random, options);
  const group = new THREE.Group();
  const variants = [0, 1, 2, 3].map((v) => {
    const tree = createPaintedTree(kind, 700 + v * 37 + Math.floor(random() * 100), kit.context.palette, kit.time, BAND_HAZE, kit.density < 1 ? 0.16 : 0.24, 1.9);
    kit.disposables.push(tree);
    return tree;
  });
  const holders = items.map((_, index) => {
    const variant = variants[index % variants.length];
    const holder = variant.group.clone();
    holder.userData.height = variant.height;
    group.add(holder);
    return holder;
  });
  kit.bands.push({
    items,
    set(index, position, rotation, scale) {
      const holder = holders[index];
      holder.position.copy(position);
      holder.quaternion.copy(rotation);
      // Painted trees are built in their own units: scale to the band's height (uniformly).
      holder.scale.setScalar(scale.y / (holder.userData.height as number));
    },
    done() {},
  });
  return group;
}

function placeBands(bands: Band[], aspect: number) {
  const fov = stageFov(aspect);
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const band of bands) {
    band.items.forEach((item, index) => {
      band.set(index, new THREE.Vector3(worldXForScreen(item.fromLeft, item.distance, fov, aspect), -1, -item.distance), rotation.setFromAxisAngle(up, item.yaw), new THREE.Vector3(item.scale, item.scale, item.scale));
    });
    band.done();
  }
}

// ── the castle greenery ──────────────────────────────────────────────────

/**
 * Greenery growing ON the Academy, as painted as the woods (Deepak,
 * 2026-10-17: "add a temporary variation to both the scenes … with some
 * vegitation on the castle too, use high quality as other vegitation", then
 * "keep castle greenery on" — part of both scenes since):
 *
 *  - IVY: painted leaf clusters climbing the camera-facing walls in patches
 *    (thick low down, thinning up the towers), each a clump of leaf cards
 *    with a lobe so neighbours shade as one mass; on the blossom scene a
 *    share of them is climbing blossom;
 *  - VINES: strands of small clusters trailing from the curtain wall and the
 *    library's eaves;
 *  - TREES on the castle: painted trees on the wall walk and in the library's
 *    court, and a great one grown up through the court beside the great tower.
 *
 * 480 m out a leaf is sub-pixel: the clusters take few, big cards (as the far
 * band does). `footY` lifts the castle-relative points onto its plateau.
 */
function castleGreenery(kit: Kit, far: THREE.Group, stone: THREE.BufferGeometry[], footY: number, kind: PaintedKind) {
  const random = seededRandom(kind === 'oak' ? 71 : 73);
  // Roots low on the walls (in noise patches); from each, a run climbs the stone.
  const points = stonePoints(stone, Math.round(120 * Math.max(0.5, kit.density)), random, (p) => {
    const patch = fbm3(p.x * 0.018 + 1.7, p.y * 0.022, p.z * 0.018, 3);
    return p.y < 120 && patch > 0.44 + (p.y / 260) * 0.3;
  });
  const ivy: Clump[] = [];
  const climbing: Clump[] = [];
  points.forEach(({ point, normal }, index) => {
    // On the blossom scene, two runs in five are climbing blossom.
    const list = kind === 'blossom' && index % 5 < 2 ? climbing : ivy;
    const base = 2.4 + random() * 1.6;
    const climb = 2 + Math.floor(random() * 4);
    const drift = (random() - 0.5) * 1.6;
    for (let k = 0; k < climb; k++) {
      // Narrowing as it climbs, wandering a little sideways.
      const radius = base * (1 - k * 0.14);
      const along = new THREE.Vector3(-normal.z, 0, normal.x).multiplyScalar(drift * k);
      // Proud of the wall, so the clump reads as growth, half of it hidden in the stone.
      const centre = point
        .clone()
        .addScaledVector(normal, radius * 0.45)
        .add(along)
        .add(new THREE.Vector3(0, footY + k * base * 1.15, 0));
      const clump: Clump = { centre, radius };
      clump.lobe = { centre: centre.clone().addScaledVector(normal, -radius * 0.6), radius: radius * 2 };
      list.push(clump);
    }
  });
  // Vines: from the curtain wall's top and the library's eaves, strands of small clusters falling.
  const vines: Clump[] = [];
  const anchor = (x: number, y: number, z: number) => {
    const fall = 10 + random() * 26;
    const steps = Math.max(2, Math.round(fall / 4));
    for (let k = 0; k < steps; k++) {
      const t = k / (steps - 1);
      vines.push({ centre: new THREE.Vector3(x + Math.sin(t * 2 + x) * 1.2, y + footY - t * fall, z + 1.8), radius: 2.1 - t * 0.8 });
    }
  };
  for (let i = 0; i < 18; i++) if (fbm3(i * 0.4, 2.2, 0.7, 2) > 0.44) anchor(-62 + i * 7.3, 46, 34.6);
  for (let i = 0; i < 14; i++) if (fbm3(i * 0.5, 5.2, 0.1, 2) > 0.42) anchor(-184 + i * 6.6, 58, 17.4);
  const cards = { density: 3, size: [1.7, 2.6] as [number, number], flatten: 0.9, shell: 3 };
  const add = (painted: PaintedKind, clumps: Clump[], seed: number) => {
    if (clumps.length === 0) return;
    const clusters = createPaintedClumps(painted, clumps, cards, seed, kit.context.palette, kit.time, FAR_HAZE);
    kit.disposables.push(clusters);
    far.add(clusters.mesh);
  };
  add('oak', ivy, 81);
  add('blossom', climbing, 83);
  add('oak', vines, 85);
  // Trees on the castle: the wall walk, the library's court, and a great one through the court.
  for (const [x, y, z, height, seed] of [
    [-40, 46, 22, 17, 401],
    [52, 46, 22, 15, 403],
    [-120, 58, -24, 22, 405],
    [44, 0, -40, 78, 407],
  ] as const) {
    const tree = createPaintedTree(kind, seed, kit.context.palette, kit.time, FAR_HAZE, 0.3, 1.8);
    kit.disposables.push(tree);
    tree.group.scale.setScalar(height / tree.height);
    tree.group.position.set(x, y + footY, z);
    far.add(tree.group);
  }
}

// ── the scenes ──────────────────────────────────────────────────────────

type SceneParts = Omit<Built, 'place'> & {
  /** Where the near group stands: across the screen (wide / tall) and how far out (m). */
  nearAt?: { fromLeft: number; portraitFromLeft: number; distance: number };
  /** Where the Academy's group stands (default: 480 m out, 0.78 across; centred on a tall screen). */
  farAt?: { fromLeft: number; distance: number };
  /** Objects in world coordinates (petals) and the mid-ground band's meshes. */
  extras?: THREE.Object3D[];
};
type Scene = (kit: Kit) => SceneParts;

const groveScene = (design: CastleDesign): Scene => (kit) => {
  const far = new THREE.Group();
  const near = new THREE.Group();
  const random = seededRandom(31);
  const ground = hill(kit, far, { radius: 400, plateau: 225, height: 30, depthScale: 0.55, seed: 7, roughness: 8 });
  const academy = academyOn(kit, far, 30, 1, FAR_HAZE, design);
  castleGreenery(kit, far, academy.stone, 30, 'oak');
  wood(kit, far, 'broadleaf', plantings(ground, Math.round(260 * kit.density), random, { radius: 520, depth: 0.55, inner: 150 }, [16, 28]), COLOURS.broadleaf, FAR_HAZE, 2);
  wood(kit, far, 'poplar', plantings(ground, Math.round(36 * kit.density), random, { radius: 330, depth: 0.55, inner: 200 }, [26, 38]), COLOURS.poplar, FAR_HAZE, 4);
  const left = new THREE.Vector3(-560, 0, -60);
  const leftHill = hill(kit, far, { radius: 320, plateau: 60, height: 24, depthScale: 0.6, seed: 12, roughness: 6 }, left);
  wood(kit, far, 'broadleaf', plantOn(leftHill, left, Math.round(170 * kit.density), random, 340, 0.6, [14, 26]), COLOURS.broadleaf, FAR_HAZE, 6);
  const woods = paintedBand(kit, 'oak', Math.round(40 * kit.density), random, { distance: [170, 340], scale: [22, 36] });
  const poplars = band(kit, 'poplar', Math.round(12 * kit.density), COLOURS.poplar, random, { distance: [200, 330], scale: [32, 46] });
  // The old oak, near the left edge.
  near.add(heroTree(kit, 'oak', 46, 77, NEAR_HAZE));
  return { far, near, dispose() {}, extras: [woods, poplars], nearAt: { fromLeft: 0.03, portraitFromLeft: -0.08, distance: 74 } };
};

const blossomScene = (design: CastleDesign): Scene => (kit) => {
  const far = new THREE.Group();
  const near = new THREE.Group();
  const random = seededRandom(51);
  const ground = hill(kit, far, { radius: 410, plateau: 225, height: 32, depthScale: 0.55, seed: 17, roughness: 9 });
  const academy = academyOn(kit, far, 32, 1, FAR_HAZE, design);
  castleGreenery(kit, far, academy.stone, 32, 'blossom');
  wood(kit, far, 'broadleaf', plantings(ground, Math.round(240 * kit.density), random, { radius: 520, depth: 0.55, inner: 150 }, [14, 24]), COLOURS.blossom, FAR_HAZE, 10, 0.22);
  wood(kit, far, 'conifer', plantings(ground, Math.round(60 * kit.density), random, { radius: 520, depth: 0.55, inner: 220 }, [18, 32]), COLOURS.conifer, FAR_HAZE, 11);
  const left = new THREE.Vector3(-560, 0, -100);
  const leftHill = hill(kit, far, { radius: 300, plateau: 60, height: 26, depthScale: 0.6, seed: 19, roughness: 6 }, left);
  wood(kit, far, 'broadleaf', plantOn(leftHill, left, Math.round(150 * kit.density), random, 320, 0.6, [12, 22]), COLOURS.blossom, FAR_HAZE, 12, 0.22);
  const woods = paintedBand(kit, 'blossom', Math.round(36 * kit.density), random, { distance: [170, 340], scale: [18, 28] });
  const pines = band(kit, 'conifer', Math.round(14 * kit.density), COLOURS.conifer, random, { distance: [200, 340], scale: [28, 44] });
  near.add(heroTree(kit, 'blossom', 30, 61, NEAR_HAZE));
  const petals = createPetals(Math.round(180 * kit.density), new THREE.Color('#f6cfe2'), kit.time, seededRandom(53));
  kit.disposables.push(petals);
  return {
    far,
    near,
    extras: [petals.mesh, woods, pines],
    update(viewport) {
      petals.viewport.value.copy(viewport);
    },
    dispose() {},
    // The umbrella crown spreads twice its height: keep it left of the title.
    nearAt: { fromLeft: -0.02, portraitFromLeft: -0.12, distance: 80 },
  };
};

// The Academy in the royal design (2026-10-17, Deepak: "pick royal").
const SCENES: Record<string, Scene> = { grove: groveScene('royal'), blossom: blossomScene('royal') };

function create(context: StageContext): AssetClass {
  const root = new THREE.Group();
  root.name = 'landscape';
  context.scene.add(root);
  const density = context.tier.tier === 'low' ? 0.4 : context.tier.tier === 'medium' ? 0.7 : 1;
  let built: Built | null = null;
  let kit: Kit | null = null;
  let current = '';
  let aspect = 16 / 9;
  const viewport = new THREE.Vector2();

  const place = () => {
    if (!built) return;
    built.place(aspect);
  };

  const setOption = (id: string) => {
    if (id === current) return;
    if (!OPTIONS.some((option) => option.id === id)) throw new Error(`[landscape] unknown option "${id}"`);
    if (kit) for (const item of kit.disposables) item.dispose();
    root.clear();
    built = null;
    kit = null;
    current = id;
    if (id === 'none') return;
    const made: Kit = { context, time: context.uniforms.uTime, density, disposables: [], bands: [] };
    kit = made;
    const scene = SCENES[id](made);
    const { nearAt, farAt } = scene;
    built = {
      ...scene,
      place(next) {
        const fov = stageFov(next);
        const portrait = next < 1;
        // The Academy: off-centre right on a wide screen (its left wing clear of the centre column),
        // centred and smaller on a tall one.
        const distance = farAt?.distance ?? ACADEMY_DISTANCE;
        scene.far.position.set(worldXForScreen(portrait ? 0.5 : (farAt?.fromLeft ?? 0.78), distance, fov, next), 0, -distance);
        scene.far.scale.setScalar(portrait ? 0.62 : 1);
        if (nearAt) {
          scene.near.position.set(worldXForScreen(portrait ? nearAt.portraitFromLeft : nearAt.fromLeft, nearAt.distance, fov, next), 0, -nearAt.distance);
          scene.near.scale.setScalar(portrait ? 0.8 : 1);
        }
        placeBands(made.bands, next);
      },
    };
    root.add(scene.far, scene.near, ...(scene.extras ?? []));
    place();
  };

  return {
    id: 'landscape',
    label: 'Landscape',
    options: OPTIONS,
    current: () => current,
    setOption,
    setAspect(next) {
      aspect = next;
      place();
    },
    update() {
      built?.update?.(worldBufferSize(context, viewport));
    },
    dispose() {
      if (kit) for (const item of kit.disposables) item.dispose();
      context.scene.remove(root);
    },
  };
}

export { create };
