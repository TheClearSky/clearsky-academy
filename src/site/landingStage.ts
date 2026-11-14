import type { Stage } from '../stage/stage';
import type { LandscapeChoice } from './landscapeChoice';

/**
 * The landing's stage options for the visitor's landscape (oak or blossom):
 * the footpath scene (2026-10-17, Deepak: "switch permanently to footpath")
 * — the lawn and brick path (the floor's `path`), the meadow mist, no chess pieces or chair, the promenade
 * (bench, magic lamp, an avenue of the scene's trees) — and the Academy in
 * the royal design (`stage/world/landscape/academy.ts`).
 */
function stageOptions(choice: LandscapeChoice): Record<string, string> {
  return {
    landscape: choice,
    floor: 'path',
    fog: 'meadow',
    props: 'books',
    promenade: choice === 'grove' ? 'oak' : 'blossom',
  };
}

function applyStageOptions(stage: Stage | null, choice: LandscapeChoice): void {
  if (!stage) return;
  for (const [classId, optionId] of Object.entries(stageOptions(choice))) stage.setOption(classId, optionId);
}

export { applyStageOptions, stageOptions };
