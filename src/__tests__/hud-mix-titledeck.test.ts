import { describe, expect, it } from 'vitest';
import { syllabi } from '../curriculum/syllabi';
import { buildCourses } from '../site/courses';
import { buildHudSubjects, overallOf } from '../site/hud/hudModel';
import type { Moment } from '../site/hud/kit/progressMoments';
import { dealEnd, planCuts } from '../site/hud/shared/classic/logic';

describe('title card deck (round 3)', () => {
  it('in the sample preview snaps at most 6 ink lines and stamps only finished cards, all within ~2.5 s of the deal', () => {
    for (const course of buildCourses(syllabi)) {
      for (const subject of buildHudSubjects(course, new Set(), true)) {
        const moments = new Map<string, Moment>(subject.chapters.filter((chapter) => chapter.done > 0).map((chapter) => [chapter.key, chapter.complete ? 'complete' : 'advanced']));
        const start = dealEnd(subject.chapters.length);
        const plan = planCuts(subject.chapters, moments, start);
        expect(plan.size).toBeLessThanOrEqual(6);
        const last = Math.max(start, ...[...plan.values()].map((beat) => beat.stamp ?? beat.at));
        expect(last).toBeLessThanOrEqual(start + 2500);
        for (const chapter of subject.chapters) if (plan.get(chapter.key)?.stamp != null) expect(chapter.complete).toBe(true);
      }
    }
  });

  it('fills the rank glyph to the whole course, never to 100 % before it is', () => {
    for (const course of buildCourses(syllabi)) {
      const overall = overallOf(buildHudSubjects(course, new Set(), true));
      const fill = Math.floor(overall.fraction * 100);
      expect(fill).toBeGreaterThan(0);
      expect(fill).toBeLessThan(100);
    }
  });
});
