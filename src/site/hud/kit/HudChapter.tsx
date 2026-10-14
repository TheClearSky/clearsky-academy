import { forwardRef } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import type { HudChapter as HudChapterData } from '../contract';

type HudChapterProps = Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'children'> & {
  chapter: HudChapterData;
  className?: string;
  style?: CSSProperties;
  /** What the design draws: visible text (number, title, count) and `aria-hidden` decoration. */
  children?: ReactNode;
};

/**
 * The ONE accessible core of a chapter, shared by every HUD design
 * (TECHNIQUES.md §6): a focusable `role="progressbar"` named "Chapter n:
 * title", whose value is the TRUE progress at once (only the drawing
 * animates) and whose `aria-valuetext` reads "3 of 7 topics learnt". A
 * progressbar's children are presentational, so a design puts its visible
 * text and graphics inside freely; it must not put links or buttons in it.
 *
 * `data-hud-chapter` and `data-complete` are styling hooks; the focus ring
 * is the design's (`:focus-visible`).
 */
const HudChapter = forwardRef<HTMLDivElement, HudChapterProps>(function HudChapter({ chapter, className, style, children, ...rest }, ref) {
  return (
    <div
      ref={ref}
      role='progressbar'
      tabIndex={0}
      aria-label={`Chapter ${chapter.number}: ${chapter.title}`}
      aria-valuemin={0}
      aria-valuemax={chapter.total}
      aria-valuenow={chapter.done}
      aria-valuetext={`${chapter.done} of ${chapter.total} topics learnt`}
      data-hud-chapter=''
      data-complete={chapter.complete || undefined}
      className={className}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
});

export { HudChapter };
