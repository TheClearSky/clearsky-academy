import { describe, expect, it } from 'vitest';
import { emptyProgress, parseProgress, PROGRESS_KEY, recordTry, serialiseProgress } from '../topics/library/types-of-numbers/play/progress';

const IDS = ['naturals', 'nest', 'first-home'];

describe('play progress (localStorage)', () => {
  it('lives under the site namespace', () => {
    expect(PROGRESS_KEY).toBe('clearsky-academy:play:types-of-numbers');
  });

  it('round-trips', () => {
    let p = emptyProgress();
    p = recordTry(p, 'nest', false);
    p = recordTry(p, 'nest', true);
    p = recordTry(p, 'nest', false);
    p = { ...p, tab: 2 };
    expect(parseProgress(serialiseProgress(p), IDS)).toEqual({ tab: 2, questions: { nest: { tries: 3, solved: true, last: 'wrong' } } });
  });

  it('ignores anything it cannot trust, without throwing', () => {
    for (const raw of [null, '', 'not json', '[]', '{}', '{"version":2,"tab":1}', 'null', '42']) expect(parseProgress(raw, IDS)).toEqual(emptyProgress());
    const odd = JSON.stringify({
      version: 1,
      tab: 99,
      questions: { nest: { tries: -1 }, naturals: { tries: 2.5 }, 'first-home': { tries: 1, solved: 'yes', last: 'maybe' }, ghost: { tries: 1, solved: true } },
    });
    expect(parseProgress(odd, IDS)).toEqual({ tab: 0, questions: { 'first-home': { tries: 1, solved: false, last: null } } });
  });
});
