import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HORIZON_FROM_TOP, lensShiftFor, stageFov } from '../stage/engine/lensShift';
import { STAGE_TIERS } from '../stage/engine/quality';
import { spellPlacement } from '../stage/world/spellTimeline';
import { BOOK_EULER_ORDER, EYE_HEIGHT, middleBand, middleDepth, OPEN_BOOK_FRACTION, orbitPoint, propCounts, propLayout, TEXT_LINE } from '../stage/world/props/propLayout';
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

  /** A carousel prop's place at time t (its orbit and its rise; no bob). */
  const at = (placement: Placement, t: number): Placement => {
    const point = orbitPoint(placement.orbit!, t, placement.y);
    return { ...placement, x: point.x, y: placement.y + point.rise, z: point.z };
  };
  const aspects = [16 / 9, 4 / 3, 21 / 9, 1440 / 900, 390 / 844, 412 / 915, 768 / 1024];
  const times = Array.from({ length: 29 }, (_, step) => step * 7);

  it('flies every book and candle round the carousel BELOW the hero text, all the way round, at every aspect', () => {
    for (const aspect of aspects) {
      const camera = stageCamera(aspect);
      const layout = propLayout(aspect, counts);
      for (const placement of [...layout.closedBooks, ...layout.openBooks, ...layout.candles]) {
        expect(placement.orbit).toBeDefined();
        for (const t of times) {
          const spot = onScreen(camera, at(placement, t));
          expect(spot.fromTop).toBeGreaterThanOrEqual(TEXT_LINE - 1e-6);
          expect(at(placement, t).y).toBeGreaterThan(0.6);
        }
      }
    }
  });

  it('keeps the carousel out of the lens, behind the chair and across the screen: never nearer than 8 m, spanning both halves', () => {
    for (const aspect of aspects) {
      const camera = stageCamera(aspect);
      const layout = propLayout(aspect, counts);
      const props = [...layout.closedBooks, ...layout.openBooks, ...layout.candles];
      for (const placement of props) for (const t of times) expect(-at(placement, t).z).toBeGreaterThan(-layout.chair.z);
      for (const placement of props) for (const t of times) expect(-at(placement, t).z).toBeGreaterThanOrEqual(8 - 1e-6);
      const lefts = props.map((placement) => onScreen(camera, placement).fromLeft);
      expect(lefts.some((left) => left < 0.4)).toBe(true);
      expect(lefts.some((left) => left > 0.6)).toBe(true);
    }
  });

  it('crosses the middle only well BEHIND the magic circle (4 m past its far edge), never in front of it', () => {
    for (const aspect of aspects) {
      const camera = stageCamera(aspect);
      const layout = propLayout(aspect, counts);
      const spell = spellPlacement(aspect);
      // Behind the circle's far edge with a buffer (4 m).
      expect(middleDepth(aspect)).toBeGreaterThanOrEqual(spell.distance + spell.radius + 4 - 1e-6);
      // The middle covers at least the circle's own width on screen.
      const rim = new THREE.Vector3(spell.radius, 0, -spell.distance).project(camera);
      expect(middleBand(aspect)).toBeGreaterThan((rim.x + 1) / 2 - 0.5);
      let crossings = 0;
      for (const placement of [...layout.closedBooks, ...layout.openBooks, ...layout.candles]) {
        for (const t of times) {
          const place = at(placement, t);
          const spot = onScreen(camera, place);
          if (Math.abs(spot.fromLeft - 0.5) >= middleBand(aspect)) continue;
          crossings++;
          expect(-place.z).toBeGreaterThanOrEqual(middleDepth(aspect) - 1e-6);
        }
      }
      // They do cross (behind), not just avoid the middle.
      expect(crossings).toBeGreaterThan(0);
    }
  });

  it('turns the books one way and the candles the other, each ring rigidly (the spacing never closes up)', () => {
    const layout = propLayout(16 / 9, counts);
    const books = [...layout.openBooks, ...layout.closedBooks];
    expect(new Set(books.map((placement) => placement.orbit!.rate)).size).toBe(1);
    expect(new Set(layout.candles.map((placement) => placement.orbit!.rate)).size).toBe(1);
    expect(Math.sign(books[0].orbit!.rate)).toBe(-Math.sign(layout.candles[0].orbit!.rate));
    // Candles fly the inner ring, books the outer.
    expect(Math.max(...layout.candles.map((placement) => placement.orbit!.reach))).toBeLessThan(Math.min(...books.map((placement) => placement.orbit!.reach)));
    // The books are spread out: no two within 1.2 m on the floor plane, at t = 0.
    for (const [index, a] of books.entries()) for (const b of books.slice(index + 1)) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1.2);
  });

  it('flies fewer props on smaller screens, never more than the tier allows', () => {
    const high = STAGE_TIERS.high;
    const desktop = propCounts(high, 1920, 1080);
    const laptop = propCounts(high, 1440, 900);
    const small = propCounts(STAGE_TIERS.medium, 1280, 720);
    const phone = propCounts(STAGE_TIERS.low, 412, 915);
    expect(desktop.books).toBeGreaterThan(laptop.books);
    expect(laptop.books).toBeGreaterThan(small.books);
    expect(small.books).toBeGreaterThanOrEqual(phone.books);
    expect(phone.books + phone.candles).toBeLessThanOrEqual(6);
    expect(desktop.books).toBeLessThanOrEqual(high.books);
    expect(desktop.candles).toBeLessThanOrEqual(high.candles);
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
