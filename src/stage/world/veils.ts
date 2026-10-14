import { airState, disposeAir, MIST } from '../engine/air';
import type { AssetClass, AssetOption, StageContext } from '../engine/contract';

/**
 * Fog class: the GROUND MIST of the shared air (`engine/air.ts`).
 *
 * The owner, 2026-10-12, on the hellscape veils this class used to draw
 * (seven horizontal disc slices): "the fog is so far away to the right, it
 * isn't visible even and i can see layers of the plane, illusion is broken
 * and the fog is too small, maybe we need a different technique."
 *
 * So the mist is no geometry at all: a continuous exponential height fog,
 * integrated analytically along every view ray and broken into drifting
 * banks by a shared noise, evaluated inside `airFog` — the one function the
 * floor, props, chess pieces, spell and motes already call. Every surface
 * sees the same volume; there is nothing to slice. This class only drives
 * the shared uniforms (density, sample count, the drift clock).
 *
 * Options:
 *  - `mist` ★ — drifting banks and wisps: the tier's noise samples per ray
 *    (high 4 · medium 3 · low 2, two texture fetches each);
 *  - `smooth` — the same sheet without noise (no fetches): an even ground
 *    haze, for comparison and the slowest devices;
 *  - `none` — only the distance haze of the shared air.
 *
 * The veils (and their `thin` variant) are removed: the owner rejected the
 * slices themselves, which no tuning of a sliced volume can hide at a 2.4 m
 * eye. Their noise texture lives on in `engine/airNoise.ts`.
 */

const OPTIONS: readonly AssetOption[] = [
  { id: 'mist', label: 'Ground mist', description: 'A volumetric height fog on the floor, integrated per pixel, broken into drifting banks and wisps by a shared noise.' },
  { id: 'smooth', label: 'Smooth mist', description: 'The same analytic ground sheet without the noise: an even haze lying on the floor, no texture fetches.' },
  { id: 'none', label: 'No mist', description: 'Only the distance haze of the shared air.' },
];

function create(context: StageContext): AssetClass {
  const { palette, tier } = context;
  const air = airState(palette);
  let current = '';

  const setOption = (id: string) => {
    if (id === current) return;
    if (!OPTIONS.some((option) => option.id === id)) throw new Error(`[fog] unknown option "${id}"`);
    air.uMistDensity.value = id === 'none' ? 0 : MIST.density;
    air.uMistGlow.value = id === 'none' ? 0 : MIST.glow;
    air.uMistSamples.value = id === 'mist' ? tier.mistSamples : 0;
    current = id;
  };

  setOption(tier.mistSamples > 0 ? 'mist' : 'smooth');

  return {
    id: 'fog',
    label: 'Fog',
    options: OPTIONS,
    current: () => current,
    setOption,
    update(t) {
      air.uAirTime.value = t;
    },
    dispose() {
      air.uMistDensity.value = 0;
      air.uMistGlow.value = 0;
      disposeAir(palette);
    },
  };
}

export { create };
