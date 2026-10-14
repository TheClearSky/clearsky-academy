import { describe, expect, it } from 'vitest';
import { parseLandingState } from '../site/landingState';

describe('landing state', () => {
  it('keeps the well-formed fields', () => {
    expect(parseLandingState('{"course":"cbse-11","picked":true,"subject":"cbse-11-physics"}')).toEqual({ course: 'cbse-11', picked: true, subject: 'cbse-11-physics' });
  });

  it('drops malformed fields and ignores junk', () => {
    expect(parseLandingState('{"course":7,"picked":"yes","subject":"cbse-11-physics"}')).toEqual({ subject: 'cbse-11-physics' });
    expect(parseLandingState('[1,2]')).toEqual({});
    expect(parseLandingState('not json')).toEqual({});
    expect(parseLandingState(null)).toEqual({});
    expect(parseLandingState(JSON.stringify({ course: 'x'.repeat(65) }))).toEqual({});
  });
});
