/**
 * The colours of the hellscape's anime finish (`engine/animePost.ts`),
 * re-toned for the blue-white night. Pure maths, no three.js, so it is
 * unit-tested (`src/__tests__/animeTones.test.ts`).
 *
 * In Nodestra the anime finish takes five colours from the scene palette
 * (`react-blender-nodes-sound/src/landing/hell/hell-src/scene/post.ts:123-135`,
 * `postTones`): the split tone's shadows and highlights, the halation, the
 * vignette and the glow stack's middle hue. The landing runs the `dusk`
 * palette (`hell-src/scene/palette.ts:139`: violet shadows, peach-white
 * highlights, salmon halation). Ours are chosen the same way, from the
 * hellscape's own blue-night palettes and this stage's palette
 * (`engine/palette.ts`):
 *
 *  - shadows    `#1a1f4a` — the hellscape's cobalt-sky split tone
 *               (`scene/palette.ts:97`, "Eva split"): it leans the darks to
 *               blue without crushing them;
 *  - highlights `#f2f6ff` — the hellscape's moonlit cool white
 *               (`scene/palette.ts:181`, "Hueco night"): whites stay white;
 *  - halation   `#8f97d8` — this stage's lavender haze (`palette.haze`): a
 *               lavender ring round the candle flames and the brightest stars
 *               instead of the hellscape's red;
 *  - vignette   `#0a0c24` — the hellscape's navy vignette
 *               (`scene/palette.ts:97`), close to `palette.skyDeep`;
 *  - glowMiddle `#7b5cc4` — this stage's violet (`palette.violet`, the deck's
 *               sunburst): the glow stack falls off highlight → violet →
 *               shadow, as the hellscape's falls off highlight → circle red
 *               → shadow.
 *
 * `animeFinishColours` is the hellscape's `recolour`
 * (`scene/post.ts:200-221`) for the finish shader's display-referred
 * uniforms, unchanged in its maths.
 */

/** sRGB (display) components, 0..1. */
type RgbTriple = readonly [number, number, number];

/** sRGB hex colours (`#rrggbb`) the anime finish is toned with. */
type AnimeTones = {
  shadows: string;
  highlights: string;
  halation: string;
  vignette: string;
  glowMiddle: string;
};

/** The blue-white night's tones (see the header for where each comes from). */
const NIGHT_ANIME_TONES: AnimeTones = {
  shadows: '#1a1f4a',
  highlights: '#f2f6ff',
  halation: '#8f97d8',
  vignette: '#0a0c24',
  glowMiddle: '#7b5cc4',
};

/** The finish shader's colour uniforms, display-referred. */
type AnimeFinishColours = {
  /** The split tone's shadow push (the shader adds `(tint − 0.18) · 0.22`). */
  shadowTint: RgbTriple;
  /** The split tone's highlight multiply. */
  highlightTint: RgbTriple;
  /** The ASC CDL slope: a gentle lean toward the highlight colour. */
  slope: RgbTriple;
  /** The vignette's multiply, its brightest channel at 0.59. */
  vignetteTint: RgbTriple;
  /** The halation's screen colour, its brightest channel at 1. */
  halationTint: RgbTriple;
};

/** A guard against dividing by a black colour's brightest channel. */
const DIVIDE_GUARD = 1e-3;

/** `#rrggbb` → sRGB components 0..1 (`hell-src/scene/sky-ramp.ts:94-98`, `srgbVec`). */
function srgbTriple(hex: string): RgbTriple {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`[animeTones] not a #rrggbb colour: "${hex}"`);
  const packed = parseInt(hex.slice(1), 16);
  return [((packed >> 16) & 255) / 255, ((packed >> 8) & 255) / 255, (packed & 255) / 255];
}

/** Scales a colour so its brightest channel is `peak`. */
function withPeak(colour: RgbTriple, peak: number): RgbTriple {
  const scale = peak / Math.max(colour[0], colour[1], colour[2], DIVIDE_GUARD);
  return [colour[0] * scale, colour[1] * scale, colour[2] * scale];
}

/** The finish's colour uniforms for these tones (`hell-src/scene/post.ts:201-215`). */
function animeFinishColours(tones: AnimeTones): AnimeFinishColours {
  const highlights = srgbTriple(tones.highlights);
  const mean = (highlights[0] + highlights[1] + highlights[2]) / 3;
  return {
    shadowTint: srgbTriple(tones.shadows),
    highlightTint: highlights,
    // CDL slope: hell-12's was a fixed red lean; the hellscape scene leans 30 % toward the highlight colour.
    slope: [1 + 0.3 * (highlights[0] - mean), 1 + 0.3 * (highlights[1] - mean), 1 + 0.3 * (highlights[2] - mean)],
    // hell-12 multiplied by #962228 (brightest channel ~0.59): same strength, our hue.
    vignetteTint: withPeak(srgbTriple(tones.vignette), 0.59),
    // The halation colour at full strength on its brightest channel.
    halationTint: withPeak(srgbTriple(tones.halation), 1),
  };
}

export { animeFinishColours, NIGHT_ANIME_TONES, srgbTriple };
export type { AnimeFinishColours, AnimeTones, RgbTriple };
