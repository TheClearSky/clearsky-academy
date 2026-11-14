import '@fontsource/cormorant-garamond/latin-600-italic.css';
import '@fontsource/stix-two-text/latin-500.css';
import '@fontsource/stix-two-math/latin-400.css';
import './play/play.css';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { PlaygroundProps } from '../../contract';
import { MathText } from './play/MathText';
import { loadProgress, recordTry, saveProgress } from './play/progress';
import type { PlayProgress } from './play/progress';
import { checkAnswer, DIFFICULTIES, initialResponse, isComplete, QUESTIONS } from './play/questions';
import type { Difficulty, Response } from './play/questions';
import { SCENES, stepStill } from './play/scenes';
import { Stage } from './play/Stage';
import type { Playing } from './play/Stage';

/**
 * "Play with it" for video 1, Types of Numbers (M13.X1, 2026-11-14). Deepak, verbatim: "Add some real puzzles related to
 * the video and topic, ramp it up slowly, start with easy problems to hard ones. Make a tab selection for the questions,
 * have 10 questions and every question has a badge called "Easy" "Medium" or "Hard". And when you click submit, a
 * visual animated solution follows with either you were correct or incorrect. You can reset a problem to try again, no
 * problem with that." and "Make sure it's in our style".
 *
 * Ten puzzles (`play/questions.ts`), drawn in the film's own kit on one canvas (`play/scenes.ts`, `play/Stage.tsx`), in
 * the topic modal's dress (`play/play.css`: its Cinzel capitals, gilt hairlines, crystal focus ring). Progress (tries,
 * solved) is kept in localStorage (`play/progress.ts`). With reduced motion a solution is shown as still steps.
 * (The scaffold's placeholder, a torus knot on a slider, is kept in `_old/Playground.scaffold.tsx.txt`.)
 */

type QuestionState = { response: Response; playing: Playing | null; step: number; done: boolean };

const fresh = (index: number): QuestionState => ({ response: initialResponse(QUESTIONS[index]), playing: null, step: 0, done: false });
const IDS = QUESTIONS.map((q) => q.id);
const pad = (n: number) => String(n).padStart(2, '0');

function Pips({ level }: { level: Difficulty }) {
  const n = DIFFICULTIES.indexOf(level) + 1;
  return (
    <span className='np-pips' aria-hidden='true'>
      {[0, 1, 2].map((i) => (
        <span key={i} className='np-pip' data-on={i < n || undefined} />
      ))}
    </span>
  );
}

function Badge({ level }: { level: Difficulty }) {
  return (
    <span className='np-badge' data-level={level.toLowerCase()}>
      <Pips level={level} />
      {level}
    </span>
  );
}

function Playground({ active, reducedMotion }: PlaygroundProps) {
  const uid = useId();
  const [progress, setProgress] = useState<PlayProgress>(() => loadProgress(IDS));
  const [tab, setTab] = useState(() => progress.tab);
  const [states, setStates] = useState<QuestionState[]>(() => QUESTIONS.map((_, i) => fresh(i)));
  const [announce, setAnnounce] = useState('');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const q = QUESTIONS[tab];
  const scene = SCENES[q.id];
  const state = states[tab];

  useEffect(() => saveProgress(progress), [progress]);

  const update = useCallback((index: number, patch: Partial<QuestionState>) => setStates((all) => all.map((s, i) => (i === index ? { ...s, ...patch } : s))), []);

  const select = (index: number, focus = false) => {
    setTab(index);
    setProgress((p) => ({ ...p, tab: index }));
    if (focus) tabRefs.current[index]?.focus();
  };
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowRight: tab + 1, ArrowLeft: tab - 1, Home: 0, End: QUESTIONS.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select((moves[event.key] + QUESTIONS.length) % QUESTIONS.length, true);
  };
  // Keep the chosen tab in view in the scrolling strip (a phone shows a few at a time).
  useEffect(() => {
    tabRefs.current[tab]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  const submit = () => {
    const verdict = checkAnswer(q, state.response);
    update(tab, { playing: { response: state.response, verdict, startedAt: performance.now() }, step: 0, done: reducedMotion });
    setProgress((p) => recordTry(p, q.id, verdict.correct));
    setAnnounce(verdict.correct ? 'Correct. The solution follows.' : 'Not quite. Watch the solution, then try again.');
  };
  const reset = () => {
    update(tab, fresh(tab));
    setAnnounce('Reset. Try again.');
  };
  const replay = () => {
    if (!state.playing) return;
    update(tab, { playing: { ...state.playing, startedAt: performance.now() }, step: 0, done: false });
  };
  const onStep = useCallback((step: number) => update(tab, { step }), [tab, update]);
  const onDone = useCallback(() => update(tab, { done: true }), [tab, update]);

  const verdict = state.playing?.verdict ?? null;
  const solvedCount = IDS.filter((id) => progress.questions[id]?.solved).length;
  const stillAt = state.playing && reducedMotion ? stepStill(scene, state.step, state.playing.verdict) : null;
  const shownSteps = state.playing ? (reducedMotion ? state.step : state.done ? scene.steps.length - 1 : state.step) : -1;

  return (
    <div className='np'>
      <div className='np-strip'>
        <div className='np-tabs' role='tablist' aria-label='Puzzles, easy to hard' onKeyDown={onTabKey}>
          {QUESTIONS.map((question, i) => {
            const record = progress.questions[question.id];
            const mark = record?.solved ? 'solved' : record?.tries ? 'tried' : 'new';
            return (
              <button
                key={question.id}
                ref={(element) => {
                  tabRefs.current[i] = element;
                }}
                type='button'
                role='tab'
                id={`${uid}-tab-${i}`}
                aria-selected={i === tab}
                aria-controls={`${uid}-panel`}
                tabIndex={i === tab ? 0 : -1}
                className='np-tab'
                data-level={question.difficulty.toLowerCase()}
                data-mark={mark}
                aria-label={`Puzzle ${i + 1}, ${question.difficulty}${mark === 'solved' ? ', solved' : mark === 'tried' ? ', tried' : ''}`}
                onClick={() => select(i)}
              >
                <span className='np-tab-n'>{pad(i + 1)}</span>
                <Pips level={question.difficulty} />
                <span className='np-tab-mark' aria-hidden='true' />
              </button>
            );
          })}
        </div>
        <p className='np-tally'>
          <span className='np-tally-n'>{solvedCount}</span> of {QUESTIONS.length} solved
        </p>
      </div>

      <section className='np-panel' role='tabpanel' id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`}>
        <header className='np-head'>
          <div className='np-head-line'>
            <Badge level={q.difficulty} />
            <span className='np-kicker'>
              Puzzle {pad(tab + 1)} of {QUESTIONS.length} · {q.title}
            </span>
          </div>
          <h4 className='np-prompt'>
            <MathText text={q.prompt} />
          </h4>
          <p className='np-how'>
            <MathText text={q.how} />
          </p>
        </header>

        <Stage
          key={q.id}
          question={q}
          response={state.response}
          onResponse={(response) => update(tab, { response })}
          playing={state.playing}
          stillAt={stillAt}
          active={active}
          onStep={onStep}
          onDone={onDone}
          onAnnounce={setAnnounce}
        />

        <div className='np-actions'>
          <button type='button' className='np-btn np-btn-quiet' onClick={reset} disabled={!state.playing && JSON.stringify(state.response) === JSON.stringify(initialResponse(q))}>
            <span className='np-btn-mark np-btn-mark-reset' aria-hidden='true' />
            Reset
          </button>
          <p className='np-verdict' data-verdict={verdict ? (verdict.correct ? 'correct' : 'wrong') : undefined}>
            {verdict && (verdict.correct ? <><VerdictMark kind='tick' />Correct</> : <><VerdictMark kind='cross' />Not quite</>)}
          </p>
          {state.playing ? (
            reducedMotion ? null : (
              <button type='button' className='np-btn np-btn-gilt' onClick={replay}>
                <span className='np-btn-mark' aria-hidden='true' />
                Replay
              </button>
            )
          ) : (
            <button type='button' className='np-btn np-btn-gilt' onClick={submit} disabled={!isComplete(q, state.response)}>
              <span className='np-btn-mark' aria-hidden='true' />
              Submit
            </button>
          )}
        </div>

        {state.playing && (
          <div className='np-solution'>
            <ol className='np-steps' aria-label='The solution, step by step'>
              {scene.steps.map((step, i) => (
                <li key={i} className='np-step' data-shown={i <= shownSteps || undefined} data-now={i === shownSteps || undefined} aria-hidden={i > shownSteps || undefined}>
                  <span className='np-step-n' aria-hidden='true'>
                    {i + 1}
                  </span>
                  <span className='np-step-text'>
                    <MathText text={step.caption} />
                  </span>
                </li>
              ))}
            </ol>
            {reducedMotion && (
              <div className='np-stepper'>
                <button type='button' className='np-btn np-btn-quiet np-btn-small' disabled={state.step === 0} onClick={() => update(tab, { step: state.step - 1 })}>
                  <span aria-hidden='true'>‹ </span>Back
                </button>
                <span className='np-stepper-n'>
                  Step {state.step + 1} of {scene.steps.length}
                </span>
                <button type='button' className='np-btn np-btn-quiet np-btn-small' disabled={state.step >= scene.steps.length - 1} onClick={() => update(tab, { step: state.step + 1 })}>
                  Next<span aria-hidden='true'> ›</span>
                </button>
              </div>
            )}
            {!verdict?.correct && state.done && <p className='np-again'>Reset the puzzle to try it again.</p>}
          </div>
        )}
        <p className='sr-only' aria-live='polite'>
          {announce}
        </p>
      </section>
    </div>
  );
}

/** The verdict's mark: a tick beside Correct, a cross beside Not quite, drawn in the pill's own ink (no red / green). */
function VerdictMark({ kind }: { kind: 'tick' | 'cross' }) {
  return (
    <svg className='np-verdict-mark' viewBox='0 0 16 16' aria-hidden='true' focusable='false'>
      {kind === 'tick' ? <path d='M2.5 8.6 6.2 12.2 13.5 3.8' /> : <path d='M3.5 3.5 12.5 12.5 M12.5 3.5 3.5 12.5' />}
    </svg>
  );
}

export default Playground;
