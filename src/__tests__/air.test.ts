import { describe, expect, it } from 'vitest';
import { AIR_GLSL, AIR_MIST_MEAN_DENSITY, airState, airUniforms, disposeAir, MIST, mistOpticalDepth, mistProfileMean } from '../stage/engine/air';
import { airNoiseData } from '../stage/engine/airNoise';
import { createPalette } from '../stage/engine/palette';

type Vector = [number, number, number];

/** Brute-force reference: midpoint-rule integral of the sheet's density along the ray. */
function integrateDepth(eye: Vector, point: Vector, density: number, height: number, steps = 200000): number {
  const delta = [point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]];
  const length = Math.hypot(delta[0], delta[1], delta[2]);
  let sum = 0;
  for (let index = 0; index < steps; index++) {
    const t = (index + 0.5) / steps;
    const y = eye[1] + delta[1] * t;
    sum += Math.exp(-Math.max(y, 0) / height);
  }
  return AIR_MIST_MEAN_DENSITY * density * (sum / steps) * length;
}

const EYE: Vector = [0, 2.4, 0];

describe('mistProfileMean', () => {
  it('is the mean of e^(-y/H) between two heights', () => {
    const exact = (0.6 * (Math.exp(-0.5 / 0.6) - Math.exp(-2 / 0.6))) / 1.5;
    expect(mistProfileMean(0.5, 2, 0.6)).toBeCloseTo(exact, 10);
    expect(mistProfileMean(2, 0.5, 0.6)).toBeCloseTo(exact, 10);
  });

  it('takes the flat limit without dividing by ~0, continuously across the switch', () => {
    expect(mistProfileMean(1, 1, 0.7)).toBeCloseTo(Math.exp(-1 / 0.7), 12);
    const justFlat = mistProfileMean(1, 1 + 0.7 * 0.9999e-3, 0.7);
    const justSloped = mistProfileMean(1, 1 + 0.7 * 1.0001e-3, 0.7);
    expect(Math.abs(justFlat - justSloped)).toBeLessThan(1e-6);
  });

  it('clamps heights to the floor and never overflows', () => {
    expect(mistProfileMean(-5, 0, 0.6)).toBe(1);
    const huge = mistProfileMean(0, 5000, 0.05);
    expect(Number.isFinite(huge)).toBe(true);
    expect(huge).toBeGreaterThan(0);
    expect(mistProfileMean(5000, 6000, 0.05)).toBe(0);
  });
});

describe('mistOpticalDepth (the smooth sheet, mirrored from airMistDepth)', () => {
  const settings = { ...MIST };

  it('matches a brute-force integral for floor points near and far, left and right', () => {
    const points: Vector[] = [
      [0, 0, -7],
      [3, 0, -12],
      [-20, 0, -40],
      [0, 0, -150],
      [5, 1.2, -30], // a prop's base inside the sheet
      [0, 2.4, -60], // a flat ray at eye height
      [0, 40, -80], // up into the sky
    ];
    for (const point of points) {
      expect(mistOpticalDepth(EYE, point, settings)).toBeCloseTo(integrateDepth(EYE, point, settings.density, settings.height), 4);
    }
  });

  it('grows with distance along the floor (the mist thickens toward the horizon)', () => {
    let previous = 0;
    for (const distance of [7, 10, 20, 40, 80, 160]) {
      const depth = mistOpticalDepth(EYE, [0, 0, -distance], settings);
      expect(depth).toBeGreaterThan(previous);
      previous = depth;
    }
    // The nearest visible tiles (6.7 m) sit under a thin veil at the MEAN
    // density (the noise's gaps there are far clearer); the far floor is deep in it.
    expect(1 - Math.exp(-mistOpticalDepth(EYE, [0, 0, -6.7], settings))).toBeLessThan(0.4);
    expect(1 - Math.exp(-mistOpticalDepth(EYE, [0, 0, -80], settings))).toBeGreaterThan(0.9);
  });

  it('is finite for degenerate rays (point at the eye, flat rays, a camera below the floor)', () => {
    const cases: [Vector, Vector][] = [
      [EYE, EYE],
      [EYE, [0, 2.4, -1e6]],
      [EYE, [0, 2.4 + 1e-9, -50]],
      [[0, -2.4, 0], [0, 1, -30]], // the mirror floor's reflected camera
      [[0, 1, 0], [0, 1, -10]], // an eye inside the slab
    ];
    for (const [eye, point] of cases) {
      const depth = mistOpticalDepth(eye, point, settings);
      expect(Number.isFinite(depth)).toBe(true);
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(mistOpticalDepth(EYE, EYE, settings)).toBeLessThan(1e-3);
  });

  it('is zero when the mist is off', () => {
    expect(mistOpticalDepth(EYE, [0, 0, -30], { ...settings, density: 0 })).toBe(0);
  });
});

describe('the shared air uniforms', () => {
  it('hands every material the SAME uniform objects for one palette', () => {
    const palette = createPalette();
    const first = airUniforms(palette);
    const second = airUniforms(palette);
    expect(first).not.toBe(second);
    for (const name of Object.keys(first)) expect(second[name]).toBe(first[name]);
    expect(airState(palette).uMistDensity).toBe(first.uMistDensity);
    // A different stage gets its own.
    expect(airUniforms(createPalette()).uMistDensity).not.toBe(first.uMistDensity);
    disposeAir(palette);
    expect(airUniforms(palette).uMistDensity).not.toBe(first.uMistDensity);
  });

  it('starts with the mist off (the fog class turns it on)', () => {
    const air = airState(createPalette());
    expect(air.uMistDensity.value).toBe(0);
    expect(air.uMistGlow.value).toBe(0);
    expect(air.uMistSamples.value).toBe(0);
  });
});

describe('AIR_GLSL', () => {
  it('keeps the functions every world shader calls', () => {
    expect(AIR_GLSL).toMatch(/vec3 airFog\(vec3 colour, vec3 worldPosition\)/);
    expect(AIR_GLSL).toMatch(/float airFogAmount\(vec3 worldPosition\)/);
    expect(AIR_GLSL).toMatch(/vec3 airSky\(vec3 direction\)/);
    expect(AIR_GLSL).toMatch(/vec3 airHorizon\(\)/);
  });

  it('is plain ASCII and has no unguarded NaN sources', () => {
    expect([...AIR_GLSL].every((character) => character.charCodeAt(0) < 127)).toBe(true);
    // normalize only of the sky direction, whose y is clamped >= 0.015.
    expect(AIR_GLSL.match(/normalize\(/g)).toHaveLength(1);
    expect(AIR_GLSL).toMatch(/normalize\(vec3\(direction\.x, max\(direction\.y, 0\.015\), direction\.z\)\)/);
    // pow only of a non-negative base (max(direction.y, 0.0)).
    expect(AIR_GLSL.match(/pow\(/g)).toHaveLength(1);
    expect(AIR_GLSL).toMatch(/float h = max\(direction\.y, 0\.0\);[\s\S]*pow\(h, 0\.45\)/);
  });
});

describe('airNoiseData', () => {
  const size = 64;
  const data = airNoiseData(size);

  it('fills every channel over the full byte range', () => {
    for (let channel = 0; channel < 3; channel++) {
      let low = 255;
      let high = 0;
      for (let index = 0; index < size * size; index++) {
        low = Math.min(low, data[index * 4 + channel]);
        high = Math.max(high, data[index * 4 + channel]);
      }
      expect(low).toBe(0);
      expect(high).toBe(255);
    }
  });

  it('tiles: the step across the wrap is no larger than the steps inside', () => {
    for (let channel = 0; channel < 3; channel++) {
      let insideMax = 0;
      let wrapMax = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const here = data[(y * size + x) * 4 + channel];
          const right = data[(y * size + ((x + 1) % size)) * 4 + channel];
          const below = data[(((y + 1) % size) * size + x) * 4 + channel];
          const step = Math.max(Math.abs(here - right), Math.abs(here - below));
          if (x === size - 1 || y === size - 1) wrapMax = Math.max(wrapMax, step);
          else insideMax = Math.max(insideMax, step);
        }
      }
      expect(wrapMax).toBeLessThanOrEqual(insideMax);
    }
  });
});
