import '@fontsource/shippori-mincho-b1/800.css';
import '@fontsource/gloock/400.css';
import '@fontsource/barlow-condensed/600.css';
import './editorial.css';
import type { HudModel, HudSubject } from '../../contract';
import { SubjectTabs } from '../../kit/SubjectTabs';
import { Squeeze } from '../../kit/parts';

/**
 * The editorial subject switch shared by the title-card designs (ledger,
 * wall, title deck, album): typographic tabs — a compressed Mincho word
 * beside an outlined Gloock numeral (the subject's %). The selected tab
 * fills its numeral solid (it is the hero number) and sits on a red brush
 * swash. No boxes. Styles: `editorial.css` (`.ed-*`).
 */

/** A dry-brush swash, stretched under the selected word. */
function Swash() {
  return (
    <svg className='ed-swash' viewBox='0 0 200 26' preserveAspectRatio='none' aria-hidden='true'>
      <path d='M3 15 C22 7 70 4 118 6 C150 7 182 7 197 10 C199 13 194 16 186 17 C150 20 112 19 80 21 C52 23 22 24 8 21 C2 20 1 17 3 15 Z' />
      <path d='M14 9 C60 5 120 3 170 6' className='ed-swash-streak' />
      <path d='M30 23 C80 22 140 21 180 19' className='ed-swash-streak' />
    </svg>
  );
}

function TabFace({ subject, selected }: { subject: HudSubject; selected: boolean }) {
  const pct = Math.floor(subject.fraction * 100);
  return (
    <>
      <span className='ed-tab-num' aria-hidden='true'>
        {pct}
        <small>%</small>
      </span>
      <span className='ed-tab-word'>
        {selected && <Swash />}
        <Squeeze>{subject.label}</Squeeze>
      </span>
      <span className='sr-only'>, {pct}% learnt</span>
    </>
  );
}

function EditorialTabs({ model, className }: { model: HudModel; className?: string }) {
  if (model.subjects.length < 2) {
    return (
      <div className={`ed-tabs${className ? ` ${className}` : ''}`}>
        <span className='ed-tab' data-static=''>
          <TabFace subject={model.active} selected />
        </span>
      </div>
    );
  }
  return <SubjectTabs model={model} className={`ed-tabs${className ? ` ${className}` : ''}`} tabClassName='ed-tab' renderTab={(subject, selected) => <TabFace subject={subject} selected={selected} />} />;
}

export { EditorialTabs, Swash };
