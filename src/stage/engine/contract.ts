import type * as THREE from 'three';
import type { StagePalette } from './palette';
import type { StageTierParams } from './quality';

/**
 * The hellscape's method (Nodestra `hell-src/scene/contract.ts`): the stage
 * is a set of ASSET CLASSES, each with 2–4 clearly different options. The
 * dev-only lab (`/lab.html`) switches them live; the landing uses the picks.
 */

type AssetOption = {
  /** Stable id used in the exported selection. */
  id: string;
  label: string;
  /** One line: what makes this option different. */
  description: string;
};

type AssetClass = {
  id: string;
  label: string;
  options: readonly AssetOption[];
  current(): string;
  setOption(id: string): void;
  /** Per-frame update: t seconds since the stage began, dt seconds. */
  update?(t: number, dt: number): void;
  /** The runtime ladder's mote budget (classes without motes ignore it). */
  setMoteBudget?(count: number): void;
  /** The canvas changed shape (props re-lay out to frame the page). */
  setAspect?(aspect: number): void;
  /** Redraw anything drawn only once (a baked texture) after a lost WebGL
   *  context comes back. */
  restore?(): void;
  dispose(): void;
};

/** Shared, per-frame uniforms every world shader may read. */
type StageUniforms = {
  uTime: { value: number };
};

type StageContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  palette: StagePalette;
  tier: StageTierParams;
  uniforms: StageUniforms;
};

export type { AssetClass, AssetOption, StageContext, StageUniforms };
