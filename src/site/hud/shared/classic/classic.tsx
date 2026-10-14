import '@fontsource-variable/cinzel/wght.css';
import './classic.css';
import { useMemo } from 'react';
import type { HTMLAttributes, ReactNode, Ref, RefObject } from 'react';
import type { CardSuit } from '../../../../stage/cards/model';
import type { HudChapter as HudChapterData, HudModel } from '../../contract';
import { HudChapter } from '../../kit/HudChapter';
import { SubjectTabs } from '../../kit/SubjectTabs';
import { CountUp, WaxSeal } from '../../kit/parts';
import { percent } from '../../kit/format';
import { Suit, TILT, useFreshMoments, useWidth } from '../ascension/cards';
import type { Phase, Vars } from '../ascension/cards';
import { dealEnd, fanOf, lineOf, planCuts, stateOf } from './logic';
import type { ClassicBeat } from './logic';

/**
 * THE CLASSIC CARD — round 1's Chapter Deck card ("best one yet"), lifted
 * so round 3's decks deal the SAME card: cream stock, the Cinzel corner
 * index (number over suit), the title, the foot rule with done/total and
 * %, the course-accent hatched back, the pile, the deal and flip wave, and
 * the 3D pointer tilt with its glare. Gone: rarity badges and tallies, holo
 * and prism, and the pip field.
 *
 * ── API ──────────────────────────────────────────────────────────────
 *  <ClassicCard>   one chapter (a `kit/HudChapter`). Props:
 *     chapter, suit, reduced
 *     treatment  'cutoff' (default) — the INK LINE: below a crisp line at
 *                the chapter's % the card is re-inked in the learnt colour
 *                (a second copy of the face, clipped by transform only),
 *                with a thin bright line at the edge.
 *                'none' — no card-wide treatment; draw yours in the art
 *                window (deck-reveal's relic).
 *     art        what the ART WINDOW holds (default: the course's suit,
 *                large). The window is the `.cl-art` element with
 *                `data-classic-art` — the one flexible box between the
 *                index and the title (≈ 106 × 50–80 px on a 122 px card).
 *                With 'cutoff' the art is drawn twice (paper + ink copy),
 *                so pass only stateless art (SVG) there.
 *     next       a quiet "✦ Next" tab over the card.
 *     beat       this mount's moment (`planCuts`): the line snaps up at
 *                `beat.at`, the seal stamps at `beat.stamp`.
 *     children   extra decoration inside the face (aria-hidden yours).
 *   Finished (chapter.complete) = gold edge (`.cl-gild`) + `WaxSeal` in the
 *   top-right corner. Never holo or prism.
 *  <ClassicPile ref>  the round-1 pile (three cards, rank + suit) — the deal
 *                    flies out of it (pass its ref to `useDeal`).
 *  <ClassicHeader>    round 1's header: pile, kicker, `<h2>`, pill tabs,
 *                    the active subject's % (CountUp) + one quiet line.
 *  <ClassicHand>      the fanned rows (`.cl-hand > .cl-slot`); key it by
 *                    subject so a switch re-reveals instead of re-dealing.
 *  <ClassicLegend>    "learnt below the line · sealed = complete".
 *  useClassicLayout(handRef)  cards per row + fan, round 1's numbers.
 *  useClassicBeats(chapters, sample, phase)  the moments to play.
 *  The deal itself is `shared/ascension/cards › useDeal(pileRef, handRef,
 *  '.cl-slot', entered, reduced, subjectId)`; put its phase on an ancestor
 *  as `data-cl-phase` ('none' hides the hand; 'deal' flies + flips; 'swap'
 *  is the < 400 ms re-reveal; 'still' = reduced motion).
 *
 * ── CSS variables (set on any ancestor; defaults in classic.css) ──────
 *   --cl-paper        card stock (#efe6d2)          --cl-ink    text (#1a1a22)
 *   --cl-accent       index, suit, back (course accent)
 *   --cl-learnt       the ink below the line        --cl-learnt-ink  text on it
 *   --cl-learnt-index index + suit on it            --cl-line   the bright line
 *   --cl-line-glow    its glow                      --cl-gold-edge   finished frame
 *   --cl-radius       9px                           --cl-cinzel  the face font
 *   On the card itself: --cl-f (the line, 0..1, from `lineOf`), --cl-at.
 *   Hooks: `.cl-card[data-state=untouched|started|done][data-next]`,
 *   `.cl-front` (the face), `.cl-art[data-classic-art]` (the window),
 *   `.cl-ink` (the learnt copy), `.cl-edge` (the line), `.cl-gild`.
 */

/* ── the card ───────────────────────────────────────────────────────── */

type ClassicCardProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> & {
  chapter: HudChapterData;
  suit: CardSuit;
  reduced: boolean;
  treatment?: 'cutoff' | 'none';
  art?: ReactNode;
  next?: boolean;
  beat?: ClassicBeat;
  /** Pointer tilt + glare (default: on unless reduced). */
  tilt?: boolean;
  children?: ReactNode;
};

/** The face's content — drawn once on paper, and again in ink for the cut-off. */
function Face({ chapter, suit, art, ink }: { chapter: HudChapterData; suit: CardSuit; art?: ReactNode; ink: boolean }) {
  return (
    <>
      <span className='cl-top'>
        <span className='cl-index'>
          <span className='cl-num'>{chapter.number}</span>
          <Suit suit={suit} className='cl-index-suit' />
        </span>
      </span>
      <span className='cl-art' data-classic-art={ink ? undefined : ''} aria-hidden='true'>
        {art ?? <Suit suit={suit} className='cl-art-suit' />}
      </span>
      <span className='cl-title'>{chapter.title}</span>
      <span className='cl-foot'>
        <span>
          {chapter.done}/{chapter.total}
        </span>
        <span>{percent(chapter.fraction)}</span>
      </span>
    </>
  );
}

function ClassicCard({ chapter, suit, reduced, treatment = 'cutoff', art, next = false, beat, tilt, className, style, children, ...rest }: ClassicCardProps) {
  const state = stateOf(chapter);
  const line = lineOf(chapter.done, chapter.total);
  const tilting = tilt ?? !reduced;
  const vars: Vars = { ...style, '--cl-f': line, ...(beat ? { '--cl-at': `${beat.at}ms` } : {}) };
  return (
    <HudChapter
      chapter={chapter}
      className={`cl-card${className ? ` ${className}` : ''}`}
      data-state={state}
      data-treatment={treatment}
      data-next={next || undefined}
      data-cut={beat ? '' : undefined}
      style={vars}
      {...(tilting ? TILT : {})}
      {...rest}
    >
      {next && (
        <span className='cl-next' aria-hidden='true'>
          <Suit suit='star' className='cl-next-star' />
          Next
        </span>
      )}
      <span className='cl-flip'>
        <span className='cl-tilt'>
          <span className='cl-face cl-front'>
            <span className='cl-paper'>
              <Face chapter={chapter} suit={suit} art={art} ink={false} />
            </span>
            {treatment === 'cutoff' && line > 0 && (
              <span className='cl-ink' aria-hidden='true'>
                <span className='cl-ink-inner'>
                  <span className='cl-paper cl-paper-ink'>
                    <Face chapter={chapter} suit={suit} art={art} ink />
                  </span>
                </span>
                <span className='cl-edge' />
                <span className='cl-edge-glow' />
              </span>
            )}
            {state === 'done' && <span className='cl-gild' aria-hidden='true' />}
            {children}
            <span className='cl-glare' aria-hidden='true' />
          </span>
          {state === 'done' && (
            <span className='cl-seal' aria-hidden='true'>
              <WaxSeal size={26} stamp={!reduced && beat?.stamp != null} delay={beat?.stamp ?? 0} />
            </span>
          )}
          <span className='cl-face cl-back' aria-hidden='true'>
            <Suit suit={suit} className='cl-back-suit' />
          </span>
        </span>
      </span>
    </HudChapter>
  );
}

/* ── the pile ───────────────────────────────────────────────────────── */

function ClassicPile({ rank, suit, ref, className }: { rank: string; suit: CardSuit; ref?: Ref<HTMLDivElement>; className?: string }) {
  return (
    <div ref={ref} className={`cl-pile${className ? ` ${className}` : ''}`} aria-hidden='true'>
      <span className='cl-pile-card cl-pile-3' />
      <span className='cl-pile-card cl-pile-2' />
      <span className='cl-pile-card cl-pile-1'>
        <span className='cl-pile-rank'>{rank}</span>
        <Suit suit={suit} className='cl-pile-suit' />
        <span className='cl-pile-rank cl-pile-rank-low'>{rank}</span>
      </span>
    </div>
  );
}

/* ── the header (round 1's) ─────────────────────────────────────────── */

type ClassicHeaderProps = {
  model: HudModel;
  pileRef?: Ref<HTMLDivElement>;
  /** The tracked line over the title (decorative). */
  kicker?: string;
  /** Count the hero number up (e.g. once in view). */
  run: boolean;
  className?: string;
};

/** Pile · kicker · `<h2>` · pill tabs on the left; the active subject's %
 *  (the hero number) and one quiet line on the right. */
function ClassicHeader({ model, pileRef, kicker = 'Chapter collection', run, className }: ClassicHeaderProps) {
  const { course, active } = model;
  const pct = Math.floor(active.fraction * 100);
  return (
    <header className={`cl-head${className ? ` ${className}` : ''}`}>
      <ClassicPile ref={pileRef} rank={course.rank} suit={course.suit} />
      <div className='cl-titles'>
        <p className='cl-kicker' aria-hidden='true'>
          {kicker}
        </p>
        <h2 className='cl-h2'>
          {course.kicker} · {course.title}
        </h2>
        {model.subjects.length < 2 ? (
          <div className='cl-tabs'>
            <span className='cl-tab' data-static=''>
              <Suit suit={course.suit} className='cl-tab-suit' />
              {active.label}
            </span>
          </div>
        ) : (
          <SubjectTabs
            model={model}
            className='cl-tabs'
            tabClassName='cl-tab'
            renderTab={(subject) => (
              <>
                <Suit suit={course.suit} className='cl-tab-suit' />
                {subject.label}
                <span className='cl-tab-pct'>{percent(subject.fraction)}</span>
              </>
            )}
          />
        )}
      </div>
      <div className='cl-hero'>
        <span className='cl-hero-label' aria-hidden='true'>
          {active.label}
        </span>
        <span className='cl-hero-num' aria-hidden='true'>
          <CountUp value={pct} run={run} reducedMotion={model.reducedMotion} duration={1100} />
          <small>%</small>
        </span>
        <span className='sr-only'>
          {active.label}: {pct}% learnt.
        </span>
        <span className='cl-hero-meta'>
          {active.done}/{active.total} topics · {active.completeChapters}/{active.chapters.length} chapters sealed
        </span>
      </div>
    </header>
  );
}

/* ── the hand ───────────────────────────────────────────────────────── */

type ClassicLayout = { width: number; phone: boolean; perRow: number; maxRotate: number; arc: number };

/** Round 1's layout: 122 px cards 10 px apart (phones: as many ~104 px
 *  cards as fit, at least two), a stronger fan when a row is long.
 *  `reserve`: px kept free for the fan's overhang in a tight column. */
function useClassicLayout(handRef: RefObject<HTMLElement | null>, { card = 122, gap = 10, phoneAt = 600, phoneCard = 104, reserve = 0 } = {}): ClassicLayout {
  const measured = useWidth(handRef);
  const phone = measured < phoneAt;
  const width = phone ? measured : measured - reserve;
  const perRow = phone ? Math.max(2, Math.floor((width + 8) / (phoneCard + 8))) : Math.max(1, Math.floor((width + gap) / (card + gap)));
  return { width, phone, perRow, maxRotate: perRow >= 6 ? 7 : 2.5, arc: perRow >= 6 ? 16 : 6 };
}

const NO_BEATS: ReadonlyMap<string, ClassicBeat> = new Map();

/** The moments to play this mount (fresh `useProgressMoments` keys only),
 *  starting after the deal lands — or quickly after a subject switch. */
function useClassicBeats(chapters: readonly HudChapterData[], sample: boolean, phase: Phase, options?: Parameters<typeof planCuts>[3]): ReadonlyMap<string, ClassicBeat> {
  const moments = useFreshMoments(chapters, sample);
  const start = phase === 'deal' ? dealEnd(chapters.length) : 380;
  const cap = options?.cap;
  const spacing = options?.spacing;
  const stampAfter = options?.stampAfter;
  const beats = useMemo(() => planCuts(chapters, moments, start, { cap, spacing, stampAfter }), [chapters, moments, start, cap, spacing, stampAfter]);
  return phase === 'deal' || phase === 'swap' ? beats : NO_BEATS;
}

type ClassicHandProps = {
  chapters: readonly HudChapterData[];
  layout: Pick<ClassicLayout, 'phone' | 'perRow' | 'maxRotate' | 'arc'>;
  renderCard: (chapter: HudChapterData) => ReactNode;
  className?: string;
};

function ClassicHand({ chapters, layout, renderCard, className }: ClassicHandProps) {
  return (
    <ol className={`cl-hand${className ? ` ${className}` : ''}`} data-phone={layout.phone || undefined} style={{ '--per': layout.perRow } as Vars}>
      {chapters.map((chapter) => {
        const fan = fanOf(chapter.index, chapters.length, layout.perRow, layout.maxRotate, layout.arc);
        return (
          <li key={chapter.key} className='cl-slot' style={{ '--rot': `${fan.rotate}deg`, '--lift': `${fan.lift}px`, '--i': Math.min(chapter.index, 26) } as Vars}>
            {renderCard(chapter)}
          </li>
        );
      })}
    </ol>
  );
}

/* ── the legend ─────────────────────────────────────────────────────── */

/** A tiny key: a card inked to its line, and the seal. Decorative words
 *  only (the chapters carry their own numbers). */
function ClassicLegend({ className }: { className?: string }) {
  return (
    <span className={`cl-legend${className ? ` ${className}` : ''}`} aria-hidden='true'>
      <span className='cl-legend-item'>
        <span className='cl-legend-card' />
        learnt below the line
      </span>
      <span className='cl-legend-item'>
        <WaxSeal size={16} />
        sealed = complete
      </span>
    </span>
  );
}

export { ClassicCard, ClassicHand, ClassicHeader, ClassicLegend, ClassicPile, useClassicBeats, useClassicLayout };
export type { ClassicCardProps, ClassicLayout };
