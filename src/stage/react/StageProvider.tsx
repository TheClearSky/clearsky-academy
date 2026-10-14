import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createStage } from '../stage';
import type { Stage } from '../stage';
import { StageContext } from './StageContext';
import { useReducedMotion } from '../../site/useReducedMotion';

type StageProviderProps = {
  /** The asset-class picks (`stageSelection.ts`). */
  selection: Record<string, string>;
  children: ReactNode;
};

/**
 * Makes the page's ONE stage behind its content and shares it with the
 * cards and rings (`StageContext`). The stage sits in a fixed, full-viewport
 * layer under the page (the page scrolls over it; the cards and rings follow
 * their DOM anchors). It is made again when reduced motion is switched, and
 * disposed — giving its WebGL context back — when the page goes.
 *
 * No WebGL (blocked, very old device): the context stays null, the layer
 * shows a plain night gradient, and every card and ring renders as CSS.
 */
function StageProvider({ selection, children }: StageProviderProps) {
  const reducedMotion = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [failed, setFailed] = useState(false);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let created: Stage;
    try {
      created = createStage(host, { reducedMotion, selection: selectionRef.current });
    } catch (error) {
      console.warn('[stage] no WebGL; the page renders without its 3D layer', error);
      setFailed(true);
      return undefined;
    }
    setFailed(false);
    setStage(created);
    if (import.meta.env.DEV) (window as Window & { __stage?: Stage }).__stage = created;
    return () => {
      created.dispose();
      setStage(null);
    };
  }, [reducedMotion]);

  return (
    <StageContext.Provider value={stage}>
      <div
        ref={hostRef}
        aria-hidden='true'
        data-slot='stage-layer'
        className={failed ? 'fixed inset-0 bg-[radial-gradient(ellipse_at_50%_30%,var(--color-primary-blue),var(--color-primary-black)_70%)]' : 'fixed inset-0 bg-primary-black'}
      />
      {children}
    </StageContext.Provider>
  );
}

export { StageProvider };
