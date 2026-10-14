import { describe, expect, it } from 'vitest';
import { cardFlights, seedOf, sheetClips } from '../chapter/topicMotion';
import { discriminant, formatEquation, realRoots, vertex } from '../topics/library/quadratic-standard-form/model';

describe('topic modal motion', () => {
  it('opens the sheet from a point, through the rail, to the whole sheet', () => {
    const [point, rail, full] = sheetClips({ x: 300, y: 200 }, { width: 1000, height: 800 }, 18);
    expect(point).toBe('inset(199px 699px 599px 299px round 2px)');
    expect(rail).toBe('inset(199px 0px 599px 0px round 2px)');
    expect(full).toBe('inset(0px 0px 0px 0px round 18px)');
  });

  it('clamps an origin that is off screen', () => {
    expect(sheetClips({ x: -50, y: 2000 }, { width: 1000, height: 800 }, 0)[0]).toBe('inset(799px 999px -1px -1px round 2px)');
  });

  it('flies the same cards for the same topic, out past the edges', () => {
    const size = { width: 1280, height: 800 };
    const a = cardFlights(9, size, seedOf('leawqo'));
    expect(cardFlights(9, size, seedOf('leawqo'))).toEqual(a);
    expect(cardFlights(9, size, seedOf('other'))).not.toEqual(a);
    for (const flight of a) expect(Math.hypot(flight.dx, flight.dy / 0.8)).toBeGreaterThan(Math.hypot(1280, 800) * 0.6 * 0.75);
    expect(a.some((flight) => flight.face)).toBe(true);
  });
});

describe('quadratic model', () => {
  it('finds roots, the vertex and the discriminant', () => {
    expect(realRoots({ a: 1, b: -1, c: -2 })).toEqual([-1, 2]);
    expect(realRoots({ a: 1, b: 2, c: 1 })).toEqual([-1]);
    expect(realRoots({ a: 1, b: 0, c: 1 })).toEqual([]);
    expect(realRoots({ a: 0, b: 2, c: 1 })).toBeNull();
    expect(vertex({ a: 1, b: -2, c: 0 })).toEqual({ x: 1, y: -1 });
    expect(discriminant({ a: 1, b: -1, c: -2 })).toBe(9);
  });

  it('writes the equation the way a textbook would', () => {
    expect(formatEquation({ a: 1, b: -1, c: -2 })).toBe('x² − x − 2 = 0');
    expect(formatEquation({ a: -0.5, b: 0, c: 3 })).toBe('−0.5x² + 3 = 0');
    expect(formatEquation({ a: 0, b: 0, c: 0 })).toBe('0 = 0');
  });
});
