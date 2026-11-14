/**
 * "PLAY WITH IT" FOR VIDEO 1 (M13.X1, 2026-11-14): the ten puzzles as DATA, and the answer checker. PURE: no DOM, no
 * canvas, no clock (the scenes in `scenes.ts` draw them; `src/__tests__/play-questions.test.ts` proves every answer from
 * the numbers themselves, so a typo in an answer key cannot ship).
 *
 * Deepak, 2026-11-14 (verbatim): "Add some real puzzles related to the video and topic, ramp it up slowly, start with
 * easy problems to hard ones. Make a tab selection for the questions, have 10 questions and every question has a badge
 * called "Easy" "Medium" or "Hard". And when you click submit, a visual animated solution follows with either you were
 * correct or incorrect. You can reset a problem to try again, no problem with that."
 *
 * Three ways to answer (one interaction model each, `Stage.tsx`):
 *   place   numbers (or set symbols) moved into regions: the rings of the film's Venn, or the tray (not placed);
 *   line    a point dragged along the number line (a tolerance);
 *   choose  one option picked per slot (the film's written puzzle, the set-builder gaps, the square's side).
 */

type Difficulty = 'Easy' | 'Medium' | 'Hard';
const DIFFICULTIES: readonly Difficulty[] = ['Easy', 'Medium', 'Hard'];

/** The chapter's groups (venn.ts › SETS): ℕ ⊂ 𝕎 ⊂ ℤ ⊂ ℚ ⊂ ℝ, and 𝕀 = ℝ ∖ ℚ. */
type SetId = 'N' | 'W' | 'Z' | 'Q' | 'I' | 'R';
const SYMBOL: Record<SetId, string> = { N: 'ℕ', W: '\u{1D54E}', Z: 'ℤ', Q: 'ℚ', I: '\u{1D540}', R: 'ℝ' };
const SET_NAME: Record<SetId, string> = { N: 'natural numbers', W: 'whole numbers', Z: 'integers', Q: 'rational numbers', I: 'irrational numbers', R: 'real numbers' };

/** A number, exactly: a fraction p⁄q (q > 0), or an irrational with a decimal approximation. */
type Num = { kind: 'rational'; p: number; q: number } | { kind: 'irrational'; approx: number };
const frac = (p: number, q = 1): Num => ({ kind: 'rational', p, q });
const irrational = (approx: number): Num => ({ kind: 'irrational', approx });

/** The smallest group of the chain a number belongs to (its "first home"). */
function smallestSet(v: Num): Exclude<SetId, 'R'> {
  if (v.kind === 'irrational') return 'I';
  if (v.q === 0) throw new Error('p⁄0 is not a number');
  if (v.p % v.q !== 0) return 'Q';
  const n = v.p / v.q;
  return n > 0 ? 'N' : n === 0 ? 'W' : 'Z';
}

/** Every group a number belongs to (ℕ ⊂ 𝕎 ⊂ ℤ ⊂ ℚ ⊂ ℝ; 𝕀 ⊂ ℝ). */
const CHAIN: readonly SetId[] = ['N', 'W', 'Z', 'Q', 'R'];
function setsOf(v: Num): SetId[] {
  const first = smallestSet(v);
  if (first === 'I') return ['I', 'R'];
  return CHAIN.slice(CHAIN.indexOf(first));
}
/** Is every member of `a` a member of `b`? (The chapter's groups only.) */
function isSubset(a: SetId, b: SetId): boolean {
  if (a === b) return true;
  if (b === 'R') return true;
  if (a === 'I' || b === 'I' || a === 'R') return false;
  return CHAIN.indexOf(a) < CHAIN.indexOf(b);
}

type Token = { id: string; label: string; aria: string; value?: Num; set?: SetId };
type Region = { id: string; aria: string };
type Option = { id: string; label: string; aria: string; value?: Num };
type Slot = { id: string; aria: string; options: Option[]; answer: string };

type Base = { id: string; difficulty: Difficulty; title: string; prompt: string; how: string };
type PlaceQuestion = Base & {
  kind: 'place';
  tokens: Token[];
  /** Where a token can go; 'tray' (not placed) is always allowed and is not listed. */
  regions: Region[];
  /** The right region of each token ('tray' = it does not belong anywhere offered). */
  answer: Record<string, string>;
  /** Submit only once every token has been placed. */
  needAll: boolean;
  /** At most this many tokens per region (a ring takes one symbol). */
  capacity?: number;
};
type LineQuestion = Base & { kind: 'line'; range: [number, number]; start: number; answer: number; tolerance: number; target: string };
type ChooseQuestion = Base & { kind: 'choose'; slots: Slot[] };
type Question = PlaceQuestion | LineQuestion | ChooseQuestion;

/** The claims of the film's own puzzle (sectionsSubset.ts › CLAIMS): "in chaar mein se kaun saa galat hai?" */
type Claim = { kind: 'member'; el: Num; not: boolean; set: SetId } | { kind: 'subset'; a: SetId; b: SetId };
const CLAIMS: Record<string, Claim> = {
  A: { kind: 'member', el: frac(0), not: false, set: 'N' },
  B: { kind: 'member', el: frac(-5), not: false, set: 'Q' },
  C: { kind: 'member', el: irrational(Math.SQRT2), not: true, set: 'Q' },
  D: { kind: 'subset', a: 'W', b: 'Z' },
};
function claimHolds(claim: Claim): boolean {
  if (claim.kind === 'subset') return isSubset(claim.a, claim.b);
  const inside = setsOf(claim.el).includes(claim.set);
  return claim.not ? !inside : inside;
}

const QUESTIONS: readonly Question[] = [
  {
    kind: 'place',
    id: 'naturals',
    difficulty: 'Easy',
    title: 'Counting numbers',
    prompt: 'Which of these are natural numbers?',
    how: 'Move every number that belongs into ℕ. Drag it, or tap it and then tap the ring.',
    tokens: [
      { id: 'zero', label: '0', aria: 'zero', value: frac(0) },
      { id: 'three', label: '3', aria: 'three', value: frac(3) },
      { id: 'minus-two', label: '−2', aria: 'minus two', value: frac(-2) },
      { id: 'seven', label: '7', aria: 'seven', value: frac(7) },
      { id: 'half', label: '½', aria: 'one half', value: frac(1, 2) },
    ],
    regions: [{ id: 'N', aria: 'ℕ, the natural numbers' }],
    answer: { zero: 'tray', three: 'N', 'minus-two': 'tray', seven: 'N', half: 'tray' },
    needAll: false,
  },
  {
    kind: 'place',
    id: 'nest',
    difficulty: 'Easy',
    title: 'Groups inside groups',
    prompt: 'Nest the groups: which ring is which?',
    how: 'Put ℕ, 𝕎 and ℤ on the three rings, the smallest group inside.',
    tokens: [
      { id: 'Z', label: 'ℤ', aria: 'ℤ, the integers', set: 'Z' },
      { id: 'N', label: 'ℕ', aria: 'ℕ, the natural numbers', set: 'N' },
      { id: 'W', label: '\u{1D54E}', aria: '𝕎, the whole numbers', set: 'W' },
    ],
    regions: [
      { id: 'inner', aria: 'the inner ring' },
      { id: 'middle', aria: 'the middle ring' },
      { id: 'outer', aria: 'the outer ring' },
    ],
    answer: { N: 'inner', W: 'middle', Z: 'outer' },
    needAll: true,
    capacity: 1,
  },
  {
    kind: 'place',
    id: 'first-home',
    difficulty: 'Easy',
    title: 'First home',
    prompt: 'Where does each number live first?',
    how: 'Move each number into the smallest group it belongs to.',
    tokens: [
      { id: 'minus-three', label: '−3', aria: 'minus three', value: frac(-3) },
      { id: 'five', label: '5', aria: 'five', value: frac(5) },
      { id: 'zero', label: '0', aria: 'zero', value: frac(0) },
    ],
    regions: [
      { id: 'N', aria: 'ℕ, the natural numbers' },
      { id: 'W', aria: '𝕎, the whole numbers' },
      { id: 'Z', aria: 'ℤ, the integers' },
    ],
    answer: { 'minus-three': 'Z', five: 'N', zero: 'W' },
    needAll: true,
  },
  {
    kind: 'line',
    id: 'three-quarters',
    difficulty: 'Medium',
    title: 'A share on the line',
    prompt: 'Place ¾ on the number line.',
    how: 'Drag the point along the line, or move it with the arrow keys.',
    range: [0, 2],
    start: 0,
    answer: 3 / 4,
    tolerance: 0.06,
    target: '¾',
  },
  {
    kind: 'place',
    id: 'trick',
    difficulty: 'Medium',
    title: 'Look again',
    prompt: 'Which group does −8⁄4 belong to first?',
    how: 'Drop it into the smallest group that holds it.',
    tokens: [{ id: 'minus-eight-quarters', label: '−8⁄4', aria: 'minus eight over four', value: frac(-8, 4) }],
    regions: [
      { id: 'N', aria: 'ℕ, the natural numbers' },
      { id: 'W', aria: '𝕎, the whole numbers' },
      { id: 'Z', aria: 'ℤ, the integers' },
      { id: 'Q', aria: 'ℚ, the rational numbers' },
      { id: 'I', aria: '𝕀, the irrational numbers' },
    ],
    answer: { 'minus-eight-quarters': 'Z' },
    needAll: true,
  },
  {
    kind: 'choose',
    id: 'which-wrong',
    difficulty: 'Medium',
    title: 'The video’s puzzle',
    prompt: 'Which of these four is wrong?',
    how: 'Read each statement. Pick the one that is false.',
    slots: [
      {
        id: 'claim',
        aria: 'the wrong statement',
        options: [
          { id: 'A', label: '0 ∈ ℕ', aria: 'A: zero belongs to ℕ' },
          { id: 'B', label: '−5 ∈ ℚ', aria: 'B: minus five belongs to ℚ' },
          { id: 'C', label: '√2 ∉ ℚ', aria: 'C: root two does not belong to ℚ' },
          { id: 'D', label: '\u{1D54E} ⊂ ℤ', aria: 'D: 𝕎 is a subset of ℤ' },
        ],
        answer: 'A',
      },
    ],
  },
  {
    kind: 'choose',
    id: 'set-builder',
    difficulty: 'Medium',
    title: 'Set-builder form',
    prompt: 'Complete the set-builder form of ℚ.',
    how: 'Pick what fills each gap.',
    slots: [
      {
        id: 'from',
        aria: 'p and q belong to',
        options: [
          { id: 'N', label: 'ℕ', aria: 'ℕ' },
          { id: 'W', label: '\u{1D54E}', aria: '𝕎' },
          { id: 'Z', label: 'ℤ', aria: 'ℤ' },
          { id: 'R', label: 'ℝ', aria: 'ℝ' },
        ],
        answer: 'Z',
      },
      {
        id: 'not',
        aria: 'q is not equal to',
        options: [
          { id: '0', label: '0', aria: 'zero' },
          { id: '1', label: '1', aria: 'one' },
          { id: '-1', label: '−1', aria: 'minus one' },
        ],
        answer: '0',
      },
    ],
  },
  {
    kind: 'place',
    id: 'decimals',
    difficulty: 'Hard',
    title: 'Decimals',
    prompt: 'Rational or not?',
    how: 'Move each decimal into ℚ or into 𝕀 (the irrationals).',
    tokens: [
      { id: 'thirds', label: '0.333…', aria: 'zero point three three three, repeating', value: frac(1, 3) },
      { id: 'three-quarters', label: '0.75', aria: 'zero point seven five', value: frac(3, 4) },
      { id: 'growing', label: '0.1010010001…', aria: 'zero point one zero one zero zero one zero zero zero one, and on, one more zero each time', value: irrational(0.1010010001) },
    ],
    regions: [
      { id: 'Q', aria: 'ℚ, the rational numbers' },
      { id: 'I', aria: '𝕀, the irrational numbers' },
    ],
    answer: { thirds: 'Q', 'three-quarters': 'Q', growing: 'I' },
    needAll: true,
  },
  {
    kind: 'choose',
    id: 'area-two',
    difficulty: 'Hard',
    title: 'The square of area 2',
    prompt: 'A square has area 2. What is its side, and is it a fraction?',
    how: 'Pick the side, then say whether it belongs to ℚ.',
    slots: [
      {
        id: 'side',
        aria: 'the side',
        options: [
          { id: '1', label: '1', aria: 'one', value: frac(1) },
          { id: '1.4', label: '1.4', aria: 'one point four', value: frac(7, 5) },
          { id: 'root2', label: '√2', aria: 'root two', value: irrational(Math.SQRT2) },
          { id: '2', label: '2', aria: 'two', value: frac(2) },
        ],
        answer: 'root2',
      },
      {
        id: 'fraction',
        aria: 'is the side a fraction',
        options: [
          { id: 'in', label: '∈ ℚ', aria: 'yes, it belongs to ℚ' },
          { id: 'out', label: '∉ ℚ', aria: 'no, it does not belong to ℚ' },
        ],
        answer: 'out',
      },
    ],
  },
  {
    kind: 'line',
    id: 'root-three',
    difficulty: 'Hard',
    title: 'The compass',
    prompt: 'Put √3 on the number line.',
    how: 'Use the triangle on √2: swing its slanted side down onto the line, as the compass did for √2.',
    range: [0, 2],
    start: 1,
    answer: Math.sqrt(3),
    tolerance: 0.03,
    target: '√3',
  },
];

// ─── answers ────────────────────────────────────────────────────────────────────────────────────────────────────────

type PlaceResponse = { kind: 'place'; at: Record<string, string>; order: string[] };
type LineResponse = { kind: 'line'; value: number; moved: boolean };
type ChooseResponse = { kind: 'choose'; pick: Record<string, string> };
type Response = PlaceResponse | LineResponse | ChooseResponse;

function initialResponse(q: Question): Response {
  if (q.kind === 'place') return { kind: 'place', at: {}, order: [] };
  if (q.kind === 'line') return { kind: 'line', value: q.start, moved: false };
  return { kind: 'choose', pick: {} };
}

/** Where a token sits ('tray' when it has not been placed). */
const regionOf = (r: PlaceResponse, token: string) => r.at[token] ?? 'tray';

/** Moves `token` to `region` ('tray' takes it out). A full region (capacity) swaps its occupant back to the tray. */
function placeToken(q: PlaceQuestion, r: PlaceResponse, token: string, region: string): PlaceResponse {
  const at = { ...r.at };
  let order = r.order.filter((id) => id !== token);
  if (region === 'tray') {
    delete at[token];
    return { kind: 'place', at, order };
  }
  if (!q.regions.some((g) => g.id === region)) return r;
  if (q.capacity !== undefined) {
    const inside = order.filter((id) => at[id] === region);
    while (inside.length >= q.capacity) {
      const out = inside.shift()!;
      delete at[out];
      order = order.filter((id) => id !== out);
    }
  }
  at[token] = region;
  order.push(token);
  return { kind: 'place', at, order };
}

/** Can the answer be submitted yet? */
function isComplete(q: Question, r: Response): boolean {
  if (q.kind === 'place' && r.kind === 'place') return q.needAll ? q.tokens.every((t) => regionOf(r, t.id) !== 'tray') : true;
  if (q.kind === 'line' && r.kind === 'line') return r.moved;
  if (q.kind === 'choose' && r.kind === 'choose') return q.slots.every((s) => r.pick[s.id] !== undefined);
  return false;
}

type Verdict = { correct: boolean; /** The ids that were wrong: tokens, slots, or 'point'. */ wrong: string[] };

function checkAnswer(q: Question, r: Response): Verdict {
  if (q.kind === 'place' && r.kind === 'place') {
    const wrong = q.tokens.filter((t) => regionOf(r, t.id) !== q.answer[t.id]).map((t) => t.id);
    return { correct: wrong.length === 0, wrong };
  }
  if (q.kind === 'line' && r.kind === 'line') {
    const ok = r.moved && Math.abs(r.value - q.answer) <= q.tolerance + 1e-9;
    return { correct: ok, wrong: ok ? [] : ['point'] };
  }
  if (q.kind === 'choose' && r.kind === 'choose') {
    const wrong = q.slots.filter((s) => r.pick[s.id] !== s.answer).map((s) => s.id);
    return { correct: wrong.length === 0, wrong };
  }
  return { correct: false, wrong: ['kind'] };
}

const questionById = (id: string) => QUESTIONS.find((q) => q.id === id);

export { CHAIN, checkAnswer, claimHolds, CLAIMS, DIFFICULTIES, frac, initialResponse, irrational, isComplete, isSubset, placeToken, QUESTIONS, questionById, regionOf, SET_NAME, setsOf, smallestSet, SYMBOL };
export type { ChooseQuestion, ChooseResponse, Claim, Difficulty, LineQuestion, LineResponse, Num, Option, PlaceQuestion, PlaceResponse, Question, Region, Response, SetId, Slot, Token, Verdict };
