import '@fontsource-variable/bodoni-moda/wght.css';
import '@fontsource-variable/cinzel/wght.css';
import '@fontsource/barlow-condensed/600.css';
import './cards.css';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode, RefObject } from 'react';
import type { CardSuit } from '../../../../stage/cards/model';
import type { HudChapter as HudChapterData, HudSubject } from '../../contract';
import { HudChapter } from '../../kit/HudChapter';
import { Crystal, WaxSeal } from '../../kit/parts';
import { useProgressMoments } from '../../kit/progressMoments';
import type { Moment } from '../../kit/progressMoments';
import { pad2 } from '../../kit/format';
import { SUIT_PATHS, TIER_NAME, tierOf } from './logic';
import type { Beat, Tier } from './logic';

/**
 * The round-2 card kit, shared by the Ascension Deck and the mixes that
 * deal its cards (title deck, order deck, album, arcana): the suit, the
 * per-subject line art, the violet harlequin back, the Ascension card
 * itself (giant numeral · art window that fills with light · title plate,
 * its material earned by progress), the once-only tier headline, and the
 * hooks — fresh moments, the deal from the pile, pointer tilt, width.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/* ── small art ──────────────────────────────────────────────────────── */

function Suit({ suit, className }: { suit: CardSuit; className?: string }) {
  return (
    <svg viewBox='-0.5 -0.5 1 1' className={className} aria-hidden='true'>
      <path d={SUIT_PATHS[suit]} />
    </svg>
  );
}

/** One line drawing per subject (in the spirit of the stage cards' art):
 *  a compass construction, an atom, a projectile, a benzene ring. */
function SubjectArt({ subject, className }: { subject: HudSubject['subject']; className?: string }) {
  return (
    <svg viewBox='0 0 100 80' className={className} aria-hidden='true' preserveAspectRatio='xMidYMid meet'>
      <g className='asc-rays'>
        {Array.from({ length: 16 }, (_, index) => {
          const angle = (index / 16) * Math.PI * 2;
          return <line key={index} x1={50 + Math.cos(angle) * 12} y1={42 + Math.sin(angle) * 12} x2={50 + Math.cos(angle) * 70} y2={42 + Math.sin(angle) * 70} />;
        })}
      </g>
      {subject === 'mathematics' && (
        <g>
          <circle cx='50' cy='44' r='20' />
          <path d='M50 24 L67.3 54 L32.7 54 Z' />
          <path d='M33 54 A34.6 34.6 0 0 1 77 26' className='asc-dash' />
          <path d='M67 54 A34.6 34.6 0 0 0 23 26' className='asc-dash' />
          <path d='M50 24 L56 7 L62 24' />
          <circle cx='56' cy='7' r='1.6' className='asc-dot' />
          <circle cx='50' cy='24' r='1.4' className='asc-dot' />
          <circle cx='67.3' cy='54' r='1.4' className='asc-dot' />
          <circle cx='32.7' cy='54' r='1.4' className='asc-dot' />
        </g>
      )}
      {subject === 'science' && (
        <g>
          <ellipse cx='50' cy='42' rx='27' ry='9.5' />
          <ellipse cx='50' cy='42' rx='27' ry='9.5' transform='rotate(60 50 42)' />
          <ellipse cx='50' cy='42' rx='27' ry='9.5' transform='rotate(120 50 42)' />
          <circle cx='50' cy='42' r='3.6' className='asc-dot' />
          <circle cx='77' cy='42' r='1.6' className='asc-dot' />
          <circle cx='36.5' cy='18.6' r='1.6' className='asc-dot' />
          <circle cx='36.5' cy='65.4' r='1.6' className='asc-dot' />
        </g>
      )}
      {subject === 'physics' && (
        <g>
          <path d='M10 68 H90' />
          <path d='M14 68 Q50 -8 86 68' className='asc-dash' />
          <path d='M14 68 L27 47' />
          <path d='M27 47 L22.6 48.6 L25.8 51.2 Z' className='asc-dot' />
          <path d='M50 30 H64' />
          <path d='M64 30 L60 27.8 L60 32.2 Z' className='asc-dot' />
          <circle cx='50' cy='30' r='3' className='asc-dot' />
          <path d='M24 68 A10 10 0 0 0 19.5 59.8' />
        </g>
      )}
      {subject === 'chemistry' && (
        <g>
          <path d='M50 26 L63.9 34 L63.9 50 L50 58 L36.1 50 L36.1 34 Z' />
          <circle cx='50' cy='42' r='8.5' />
          <path d='M50 26 V12 M63.9 34 L76 27 M63.9 50 L76 57 M50 58 V72 M36.1 50 L24 57 M36.1 34 L24 27' />
          {[
            [50, 11],
            [77, 26.5],
            [77, 57.5],
            [50, 73],
            [23, 57.5],
            [23, 26.5],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r='1.8' className='asc-dot' />
          ))}
        </g>
      )}
    </svg>
  );
}

/** The landing's card back: a violet harlequin with a gold ✦ medallion. */
function CardBack({ className }: { className?: string }) {
  return (
    <span className={`asc-back${className ? ` ${className}` : ''}`} aria-hidden='true'>
      <span className='asc-back-medallion'>
        <Suit suit='star' className='asc-back-star' />
      </span>
    </span>
  );
}

/** The crimson wax seal with two ribbon tails (royal charters). */
function RibbonSeal({ size = 34, stamp = false, delay = 0, className }: { size?: number; stamp?: boolean; delay?: number; className?: string }) {
  return (
    <span className={`asc-ribbonseal${className ? ` ${className}` : ''}`} style={{ '--seal': `${size}px`, '--seal-delay': `${delay}ms` } as Vars} data-stamp={stamp || undefined} aria-hidden='true'>
      <span className='asc-tail asc-tail-l' />
      <span className='asc-tail asc-tail-r' />
      <WaxSeal size={size} stamp={stamp} delay={delay} />
    </span>
  );
}

/* ── hooks ──────────────────────────────────────────────────────────── */

/** `useProgressMoments`, minus the keys this mount has already celebrated —
 *  so switching subjects and back never replays a celebration (even in the
 *  sample preview, where every started chapter is a moment). */
function useFreshMoments(chapters: readonly HudChapterData[], sample: boolean): ReadonlyMap<string, Moment> {
  const moments = useProgressMoments(chapters, sample);
  const shown = useRef(new Set<string>());
  const fresh = useMemo(() => {
    const out = new Map<string, Moment>();
    for (const [key, moment] of moments) if (!shown.current.has(key)) out.set(key, moment);
    return out;
  }, [moments]);
  useEffect(() => {
    for (const key of fresh.keys()) shown.current.add(key);
  }, [fresh]);
  return fresh;
}

/** The element's content width, kept current. */
function useWidth(ref: RefObject<HTMLElement | null>, fallback = 1000): number {
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

type Phase = 'none' | 'deal' | 'swap' | 'still';

/**
 * The deal: once the hand is in view, every card is measured against the
 * pile (`--dx`/`--dy`) and flies out face-down, then flips up. It plays
 * ONCE per mount; a later subject switch is a quick re-reveal (`swap`).
 */
function useDeal(pileRef: RefObject<HTMLElement | null>, handRef: RefObject<HTMLElement | null>, slotSelector: string, entered: boolean, reduced: boolean, subjectId: string): Phase {
  const [dealtFor, setDealtFor] = useState<string | null>(null);
  const [switched, setSwitched] = useState(false);
  useLayoutEffect(() => {
    if (!entered || reduced || dealtFor) return;
    const pile = pileRef.current?.getBoundingClientRect();
    const slots = handRef.current?.querySelectorAll<HTMLElement>(slotSelector);
    if (pile && slots) {
      const px = pile.left + pile.width / 2;
      const py = pile.top + pile.height / 2;
      slots.forEach((slot) => {
        const box = slot.getBoundingClientRect();
        slot.style.setProperty('--dx', `${(px - (box.left + box.width / 2)).toFixed(0)}px`);
        slot.style.setProperty('--dy', `${(py - (box.top + box.height / 2)).toFixed(0)}px`);
      });
    }
    setDealtFor(subjectId);
  }, [entered, reduced, dealtFor, subjectId, pileRef, handRef, slotSelector]);
  useEffect(() => {
    if (dealtFor && subjectId !== dealtFor) setSwitched(true);
  }, [dealtFor, subjectId]);
  if (reduced) return 'still';
  if (!dealtFor) return 'none';
  return switched || subjectId !== dealtFor ? 'swap' : 'deal';
}

/* Pointer tilt: the rect is cached on enter, so the lift under the pointer
 * never feeds back into the angle (review §1 finding 5). */
const tiltBoxes = new WeakMap<Element, DOMRect>();
function tiltEnter(event: PointerEvent<HTMLElement>) {
  if (event.pointerType === 'touch') return;
  tiltBoxes.set(event.currentTarget, event.currentTarget.getBoundingClientRect());
}
function tiltMove(event: PointerEvent<HTMLElement>) {
  if (event.pointerType === 'touch') return;
  let box = tiltBoxes.get(event.currentTarget);
  if (!box) {
    box = event.currentTarget.getBoundingClientRect();
    tiltBoxes.set(event.currentTarget, box);
  }
  const x = (event.clientX - box.left) / box.width - 0.5;
  const y = (event.clientY - box.top) / box.height - 0.5;
  event.currentTarget.style.setProperty('--ry', `${(x * 18).toFixed(2)}deg`);
  event.currentTarget.style.setProperty('--rx', `${(-y * 16).toFixed(2)}deg`);
  event.currentTarget.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
}
function tiltLeave(event: PointerEvent<HTMLElement>) {
  tiltBoxes.delete(event.currentTarget);
  event.currentTarget.style.setProperty('--ry', '0deg');
  event.currentTarget.style.setProperty('--rx', '0deg');
}
const TILT = { onPointerEnter: tiltEnter, onPointerMove: tiltMove, onPointerLeave: tiltLeave };

/* ── the Ascension card ─────────────────────────────────────────────── */

type AscensionCardProps = {
  chapter: HudChapterData;
  subject: HudSubject['subject'];
  suit: CardSuit;
  next?: boolean;
  beat?: Beat;
  /** `compact`: no art window — the whole face fills with light. */
  variant?: 'full' | 'compact';
  /** `across`: a bigger seal stamped across the lower corner. */
  seal?: 'corner' | 'across';
  reduced: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/**
 * A chapter as an Ascension card — three zones only: the giant numeral of
 * topics learnt (and a small "/9"), the art window that fills with light
 * from the bottom like liquid in a glass, and the title plate. The stock
 * is its tier: cream, gilt edge, foil, prism + a crimson seal.
 */
function AscensionCard({ chapter, subject, suit, next = false, beat, variant = 'full', seal = 'corner', reduced, className, style, children }: AscensionCardProps) {
  const tier: Tier = tierOf(chapter.done, chapter.total);
  const vars: Vars = {
    ...style,
    '--fill': chapter.fraction,
    ...(beat?.rise != null ? { '--rise': `${beat.rise}ms` } : {}),
    ...(beat?.ascend != null ? { '--ascend': `${beat.ascend}ms` } : {}),
  };
  return (
    <HudChapter
      chapter={chapter}
      className={`asc-card${className ? ` ${className}` : ''}`}
      data-tier={tier}
      data-variant={variant}
      data-next={next || undefined}
      data-rise={beat?.rise != null || undefined}
      data-ascend={beat?.ascend != null || undefined}
      style={vars}
      {...(reduced ? {} : TILT)}
    >
      {next && (
        <span className='asc-next' aria-hidden='true'>
          <Crystal size={15} live={!reduced} className='asc-next-crystal' />
          Next
        </span>
      )}
      <span className='asc-flip'>
        <span className='asc-tilt'>
          <span className='asc-face asc-front'>
            <span className='asc-top'>
              <span className='asc-num'>
                <b>{chapter.done}</b>
                <small>/{chapter.total}</small>
              </span>
              <Suit suit={suit} className='asc-suit' />
            </span>
            {variant === 'full' ? (
              <span className='asc-window' aria-hidden='true'>
                <SubjectArt subject={subject} className='asc-art asc-art-dry' />
                <span className='asc-liquid'>
                  <span className='asc-liquid-inner'>
                    <SubjectArt subject={subject} className='asc-art asc-art-wet' />
                  </span>
                </span>
                <span className='asc-surface'>
                  <span className='asc-meniscus' />
                </span>
              </span>
            ) : (
              <span className='asc-vial' aria-hidden='true'>
                <span className='asc-liquid' />
                <span className='asc-surface'>
                  <span className='asc-meniscus' />
                </span>
              </span>
            )}
            <span className='asc-plate'>
              <span className='asc-ch'>Chapter {pad2(chapter.number)}</span>
              <span className='asc-title'>{chapter.title}</span>
            </span>
            <span className='asc-glare' aria-hidden='true' />
            {(tier === 'foil' || tier === 'prism') && <span className='asc-sheen' aria-hidden='true' />}
            {children}
          </span>
          {tier === 'prism' && <RibbonSeal className={`asc-seal asc-seal-${seal}`} size={seal === 'across' ? 44 : 30} stamp={!reduced && beat?.stamp != null} delay={beat?.stamp ?? 0} />}
          <CardBack className='asc-face' />
        </span>
      </span>
    </HudChapter>
  );
}

/* ── the tier headline ──────────────────────────────────────────────── */

/** "PRISM" — the tier named once, Marvel-Snap style, when a moment earns it. */
function TierHeadline({ tier, chapter, others, at, className }: { tier: Tier; chapter: Pick<HudChapterData, 'number' | 'title'>; others: number; at: number; className?: string }) {
  return (
    <div className={`asc-headline${className ? ` ${className}` : ''}`} data-tier={tier} style={{ '--at': `${at}ms` } as Vars} aria-hidden='true'>
      <span className='asc-headline-burst' />
      <span className='asc-headline-word'>{TIER_NAME[tier]}</span>
      <span className='asc-headline-sub'>
        Chapter {chapter.number} · {chapter.title}
        {others > 0 && <i> + {others} more</i>}
      </span>
    </div>
  );
}

export { AscensionCard, CardBack, RibbonSeal, Suit, SubjectArt, TierHeadline, TILT, useDeal, useFreshMoments, useWidth };
export type { Phase, Vars };
