import { documentChapters } from '../curriculum/progress';
import type { SyllabusDocument } from '../curriculum/schema';
import { editionFor } from '../stage/cards/model';
import type { CardFaceModel, CardIllustration, CardSuit } from '../stage/cards/model';
import { subjectLabelMap } from '../subjects';

/**
 * The landing's courses: the six decks a learner picks from (CBSE classes
 * 9–12, JEE Main, JEE Advanced), each with its syllabi, its playing card
 * (rank, suit, accent, illustration — `.claude/research/stage-v2/CARDS.md`
 * › D1: the classes are IX…XII in the four-colour-deck suits, the JEE decks
 * are the King and the Ace of the academy's ✦ suit) and its progress, which
 * earns the card's finish (`editionFor`). The optional "Advanced Level"
 * class-9 books are not shown (the curriculum page that listed them was
 * removed, 2026-10-14); the decks show the core curriculum.
 */

type Course = {
  key: string;
  /** Small caption on the card ("CBSE", "NTA", "IIT"). */
  kicker: string;
  title: string;
  /** The emblem glyph. */
  emblem: string;
  card: CourseCard;
  documents: SyllabusDocument[];
};

/** The parts of a course's playing card that never change. */
type CourseCard = { rank: string; suit: CardSuit; accent: string; tint: string; illustration: CardIllustration };

const CBSE_CARDS: readonly CourseCard[] = [
  { rank: 'IX', suit: 'club', accent: '#0e8a5a', tint: '#e9f6f0', illustration: 'compass' },
  { rank: 'X', suit: 'diamond', accent: '#2156d9', tint: '#eaf0fd', illustration: 'prism' },
  { rank: 'XI', suit: 'heart', accent: '#d3153b', tint: '#fdecef', illustration: 'projectile' },
  { rank: 'XII', suit: 'spade', accent: '#1e1838', tint: '#eeedf5', illustration: 'field' },
];
const JEE_MAIN_CARD: CourseCard = { rank: 'K', suit: 'star', accent: '#6a3fd1', tint: '#f1ecfd', illustration: 'crown' };
const JEE_ADVANCED_CARD: CourseCard = { rank: 'A', suit: 'star', accent: '#5a2fc0', tint: '#f1ecfd', illustration: 'rosette' };

const SUBJECT_ORDER = ['mathematics', 'science', 'physics', 'chemistry'] as const;

function buildCourses(syllabi: readonly SyllabusDocument[]): Course[] {
  const core = syllabi.filter((document) => document.variant === null || document.exam !== 'CBSE board');
  const bySubject = (first: SyllabusDocument, second: SyllabusDocument) => SUBJECT_ORDER.indexOf(first.subject) - SUBJECT_ORDER.indexOf(second.subject);
  const cbse = [9, 10, 11, 12].map((classNumber) => ({
    key: `cbse-${classNumber}`,
    kicker: 'CBSE',
    title: `Class ${['IX', 'X', 'XI', 'XII'][classNumber - 9]}`,
    emblem: ['IX', 'X', 'XI', 'XII'][classNumber - 9],
    card: CBSE_CARDS[classNumber - 9],
    documents: core.filter((document) => document.exam === 'CBSE board' && document.class === classNumber).sort(bySubject),
  }));
  const jee = [
    { key: 'jee-main', kicker: 'NTA', title: 'JEE Main', emblem: 'M', card: JEE_MAIN_CARD, exam: 'JEE Main' },
    { key: 'jee-advanced', kicker: 'IIT', title: 'JEE Advanced', emblem: 'A', card: JEE_ADVANCED_CARD, exam: 'JEE Advanced' },
  ].map(({ exam, ...course }) => ({ ...course, documents: core.filter((document) => document.exam === exam).sort(bySubject) }));
  return [...cbse, ...jee].filter((course) => course.documents.length > 0);
}

type CourseProgress = { done: number; total: number; chapters: number; fraction: number };

function courseProgress(course: Course, done: ReadonlySet<string>): CourseProgress {
  let topicsDone = 0;
  let topics = 0;
  let chapters = 0;
  for (const document of course.documents) {
    for (const entry of documentChapters(document, done)) {
      topicsDone += entry.progress.done;
      topics += entry.progress.total;
      chapters++;
    }
  }
  return { done: topicsDone, total: topics, chapters, fraction: topics === 0 ? 0 : topicsDone / topics };
}

function subjectName(subject: SyllabusDocument['subject']): string {
  return subject === 'science' ? 'Science' : subjectLabelMap[subject];
}

/** The course's playing card at this progress. */
function cardModelFor(course: Course, progress: CourseProgress): CardFaceModel {
  return {
    ...course.card,
    kicker: `${course.kicker} · ${progress.chapters} chapters`,
    title: course.title,
    subjects: course.documents.map((document) => subjectName(document.subject)),
    chapters: progress.chapters,
    fraction: progress.fraction,
    edition: editionFor(progress.fraction),
  };
}

export { buildCourses, cardModelFor, courseProgress, subjectName };
export type { Course, CourseCard, CourseProgress };
