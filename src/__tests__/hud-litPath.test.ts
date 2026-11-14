import { describe, expect, it } from 'vitest';
import { arrivalMs, dashFor, easeAt, frontierOf, litExtent, litIntervals, pointAt, RACE_EASE, raceMs, seeded, sprinkle, STEADY_RACE_EASE, steadyRaceMs, stopsAlong, timeToReach, tracePath } from '../site/hud/kit/litPath';

const chapter = (done: number, total: number) => ({ done, fraction: total ? done / total : 0, complete: total > 0 && done >= total });

describe('tracePath', () => {
  it('measures straight runs exactly and puts collinear points at their own distance', () => {
    const trace = tracePath(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 120, y: 0 },
      ],
      20,
    );
    expect(trace.length).toBeCloseTo(120, 6);
    expect(trace.vertices).toEqual([0, 50, 120]);
    expect(trace.d).toBe('M0 0L50 0L120 0');
  });

  it('rounds a right angle with an exact quarter arc', () => {
    const trace = tracePath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      20,
    );
    // 80 straight + a quarter of a 20 px circle + 80 straight.
    expect(trace.length).toBeCloseTo(160 + (Math.PI * 20) / 2, 6);
    expect(trace.d).toContain('A20 20 0 0 1 100 20');
    expect(trace.vertices[1]).toBeCloseTo(80 + (Math.PI * 20) / 4, 6);
  });

  it('walks continuously: pointAt agrees with a fine polyline of itself', () => {
    const trace = tracePath(
      [
        { x: 10, y: 10 },
        { x: 300, y: 10 },
        { x: 330, y: 40 },
        { x: 330, y: 160 },
        { x: 40, y: 160 },
        { x: 0, y: 220 },
      ],
      24,
    );
    let walked = 0;
    let previous = pointAt(trace, 0);
    const steps = 4000;
    for (let step = 1; step <= steps; step++) {
      const point = pointAt(trace, (trace.length * step) / steps);
      const hop = Math.hypot(point.x - previous.x, point.y - previous.y);
      expect(hop).toBeLessThan((trace.length / steps) * 1.01 + 1e-6);
      walked += hop;
      previous = point;
    }
    expect(walked).toBeCloseTo(trace.length, 0);
    expect(previous.x).toBeCloseTo(0, 6);
    expect(previous.y).toBeCloseTo(220, 6);
  });

  it('keeps fillets inside short legs', () => {
    const trace = tracePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 10 },
      ],
      40,
    );
    const end = pointAt(trace, trace.length);
    expect(end.x).toBeCloseTo(20, 6);
    expect(end.y).toBeCloseTo(10, 6);
    expect(trace.length).toBeLessThanOrEqual(30 + 1e-6);
  });
});

describe('lit by what is learnt', () => {
  const stops = stopsAlong([20, 120, 220, 320], 10, 20);

  it('builds each stop’s stretch between its neighbours', () => {
    expect(stops[0]).toEqual({ start: 0, end: 10, at: 20 });
    expect(stops[1]).toEqual({ start: 30, end: 110, at: 120 });
  });

  it('lights nothing at zero and one run when everything is learnt', () => {
    const none = [chapter(0, 4), chapter(0, 4), chapter(0, 4), chapter(0, 4)];
    expect(litIntervals(stops, none)).toEqual([]);
    expect(dashFor([], 400)).toBe('0 401.0');
    const all = [chapter(4, 4), chapter(4, 4), chapter(4, 4), chapter(4, 4)];
    expect(litIntervals(stops, all)).toEqual([[0, 320]]);
  });

  it('lights a stretch to its fraction and the onward track only once the next is started', () => {
    const intervals = litIntervals(stops, [chapter(4, 4), chapter(2, 4), chapter(0, 4), chapter(0, 4)]);
    // stop 0 complete → [0,20] + onward [20,30]; stop 1 half → [30,70].
    expect(intervals).toEqual([[0, 70]]);
    const skipping = litIntervals(stops, [chapter(4, 4), chapter(0, 4), chapter(4, 4), chapter(0, 4)]);
    expect(skipping).toEqual([
      [0, 20],
      [130, 220],
    ]);
    expect(litExtent(skipping)).toBe(220);
    const dashes = dashFor(skipping, 400).split(' ').map(Number);
    expect(dashes).toEqual([0, 0, 20, 110, 90, 401]);
  });
});

describe('eased timing', () => {
  it('inverts the easing exactly', () => {
    for (const fraction of [0.05, 0.2, 0.5, 0.8, 0.97]) {
      expect(easeAt(RACE_EASE, timeToReach(RACE_EASE, fraction))).toBeCloseTo(fraction, 4);
    }
    expect(timeToReach(RACE_EASE, 0)).toBe(0);
    expect(timeToReach(RACE_EASE, 1)).toBe(1);
    expect(timeToReach([0, 0, 1, 1], 0.3)).toBeCloseTo(0.3, 4);
  });

  it('makes nodes early in an ease-in race wait for the light (not a linear clock)', () => {
    const race = 2000;
    // At a quarter of the way the eased light is late: it gets there after a quarter of the time.
    expect(arrivalMs(250, 1000, race)).toBeGreaterThan(500);
    const times = [0, 100, 300, 600, 900, 1000].map((along) => arrivalMs(along, 1000, race));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times[times.length - 1]).toBe(race);
  });

  it('scales the race with the path but keeps it short', () => {
    expect(raceMs(0)).toBe(1400);
    expect(raceMs(100_000)).toBe(3200);
    expect(raceMs(3000)).toBeGreaterThan(raceMs(1500));
  });

  it('runs a narrow line at a steady speed, slower than the fixed-time race', () => {
    // The 5-topic phone line measured on 2026-10-17: 1315 px (was 1.4 s).
    expect(steadyRaceMs(1315)).toBeGreaterThan(4000);
    expect(steadyRaceMs(1315)).toBeGreaterThan(raceMs(1315) * 2);
    expect(steadyRaceMs(2600) / steadyRaceMs(1300)).toBeCloseTo(2, 2);
    expect(steadyRaceMs(0)).toBe(1400);
    expect(steadyRaceMs(100_000)).toBe(10000);
    // Its easing is invertible like the race's (the pop clock depends on it).
    for (const fraction of [0.1, 0.5, 0.9]) expect(easeAt(STEADY_RACE_EASE, timeToReach(STEADY_RACE_EASE, fraction))).toBeCloseTo(fraction, 4);
  });
});

describe('frontier and decoration', () => {
  it('heads for the unfinished chapter closest to done', () => {
    expect(frontierOf([chapter(4, 4), chapter(1, 4), chapter(3, 4), chapter(0, 4)])).toBe(2);
    expect(frontierOf([chapter(4, 4), chapter(0, 4), chapter(0, 4)])).toBe(1);
    expect(frontierOf([chapter(4, 4), chapter(4, 4)])).toBe(-1);
  });

  it('is deterministic', () => {
    const a = seeded('maths:3');
    const b = seeded('maths:3');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const trace = tracePath(
      [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
      ],
      0,
    );
    const dust = sprinkle(trace, [[0, 200]], 20, 4, 'x');
    expect(dust.length).toBeGreaterThan(10);
    expect(dust.every((point) => point.lit === point.x <= 200 + 1e-6 || Math.abs(point.x - 200) < 5)).toBe(true);
    expect(sprinkle(trace, [[0, 200]], 20, 4, 'x')).toEqual(dust);
  });
});
