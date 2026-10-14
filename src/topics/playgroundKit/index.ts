import '@fontsource/cormorant-garamond/latin-600-italic.css';
import './playground.css';

/**
 * The playground kit: everything a topic's `Playground.tsx` needs besides
 * its own scene (`contract.ts`). `npm run topic -- new` scaffolds a
 * playground that uses it.
 */
export { PlaygroundPanel, PlaygroundReadout, PlaygroundSlider } from './controls';
export { PlaygroundCanvas } from './PlaygroundCanvas';
export type { PlaygroundCanvasProps, PlaygroundScene, SetupContext } from './PlaygroundCanvas';
