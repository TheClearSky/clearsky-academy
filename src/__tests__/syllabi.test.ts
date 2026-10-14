import { describe, expect, it } from 'vitest';
import { parseSyllabi, syllabi } from '../curriculum/syllabi';

/** Every string a learner reads, flattened (for whole-corpus checks). */
function contentStrings(): string[] {
  const out: string[] = [];
  for (const document of syllabi) {
    for (const unit of document.units) {
      out.push(unit.title);
      for (const chapter of unit.chapters) out.push(chapter.title, ...chapter.topics);
    }
  }
  return out;
}

describe('the shipped syllabi', () => {
  it('all 18 documents load and validate against the strict schema', () => {
    expect(syllabi.map((document) => document.id).sort()).toEqual([
      'cbse-09-mathematics',
      'cbse-09-mathematics-advanced',
      'cbse-09-science',
      'cbse-09-science-advanced',
      'cbse-10-mathematics',
      'cbse-10-science',
      'cbse-11-chemistry',
      'cbse-11-mathematics',
      'cbse-11-physics',
      'cbse-12-chemistry',
      'cbse-12-mathematics',
      'cbse-12-physics',
      'jee-advanced-chemistry',
      'jee-advanced-mathematics',
      'jee-advanced-physics',
      'jee-main-chemistry',
      'jee-main-mathematics',
      'jee-main-physics',
    ]);
  });

  it('cover maths, physics and chemistry for every CBSE class 9–12, JEE Main and JEE Advanced', () => {
    const covered = new Set(syllabi.map((document) => `${document.exam}|${document.class}|${document.subject}`));
    for (const classNumber of [9, 10]) {
      expect(covered).toContain(`CBSE board|${classNumber}|mathematics`);
      expect(covered).toContain(`CBSE board|${classNumber}|science`);
    }
    for (const classNumber of [11, 12]) {
      for (const subject of ['mathematics', 'physics', 'chemistry']) expect(covered).toContain(`CBSE board|${classNumber}|${subject}`);
    }
    for (const exam of ['JEE Main', 'JEE Advanced']) {
      for (const subject of ['mathematics', 'physics', 'chemistry']) expect(covered).toContain(`${exam}|null|${subject}`);
    }
  });

  it('carry no biology: class 9–10 science keeps only physics/chemistry chapters and lists what it left out', () => {
    for (const document of syllabi.filter((entry) => entry.subject === 'science' && entry.variant === null)) {
      for (const unit of document.units) {
        for (const chapter of unit.chapters) expect(['physics', 'chemistry'], chapter.title).toContain(chapter.discipline);
      }
      expect(document.excluded.length, document.id).toBeGreaterThan(0);
    }
    expect(syllabi.some((document) => (document.subject as string) === 'biology')).toBe(false);
  });

  it('every chapter has topics, except where the source itself prints none', () => {
    const empty = syllabi.flatMap((document) =>
      document.units.flatMap((unit) => unit.chapters.filter((chapter) => chapter.topics.length === 0).map((chapter) => `${document.id}: ${chapter.title}`)),
    );
    expect(empty).toEqual([]);
  });

  it('contain U+FFFD only at the three glyphs the JEE Main PDF itself cannot encode (documented in its notes)', () => {
    const broken = contentStrings().filter((text) => text.includes('�'));
    expect(broken).toHaveLength(3);
    expect(broken.every((text) => syllabi.find((document) => document.id === 'jee-main-chemistry')!.units.some((unit) => unit.chapters.some((chapter) => chapter.topics.includes(text))))).toBe(true);
  });
});

describe('parseSyllabi', () => {
  const valid = syllabi[0];

  it('refuses a document with a field the schema does not know (nothing is dropped silently)', () => {
    expect(() => parseSyllabi({ [`./data/${valid.id}.json`]: { ...valid, surprise: 1 } })).toThrow(/does not match the syllabus schema/);
  });

  it('refuses a file whose name is not its id', () => {
    expect(() => parseSyllabi({ './data/wrong-name.json': valid })).toThrow(/must be named/);
  });
});
