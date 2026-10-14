import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HORIZON_FROM_TOP, lensShiftFor, stageFov } from '../stage/engine/lensShift';
import { worldXForScreen, worldYForScreen } from '../stage/engine/screenSpace';

const EYE = 2.4;

function stageCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(stageFov(aspect), aspect, 0.1, 5000);
  camera.position.set(0, EYE, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = lensShiftFor(HORIZON_FROM_TOP);
  return camera;
}

describe('worldXForScreen / worldYForScreen', () => {
  for (const aspect of [16 / 9, 4 / 3, 390 / 844]) {
    it(`land exactly where asked on the real stage camera (aspect ${aspect.toFixed(2)})`, () => {
      const camera = stageCamera(aspect);
      for (const [fromLeft, fromTop, distance] of [
        [0.1, 0.2, 12],
        [0.85, 0.15, 25],
        [0.5, 0.9, 5],
        [0.3, HORIZON_FROM_TOP, 40],
      ]) {
        const world = new THREE.Vector3(
          worldXForScreen(fromLeft, distance, camera.fov, aspect),
          worldYForScreen(fromTop, distance, camera.fov, EYE),
          -distance,
        );
        const ndc = world.project(camera);
        expect((ndc.x + 1) / 2).toBeCloseTo(fromLeft, 6);
        expect((1 - ndc.y) / 2).toBeCloseTo(fromTop, 6);
      }
    });
  }

  it('puts the horizon line at eye height at any distance', () => {
    for (const distance of [3, 30, 300]) expect(worldYForScreen(HORIZON_FROM_TOP, distance, 60, EYE)).toBeCloseTo(EYE, 9);
  });

  it('is the centre column at x = 0', () => {
    expect(worldXForScreen(0.5, 20, 60, 16 / 9)).toBe(0);
  });
});
