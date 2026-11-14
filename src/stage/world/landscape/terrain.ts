import * as THREE from 'three';
import { fbm3, TAU } from './kit';

/**
 * The ground the Academy stands on: a hill (a plateau for the Academy, its
 * outline and slopes broken by noise, its edge sinking below the floor into
 * the mist). (The floating island and the far ridge of the five-scene round
 * are archived in `themes/clearsky-landscape-v1`.) Pure geometry with a per-vertex tint (grass on the flats,
 * rock on the steeps) and a `heightAt` for planting trees.
 */

type HillOptions = {
  /** Outer radius (m) — the outline wanders ±25 % round it. */
  radius: number;
  /** The plateau: its radius and height (m). */
  plateau: number;
  height: number;
  /** How far below the floor the edge sinks (m). */
  sink?: number;
  seed: number;
  /** Surface bumps (m). */
  roughness?: number;
  /** Squash in depth (the hill is seen edge-on; a deep hill wastes triangles). */
  depthScale?: number;
};

type Ground = {
  geometry: THREE.BufferGeometry;
  /** The ground's height (m) at local (x, z); -Infinity off it. */
  heightAt(x: number, z: number): number;
  /** The slope there (0 flat … 1 vertical). */
  slopeAt(x: number, z: number): number;
};

const GRASS = new THREE.Color('#2a4a44');
const ROCK = new THREE.Color('#4a4f6e');

function hillHeight(options: HillOptions, x: number, z: number): number {
  const depth = options.depthScale ?? 1;
  const zz = z / depth;
  const r = Math.hypot(x, zz);
  const theta = Math.atan2(zz, x);
  const outline = options.radius * (0.78 + 0.45 * fbm3(Math.cos(theta) * 1.3 + options.seed, Math.sin(theta) * 1.3, options.seed * 0.7, 3));
  if (r > outline) return -(options.sink ?? 12);
  const s = THREE.MathUtils.smoothstep(r, options.plateau, outline);
  const shoulder = Math.pow(1 - s, 1.7);
  const bumps = (fbm3(x * 0.012 + options.seed, z * 0.012, options.seed, 4) - 0.5) * 2 * (options.roughness ?? 14);
  return -(options.sink ?? 12) + (options.height + (options.sink ?? 12)) * shoulder + bumps * Math.min(1, s * 3) * shoulder;
}

/** A polar-grid hill: dense near the plateau's edge, where its silhouette is. */
function createHill(options: HillOptions): Ground {
  const rings = 40;
  const around = 120;
  const reach = options.radius * 1.3;
  const positions: number[] = [];
  const indices: number[] = [];
  const depth = options.depthScale ?? 1;
  for (let i = 0; i <= rings; i++) {
    const r = reach * Math.pow(i / rings, 1.15);
    for (let j = 0; j < around; j++) {
      const a = (j / around) * TAU;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * depth;
      positions.push(x, hillHeight(options, x, z), z);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      const c = a + around;
      const d = b + around;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  tintBySlope(geometry);
  const heightAt = (x: number, z: number) => hillHeight(options, x, z);
  return { geometry, heightAt, slopeAt: (x, z) => slope(heightAt, x, z) };
}

function slope(heightAt: (x: number, z: number) => number, x: number, z: number): number {
  const e = 3;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz);
}

/** Grass on the flats, rock on the steeps (the vertex `color` the land material reads). */
function tintBySlope(geometry: THREE.BufferGeometry) {
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const colours = new Float32Array(normal.count * 3);
  const colour = new THREE.Color();
  for (let i = 0; i < normal.count; i++) {
    const steep = THREE.MathUtils.smoothstep(Math.abs(normal.getY(i)), 0.9, 0.55);
    colour.copy(GRASS).lerp(ROCK, steep);
    colours.set([colour.r, colour.g, colour.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
}

export { createHill };
export type { Ground, HillOptions };
