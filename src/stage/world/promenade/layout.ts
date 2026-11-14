import { spellPlacement } from '../spellTimeline';

/**
 * EXPERIMENT (2026-10-17) — the promenade's layout, shared by the floor (which
 * draws the lawn, the path and the plaza in its shader, `world/floor.ts`
 * › `meadow`) and the promenade class (the bench, the lamp and the avenue,
 * `world/promenade/index.ts`). Deepak: "remove the chess floor and pieces and
 * instead have a bench, a beautiful medieval royal footpath, some more trees
 * besides the footpath and a magic street light stylized".
 *
 * The camera stands at the path's near end. The path runs straight away
 * from it down the middle of the frame — a royal axis, vanishing into the
 * mist toward the horizon — through a round paved plaza under the summoning
 * circle. Metres; the path's centre line is x = 0.
 */

/** Half the paved width (m), the granite kerb's width, the gold inlay's inset from the kerb. */
const PATH_HALF_WIDTH = 1.8;
const KERB = 0.32;
const INLAY_INSET = 0.18;
/** The plaza round the summoning circle: the circle's radius plus this. */
const PLAZA_MARGIN = 1.7;

/** The magic street lamp: on the path's right, a little ahead (x, z), and how tall (m). On a tall
 *  screen the view is narrow near the eye: lamp and bench stand a little farther and closer in. */
const LAMP_HEIGHT = 4.4;
function lampFor(aspect: number): { x: number; z: number; height: number } {
  return aspect < 1 ? { x: PATH_HALF_WIDTH + KERB + 0.9, z: -11.5, height: LAMP_HEIGHT } : { x: PATH_HALF_WIDTH + KERB + 1.15, z: -8.5, height: LAMP_HEIGHT };
}
/** The bench: on the left, facing the path. */
function benchFor(aspect: number): { x: number; z: number } {
  return aspect < 1 ? { x: -(PATH_HALF_WIDTH + KERB + 0.95), z: -11 } : { x: -(PATH_HALF_WIDTH + KERB + 1.5), z: -7.2 };
}

/** The plaza for this aspect: centre z (negative, ahead) and radius. */
function plazaFor(aspect: number): { z: number; radius: number } {
  const spell = spellPlacement(aspect);
  return { z: -spell.distance, radius: spell.radius + PLAZA_MARGIN };
}

/** Where the lamp's light shines from (the lantern). */
function lampLight(aspect: number): [number, number, number] {
  const lamp = lampFor(aspect);
  return [lamp.x, lamp.height - 0.75, lamp.z];
}

export { benchFor, INLAY_INSET, KERB, lampFor, lampLight, PATH_HALF_WIDTH, plazaFor };
