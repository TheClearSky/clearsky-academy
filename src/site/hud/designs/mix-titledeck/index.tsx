import '@fontsource/noto-sans-runic/runic-400.css';
import './hud.css';
import { useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { chapterPath, markReturnToProgress } from '../../../../chapter/chapterPath';
import type { HudDesignProps } from '../../contract';
import { TitleCard } from '../../kit/parts';
import { useInView } from '../../kit/motion';
import { useDeal } from '../../shared/ascension/cards';
import type { Vars } from '../../shared/ascension/cards';
import { ClassicCard, ClassicHand, ClassicLegend, useClassicBeats, useClassicLayout } from '../../shared/classic/classic';
import { nextChapter } from '../../shared/classic/logic';
import { EditorialTabs } from '../../shared/editorial/editorial';

/**
 * Title Card Deck (round 3 redo, `ROUND3.md` › Mixes) — the kit's paper
 * title card, exactly, over round 1's cards dealt straight onto the HUD's
 * black, in the Title Card Wall's editorial palette: paper, ink and one
 * red. Each card is inked black from the bottom to its chapter's % with a
 * hard edge and a thin red rule at the cut; the type inverts where the ink
 * passes under it. A finished card is ink to the top with a gold edge and
 * the crimson seal. The title card's outlined rank glyph fills with ink to
 * the whole course's %, and the cards are dealt out of it.
 *
 * Round 4 (Deepak): the learnt colour is the picked class card's accent
 * (`hud.css`), and a card opens its chapter's page (`src/chapter/`), where
 * the chapter's topics ride a Crystal Line. The strap down the title
 * card's side is runes, not Japanese (Deepak, round 4): PROGRESS in the
 * Elder Futhark (ᛈᚱᛟᚷᚱᛖᛋᛋ), stacked upright.
 */

function TitleCardDeckHud({ model }: HudDesignProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const rankRef = useRef<HTMLElement | null>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const { entered, visible } = useInView(rootRef);
  const reduced = model.reducedMotion;
  const { course, active, overall } = model;
  const chapters = active.chapters;

  // The cards are dealt out of the title card's rank glyph.
  useLayoutEffect(() => {
    rankRef.current = headRef.current?.querySelector<HTMLElement>('.hud-titlecard-rank') ?? headRef.current;
  });

  const layout = useClassicLayout(handRef);
  const phase = useDeal(rankRef, handRef, '.cl-slot', entered, reduced, active.id);
  const beats = useClassicBeats(chapters, model.sample, phase);
  const next = nextChapter(chapters);
  const fill = Math.floor(overall.fraction * 100);
  const navigate = useNavigate();
  const open = (number: number) => {
    markReturnToProgress();
    navigate(chapterPath(active.id, number));
  };

  return (
    <div ref={rootRef} className='td-root' style={{ '--td-accent': course.accent } as Vars} data-cl-phase={phase} data-play={entered || reduced || undefined} data-hud-paused={!visible || undefined} data-reduced={reduced || undefined}>
      <div ref={headRef} className='td-head'>
        <TitleCard
          strap='ᛈᚱᛟᚷᚱᛖᛋᛋ'
          kicker={`PROGRESS REPORT · ${course.kicker}`}
          title={`${course.kicker} · ${course.title}`}
          sub={
            <>
              Chapter deck — <strong>{active.label}</strong>
            </>
          }
          rank={course.rank}
          className='td-titlecard'
          style={{ '--td-fill': `${fill}%` } as Vars}
        />
        <span className='sr-only'>
          {course.kicker} {course.title}: {fill}% of the whole course learnt.
        </span>
      </div>

      <div className='td-subjects'>
        <EditorialTabs model={model} />
        <p className='td-quiet'>
          {active.done} of {active.total} topics · {active.completeChapters} of {chapters.length} chapters sealed
        </p>
      </div>

      <div className='td-rule'>
        <ClassicLegend />
      </div>

      <div ref={handRef} className='td-table'>
        <ClassicHand
          key={active.id}
          chapters={chapters}
          layout={layout}
          renderCard={(chapter) => (
            <ClassicCard
              chapter={chapter}
              suit={course.suit}
              reduced={reduced}
              next={chapter.key === next?.key}
              beat={beats.get(chapter.key)}
              data-open=''
              title={`${chapter.title} — open the chapter`}
              onClick={() => open(chapter.number)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open(chapter.number);
              }}
            />
          )}
        />
      </div>
    </div>
  );
}

export default TitleCardDeckHud;
