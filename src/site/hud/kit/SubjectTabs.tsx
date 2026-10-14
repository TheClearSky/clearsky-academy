import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { HudModel, HudSubject } from '../contract';

type SubjectTabsProps = {
  model: HudModel;
  className?: string;
  /** Classes for each tab (a function gets whether it is selected). */
  tabClassName?: string | ((subject: HudSubject, selected: boolean) => string);
  /** What a tab shows; default: the subject's label. */
  renderTab?: (subject: HudSubject, selected: boolean) => ReactNode;
};

/**
 * The subject switch every HUD design uses: a `role="tablist"` with one tab
 * stop and arrow keys (APG Tabs: ←/→ and Home/End move and select). A
 * design only styles it. With one subject it renders nothing.
 */
function SubjectTabs({ model, className, tabClassName, renderTab }: SubjectTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  if (model.subjects.length < 2) return null;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = model.subjects.findIndex((subject) => subject.id === model.active.id);
    const last = model.subjects.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index + 1) % model.subjects.length : event.key === 'ArrowLeft' ? (index - 1 + model.subjects.length) % model.subjects.length : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    model.setActive(model.subjects[next].id);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };
  return (
    <div ref={listRef} role='tablist' aria-label='Subject' className={className} onKeyDown={onKeyDown}>
      {model.subjects.map((subject) => {
        const selected = subject.id === model.active.id;
        return (
          <button
            key={subject.id}
            type='button'
            role='tab'
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => model.setActive(subject.id)}
            className={typeof tabClassName === 'function' ? tabClassName(subject, selected) : tabClassName}
          >
            {renderTab ? renderTab(subject, selected) : subject.label}
          </button>
        );
      })}
    </div>
  );
}

export { SubjectTabs };
