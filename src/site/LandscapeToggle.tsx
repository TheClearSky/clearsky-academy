import { useState } from 'react';
import { useStage } from '../stage/react/StageContext';
import { applyStageOptions } from './landingStage';
import { readLandscapeChoice, writeLandscapeChoice } from './landscapeChoice';
import type { LandscapeChoice } from './landscapeChoice';
import { cn } from '../cn';

const LABELS: Record<LandscapeChoice, string> = { grove: 'Oak', blossom: 'Blossom' };
const NEXT: Record<LandscapeChoice, LandscapeChoice> = { grove: 'blossom', blossom: 'grove' };

function LandscapeIcon({ choice }: { choice: LandscapeChoice }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  if (choice === 'blossom') {
    // Five petals round an eye.
    return (
      <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
        {[0, 72, 144, 216, 288].map((angle) => (
          <ellipse key={angle} cx='12' cy='7' rx='2.6' ry='3.8' transform={`rotate(${angle} 12 12)`} {...stroke} />
        ))}
        <circle cx='12' cy='12' r='1.3' fill='currentColor' />
      </svg>
    );
  }
  // An oak: a three-lobed crown over a trunk that forks into it.
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
      <path d='M8 16.5a3.6 3.6 0 0 1-1.6-6.8A4 4 0 0 1 12 4.6a4 4 0 0 1 5.6 5.1A3.6 3.6 0 0 1 16 16.5Z' {...stroke} />
      <path d='M12 22v-8.5M12 16.2l-2.6-2.4M12 15l2.4-2.2' {...stroke} />
    </svg>
  );
}

/**
 * The landscape switch, beside the theme switch: the Academy in its oak
 * grove or among blossom. One button that flips between the two, showing
 * the current one (the label hides on a phone; the icon and its accessible
 * name stay). The stage starts on the stored choice (`LandingPage`).
 */
function LandscapeToggle({ className }: { className?: string }) {
  const stage = useStage();
  const [choice, setChoice] = useState(readLandscapeChoice);
  const next = NEXT[choice];
  return (
    <button
      type='button'
      onClick={() => {
        setChoice(next);
        writeLandscapeChoice(next);
        applyStageOptions(stage, next);
      }}
      title={`Scene: ${LABELS[choice]} — switch to ${LABELS[next]}`}
      aria-label={`Scene: ${LABELS[choice]}. Switch to ${LABELS[next]}`}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-full border border-primary-white/25 bg-primary-black/30 px-3 py-1.5 text-[13px] font-medium backdrop-blur hover:bg-primary-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-gold',
        className,
      )}
    >
      <LandscapeIcon choice={choice} />
      <span className='hidden sm:inline'>{LABELS[choice]}</span>
    </button>
  );
}

export { LandscapeToggle };
