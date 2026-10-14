import { Component, startTransition, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useProgress } from '../../curriculum/progressStore';
import { useReducedMotion } from '../useReducedMotion';
import type { Course } from '../courses';
import type { HudModel } from './contract';
import { useHudChoice, useHudSample } from './hudChoice';
import { buildHudSubjects, overallOf } from './hudModel';
import { DEFAULT_HUD, HUD_COMPONENTS, HUD_DESIGNS } from './registry';
import './kit/kit.css';
import './kit/theme.css';

/**
 * The progress HUD under the deck: the design (lazy; one remains since
 * round 4 — the style picker is gone, see `registry.ts`; `?hudSample=1`
 * still previews made-up progress) and the way on to the curriculum. One model for every design
 * (`contract.ts`), built here.
 */

class HudBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[hud] the design failed to load or render', error);
  }
  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? <p className='py-16 text-center text-[14px] text-primary-white/60'>This HUD style could not load. Pick another above.</p> : this.props.children;
  }
}

type HudHostProps = {
  course: Course;
  /** The subject to open on (the landing's `?subject=`), if it is this course's. */
  initialSubject?: string | null;
  onSubjectChange?: (id: string) => void;
};

function HudHost({ course, initialSubject, onSubjectChange }: HudHostProps) {
  const done = useProgress();
  const sample = useHudSample();
  const reducedMotion = useReducedMotion();
  const choice = useHudChoice();
  // The design on screen follows the choice in a transition, so the old one
  // stays up while the new chunk loads (no blank fallback).
  const [shown, setShown] = useState(choice);
  useEffect(() => {
    startTransition(() => setShown(choice));
  }, [choice]);
  // Load the chosen design while the visitor is still up at the hero, so it
  // is ready (with its font) by the time they scroll down (review X8.1).
  useEffect(() => {
    const design = HUD_DESIGNS.find((entry) => entry.id === choice);
    if (!design) return undefined;
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => void design.load());
    return () => cancel(handle);
  }, [choice]);

  const subjects = useMemo(() => buildHudSubjects(course, done, sample), [course, done, sample]);
  const [activeId, setActiveIdState] = useState(() => subjects.find((subject) => subject.id === initialSubject)?.id ?? subjects[0]?.id ?? '');
  const setActiveId = useCallback(
    (id: string) => {
      setActiveIdState(id);
      onSubjectChange?.(id);
    },
    [onSubjectChange],
  );
  const model = useMemo<HudModel>(() => {
    const active = subjects.find((subject) => subject.id === activeId) ?? subjects[0];
    return {
      course: { key: course.key, kicker: course.kicker, title: course.title, rank: course.card.rank, suit: course.card.suit, accent: course.card.accent },
      subjects,
      active,
      setActive: setActiveId,
      overall: overallOf(subjects),
      reducedMotion,
      sample,
    };
  }, [course, subjects, activeId, setActiveId, reducedMotion, sample]);

  const Design = HUD_COMPONENTS.get(shown) ?? HUD_COMPONENTS.get(DEFAULT_HUD)!;

  return (
    <div data-slot='hud' data-no-drag='' className='flex flex-col items-center gap-8'>
      <div data-slot='hud-design' data-hud={shown} className='w-full scroll-mt-6 [contain:layout_paint]'>
        <HudBoundary resetKey={shown}>
          <Suspense fallback={<div className='min-h-[900px]' />}>{model.active && <Design model={model} />}</Suspense>
        </HudBoundary>
      </div>
    </div>
  );
}

export { HudHost };
