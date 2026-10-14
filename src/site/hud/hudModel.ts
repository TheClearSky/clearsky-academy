import { documentChapters } from '../../curriculum/progress';
import type { SyllabusDocument } from '../../curriculum/schema';
import { subjectColorMap } from '../../subjects';
import { subjectName } from '../courses';
import type { Course } from '../courses';
import type { HudChapter, HudSubject } from './contract';

/**
 * The HUD's data, built from a course and the learner's done set — pure, so
 * it is unit-tested (`src/__tests__/hudModel.test.ts`).
 *
 * SAMPLE progress: the picker's "Sample progress" preview, so a design can
 * be judged with numbers in it before anything is learnt. It is made up and
 * deterministic: early chapters mostly complete, then a few partial ones,
 * then untouched — the shape of a real learner's syllabus.
 */

const SCIENCE_COLOUR = '#c98bff';

function subjectColour(subject: SyllabusDocument['subject']): string {
  return subject === 'science' ? SCIENCE_COLOUR : subjectColorMap[subject];
}

/** A made-up but stable done count for chapter `index` of `count`. */
function sampleDone(index: number, count: number, total: number, seed: string): number {
  let hash = 2166136261;
  for (const character of `${seed}|${index}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const jitter = (hash % 1000) / 1000;
  const position = index / Math.max(count - 1, 1);
  const fraction = position < 0.3 ? (jitter < 0.8 ? 1 : 0.6 + jitter * 0.3) : position < 0.6 ? jitter * 0.9 : jitter < 0.25 ? jitter : 0;
  return Math.min(total, Math.round(total * fraction));
}

function buildSubject(document: SyllabusDocument, done: ReadonlySet<string>, sample: boolean): HudSubject {
  const entries = documentChapters(document, done);
  const unitIndex = new Map(document.units.map((unit, index) => [unit, index]));
  const chapters: HudChapter[] = entries.map(({ unit, chapter, progress }, index) => {
    const total = progress.total;
    const count = sample ? sampleDone(index, entries.length, total, document.id) : progress.done;
    return {
      key: `${document.id}:${index}`,
      index,
      number: index + 1,
      title: chapter.title,
      unitTitle: unit.title,
      unitIndex: unitIndex.get(unit) ?? 0,
      done: count,
      total,
      fraction: total === 0 ? 0 : count / total,
      complete: total > 0 && count >= total,
    };
  });
  const doneTopics = chapters.reduce((sum, chapter) => sum + chapter.done, 0);
  const totalTopics = chapters.reduce((sum, chapter) => sum + chapter.total, 0);
  return {
    id: document.id,
    subject: document.subject,
    label: subjectName(document.subject),
    colour: subjectColour(document.subject),
    chapters,
    done: doneTopics,
    total: totalTopics,
    fraction: totalTopics === 0 ? 0 : doneTopics / totalTopics,
    completeChapters: chapters.filter((chapter) => chapter.complete).length,
  };
}

function buildHudSubjects(course: Course, done: ReadonlySet<string>, sample: boolean): HudSubject[] {
  return course.documents.map((document) => buildSubject(document, done, sample));
}

function overallOf(subjects: readonly HudSubject[]) {
  const done = subjects.reduce((sum, subject) => sum + subject.done, 0);
  const total = subjects.reduce((sum, subject) => sum + subject.total, 0);
  return {
    done,
    total,
    fraction: total === 0 ? 0 : done / total,
    chapters: subjects.reduce((sum, subject) => sum + subject.chapters.length, 0),
    completeChapters: subjects.reduce((sum, subject) => sum + subject.completeChapters, 0),
  };
}

export { buildHudSubjects, overallOf, sampleDone };
