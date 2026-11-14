/**
 * The effects' colours (effects standard 6): an effect takes its OWNER's colour, the video's binding
 * colour code (product plan `types-of-numbers-3d.md`, "Rules kept"): naturals gold, zero white-gold,
 * negatives crystal, fractions lilac, irrationals rose. `text` is the numeral's own colour (the picked
 * typography's KIND, `src/bench/assets/typography.ts`); `core` / `hot` / `halo` are the light the
 * effect is drawn in, shifting outward per the layered-glow rule (`glow.ts`).
 */
const NUMBER_FX = {
  natural: { text: '#f4e2a6', core: '#ffd36b', hot: '#fffaf0', halo: '#ff9a3c' },
  zero: { text: '#ffffff', core: '#fff1cc', hot: '#ffffff', halo: '#ffc85a' },
  negative: { text: '#6fe3ff', core: '#8fe8ff', hot: '#f2fdff', halo: '#3a7cff' },
  fraction: { text: '#c9a7ff', core: '#d4b8ff', hot: '#fbf6ff', halo: '#8a5cff' },
  irrational: { text: '#ff8fb1', core: '#ffa6c2', hot: '#fff3f7', halo: '#ff4f86' },
} as const;

type NumberKind = keyof typeof NUMBER_FX;

export { NUMBER_FX };
export type { NumberKind };
