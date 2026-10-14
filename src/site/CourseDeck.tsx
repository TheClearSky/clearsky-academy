import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useProgress } from '../curriculum/progressStore';
import { CardSlot } from '../stage/react/CardSlot';
import { useStage } from '../stage/react/StageContext';
import type { TableLayout } from '../stage/cards/cardTable';
import { cn } from '../cn';
import { useTheme } from '../theme';
import { cardModelFor, courseProgress } from './courses';
import type { Course } from './courses';

type CourseDeckProps = {
  courses: Course[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** A card was picked (and is spinning onto the held spot). */
  onPicked?: () => void;
  /** The cards were dealt or gathered by hand, so none is held any more. */
  onUnpicked?: () => void;
  /** On mount, put the selected course's card straight back on the held
   *  spot, with no spin (the visitor is coming back to the page). */
  restorePicked?: boolean;
};

/**
 * The six course decks as playing cards (`stage/cards/`): each card's rank,
 * suit and illustration are its course's, and its finish is earned by the
 * course's progress. The stage deals them out of a deck when this section
 * scrolls into view and gathers them back when the page returns to the
 * hero; the button below gathers or deals by hand. Each card is a real
 * button (click, Enter or Space picks the course whose chapter rings the
 * tracker below shows) carrying the card's text for screen readers.
 *
 * Picking a card KEEPS it: it spins onto the held spot, the rest gather
 * into the deck beside it, and the button offers "Pick another card"
 * (the owner, 2026-10-12). The two spots are invisible elements over the
 * grid that the stage poses the cards from.
 *
 * The cards size themselves to fit one screen: the smaller of the column
 * width, 230 px, and the height left for two rows (three on phones) after
 * the heading and the button — so the whole deck is always in view.
 */

const noSubscription = () => () => {};

/** The kept card, this much larger than a card in its slot. */
const HELD_SCALE = 1.25;

function CourseDeck({ courses, selectedKey, onSelect, onPicked, onUnpicked, restorePicked = false }: CourseDeckProps) {
  const stage = useStage();
  const done = useProgress();
  const deckRef = useRef<HTMLUListElement>(null);
  const heldRef = useRef<HTMLDivElement>(null);
  const deckSpotRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const models = useMemo(() => new Map(courses.map((course) => [course.key, cardModelFor(course, courseProgress(course, done))])), [courses, done]);
  const layout = useSyncExternalStore<TableLayout>(
    stage ? stage.cards.subscribe : noSubscription,
    useCallback(() => (stage ? stage.cards.layout() : 'slots'), [stage]),
  );
  const dealt = layout === 'slots';

  // The cards follow the site theme (System / Light / Dark).
  const theme = useTheme();
  useEffect(() => {
    stage?.setOption('cardTheme', theme);
  }, [stage, theme]);

  useEffect(() => {
    if (!stage) return undefined;
    stage.cards.setBackdrop(deckRef.current);
    stage.cards.setPickSpots(heldRef.current, deckSpotRef.current);
    return () => {
      stage.cards.setBackdrop(null);
      stage.cards.setPickSpots(null, null);
    };
  }, [stage]);

  // Coming back: the card the visitor had picked is already held (once, when the stage is up).
  const restoreRef = useRef(restorePicked);
  useEffect(() => {
    if (!stage || !restoreRef.current) return;
    restoreRef.current = false;
    const index = courses.findIndex((course) => course.key === selectedKey);
    const slot = deckRef.current?.querySelectorAll('[data-slot="card-slot"]')[index];
    if (slot instanceof HTMLElement) stage.cards.pick(slot, { instant: true });
  }, [stage, courses, selectedKey]);

  // Dealing or gathering by hand lets go of the held card.
  const setDealt = (dealt: boolean) => {
    if (!stage) return;
    stage.cards.setDealt(dealt);
    onUnpicked?.();
  };

  // The spots are sized from a slot's live width (the slots size themselves to the screen).
  const [cardWidth, setCardWidth] = useState(0);
  useEffect(() => {
    const first = deckRef.current?.querySelector('[data-slot="card-slot"]');
    if (!first) return undefined;
    const observer = new ResizeObserver(() => setCardWidth(first.getBoundingClientRect().width));
    observer.observe(first);
    return () => observer.disconnect();
  }, []);

  const pick = (key: string, slot: Element | null) => {
    onSelect(key);
    if (!stage || !(slot instanceof HTMLElement)) return;
    stage.cards.pick(slot);
    onPicked?.();
    // The slots go inert under the picked view: keep the focus on the way on.
    requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
  };

  return (
    <div data-slot='course-deck' className='flex w-full flex-col items-center'>
      <div className='relative w-full'>
        <ul
          ref={deckRef}
          role='radiogroup'
          aria-label='Courses'
          className='mx-auto grid max-w-[860px] grid-cols-2 justify-items-center gap-x-[clamp(12px,4vw,56px)] gap-y-8 sm:grid-cols-3'
        >
          {courses.map((course, index) => {
            const model = models.get(course.key)!;
            const selected = course.key === selectedKey;
            return (
              <li
                key={course.key}
                // Gathered into the deck (or picked), the slots are empty: not clickable, not tabbable.
                inert={!dealt}
                className='w-[min(100%,calc((100svh_-_290px)/3*0.716))] sm:w-[min(230px,100%,calc((100svh_-_250px)/2*0.716))]'
              >
                <CardSlot model={model} selected={selected} seed={index * 0.173 + 0.05}>
                  <button
                    type='button'
                    role='radio'
                    aria-checked={selected}
                    onClick={(event) => pick(course.key, event.currentTarget.closest('[data-slot="card-slot"]'))}
                    className='absolute inset-0 cursor-pointer rounded-[5.5%] outline-none'
                  >
                    <span className='sr-only'>
                      {course.title} — {course.kicker}: {model.subjects.join(', ')}. {model.chapters} chapters, {Math.round(model.fraction * 100)}% learnt.
                    </span>
                  </button>
                </CardSlot>
              </li>
            );
          })}
        </ul>
        {stage && layout === 'deck' && (
          // The gathered deck sits in the middle of the grid: clicking it deals.
          <button type='button' tabIndex={-1} aria-hidden='true' onClick={() => setDealt(true)} className='absolute inset-0 cursor-pointer' />
        )}
        {/* The picked view: the deck, and the kept card beside it (side by side; stacked on phones). */}
        <div aria-hidden='true' className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-[clamp(32px,6vw,80px)]'>
          <div ref={deckSpotRef} style={{ width: cardWidth }} className='relative aspect-[63/88]'>
            {stage && layout === 'picked' && (
              <button type='button' tabIndex={-1} onClick={() => setDealt(true)} className='pointer-events-auto absolute inset-0 cursor-pointer' />
            )}
          </div>
          <div ref={heldRef} style={{ width: cardWidth * HELD_SCALE }} className={cn('aspect-[63/88]', layout === 'picked' && 'pointer-events-auto cursor-pointer')} />
        </div>
      </div>
      {stage && (
        <button
          ref={buttonRef}
          type='button'
          onClick={() => setDealt(!dealt)}
          className={cn(
            'mt-6 flex cursor-pointer items-center gap-2 rounded-full border px-5 py-2 text-[14px] font-medium backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-gold',
            dealt ? 'border-primary-white/25 bg-primary-black/30 text-primary-white hover:bg-primary-white/10' : 'border-accent-gold/60 bg-accent-gold/15 text-accent-gold hover:bg-accent-gold/25',
          )}
        >
          <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
            {layout === 'slots' && <path d='M7 4h10v14H7zM9 20h10V6' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinejoin='round' />}
            {layout === 'deck' && <path d='M3 8l6-3 2 13-6 2zM13 5h8v14h-8z' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinejoin='round' />}
            {layout === 'picked' && <path d='M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />}
          </svg>
          {layout === 'slots' ? 'Gather the deck' : layout === 'deck' ? 'Deal the cards' : 'Pick another card'}
        </button>
      )}
    </div>
  );
}

export { CourseDeck };
