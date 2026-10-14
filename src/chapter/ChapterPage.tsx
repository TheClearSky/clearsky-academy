import '@fontsource-variable/cinzel/wght.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-sc/latin-600.css';
import '../index.css';
import '../site/hud/kit/kit.css';
import '../site/hud/kit/theme.css';
import '../site/hud/shared/crystalline/crystalline.css';
import './chapter.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { documentChapters, topicKey } from '../curriculum/progress';
import { setTopicDone, useProgress } from '../curriculum/progressStore';
import { syllabi } from '../curriculum/syllabi';
import { SourceText } from '../curriculum/SourceText';
import markUrl from '../site/brand/clearsky-mark.svg';
import { buildCourses, subjectName } from '../site/courses';
import type { HudChapter } from '../site/hud/contract';
import { useHudSample } from '../site/hud/hudChoice';
import { buildHudSubjects } from '../site/hud/hudModel';
import { pad2, percent } from '../site/hud/kit/format';
import { frontierOf } from '../site/hud/kit/litPath';
import { useEntrance, useMeasuredWidth } from '../site/hud/kit/LitPathLayers';
import { CountUp, CrystalShape } from '../site/hud/kit/parts';
import { useProgressMoments } from '../site/hud/kit/progressMoments';
import { CrystalBoard } from '../site/hud/shared/crystalline/board';
import { lineLayout } from '../site/hud/shared/crystalline/logic';
import type { LineOptions } from '../site/hud/shared/crystalline/logic';
import { readLandingState, writeLandingState } from '../site/landingState';
import { useReducedMotion } from '../site/useReducedMotion';
import { topicEntryAt } from '../topics/registry';
import { chapterPath, topicPath } from './chapterPath';
import { TopicModal } from './TopicModal';

/**
 * The chapter page at `/chapter/<document id>/<n>` (Deepak, round 4: "Clicking
 * on a card opens a separate page with a UI like crystal line with topics on
 * each node"). The Title Card Deck's cards and the Crystal Line's stations
 * open it. The chapter's official topics ride the Crystal Line
 * (`site/hud/shared/crystalline`), one station per topic: a learnt topic is
 * a lit station, the crystal waits at the first one still to learn.
 * Clicking a station (or its label) opens the topic's modal
 * (`TopicModal.tsx`, at `…/topic/<t>`): its video, its playground, and
 * "Mark as learnt" — the learner's progress (`progressStore`); the
 * station lights at once.
 *
 * Topics are long syllabus sentences, so the labels clamp and the reader
 * below the line shows the hovered (or last focused) topic in full.
 *
 * The grid is fixed a quarter of the way from round 2's classic panel to
 * round 4's night panel (`--crl-night: 0.25` in `crystalline.css`): Deepak
 * tried a classic ↔ night slider and picked that spot ("i like this the
 * best"), so the slider is gone. With the HUD's sample preview on
 * (`?hudSample=1`), the page shows the same made-up count, read-only.
 */

/** Topic labels are sentences: taller labels, a wider pitch. */
const TOPIC_LINE: LineOptions = { labelHeight: [78, 94], minPitch: [128, 200], labelWidth: [180, 270] };

function ChapterPage() {
  const params = useParams();
  const documentId = params.documentId ?? '';
  const number = Number(params.number);
  const syllabus = syllabi.find((entry) => entry.id === documentId);
  const course = useMemo(() => (syllabus ? buildCourses(syllabi).find((entry) => entry.documents.includes(syllabus)) : undefined), [syllabus]);
  const done = useProgress();
  const sample = useHudSample();
  const entries = useMemo(() => (syllabus ? documentChapters(syllabus, done) : []), [syllabus, done]);
  const entry = Number.isInteger(number) ? entries[number - 1] : undefined;
  if (!syllabus || !course || !entry) return <Navigate to='/' replace />;
  const topic = Number(params.topic);
  return <ChapterView key={`${documentId}:${number}`} documentId={documentId} number={number} topicNumber={Number.isInteger(topic) ? topic : null} entries={entries} course={course} done={done} sample={sample} />;
}

type ChapterViewProps = {
  documentId: string;
  number: number;
  /** The topic whose modal is open (the address's `/topic/<t>`), 1-based. */
  topicNumber: number | null;
  entries: ReturnType<typeof documentChapters>;
  course: ReturnType<typeof buildCourses>[number];
  done: ReadonlySet<string>;
  sample: boolean;
};

function ChapterView({ documentId, number, topicNumber, entries, course, done, sample }: ChapterViewProps) {
  const { unit, chapter } = entries[number - 1];
  const subject = course.documents.find((document) => document.id === documentId)!.subject;
  const label = subjectName(subject);
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `${chapter.title} — ClearSky Academy`;
    window.scrollTo(0, 0);
  }, [chapter.title]);

  // Back on the landing, the HUD shows this chapter's class and subject. A
  // chapter of another class (a shared link) lets go of the held card.
  useEffect(() => {
    if (readLandingState().course === course.key) writeLandingState({ subject: documentId });
    else writeLandingState({ course: course.key, subject: documentId, picked: false });
  }, [course.key, documentId]);

  // With "Sample progress" on, the HUD's made-up count for this chapter: its first topics.
  const sampleCount = useMemo(() => {
    if (!sample) return 0;
    return buildHudSubjects(course, done, true).find((entry) => entry.id === documentId)?.chapters[number - 1]?.done ?? 0;
  }, [sample, course, done, documentId, number]);

  const keys = useMemo(() => chapter.topics.map((topic) => topicKey(documentId, chapter.title, topic)), [chapter, documentId]);
  const topics = useMemo<HudChapter[]>(
    () =>
      chapter.topics.map((topic, index) => {
        const learnt = sample ? index < sampleCount : done.has(keys[index]);
        return {
          key: `${documentId}:${number - 1}:${index}`,
          index,
          number: index + 1,
          title: topic,
          unitTitle: unit.title,
          unitIndex: 0,
          done: learnt ? 1 : 0,
          total: 1,
          fraction: learnt ? 1 : 0,
          complete: learnt,
        };
      }),
    [chapter, documentId, number, unit, sample, sampleCount, done, keys],
  );
  const learnt = topics.filter((topic) => topic.complete).length;
  const fraction = topics.length === 0 ? 0 : learnt / topics.length;

  const { visible, play, entrance } = useEntrance(rootRef, `${documentId}:${number}`, reduced);
  const width = useMeasuredWidth(areaRef);
  const line = useMemo(() => (width > 0 ? lineLayout(topics.length, width, TOPIC_LINE) : null), [topics.length, width]);
  const moments = useProgressMoments(topics, sample);
  const frontier = frontierOf(topics);

  // Ticked here: lights at once (no comet).
  const [instant, setInstant] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback(
    (index: number) => {
      if (sample) return;
      const next = !done.has(keys[index]);
      setTopicDone(keys[index], next);
      const key = `${documentId}:${number - 1}:${index}`;
      setInstant((previous) => {
        const out = new Set(previous);
        if (next) out.add(key);
        else out.delete(key);
        return out;
      });
    },
    [sample, done, keys, documentId, number],
  );

  // The reader: the hovered topic, else the last focused or ticked one, else the next to learn.
  const [hovered, setHovered] = useState(-1);
  const [pinned, setPinned] = useState(-1);
  const shown = hovered >= 0 ? hovered : pinned >= 0 ? pinned : Math.max(0, frontier);
  const shownTopic = topics[shown];

  // THE TOPIC MODAL follows the address: `/topic/<t>` opens it, and when the
  // address loses it (×, Esc, Back) it stays mounted, `closing`, until its
  // exit has played.
  const navigate = useNavigate();
  const location = useLocation();
  const openFromHere = (location.state as { fromChapter?: boolean } | null)?.fromChapter === true;
  const wanted = topicNumber !== null && topicNumber >= 1 && topicNumber <= topics.length ? topicNumber : null;
  const [modal, setModal] = useState<{ number: number; closing: boolean } | null>(null);
  useEffect(() => {
    if (wanted !== null) setModal({ number: wanted, closing: false });
    else setModal((current) => (current && !current.closing ? { ...current, closing: true } : current));
  }, [wanted]);
  const openTopic = useCallback((index: number) => navigate(topicPath(documentId, number, index + 1), { state: { fromChapter: true } }), [navigate, documentId, number]);
  const closeTopic = () => {
    if (openFromHere) navigate(-1);
    else navigate(chapterPath(documentId, number), { replace: true });
  };
  /** The modal's origin: its topic's station, brought into view first. */
  const stationAt = (index: number) => {
    const hit = document.querySelectorAll<SVGElement>('.crl-hit')[index];
    if (!hit) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let rect = hit.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      hit.scrollIntoView({ block: 'center' });
      rect = hit.getBoundingClientRect();
    }
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const modalTopic = modal ? topics[modal.number - 1] : undefined;

  // The landing remembers the class and the held card (`site/landingState.ts`); this says which subject to show.
  const back = '/#progress';
  const previous = number > 1 ? entries[number - 2] : undefined;
  const next = number < entries.length ? entries[number] : undefined;

  return (
    <div data-slot='chapter' className='min-h-full bg-black text-primary-white'>
      <header className='flex items-center justify-between gap-3 px-4 py-3 sm:px-8'>
        <Link to={back} className='chapter-back'>
          <svg viewBox='0 0 24 24' aria-hidden='true' className='h-4 w-4'>
            <path d='M15 5l-7 7 7 7' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' />
          </svg>
          {course.title} · {label}
        </Link>
        <Link to='/' aria-label='ClearSky Academy — home' className='flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-gold'>
          <img src={markUrl} alt='' className='h-8 w-8' />
          <span className='hidden text-[16px] font-semibold tracking-tight sm:inline'>
            ClearSky <span className='font-normal text-primary-white/75'>Academy</span>
          </span>
        </Link>
      </header>

      <main data-hud-tokens='' data-crystal-line='' className='mx-auto max-w-[1152px] px-4 pt-6 pb-24'>
        <div ref={rootRef} className='crl-root chapter-root' data-play={play || undefined} data-hud-paused={!visible || undefined} data-reduced={reduced || undefined}>
          <header className='crl-headline'>
            <div className='crl-emblem' aria-hidden='true'>
              <svg viewBox='-30 -30 60 60'>
                <circle r='26' className='crl-emblem-ring' />
                <circle r='21' className='crl-emblem-runes' />
                <g transform='scale(1.7)'>
                  <CrystalShape />
                </g>
              </svg>
            </div>
            <div className='crl-names'>
              <p className='crl-kicker'>
                Chapter {pad2(number)} · {label} · {course.kicker} {course.title}
              </p>
              <h1 className='crl-h2 chapter-h1'>{chapter.title}</h1>
              {unit.title.trim().toLowerCase() !== chapter.title.trim().toLowerCase() && <p className='chapter-unit'>{unit.title}</p>}
            </div>
            <div className='crl-hero'>
              <p className='crl-hero-num' aria-hidden='true'>
                <CountUp value={Math.floor(fraction * 100)} run={play} reducedMotion={reduced} duration={1200} />
                <span className='crl-hero-pct'>%</span>
              </p>
              <p className='crl-hero-label'>
                <span className='sr-only'>{percent(fraction)}: </span>
                {learnt} of {topics.length} {topics.length === 1 ? 'topic' : 'topics'} learnt
              </p>
            </div>
          </header>

          <div className='crl-rule'>
            <p className='crl-quiet'>{sample ? 'Sample progress preview: these ticks are made up and cannot be changed.' : 'Open a station to watch its topic and play with it.'}</p>
          </div>

          <section className='crl-panel' aria-label={`${chapter.title}: topics`}>
            <div ref={areaRef} className='crl-area' style={line ? { height: line.height } : undefined}>
              {line && (
                <CrystalBoard
                  line={line}
                  chapters={topics}
                  frontier={frontier}
                  moments={moments}
                  instant={instant}
                  play={play}
                  entrance={entrance}
                  reduced={reduced}
                  switched={false}
                  gems={false}
                  onActivate={openTopic}
                  onHoverChange={setHovered}
                  renderLabel={(topic, slot) => (
                    <button
                      type='button'
                      aria-haspopup='dialog'
                      className='crl-label crl-topic'
                      data-state={slot.state}
                      data-side={slot.station.up ? 'up' : 'down'}
                      data-frontier={slot.frontier || undefined}
                      data-hover={slot.hovered || undefined}
                      data-open=''
                      style={slot.style}
                      // Hovering the text does nothing; only the station's circle lights on hover
                      // (Deepak, round 4). Keyboard focus still lights it.
                      onBlur={slot.bind.onBlur}
                      onFocus={(event) => {
                        if (event.currentTarget.matches(':focus-visible')) slot.bind.onFocus();
                        setPinned(topic.index);
                      }}
                      onClick={() => {
                        setPinned(topic.index);
                        openTopic(topic.index);
                      }}
                    >
                      <span className='crl-text'>
                        <span className='crl-head' aria-hidden='true'>
                          <span className='crl-num'>{pad2(topic.number)}</span>
                          <span className='crl-count'>{topic.complete ? '✦ learnt' : 'to learn'}</span>
                          {slot.frontier && <span className='crl-next'>next stop</span>}
                        </span>
                        <span className='crl-title'>
                          <span className='sr-only'>Topic {topic.number}: </span>
                          <SourceText text={topic.title} />
                        </span>
                      </span>
                    </button>
                  )}
                />
              )}
            </div>
          </section>

          {shownTopic && (
            <section className='chapter-reader' data-state={shownTopic.complete ? 'done' : 'none'} aria-label='Topic in full'>
              <p className='chapter-reader-head'>
                <span className='crl-num'>Topic {pad2(shownTopic.number)}</span>
                <span className='chapter-reader-state'>{shownTopic.complete ? '✦ Learnt' : shown === frontier ? 'Next stop' : 'To learn'}</span>
              </p>
              <p className='chapter-reader-text'>
                <SourceText text={shownTopic.title} />
              </p>
            </section>
          )}

          <nav className='chapter-nav' aria-label='Chapters'>
            {previous ? (
              <Link to={chapterPath(documentId, number - 1)} className='chapter-nav-link' data-dir='previous'>
                <span className='chapter-nav-dir'>Previous chapter</span>
                <span className='chapter-nav-title'>
                  {pad2(number - 1)} · {previous.chapter.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={chapterPath(documentId, number + 1)} className='chapter-nav-link' data-dir='next'>
                <span className='chapter-nav-dir'>Next chapter</span>
                <span className='chapter-nav-title'>
                  {pad2(number + 1)} · {next.chapter.title}
                </span>
              </Link>
            )}
          </nav>
        </div>
      </main>

      {modal && modalTopic && (
        <TopicModal
          topic={modalTopic}
          total={topics.length}
          chapterLine={`Chapter ${pad2(number)} · ${chapter.title}`}
          entry={topicEntryAt(documentId, number, modal.number)}
          frontier={modal.number - 1 === frontier}
          sample={sample}
          reduced={reduced}
          closing={modal.closing}
          origin={() => stationAt(modal.number - 1)}
          onRequestClose={closeTopic}
          onClosed={() => {
            const index = modal.number - 1;
            setModal(null);
            // Focus goes back to the topic (no ring after a mouse close, where the browser supports saying so).
            document.querySelectorAll<HTMLElement>('.crl-topic')[index]?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
          }}
          onToggle={() => toggle(modal.number - 1)}
          onGo={(topic) => navigate(topicPath(documentId, number, topic), { replace: true, state: location.state })}
        />
      )}
    </div>
  );
}

export { ChapterPage };
