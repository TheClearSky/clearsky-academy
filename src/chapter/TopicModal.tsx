import './topic-modal.css';
import { lazy, Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { SourceText } from '../curriculum/SourceText';
import type { HudChapter } from '../site/hud/contract';
import { pad2 } from '../site/hud/kit/format';
import { CrystalShape } from '../site/hud/kit/parts';
import type { TopicEntry } from '../topics/contract';
import { playgroundLoader } from '../topics/registry';
import { cardFlights, seedOf, sheetClips } from './topicMotion';
import type { Point } from './topicMotion';

/**
 * A topic's full-page modal (Deepak, round 4: "clicking on a topic opens
 * basically a modal like-page with a cross button … a really cool opening
 * and closing animation … some cards should fly around too"): the topic,
 * its animated YouTube video, and a three.js playground to try the concept
 * (`src/topics/`, one folder per topic; a topic without media yet shows
 * "in the works" in their place).
 *
 * It lives at `/chapter/<doc>/<n>/topic/<t>` so Back closes it. The chapter
 * page keeps it mounted after the address loses the topic and sets
 * `closing`: the exit plays whichever way it was closed (×, Esc, Back), then
 * `onClosed` unmounts it. The choreography is in `topicMotion.ts`; with
 * reduced motion it only fades. While open the page under it can't scroll,
 * Tab stays inside, Esc closes, and focus goes back to the station after.
 */

const CARD_COUNT = 9;
const OPEN_MS = 860;
const CLOSE_MS = 640;

type TopicModalProps = {
  topic: HudChapter;
  total: number;
  /** "Chapter 04 · Quadratic Equations". */
  chapterLine: string;
  entry: TopicEntry | undefined;
  frontier: boolean;
  sample: boolean;
  reduced: boolean;
  closing: boolean;
  /** Where the topic's station is on screen now (the animation's origin). */
  origin: () => Point;
  onRequestClose(): void;
  onClosed(): void;
  onToggle(): void;
  onGo(topicNumber: number): void;
};

function TopicVideo({ youtube, title }: { youtube: string | null; title: string }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => setPlaying(false), [youtube]);
  if (!youtube) {
    return (
      <div className='tm-video tm-video-empty'>
        <svg viewBox='-30 -30 60 60' aria-hidden='true' className='tm-video-crystal'>
          <g transform='scale(1.8)'>
            <CrystalShape />
          </g>
        </svg>
        <p className='tm-video-soon'>The animation for this topic is in the works.</p>
      </div>
    );
  }
  // A facade: the player (and YouTube's scripts) load only on a click.
  return (
    <>
      <div className='tm-video'>
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtube}?autoplay=1&rel=0&modestbranding=1`}
            title={title}
            allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
            referrerPolicy='strict-origin-when-cross-origin'
            allowFullScreen
          />
        ) : (
          <button type='button' className='tm-video-facade' onClick={() => setPlaying(true)} aria-label={`Play the video: ${title}`}>
            <img src={`https://i.ytimg.com/vi/${youtube}/maxresdefault.jpg`} alt='' loading='lazy' />
            <span className='tm-video-play' aria-hidden='true' />
          </button>
        )}
      </div>
      {/* The video's title opens its YouTube page in a new tab, to comment there (Deepak, video 1's ⊂ shot, 2026-11-13:
          "you can click video ka title, isse ek naye tab mein youtube khulega and then you can comment"). */}
      <a className='tm-video-title' href={youtubeWatchUrl(youtube)} target='_blank' rel='noopener noreferrer'>
        <span className='tm-video-title-text'>{title}</span>
        <span className='tm-video-title-cta'>
          <svg viewBox='0 0 24 24' aria-hidden='true'>
            <path d='M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinejoin='round' />
          </svg>
          Comment on YouTube
          <span className='sr-only'> (opens in a new tab)</span>
          <span aria-hidden='true'>↗</span>
        </span>
      </a>
    </>
  );
}

/** A video's YouTube watch page (comments live there). */
function youtubeWatchUrl(youtube: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtube)}`;
}

function TopicPlayground({ slug, reduced, active }: { slug: string | undefined; reduced: boolean; active: boolean }) {
  const Playground = useMemo(() => {
    const loader = slug ? playgroundLoader(slug) : undefined;
    return loader ? lazy(loader) : null;
  }, [slug]);
  if (!Playground) return <p className='tm-soon'>An interactive playground for this topic is in the works.</p>;
  return (
    <Suspense fallback={<div className='tm-playground-loading' aria-hidden='true' />}>
      <Playground reducedMotion={reduced} active={active} />
    </Suspense>
  );
}

function TopicModal({ topic, total, chapterLine, entry, frontier, sample, reduced, closing, origin, onRequestClose, onClosed, onToggle, onGo }: TopicModalProps) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const seed = seedOf(entry?.key ?? topic.key);
  const [size] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  // The page under the modal holds still.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  // OPEN: the rail races out of the station, the sheet opens from it, cards burst out.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const rail = railRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !rail || !backdrop) return;
    closeRef.current?.focus({ preventScroll: true });
    const items = [...sheet.querySelectorAll<HTMLElement>('.tm-in')];
    if (reduced) {
      for (const element of [backdrop, sheet]) element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      return;
    }
    const at = origin();
    const [point, line, full] = sheetClips(at, size, 18);
    rail.style.setProperty('--tm-ox', `${at.x}px`);
    rail.style.top = `${at.y}px`;
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out', fill: 'backwards' });
    rail.animate(
      [
        { transform: 'scaleX(0)', opacity: 1 },
        { transform: 'scaleX(1)', opacity: 1, offset: 0.4 },
        { transform: 'scaleX(1)', opacity: 1, offset: 0.62 },
        { transform: 'scaleX(1)', opacity: 0 },
      ],
      { duration: OPEN_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'both' },
    );
    sheet.animate(
      [
        { clipPath: point, offset: 0 },
        { clipPath: line, offset: 0.36 },
        { clipPath: full, offset: 1 },
      ],
      { duration: OPEN_MS, easing: 'cubic-bezier(0.65, 0, 0.25, 1)', fill: 'backwards' },
    );
    items.forEach((element, index) =>
      element.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: OPEN_MS * 0.62 + index * 70, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' }),
    );
    fly(cardsRef.current, at, 'out');
    // Run once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CLOSE: the cards fly home, the sheet folds to the rail, the rail shrinks into the station.
  useEffect(() => {
    if (!closing) return;
    const sheet = sheetRef.current;
    const rail = railRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !rail || !backdrop) return;
    if (reduced) {
      const fade = rootRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      if (fade) fade.onfinish = () => onClosedRef.current();
      else onClosedRef.current();
      return;
    }
    const at = origin();
    const [point, line, full] = sheetClips(at, size, 18);
    rail.style.setProperty('--tm-ox', `${at.x}px`);
    rail.style.top = `${at.y}px`;
    for (const element of sheet.querySelectorAll<HTMLElement>('.tm-in')) element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
    fly(cardsRef.current, at, 'home');
    rail.animate(
      [
        { transform: 'scaleX(1)', opacity: 0 },
        { transform: 'scaleX(1)', opacity: 1, offset: 0.5 },
        { transform: 'scaleX(0)', opacity: 1 },
      ],
      { duration: CLOSE_MS, delay: 120, easing: 'cubic-bezier(0.7, 0, 0.3, 1)', fill: 'both' },
    );
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, delay: CLOSE_MS - 140, easing: 'ease-in', fill: 'forwards' });
    const fold = sheet.animate(
      [
        { clipPath: full, offset: 0 },
        { clipPath: line, offset: 0.6 },
        { clipPath: point, offset: 1 },
      ],
      { duration: CLOSE_MS, delay: 100, easing: 'cubic-bezier(0.7, 0, 0.3, 1)', fill: 'forwards' },
    );
    fold.onfinish = () => window.setTimeout(() => onClosedRef.current(), 200);
    // Once, when closing starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  /** The cards' flight: out from the station past the edges, or home into it. */
  function fly(host: HTMLDivElement | null, at: Point, way: 'out' | 'home') {
    if (!host) return;
    const flights = cardFlights(CARD_COUNT, size, seed);
    [...host.children].forEach((element, index) => {
      const flight = flights[index];
      if (!(element instanceof HTMLElement) || !flight) return;
      element.style.left = `${at.x}px`;
      element.style.top = `${at.y}px`;
      const home = { transform: `translate(-50%, -50%) rotate(0deg) rotateY(0deg) scale(0.25)`, opacity: 0 };
      const mid = { transform: `translate(calc(-50% + ${flight.dx * 0.35}px), calc(-50% + ${flight.dy * 0.35 - 60}px)) rotate(${flight.spin * 0.4}deg) rotateY(${flight.flip * 0.5}deg) scale(${flight.scale})`, opacity: 1, offset: 0.35 };
      const away = { transform: `translate(calc(-50% + ${flight.dx}px), calc(-50% + ${flight.dy}px)) rotate(${flight.spin}deg) rotateY(${flight.flip}deg) scale(${flight.scale * 1.1})`, opacity: 0.0 };
      const frames = way === 'out' ? [home, mid, { ...away, opacity: 0.9, offset: 0.85 }, away] : [away, { ...away, opacity: 0.9, offset: 0.15 }, { ...mid, offset: 0.65 }, home];
      element.animate(frames, {
        duration: way === 'out' ? flight.duration : flight.duration * 0.6,
        delay: way === 'out' ? flight.delay : flight.delay * 0.5,
        easing: way === 'out' ? 'cubic-bezier(0.15, 0.7, 0.3, 1)' : 'cubic-bezier(0.6, 0, 0.8, 0.4)',
        fill: 'both',
      });
    });
  }

  // Tab stays inside; Esc closes.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onRequestClose();
      return;
    }
    if (event.key !== 'Tab' || !rootRef.current) return;
    const focusable = [...rootRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])')].filter((element) => !element.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const state = topic.complete ? 'Learnt' : frontier ? 'Next stop' : 'To learn';
  const title = entry?.title ?? `Topic ${topic.number}`;

  return createPortal(
    <div ref={rootRef} className='tm-root' data-hud-tokens='' role='dialog' aria-modal='true' aria-labelledby={titleId} data-closing={closing || undefined} onKeyDown={onKeyDown}>
      <div ref={backdropRef} className='tm-backdrop' onClick={onRequestClose} aria-hidden='true' />
      <div ref={sheetRef} className='tm-sheet'>
        <div className='tm-scroll'>
          <header className='tm-head tm-in'>
            <p className='tm-kicker'>
              Topic {pad2(topic.number)} of {pad2(total)} · {chapterLine}
            </p>
            <h2 id={titleId} className='tm-title'>
              <SourceText text={topic.title} />
            </h2>
            <div className='tm-actions'>
              <span className='tm-state' data-state={topic.complete ? 'done' : frontier ? 'next' : 'none'}>
                {topic.complete ? '✦ ' : ''}
                {state}
              </span>
              <button type='button' className='tm-learnt' aria-pressed={topic.complete} disabled={sample} onClick={onToggle}>
                <span className='tm-learnt-mark' aria-hidden='true' />
                {topic.complete ? (
                  <>
                    Learnt
                    <span className='tm-learnt-undo' aria-hidden='true'>
                      Undo
                    </span>
                  </>
                ) : (
                  'Mark as learnt'
                )}
              </button>
            </div>
          </header>

          <section className='tm-section tm-in' aria-label='Video'>
            <TopicVideo key={entry?.slug ?? 'none'} youtube={entry?.youtube ?? null} title={title} />
          </section>

          <section className='tm-section tm-in' aria-labelledby={`${titleId}-play`}>
            <h3 id={`${titleId}-play`} className='tm-h3'>
              Play with it
            </h3>
            <TopicPlayground key={entry?.slug ?? 'none'} slug={entry?.slug} reduced={reduced} active={!closing} />
          </section>

          <nav className='tm-nav tm-in' aria-label='Topics'>
            {topic.number > 1 ? (
              <button type='button' className='tm-nav-link' onClick={() => onGo(topic.number - 1)}>
                ← Topic {pad2(topic.number - 1)}
              </button>
            ) : (
              <span />
            )}
            {topic.number < total && (
              <button type='button' className='tm-nav-link' onClick={() => onGo(topic.number + 1)}>
                Topic {pad2(topic.number + 1)} →
              </button>
            )}
          </nav>
        </div>
        <button ref={closeRef} type='button' className='tm-close' onClick={onRequestClose} aria-label='Close the topic'>
          <svg viewBox='0 0 24 24' aria-hidden='true'>
            <path d='M6 6l12 12M18 6L6 18' fill='none' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' />
          </svg>
        </button>
      </div>
      <div ref={railRef} className='tm-rail' aria-hidden='true' />
      <div ref={cardsRef} className='tm-cards' aria-hidden='true'>
        {cardFlights(CARD_COUNT, size, seed).map((flight, index) => (
          <span key={index} className='tm-card' data-face={flight.face || undefined} style={{ '--tm-i': index } as CSSProperties}>
            {flight.face && (
              <>
                <span className='tm-card-num'>{pad2(topic.number)}</span>
                <span className='tm-card-suit'>✦</span>
              </>
            )}
          </span>
        ))}
      </div>
    </div>,
    document.body,
  );
}

export { TopicModal };
