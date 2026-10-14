import { useEffect, useRef } from 'react';
import { useStage } from './StageContext';
import type { RingHandle } from '../ui/rings';
import { cn } from '../../cn';

type ChapterRingProps = {
  /** The chapter's name (the progressbar's accessible label). */
  label: string;
  /** Short text inside the ring (e.g. the chapter number). */
  glyph: string;
  done: number;
  total: number;
  className?: string;
};

/**
 * A chapter's RPG-style progress ring. The ring itself is drawn by the
 * stage's ring layer (one instanced draw for all of them); this is the DOM
 * half: the real `role="progressbar"` (its value is the TRUE progress at
 * once — the drawing animates, the screen reader is never spammed), the
 * glyph, and a counter whose text counts up with the drawn fill.
 *
 * Without a stage (no WebGL) it is a plain bordered circle with the numbers.
 */
function ChapterRing({ label, glyph, done, total, className }: ChapterRingProps) {
  const stage = useStage();
  const anchorRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const handleRef = useRef<RingHandle | null>(null);
  const latestRef = useRef({ done, total });
  latestRef.current = { done, total };

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!stage || !anchor) return undefined;
    const handle = stage.rings.register(anchor, counterRef.current, latestRef.current);
    handleRef.current = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
  }, [stage]);

  useEffect(() => {
    handleRef.current?.set({ done, total });
  }, [done, total, stage]);

  return (
    <div
      ref={anchorRef}
      role='progressbar'
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${done} of ${total} topics learnt`}
      tabIndex={0}
      data-slot='chapter-ring'
      className={cn(
        'relative flex aspect-square flex-col items-center justify-center rounded-full font-semibold text-primary-white outline-none focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-accent-gold',
        !stage && 'border-2 border-accent-gold/50',
        className,
      )}
    >
      <span aria-hidden='true' className='text-[22px] leading-none font-semibold [text-shadow:0_1px_6px_var(--color-primary-black)]'>
        {glyph}
      </span>
      <span ref={counterRef} aria-hidden='true' className='mt-1 text-[11px] tracking-wider text-primary-white/70 tabular-nums'>
        {`${done}/${total}`}
      </span>
    </div>
  );
}

export { ChapterRing };
