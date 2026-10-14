import { describe, expect, it } from 'vitest';
import { animeFinishColours, NIGHT_ANIME_TONES, srgbTriple } from '../stage/engine/animeTones';
import type { AnimeTones, RgbTriple } from '../stage/engine/animeTones';

function expectTriple(actual: RgbTriple, expected: RgbTriple): void {
  actual.forEach((channel, index) => expect(channel).toBeCloseTo(expected[index], 6));
}

describe('srgbTriple', () => {
  it('reads #rrggbb as display components 0..1', () => {
    expectTriple(srgbTriple('#ff8000'), [1, 128 / 255, 0]);
    expectTriple(srgbTriple('#0A0C24'), [10 / 255, 12 / 255, 36 / 255]);
  });

  it('refuses anything that is not #rrggbb', () => {
    expect(() => srgbTriple('#fff')).toThrow();
    expect(() => srgbTriple('blue')).toThrow();
  });
});

describe('animeFinishColours (the hellscape recolour, scene/post.ts:201-215)', () => {
  it('leans the CDL slope 30 % toward the highlight colour, around 1', () => {
    const colours = animeFinishColours({ ...NIGHT_ANIME_TONES, highlights: '#ffffff' });
    // A neutral highlight: no lean at all.
    expectTriple(colours.slope, [1, 1, 1]);
    const warm = animeFinishColours({ ...NIGHT_ANIME_TONES, highlights: '#ff0000' });
    expectTriple(warm.slope, [1 + 0.3 * (2 / 3), 1 - 0.3 / 3, 1 - 0.3 / 3]);
  });

  it('puts the vignette tint at 0.59 and the halation tint at 1 on their brightest channel', () => {
    const colours = animeFinishColours(NIGHT_ANIME_TONES);
    expect(Math.max(...colours.vignetteTint)).toBeCloseTo(0.59, 6);
    expect(Math.max(...colours.halationTint)).toBeCloseTo(1, 6);
    // The hue is kept: the blue night's vignette and lavender halation stay blue-led.
    expect(colours.vignetteTint[2]).toBeGreaterThan(colours.vignetteTint[0]);
    expect(colours.halationTint[2]).toBeGreaterThan(colours.halationTint[0]);
  });

  it('stays finite for a black colour (no divide by zero reaches a shader)', () => {
    const black: AnimeTones = { shadows: '#000000', highlights: '#000000', halation: '#000000', vignette: '#000000', glowMiddle: '#000000' };
    const colours = animeFinishColours(black);
    for (const triple of Object.values(colours)) for (const channel of triple) expect(Number.isFinite(channel)).toBe(true);
  });

  it('keeps the night whites white: the highlight tint is a near-neutral cool white', () => {
    const { highlightTint } = animeFinishColours(NIGHT_ANIME_TONES);
    expect(Math.min(...highlightTint)).toBeGreaterThan(0.9);
    expect(highlightTint[2]).toBeGreaterThanOrEqual(highlightTint[0]);
  });
});
