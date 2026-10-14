import * as THREE from 'three';

/**
 * The air's noise: one tileable value-noise texture shared by every world
 * shader (`engine/air.ts` › the ground mist). MOVED from the former fog
 * veils (`world/veils.ts`), which COPIED it from Nodestra's hellscape
 * `noiseTexture` (`react-blender-nodes-sound/src/landing/hell/hell-src/
 * scene/clouds-veils.ts`):
 *  - R = fine fbm, 5 octaves (the wind-stretched wisps);
 *  - G = medium fbm, 3 octaves (the domain warp);
 *  - B = coarse fbm, 2 octaves (the banks and the clear gaps between them);
 * each channel stretched to the full 0..1 range. Every octave's lattice
 * period divides the texture size, so the texture tiles seamlessly under
 * `RepeatWrapping` — the mist can drift forever without a seam.
 * Built once on the CPU (~10 ms for 256²).
 */

const AIR_NOISE_SIZE = 256;

/** A seeded lattice of `period × period` values in [0, 1) (an LCG — stable across runs). */
function noiseLattice(period: number, seed: number): Float32Array {
  const values = new Float32Array(period * period);
  let state = seed * 9301 + 49297;
  for (let index = 0; index < values.length; index++) {
    state = (state * 9301 + 49297) % 233280;
    values[index] = state / 233280;
  }
  return values;
}

/** Smoothstep-interpolated value fbm over a `size²` tile, normalised to 0..1. */
function tileableFbm(size: number, octaves: number, basePeriod: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  let amplitude = 0.5;
  for (let octave = 0; octave < octaves; octave++) {
    const period = basePeriod << octave;
    const values = noiseLattice(period, seed + octave * 17);
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * period;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const row0 = (y0 % period) * period;
      const row1 = ((y0 + 1) % period) * period;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * period;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const column0 = x0 % period;
        const column1 = (x0 + 1) % period;
        const top = values[row0 + column0] + (values[row0 + column1] - values[row0 + column0]) * sx;
        const bottom = values[row1 + column0] + (values[row1 + column1] - values[row1 + column0]) * sx;
        out[y * size + x] += (top + (bottom - top) * sy) * amplitude;
      }
    }
    amplitude *= 0.5;
  }
  let low = Infinity;
  let high = -Infinity;
  for (let index = 0; index < out.length; index++) {
    low = Math.min(low, out[index]);
    high = Math.max(high, out[index]);
  }
  for (let index = 0; index < out.length; index++) out[index] = (out[index] - low) / (high - low || 1);
  return out;
}

/** The RGBA bytes of the air's noise tile (pure: tested for range and tiling). */
function airNoiseData(size = AIR_NOISE_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const wisps = tileableFbm(size, 5, 4, 1);
  const warp = tileableFbm(size, 3, 4, 2);
  const banks = tileableFbm(size, 2, 3, 3);
  for (let index = 0; index < size * size; index++) {
    data[index * 4] = Math.round(wisps[index] * 255);
    data[index * 4 + 1] = Math.round(warp[index] * 255);
    data[index * 4 + 2] = Math.round(banks[index] * 255);
    data[index * 4 + 3] = 255;
  }
  return data;
}

/** The noise as a repeating, mipmapped texture (the mips keep the far mist from aliasing). */
function createAirNoiseTexture(size = AIR_NOISE_SIZE): THREE.DataTexture {
  const texture = new THREE.DataTexture(airNoiseData(size), size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export { AIR_NOISE_SIZE, airNoiseData, createAirNoiseTexture };
