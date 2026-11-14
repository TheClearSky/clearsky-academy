import { STORAGE_NAMESPACE } from '../storageNamespace';

/**
 * The visitor's landscape (`stage/world/landscape/`): the Academy in its oak
 * grove or among blossom (Deepak, 2026-10-17: "keep groove and blossom, and
 * give user a toggle at top right"). Remembered in this browser, a viewer
 * convenience — it renders correctly without storage (the grove).
 */

type LandscapeChoice = 'grove' | 'blossom';

const KEY = `${STORAGE_NAMESPACE}:landscape`;
const DEFAULT_LANDSCAPE: LandscapeChoice = 'grove';

function isLandscapeChoice(value: unknown): value is LandscapeChoice {
  return value === 'grove' || value === 'blossom';
}

function readLandscapeChoice(): LandscapeChoice {
  try {
    const stored = localStorage.getItem(KEY);
    return isLandscapeChoice(stored) ? stored : DEFAULT_LANDSCAPE;
  } catch {
    return DEFAULT_LANDSCAPE;
  }
}

function writeLandscapeChoice(choice: LandscapeChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    // Storage blocked: the choice still holds for this visit.
  }
}

export { DEFAULT_LANDSCAPE, isLandscapeChoice, readLandscapeChoice, writeLandscapeChoice };
export type { LandscapeChoice };
