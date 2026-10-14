import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { syllabi } from '../curriculum/syllabi';
import { StageProvider } from '../stage/react/StageProvider';
import { WorldOnScroll } from './WorldOnScroll';
import markUrl from './brand/clearsky-mark.svg';
import { buildCourses } from './courses';
import { CourseDeck } from './CourseDeck';
import { HudHost } from './hud/HudHost';
import { readLandingState, writeLandingState } from './landingState';
import { STAGE_SELECTION } from './stageSelection';
import { ThemeToggle } from './ThemeToggle';
import { useReducedMotion } from './useReducedMotion';
import { cn } from '../cn';
import '../index.css';

/*
 * The landing page at `/` (Deepak, 2026-10-12: "the scene becomes main '/'
 * scene replacing what is there now"): the 3D stage — the night nebula over
 * the endless checker, floating books and candles, the classroom chair, chess
 * pieces at the horizon — fixed behind the hero and the deck, then scrolling
 * away with the deck so the progress HUD sits on black; over it the logo, the six
 * course decks as shining playing cards, and the chosen course's chapters as
 * RPG progress rings. Everything 3D is one canvas (`stage.ts`).
 */

const TEXT_SHADOW = '[text-shadow:0_2px_12px_var(--color-primary-black)]';

/** The picked card spins for 1.3 s; the page starts gliding to the HUD as it settles. */
const PICK_SCROLL_DELAY_MS = 1100;

/** The progress HUD's design, which opens with the Title Card Deck's title card. */
function scrollToProgress(behavior: ScrollBehavior) {
  document.querySelector('[data-slot="hud-design"]')?.scrollIntoView({ behavior, block: 'start' });
}

function LandingPage() {
  useEffect(() => {
    document.title = 'ClearSky Academy — see the concept, then learn it';
  }, []);
  const courses = useMemo(() => buildCourses(syllabi), []);
  // Where the visitor left the page this tab (`landingState.ts`): the class,
  // whether its card is held, the HUD's subject.
  const [remembered] = useState(readLandingState);
  const [selectedKey, setSelectedKey] = useState(() => courses.find((course) => course.key === remembered.course)?.key ?? courses[0].key);
  const selected = courses.find((course) => course.key === selectedKey) ?? courses[0];
  const reducedMotion = useReducedMotion();
  const start = () => document.getElementById('decks')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });

  // Back from a chapter page (`#progress`): straight to the HUD.
  useEffect(() => {
    if (window.location.hash !== '#progress') return undefined;
    const frame = requestAnimationFrame(() => scrollToProgress('auto'));
    return () => cancelAnimationFrame(frame);
  }, []);

  const select = (key: string) => {
    setSelectedKey(key);
    writeLandingState({ course: key, subject: undefined });
  };

  // Picking a class card glides down to its Title Card Deck once the card has
  // spun (Deepak, round 4) — unless the visitor scrolls or types first.
  const pendingScroll = useRef<() => void>(undefined);
  useEffect(() => () => pendingScroll.current?.(), []);
  const onPicked = () => {
    writeLandingState({ picked: true });
    pendingScroll.current?.();
    const events = ['wheel', 'touchstart', 'keydown'] as const;
    const cancel = () => {
      window.clearTimeout(timer);
      for (const type of events) window.removeEventListener(type, cancel);
      pendingScroll.current = undefined;
    };
    const timer = window.setTimeout(
      () => {
        cancel();
        scrollToProgress(reducedMotion ? 'auto' : 'smooth');
      },
      reducedMotion ? 0 : PICK_SCROLL_DELAY_MS,
    );
    for (const type of events) window.addEventListener(type, cancel, { passive: true });
    pendingScroll.current = cancel;
  };

  return (
    <StageProvider selection={STAGE_SELECTION}>
      <WorldOnScroll deckId='decks' />
      <div data-slot='landing' className='relative min-h-full text-primary-white'>
        <header className='flex items-center justify-between px-4 py-3 sm:px-8'>
          <Link to='/' aria-label='ClearSky Academy — home' className='flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-gold'>
            <img src={markUrl} alt='' className='h-9 w-9' />
            <span className='text-[18px] font-semibold tracking-tight'>
              ClearSky <span className='font-normal text-primary-white/75'>Academy</span>
            </span>
          </Link>
          <ThemeToggle />
        </header>

        <section data-slot='landing-hero' className='flex min-h-[calc(100svh-80px)] flex-col items-center px-4 pt-[6svh] text-center'>
          <img src={markUrl} alt='' className='h-[clamp(80px,13svh,124px)] w-auto' />
          <h1 className={cn('mt-5 max-w-3xl text-[clamp(30px,5.2vw,58px)] leading-[1.08] font-semibold tracking-tight', TEXT_SHADOW)}>
            See every concept come alive
          </h1>
          <p className={cn('mt-4 max-w-xl text-[clamp(15px,1.8vw,18px)] text-primary-white/80', TEXT_SHADOW)}>
            Animated Mathematics, Physics and Chemistry for Classes 9–12 — the CBSE syllabus and JEE, one chapter at a time.
          </p>
          {/* One way on: "Start" glides down to the deck (the curriculum stays in the header). */}
          <button
            type='button'
            onClick={start}
            className='group mt-8 flex cursor-pointer flex-col items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-gold'
          >
            <span className='rounded-full border border-accent-gold/60 bg-accent-gold/15 px-9 py-3 text-[17px] font-semibold text-accent-gold backdrop-blur group-hover:bg-accent-gold/25'>Start</span>
            <svg viewBox='0 0 24 24' aria-hidden='true' className='h-6 w-6 text-accent-gold motion-safe:animate-bounce'>
              <path d='M6 9l6 6 6-6' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
            </svg>
          </button>
        </section>

        {/* One screen tall: the cards size themselves to fit it (`CourseDeck`). */}
        <section id='decks' data-slot='landing-decks' className='flex min-h-svh flex-col items-center px-4 pt-6 pb-6'>
          <h2 className={cn('mb-1 text-center text-[clamp(22px,3vw,30px)] font-semibold', TEXT_SHADOW)}>Your decks</h2>
          <p className={cn('mx-auto mb-6 max-w-md text-center text-[14px] text-primary-white/70', TEXT_SHADOW)}>
            Every card earns its finish as you learn — gold foil once you start, holo from half-way, prism when it's complete.
          </p>
          <CourseDeck
            courses={courses}
            selectedKey={selected.key}
            onSelect={select}
            onPicked={onPicked}
            onUnpicked={() => writeLandingState({ picked: false })}
            restorePicked={remembered.picked === true && remembered.course === selected.key}
          />
        </section>

        <section id='progress' data-slot='landing-progress' className='mx-auto max-w-6xl px-4 pt-10 pb-24'>
          {/* The progress HUD: the Title Card Deck (`hud/`). No
              glass panel here: the Astrolabe rings are drawn in the canvas BEHIND
              the page, and a backdrop blur over them blurs them away. */}
          <HudHost
            key={selected.key}
            course={selected}
            initialSubject={remembered.course === selected.key ? remembered.subject : undefined}
            onSubjectChange={(id) => writeLandingState({ subject: id })}
          />
        </section>

        <footer className='px-4 pb-10 text-center text-[12px] text-primary-white/50'>
          Syllabus from the official CBSE 2026-27 curriculum, NTA JEE Main 2026 and JEE Advanced 2026.
        </footer>
      </div>
    </StageProvider>
  );
}

export { LandingPage };
