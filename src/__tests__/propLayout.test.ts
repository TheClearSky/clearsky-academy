import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HORIZON_FROM_TOP, lensShiftFor, stageFov } from '../stage/engine/lensShift';
import { BOOK_EULER_ORDER, CORRIDOR_HALF_WIDTH, EYE_HEIGHT, OPEN_BOOK_FRACTION, PORTRAIT_BAND_BOTTOM, propLayout } from '../stage/world/props/propLayout';
import type { Placement } from '../stage/world/props/propLayout';

function stageCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(stageFov(aspect), aspect, 0.1, 5000);
  camera.position.set(0, EYE_HEIGHT, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = lensShiftFor(HORIZON_FROM_TOP);
  return camera;
}

function onScreen(camera: THREE.PerspectiveCamera, placement: Placement) {
  const ndc = new THREE.Vector3(placement.x, placement.y, placement.z).project(camera);
  return { fromLeft: (ndc.x + 1) / 2, fromTop: (1 - ndc.y) / 2 };
}

const counts = { books: 24, candles: 20 };

describe('propLayout', () => {
  it('makes the requested numbers of props, most of the books open', () => {
    const layout = propLayout(16 / 9, counts);
    expect(layout.closedBooks.length + layout.openBooks.length).toBe(24);
    expect(layout.openBooks).toHaveLength(Math.round(24 * OPEN_BOOK_FRACTION));
    expect(layout.openBooks.length).toBeGreaterThan(layout.closedBooks.length);
    expect(layout.candles).toHaveLength(20);
    expect(layout.chess.map((entry) => entry.piece)).toEqual(['rook', 'knight', 'bishop', 'pawn']);
  });

  it('keeps the centre corridor clear in landscape (books and candles in the side clusters)', () => {
    for (const aspect of [16 / 9, 4 / 3, 21 / 9]) {
      const camera = stageCamera(aspect);
      const layout = propLayout(aspect, counts);
      for (const placement of [...layout.closedBooks, ...layout.openBooks, ...layout.candles]) {
        const spot = onScreen(camera, placement);
        expect(Math.abs(spot.fromLeft - 0.5)).toBeGreaterThanOrEqual(CORRIDOR_HALF_WIDTH - 1e-6);
        expect(spot.fromLeft).toBeGreaterThan(0);
        expect(spot.fromLeft).toBeLessThan(1);
        expect(spot.fromTop).toBeLessThan(HORIZON_FROM_TOP);
      }
    }
  });

  it('moves the floating props into a band across the top on a portrait screen', () => {
    const aspect = 390 / 844;
    const camera = stageCamera(aspect);
    const layout = propLayout(aspect, counts);
    for (const placement of [...layout.closedBooks, ...layout.openBooks, ...layout.candles]) {
      expect(onScreen(camera, placement).fromTop).toBeLessThanOrEqual(PORTRAIT_BAND_BOTTOM + 1e-6);
    }
  });

  it('stands the chair and the chess pieces ON the floor, the chess far off near the horizon', () => {
    const camera = stageCamera(16 / 9);
    const layout = propLayout(16 / 9, counts);
    expect(layout.chair.y).toBe(0);
    const chairSpot = onScreen(camera, layout.chair);
    expect(chairSpot.fromLeft).toBeLessThan(0.2);
    // Its feet are on screen (not below the bottom edge).
    expect(chairSpot.fromTop).toBeLessThan(1);
    for (const piece of layout.chess) {
      expect(piece.y).toBe(0);
      expect(-piece.z).toBeGreaterThanOrEqual(32);
      expect(onScreen(camera, piece).fromTop).toBeGreaterThan(HORIZON_FROM_TOP);
    }
  });

  it('turns the books steeply and variously — upright, diagonal and level spines, never mostly flat', () => {
    const layout = propLayout(16 / 9, counts);
    const axes = (placement: Placement) => {
      const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(placement.pitch, placement.yaw, placement.roll, BOOK_EULER_ORDER));
      return {
        spine: new THREE.Vector3(0, 1, 0).applyMatrix4(rotation),
        spread: new THREE.Vector3(1, 0, 0).applyMatrix4(rotation),
        cover: new THREE.Vector3(0, 0, 1).applyMatrix4(rotation),
      };
    };
    const spineTilts = [...layout.openBooks, ...layout.closedBooks].map((placement) => Math.acos(Math.abs(axes(placement).spine.y)));
    // Some spines near upright, some steeply diagonal, some near level.
    expect(spineTilts.filter((tilt) => tilt < 0.45).length).toBeGreaterThanOrEqual(3);
    expect(spineTilts.filter((tilt) => tilt > 0.6 && tilt < 1.0).length).toBeGreaterThanOrEqual(3);
    expect(spineTilts.filter((tilt) => tilt > 1.0).length).toBeGreaterThanOrEqual(3);
    // No open book lies flat with its spread facing straight up or down.
    for (const placement of layout.openBooks) expect(Math.abs(axes(placement).spread.y)).toBeLessThan(0.7);
    // Few closed books lie flat (their covers facing up or down) at rest.
    const flatClosed = layout.closedBooks.filter((placement) => Math.abs(axes(placement).cover.y) > Math.cos(0.5));
    expect(flatClosed.length).toBeLessThanOrEqual(Math.ceil(layout.closedBooks.length / 3));
    // Open books mostly turn their spreads toward the viewer (at the origin).
    const facing = layout.openBooks.filter((placement) => {
      const toViewer = new THREE.Vector3(-placement.x, 0, -placement.z).normalize();
      return axes(placement).spread.dot(toViewer) > 0.3;
    });
    expect(facing.length).toBeGreaterThan(layout.openBooks.length / 2);
  });

  it('is deterministic', () => {
    expect(propLayout(16 / 9, counts)).toEqual(propLayout(16 / 9, counts));
  });
});
