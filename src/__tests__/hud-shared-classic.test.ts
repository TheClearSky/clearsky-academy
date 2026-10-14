import { describe, expect, it } from 'vitest';
import { syllabi } from '../curriculum/syllabi';
import { buildCourses } from '../site/courses';
import { buildHudSubjects } from '../site/hud/hudModel';
import type { Moment } from '../site/hud/kit/progressMoments';
import { dealEnd, lineOf, planCuts, stateOf } from '../site/hud/shared/classic/logic';

describe('classic card', () => {
  it('puts the ink line at the true fraction, kept out of the corner and short of the top until complete', () => {
    expect(lineOf(0, 7)).toBe(0);
    expect(lineOf(0, 0)).toBe(0);
    expect(lineOf(7, 7)).toBe(1);
    expect(lineOf(3, 6)).toBe(0.5);
    expect(lineOf(1, 43)).toBe(0.06);
    expect(lineOf(42, 43)).toBe(0.92);
    for (let total = 1; total <= 43; total++) {
      for (let done = 1; done < total; done++) {
        const line = lineOf(done, total);
        expect(line).toBeGreaterThan(0);
        expect(line).toBeLessThan(1);
      }
    }
  });

  it('names the three states', () => {
    expect(stateOf({ done: 0, complete: false })).toBe('untouched');
    expect(stateOf({ done: 2, complete: false })).toBe('started');
    expect(stateOf({ done: 5, complete: true })).toBe('done');
  });

  it('keeps the sample preview calm on every real subject: ≤ 6 snaps, ≥ 380 ms apart, seals only for completions', () => {
    for (const course of buildCourses(syllabi)) {
      for (const subject of buildHudSubjects(course, new Set(), true)) {
        const moments = new Map<string, Moment>(subject.chapters.filter((chapter) => chapter.done > 0).map((chapter) => [chapter.key, chapter.complete ? 'complete' : 'advanced']));
        const start = dealEnd(subject.chapters.length);
        const plan = planCuts(subject.chapters, moments, start);
        expect(plan.size).toBeLessThanOrEqual(6);
        const times = [...plan.values()].map((beat) => beat.at);
        for (let index = 1; index < times.length; index++) expect(times[index] - times[index - 1]).toBeGreaterThanOrEqual(380);
        for (const [key, beat] of plan) {
          expect(beat.at).toBeGreaterThanOrEqual(start);
          expect(beat.stamp != null).toBe(moments.get(key) === 'complete');
        }
      }
    }
  });

  it('plans nothing without moments, and never spaces snaps closer than 380 ms', () => {
    const chapters = Array.from({ length: 8 }, (_, index) => ({ key: `k${index}` }));
    expect(planCuts(chapters, new Map(), 0).size).toBe(0);
    const all = new Map<string, Moment>(chapters.map((chapter) => [chapter.key, 'advanced']));
    const tight = [...planCuts(chapters, all, 0, { spacing: 100, cap: 8 }).values()].map((beat) => beat.at);
    expect(tight).toEqual([0, 380, 760, 1140, 1520, 1900, 2280, 2660]);
  });
});
