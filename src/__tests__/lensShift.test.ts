import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HORIZON_FROM_TOP, lensShiftFor, stageFov } from '../stage/engine/lensShift';

/** Where a world point lands on screen, as a fraction of the height from the top. */
function screenFromTop(camera: THREE.PerspectiveCamera, point: THREE.Vector3): number {
  const ndc = point.clone().project(camera);
  return (1 - ndc.y) / 2;
}

function shiftedCamera(aspect: number, fromTop: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(stageFov(aspect), aspect, 0.1, 5000);
  camera.position.set(0, 2.4, 0);
  camera.lookAt(0, 2.4, -1);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = lensShiftFor(fromTop);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return camera;
}

describe('lensShiftFor', () => {
  it('puts a far point straight ahead (the horizon) at the requested height, in landscape and portrait', () => {
    for (const aspect of [16 / 9, 390 / 844]) {
      const camera = shiftedCamera(aspect, HORIZON_FROM_TOP);
      expect(screenFromTop(camera, new THREE.Vector3(0, 2.4, -4000))).toBeCloseTo(HORIZON_FROM_TOP, 3);
    }
  });

  it('is no shift at all for a centred horizon', () => {
    expect(lensShiftFor(0.5)).toBe(0);
  });

  it('keeps verticals vertical: a post straight ahead projects to one screen x along its height', () => {
    const camera = shiftedCamera(16 / 9, HORIZON_FROM_TOP);
    const bottom = new THREE.Vector3(1.5, 0, -10).project(camera);
    const top = new THREE.Vector3(1.5, 5, -10).project(camera);
    expect(top.x).toBeCloseTo(bottom.x, 6);
  });

  it('round-trips through the inverse (unproject finds the same point)', () => {
    const camera = shiftedCamera(16 / 9, HORIZON_FROM_TOP);
    const point = new THREE.Vector3(-2, 1, -12);
    const back = point.clone().project(camera).unproject(camera);
    expect(back.distanceTo(point)).toBeLessThan(1e-3);
  });
});

describe('stageFov', () => {
  it('is 60° in landscape and 75° in portrait', () => {
    expect(stageFov(16 / 9)).toBe(60);
    expect(stageFov(1)).toBe(60);
    expect(stageFov(0.46)).toBe(75);
  });
});
