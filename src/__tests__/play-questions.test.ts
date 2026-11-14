import { describe, expect, it } from 'vitest';
import { checkAnswer, claimHolds, CLAIMS, DIFFICULTIES, initialResponse, isComplete, isSubset, placeToken, QUESTIONS, regionOf, setsOf, smallestSet } from '../topics/library/types-of-numbers/play/questions';
import type { ChooseQuestion, LineQuestion, PlaceQuestion, PlaceResponse, Question } from '../topics/library/types-of-numbers/play/questions';
import { SCENES } from '../topics/library/types-of-numbers/play/scenes';

/** Video 1's "Play with it" (M13.X1): the ten puzzles, every answer proved from the numbers themselves. */

const byId = <T extends Question>(id: string) => QUESTIONS.find((q) => q.id === id) as T;

/** The right answer, as a response. */
function solved(q: Question) {
  if (q.kind === 'place') {
    let r = initialResponse(q) as PlaceResponse;
    for (const t of q.tokens) if (q.answer[t.id] !== 'tray') r = placeToken(q, r, t.id, q.answer[t.id]);
    return r;
  }
  if (q.kind === 'line') return { kind: 'line' as const, value: q.answer, moved: true };
  return { kind: 'choose' as const, pick: Object.fromEntries(q.slots.map((s) => [s.id, s.answer])) };
}

describe('the ten questions', () => {
  it('are ten, with unique ids, 3 Easy, 4 Medium, 3 Hard, ramping (never easier than the one before)', () => {
    expect(QUESTIONS).toHaveLength(10);
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(10);
    const rank = QUESTIONS.map((q) => DIFFICULTIES.indexOf(q.difficulty));
    expect(rank.every((r) => r >= 0)).toBe(true);
    for (let i = 1; i < rank.length; i++) expect(rank[i]).toBeGreaterThanOrEqual(rank[i - 1]);
    expect(QUESTIONS.map((q) => q.difficulty)).toEqual(['Easy', 'Easy', 'Easy', 'Medium', 'Medium', 'Medium', 'Medium', 'Hard', 'Hard', 'Hard']);
  });

  it('every badge is exactly "Easy", "Medium" or "Hard", and every question has a title, a prompt and a how', () => {
    for (const q of QUESTIONS) {
      expect(['Easy', 'Medium', 'Hard']).toContain(q.difficulty);
      expect(q.title.length).toBeGreaterThan(2);
      expect(q.prompt.length).toBeGreaterThan(5);
      expect(q.how.length).toBeGreaterThan(5);
    }
  });

  it('every question has a scene with a solution of at least two steps', () => {
    for (const q of QUESTIONS) {
      const scene = SCENES[q.id];
      expect(scene, q.id).toBeDefined();
      expect(scene.steps.length).toBeGreaterThanOrEqual(2);
      expect(scene.duration).toBeGreaterThan(scene.steps.at(-1)!.at);
    }
  });

  it('the right answer checks as correct, and the starting answer does not', () => {
    for (const q of QUESTIONS) {
      expect(checkAnswer(q, solved(q)).correct, q.id).toBe(true);
      expect(isComplete(q, solved(q)), q.id).toBe(true);
      expect(checkAnswer(q, initialResponse(q)).correct, q.id).toBe(false);
    }
  });
});

describe('the maths of the answer keys', () => {
  it('smallestSet and setsOf follow ℕ ⊂ 𝕎 ⊂ ℤ ⊂ ℚ ⊂ ℝ', () => {
    expect(smallestSet({ kind: 'rational', p: 3, q: 1 })).toBe('N');
    expect(smallestSet({ kind: 'rational', p: 0, q: 1 })).toBe('W');
    expect(smallestSet({ kind: 'rational', p: -2, q: 1 })).toBe('Z');
    expect(smallestSet({ kind: 'rational', p: -8, q: 4 })).toBe('Z');
    expect(smallestSet({ kind: 'rational', p: 1, q: 2 })).toBe('Q');
    expect(smallestSet({ kind: 'irrational', approx: Math.SQRT2 })).toBe('I');
    expect(setsOf({ kind: 'rational', p: 0, q: 1 })).toEqual(['W', 'Z', 'Q', 'R']);
    expect(isSubset('N', 'W') && isSubset('W', 'Z') && isSubset('Z', 'Q') && isSubset('Q', 'R') && isSubset('I', 'R')).toBe(true);
    expect(isSubset('Z', 'W') || isSubset('I', 'Q') || isSubset('Q', 'I')).toBe(false);
  });

  it('Q1: a token belongs in ℕ exactly when it is a natural number', () => {
    const q = byId<PlaceQuestion>('naturals');
    for (const t of q.tokens) expect(q.answer[t.id], t.label).toBe(smallestSet(t.value!) === 'N' ? 'N' : 'tray');
    expect(q.tokens.filter((t) => q.answer[t.id] === 'N').map((t) => t.label)).toEqual(['3', '7']);
  });

  it('Q2: the rings nest ℕ inside 𝕎 inside ℤ', () => {
    const q = byId<PlaceQuestion>('nest');
    const ring = ['inner', 'middle', 'outer'];
    const order = q.tokens.slice().sort((a, b) => ring.indexOf(q.answer[a.id]) - ring.indexOf(q.answer[b.id])).map((t) => t.set!);
    expect(order).toEqual(['N', 'W', 'Z']);
    for (let i = 1; i < order.length; i++) expect(isSubset(order[i - 1], order[i])).toBe(true);
  });

  it('Q3, Q5, Q8: each token goes to its first home', () => {
    for (const id of ['first-home', 'trick']) {
      const q = byId<PlaceQuestion>(id);
      for (const t of q.tokens) expect(q.answer[t.id], `${id} ${t.label}`).toBe(smallestSet(t.value!));
    }
    expect(byId<PlaceQuestion>('trick').answer['minus-eight-quarters']).toBe('Z');
    const decimals = byId<PlaceQuestion>('decimals');
    for (const t of decimals.tokens) expect(decimals.answer[t.id], t.label).toBe(smallestSet(t.value!) === 'I' ? 'I' : 'Q');
    // 0.333… = 1⁄3 and 0.75 = 3⁄4 (the labels agree with the exact values); the growing pattern never repeats.
    expect((1 / 3).toFixed(3)).toBe('0.333');
    expect(3 / 4).toBe(0.75);
  });

  it('Q4: ¾ is the answer and the tolerance cannot accept a neighbouring eighth', () => {
    const q = byId<LineQuestion>('three-quarters');
    expect(q.answer).toBe(0.75);
    expect(q.tolerance).toBeLessThan(1 / 16);
    expect(checkAnswer(q, { kind: 'line', value: 5 / 8, moved: true }).correct).toBe(false);
    expect(checkAnswer(q, { kind: 'line', value: 7 / 8, moved: true }).correct).toBe(false);
    expect(checkAnswer(q, { kind: 'line', value: 0.78, moved: true }).correct).toBe(true);
    expect(q.answer).toBeGreaterThanOrEqual(q.range[0]);
    expect(q.answer).toBeLessThanOrEqual(q.range[1]);
  });

  it('Q6: exactly one of the film’s four claims is false, and it is the answer (0 ∉ ℕ)', () => {
    const q = byId<ChooseQuestion>('which-wrong');
    const falses = Object.entries(CLAIMS).filter(([, c]) => !claimHolds(c)).map(([k]) => k);
    expect(falses).toEqual(['A']);
    expect(q.slots[0].answer).toBe('A');
    expect(q.slots[0].options.map((o) => o.label)).toEqual(['0 ∈ ℕ', '−5 ∈ ℚ', '√2 ∉ ℚ', '\u{1D54E} ⊂ ℤ']);
  });

  it('Q7: { p⁄q : p, q ∈ ℤ, q ≠ 0 } and no other offered choice makes ℚ', () => {
    const q = byId<ChooseQuestion>('set-builder');
    const from = q.slots.find((s) => s.id === 'from')!;
    expect(from.answer).toBe('Z');
    // ℚ itself is not offered: { p⁄q : p, q ∈ ℚ } is also ℚ, so it would be a second right answer.
    expect(from.options.map((o) => o.id)).not.toContain('Q');
    // Witnesses that the other choices are wrong: with ℕ or 𝕎 every p⁄q is ≥ 0, so −1 is missed; with ℝ, √2⁄1 gets in.
    const sample = (values: number[]) => values.flatMap((p) => values.filter((v) => v !== 0).map((v) => p / v));
    expect(sample([0, 1, 2, 3, 4]).some((x) => x < 0)).toBe(false);
    expect(sample([-2, -1, 0, 1, 2]).some((x) => x === -1)).toBe(true);
    expect(sample([Math.SQRT2, 1]).some((x) => Math.abs(x - Math.SQRT2) < 1e-12)).toBe(true);
    // q ≠ 0: sharing among 0 is not a number. (q ≠ 1 or q ≠ −1 would still let p⁄0 in.)
    expect(q.slots.find((s) => s.id === 'not')!.answer).toBe('0');
    expect(Number.isFinite(1 / 0)).toBe(false);
  });

  it('Q9: only √2 squares to 2, and √2 ∉ ℚ', () => {
    const q = byId<ChooseQuestion>('area-two');
    const side = q.slots.find((s) => s.id === 'side')!;
    const squaresToTwo = side.options.filter((o) => {
      const v = o.value!;
      const x = v.kind === 'rational' ? v.p / v.q : v.approx;
      return Math.abs(x * x - 2) < 1e-9;
    });
    expect(squaresToTwo.map((o) => o.id)).toEqual(['root2']);
    expect(side.answer).toBe('root2');
    // 1.4 is the tempting one: 1.4 × 1.4 = 1.96.
    expect(1.4 * 1.4).toBeCloseTo(1.96, 12);
    expect(smallestSet(side.options.find((o) => o.id === 'root2')!.value!)).toBe('I');
    expect(q.slots.find((s) => s.id === 'fraction')!.answer).toBe('out');
  });

  it('Q10: the slanted side of the triangle on √2 is √3, and the accepted band lies between 1.7 and 1.8', () => {
    const q = byId<LineQuestion>('root-three');
    expect(Math.hypot(Math.SQRT2, 1)).toBeCloseTo(q.answer, 12);
    expect(q.answer).toBeCloseTo(1.7320508, 6);
    expect(q.answer - q.tolerance).toBeGreaterThanOrEqual(1.7);
    expect(q.answer + q.tolerance).toBeLessThanOrEqual(1.8);
    expect(checkAnswer(q, { kind: 'line', value: Math.SQRT2, moved: true }).correct).toBe(false);
    expect(checkAnswer(q, { kind: 'line', value: 1.75, moved: true }).correct).toBe(true);
  });
});

describe('answering', () => {
  it('placing, moving back to the tray and capacity swaps', () => {
    const q = byId<PlaceQuestion>('nest');
    let r = initialResponse(q) as PlaceResponse;
    r = placeToken(q, r, 'Z', 'inner');
    r = placeToken(q, r, 'N', 'inner');
    expect(regionOf(r, 'N')).toBe('inner');
    expect(regionOf(r, 'Z')).toBe('tray');
    r = placeToken(q, r, 'N', 'tray');
    expect(r.order).toEqual([]);
    expect(placeToken(q, r, 'N', 'nowhere')).toBe(r);
  });

  it('a wrong answer names what was wrong; an unmoved line point is never right', () => {
    const q = byId<PlaceQuestion>('first-home');
    let r = initialResponse(q) as PlaceResponse;
    r = placeToken(q, r, 'five', 'N');
    r = placeToken(q, r, 'zero', 'N');
    r = placeToken(q, r, 'minus-three', 'Z');
    expect(checkAnswer(q, r)).toEqual({ correct: false, wrong: ['zero'] });
    const line = byId<LineQuestion>('root-three');
    expect(checkAnswer(line, { kind: 'line', value: line.answer, moved: false }).correct).toBe(false);
    expect(isComplete(line, { kind: 'line', value: 1, moved: false })).toBe(false);
  });

  it('Submit waits for every needed token or slot', () => {
    const q = byId<PlaceQuestion>('decimals');
    expect(isComplete(q, initialResponse(q))).toBe(false);
    expect(isComplete(byId('naturals'), initialResponse(byId('naturals')))).toBe(true);
    expect(isComplete(byId('set-builder'), { kind: 'choose', pick: { from: 'Z' } })).toBe(false);
  });
});
