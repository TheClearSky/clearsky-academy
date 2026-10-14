import { describe, expect, it } from 'vitest';
import { syllabi } from '../curriculum/syllabi';
import { documentChapters, topicKey } from '../curriculum/progress';
import { buildCourses, cardModelFor, courseProgress } from '../site/courses';

describe('buildCourses', () => {
  const courses = buildCourses(syllabi);

  it('makes the six decks, in order', () => {
    expect(courses.map((course) => course.title)).toEqual(['Class IX', 'Class X', 'Class XI', 'Class XII', 'JEE Main', 'JEE Advanced']);
  });

  it('puts the right syllabi in each deck, maths first, and leaves out the optional advanced books', () => {
    const ids = Object.fromEntries(courses.map((course) => [course.key, course.documents.map((document) => document.id)]));
    expect(ids['cbse-9']).toEqual(['cbse-09-mathematics', 'cbse-09-science']);
    expect(ids['cbse-11']).toEqual(['cbse-11-mathematics', 'cbse-11-physics', 'cbse-11-chemistry']);
    expect(ids['jee-main']).toEqual(['jee-main-mathematics', 'jee-main-physics', 'jee-main-chemistry']);
  });
});

describe('courseProgress and the card finish', () => {
  const course = buildCourses(syllabi).find((entry) => entry.key === 'cbse-10')!;

  it('is base untouched, foil once started, prism when complete', () => {
    expect(cardModelFor(course, courseProgress(course, new Set())).edition).toBe('base');
    const first = course.documents[0];
    const chapter = first.units[0].chapters[0];
    const started = new Set([topicKey(first.id, chapter.title, chapter.topics[0])]);
    expect(cardModelFor(course, courseProgress(course, started)).edition).toBe('foil');
    const everything = new Set(
      course.documents.flatMap((document) => documentChapters(document, new Set()).flatMap(({ chapter: entry }) => entry.topics.map((topic) => topicKey(document.id, entry.title, topic)))),
    );
    const complete = courseProgress(course, everything);
    expect(complete.fraction).toBe(1);
    expect(cardModelFor(course, complete).edition).toBe('prism');
  });

  it('gives every deck its own rank and the class decks the four suits', () => {
    const courses = buildCourses(syllabi);
    expect(courses.map((entry) => entry.card.rank)).toEqual(['IX', 'X', 'XI', 'XII', 'K', 'A']);
    expect(new Set(courses.slice(0, 4).map((entry) => entry.card.suit)).size).toBe(4);
    expect(cardModelFor(course, courseProgress(course, new Set())).subjects).toEqual(['Mathematics', 'Science']);
  });
});
