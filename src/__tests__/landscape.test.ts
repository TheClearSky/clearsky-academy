import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HORIZON_FROM_TOP, lensShiftFor, stageFov } from '../stage/engine/lensShift';
import { createPalette } from '../stage/engine/palette';
import { STAGE_TIERS } from '../stage/engine/quality';
import type { StageContext } from '../stage/engine/contract';
import { create as createLandscape } from '../stage/world/landscape';
import { ACADEMY_TOP } from '../stage/world/landscape/academy';

const SCENES = ['grove', 'blossom'] as const;

function context(tier: keyof typeof STAGE_TIERS): StageContext {
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: {} as THREE.WebGLRenderer,
    palette: createPalette(),
    tier: STAGE_TIERS[tier],
    uniforms: { uTime: { value: 0 } },
    worldBuffer: new THREE.Vector2(1440, 900),
  };
}

function stageCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(stageFov(aspect), aspect, 0.1, 5000);
  camera.position.set(0, 2.4, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = lensShiftFor(HORIZON_FROM_TOP);
  return camera;
}

describe('landscape', () => {
  it('builds every scene on every tier with finite geometry', { timeout: 120000 }, () => {
    const timings: string[] = [];
    for (const tier of ['high', 'low'] as const) {
      for (const id of SCENES) {
        const ctx = context(tier);
        const landscape = createLandscape(ctx);
        const start = performance.now();
        landscape.setOption(id);
        timings.push(`${id}/${tier}: ${Math.round(performance.now() - start)} ms`);
        landscape.setAspect?.(16 / 9);
        let meshes = 0;
        ctx.scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          meshes++;
          const position = object.geometry.getAttribute('position') as THREE.BufferAttribute;
          // A NaN anywhere blacks the frame through the bloom.
          expect((position.array as Float32Array).every(Number.isFinite), `${id}: ${object.name || object.type}`).toBe(true);
        });
        expect(meshes, `${id} on ${tier}`).toBeGreaterThan(5);
        landscape.dispose();
      }
    }
    console.log(timings.join(' | '));
  });

  it('stands the Academy off-centre on a wide screen, centred on a tall one, its spire under the header', () => {
    const ctx = context('high');
    const landscape = createLandscape(ctx);
    landscape.setOption('grove');
    const academy = () => ctx.scene.getObjectByName('academy')!;
    for (const [aspect, wantLeft] of [
      [16 / 9, 0.78],
      [390 / 844, 0.5],
    ] as const) {
      landscape.setAspect?.(aspect);
      ctx.scene.updateMatrixWorld(true);
      const camera = stageCamera(aspect);
      const foot = new THREE.Vector3().setFromMatrixPosition(academy().matrixWorld).project(camera);
      expect((foot.x + 1) / 2).toBeCloseTo(wantLeft, 2);
      const spire = academy().localToWorld(new THREE.Vector3(0, ACADEMY_TOP, -12)).project(camera);
      // Below the header (~10 % of the screen), above the horizon.
      expect((1 - spire.y) / 2).toBeGreaterThan(0.1);
      expect((1 - spire.y) / 2).toBeLessThan(HORIZON_FROM_TOP);
    }
    landscape.dispose();
  });

  it('keeps the mid-ground woods off the centre column (the logo, title, button and circle)', () => {
    const ctx = context('high');
    const landscape = createLandscape(ctx);
    landscape.setOption('blossom');
    const aspect = 16 / 9;
    landscape.setAspect?.(aspect);
    ctx.scene.updateMatrixWorld(true);
    const camera = stageCamera(aspect);
    const matrix = new THREE.Matrix4();
    let checked = 0;
    const clear = (at: THREE.Vector3) => {
      at.project(camera);
      expect(Math.abs((at.x + 1) / 2 - 0.5)).toBeGreaterThanOrEqual(0.15 - 1e-6);
      checked++;
    };
    ctx.scene.traverse((object) => {
      // The instanced band (the pines) …
      if (object instanceof THREE.InstancedMesh && object.parent?.name === 'landscape') {
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix);
          clear(new THREE.Vector3().setFromMatrixPosition(matrix));
        }
      }
      // … and the painted band (each tree a holder with its height in userData).
      if (typeof object.userData.height === 'number') clear(new THREE.Vector3().setFromMatrixPosition(object.matrixWorld));
    });
    expect(checked).toBeGreaterThan(20);
    landscape.dispose();
  });
});
