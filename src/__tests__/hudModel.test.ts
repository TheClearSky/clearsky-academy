import { describe, expect, it } from 'vitest';
import { syllabi } from '../curriculum/syllabi';
import { topicKey } from '../curriculum/progress';
import { buildCourses } from '../site/courses';
import { buildHudSubjects, overallOf } from '../site/hud/hudModel';
import { grade, pad2, percent, rarity, roman } from '../site/hud/kit/format';
import { momentFor, parseSeen } from '../site/hud/kit/progressMoments';

const courses = buildCourses(syllabi);

describe('buildHudSubjects', () => {
  it('numbers every chapter 1..n per subject with stable keys and true progress', () => {
    const course = courses.find((entry) => entry.key === 'cbse-10')!;
    const first = course.documents[0];
    const chapter = first.units[0].chapters[0];
    const done = new Set([topicKey(first.id, chapter.title, chapter.topics[0])]);
    const subjects = buildHudSubjects(course, done, false);
    expect(subjects.map((subject) => subject.label)).toEqual(['Mathematics', 'Science']);
    const maths = subjects[0];
    expect(maths.chapters.map((entry) => entry.number)).toEqual(maths.chapters.map((_, index) => index + 1));
    expect(maths.chapters[0]).toMatchObject({ key: `${first.id}:0`, title: chapter.title, done: 1, total: chapter.topics.length, complete: chapter.topics.length === 1 });
    expect(maths.done).toBe(1);
    expect(subjects[1].done).toBe(0);
  });

  it('sample progress is made up, deterministic, within bounds, and front-loaded', () => {
    for (const course of courses) {
      const once = buildHudSubjects(course, new Set(), true);
      const again = buildHudSubjects(course, new Set(), true);
      expect(once).toEqual(again);
      for (const subject of once) {
        for (const chapter of subject.chapters) {
          expect(chapter.done).toBeGreaterThanOrEqual(0);
          expect(chapter.done).toBeLessThanOrEqual(chapter.total);
        }
        const firstThird = subject.chapters.slice(0, Math.ceil(subject.chapters.length * 0.3));
        expect(firstThird.some((chapter) => chapter.done > 0)).toBe(true);
      }
    }
  });

  it('overall sums every subject', () => {
    const course = courses.find((entry) => entry.key === 'jee-advanced')!;
    const subjects = buildHudSubjects(course, new Set(), true);
    const overall = overallOf(subjects);
    expect(overall.total).toBe(subjects.reduce((sum, subject) => sum + subject.total, 0));
    expect(overall.chapters).toBe(subjects.reduce((sum, subject) => sum + subject.chapters.length, 0));
    expect(overall.fraction).toBeCloseTo(overall.done / overall.total);
  });
});

describe('HUD formatting', () => {
  it('writes Roman numerals, grades, rarities, percents and padded numbers', () => {
    expect([1, 4, 9, 14, 40, 45, 3999].map(roman)).toEqual(['I', 'IV', 'IX', 'XIV', 'XL', 'XLV', 'MMMCMXCIX']);
    expect(roman(0)).toBe('N');
    expect([0, 0.1, 0.4, 0.7, 1].map(grade)).toEqual(['–', 'C', 'B', 'A', 'S']);
    expect([0, 0.2, 0.5, 1].map(rarity)).toEqual(['N', 'R', 'SR', 'SSR']);
    expect(percent(0.996)).toBe('99%');
    expect(percent(1)).toBe('100%');
    expect(pad2(7)).toBe('07');
    expect(pad2(45)).toBe('45');
  });
});

describe('progress moments', () => {
  const chapter = (done: number, total: number) => ({ key: 'k', index: 0, number: 1, title: 't', unitTitle: 'u', unitIndex: 0, done, total, fraction: done / total, complete: done >= total });

  it('fires only for progress beyond what was seen, as complete or advanced', () => {
    expect(momentFor(chapter(0, 5), undefined)).toBeNull();
    expect(momentFor(chapter(2, 5), undefined)).toBe('advanced');
    expect(momentFor(chapter(2, 5), 2)).toBeNull();
    expect(momentFor(chapter(5, 5), 2)).toBe('complete');
    expect(momentFor(chapter(5, 5), 5)).toBeNull();
    expect(momentFor(chapter(1, 5), 3)).toBeNull();
  });

  it('ignores a corrupt or foreign seen store', () => {
    expect(parseSeen('not json')).toEqual({});
    expect(parseSeen('[1,2]')).toEqual({});
    expect(parseSeen('{"a":3,"b":"x","c":-1}')).toEqual({ a: 3 });
  });
});
