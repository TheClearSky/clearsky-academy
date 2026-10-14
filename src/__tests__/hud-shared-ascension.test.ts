import { describe, expect, it } from 'vitest';
import { syllabi } from '../curriculum/syllabi';
import { buildCourses } from '../site/courses';
import { buildHudSubjects } from '../site/hud/hudModel';
import { dealEnd, fanOf, headlineOf, nextChapter, perRowFor, planMoments, seeded, SUIT_PATHS, TIER_NAME, tierOf } from '../site/hud/shared/ascension/logic';
import type { Moment } from '../site/hud/kit/progressMoments';

const sampleSubjects = buildCourses(syllabi).flatMap((course) => buildHudSubjects(course, new Set(), true));

describe('ascension deck logic', () => {
  it('climbs the landing ladder: cream stock, gilt once started, foil from half, prism complete', () => {
    expect(tierOf(0, 9)).toBe('stock');
    expect(tierOf(1, 9)).toBe('gilt');
    expect(tierOf(4, 9)).toBe('gilt');
    expect(tierOf(5, 10)).toBe('foil');
    expect(tierOf(9, 9)).toBe('prism');
    expect(tierOf(0, 0)).toBe('stock');
    expect(TIER_NAME.prism).toBe('Prism');
    expect(Object.keys(SUIT_PATHS).sort()).toEqual(['club', 'diamond', 'heart', 'spade', 'star']);
  });

  it('marks the next chapter: the first started one, else the first untouched, else none', () => {
    const chapter = (done: number, complete = false) => ({ done, complete });
    const a = [chapter(3, true), chapter(0), chapter(2), chapter(0)];
    expect(nextChapter(a)).toBe(a[2]);
    const b = [chapter(3, true), chapter(0), chapter(0)];
    expect(nextChapter(b)).toBe(b[1]);
    expect(nextChapter([chapter(1, true)])).toBeUndefined();
  });

  it('caps the ceremonies and spaces them so flashes stay under 3 a second', () => {
    for (const subject of sampleSubjects) {
      const moments = new Map<string, Moment>(subject.chapters.filter((chapter) => chapter.done > 0).map((chapter) => [chapter.key, chapter.complete ? 'complete' : 'advanced']));
      const plan = planMoments(subject.chapters, moments, 1000);
      const ascends = [...plan.values()].map((beat) => beat.ascend).filter((time): time is number => time != null);
      expect(ascends.length).toBeLessThanOrEqual(4);
      for (let index = 1; index < ascends.length; index++) expect(ascends[index] - ascends[index - 1]).toBeGreaterThanOrEqual(340);
      for (const beat of plan.values()) {
        expect(beat.rise).not.toBeNull();
        if (beat.stamp != null) expect(beat.stamp).toBeGreaterThan(beat.ascend!);
      }
      expect(Math.max(0, ...[...plan.values()].map((beat) => beat.rise ?? 0))).toBeLessThanOrEqual(1000 + 18 * 55);
    }
  });

  it('names the best tier earned once, with how many others earned it', () => {
    const chapters = [
      { key: 'a', done: 9, total: 9, number: 1, title: 'A' },
      { key: 'b', done: 9, total: 9, number: 2, title: 'B' },
      { key: 'c', done: 5, total: 9, number: 3, title: 'C' },
    ];
    expect(headlineOf(chapters, new Map<string, Moment>([['c', 'advanced']]))).toMatchObject({ tier: 'foil', others: 0 });
    expect(
      headlineOf(
        chapters,
        new Map<string, Moment>([
          ['c', 'advanced'],
          ['b', 'complete'],
          ['a', 'complete'],
        ]),
      ),
    ).toMatchObject({ tier: 'prism', chapter: { key: 'a' }, others: 1 });
    expect(headlineOf(chapters, new Map())).toBeNull();
  });

  it('fans rows symmetrically, deals in bounded time, fits rows and seeds deterministically', () => {
    const row = Array.from({ length: 5 }, (_, index) => fanOf(index, 5, 5, 6, 10));
    expect(row[0]).toEqual({ rotate: -6, lift: 10 });
    expect(row[2]).toEqual({ rotate: 0, lift: 0 });
    expect(row[4]).toEqual({ rotate: 6, lift: 10 });
    expect(dealEnd(45)).toBe(dealEnd(27));
    expect(dealEnd(45)).toBeLessThan(2200);
    expect(perRowFor(1080, 138, 12)).toBe(7);
    expect(perRowFor(100, 138, 12, 2)).toBe(2);
    const a = seeded('x');
    const b = seeded('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
