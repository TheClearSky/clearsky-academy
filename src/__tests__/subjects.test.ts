import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { subjectColorMap, subjects } from '../subjects';

const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');

describe('subject colours', () => {
  it('match the --color-subject-* tokens in index.css exactly', () => {
    for (const subject of subjects) {
      const token = new RegExp(`--color-subject-${subject}:\\s*(#[0-9a-f]{6});`, 'i').exec(css);
      expect(token?.[1].toLowerCase(), subject).toBe(subjectColorMap[subject].toLowerCase());
    }
  });

  it('leave biology out (user: "don\'t include biology for now")', () => {
    expect(subjects).not.toContain('biology');
  });
});
