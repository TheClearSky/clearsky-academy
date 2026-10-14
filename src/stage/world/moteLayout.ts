import { seededRandom } from '../engine/random';

/**
 * Where the motes float: just above the horizon, as in the scene
 * reference — a band 14–74 m away, spreading wider with distance (so it
 * fills the frame at every depth), mostly low (y = 0.4 + r²·9 crowds them
 * toward the floor). Pure, so the bounds are tested.
 */

type MoteLayout = {
  /** x, y, z per mote. */
  positions: Float32Array;
  /** 0..1 per mote: drives size, phase, twinkle and dark-vs-bright. */
  seeds: Float32Array;
};

const MOTE_NEAR = 14;
const MOTE_FAR = 74;
const MOTE_LOW = 0.4;
const MOTE_HEIGHT = 9;

function moteLayout(count: number, seed = 7): MoteLayout {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const z = -(MOTE_NEAR + random() * (MOTE_FAR - MOTE_NEAR));
    positions[index * 3] = (random() - 0.5) * -z * 1.6;
    positions[index * 3 + 1] = MOTE_LOW + random() * random() * MOTE_HEIGHT;
    positions[index * 3 + 2] = z;
    seeds[index] = random();
  }
  return { positions, seeds };
}

export { MOTE_FAR, MOTE_HEIGHT, MOTE_LOW, MOTE_NEAR, moteLayout };
export type { MoteLayout };
