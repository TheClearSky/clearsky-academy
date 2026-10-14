import { createContext, useContext } from 'react';
import type { Stage } from '../stage';

/**
 * The page's one stage (`stage.ts`), for the components that draw into it
 * (`CardSlot`, the chapter rings). `null` while it is being made, or when
 * this device has no WebGL — components then fall back to plain CSS.
 */
const StageContext = createContext<Stage | null>(null);

function useStage(): Stage | null {
  return useContext(StageContext);
}

export { StageContext, useStage };
