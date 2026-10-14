/**
 * The maths of "the standard form of a quadratic equation" (CBSE X, ch. 4,
 * topic 1), shared by the video (`video.ts`) and the playground
 * (`Playground.tsx`): y = ax² + bx + c, its roots, vertex and discriminant.
 * Pure; unit-tested (`src/__tests__/topic-quadratic.test.ts`).
 */

type Quadratic = { a: number; b: number; c: number };

/** Below this |a| the equation is treated as not quadratic (a ≠ 0 fails). */
const A_EPSILON = 1e-9;

function valueAt({ a, b, c }: Quadratic, x: number): number {
  return a * x * x + b * x + c;
}

function discriminant({ a, b, c }: Quadratic): number {
  return b * b - 4 * a * c;
}

/** Real roots in ascending order: two, one (a double root) or none. Not a quadratic (a = 0): null. */
function realRoots(q: Quadratic): number[] | null {
  if (Math.abs(q.a) < A_EPSILON) return null;
  const d = discriminant(q);
  if (d < -1e-12) return [];
  if (Math.abs(d) <= 1e-12) return [-q.b / (2 * q.a)];
  const s = Math.sqrt(d);
  const r1 = (-q.b - s) / (2 * q.a);
  const r2 = (-q.b + s) / (2 * q.a);
  return r1 < r2 ? [r1, r2] : [r2, r1];
}

/** The turning point (a ≠ 0). */
function vertex(q: Quadratic): { x: number; y: number } | null {
  if (Math.abs(q.a) < A_EPSILON) return null;
  const x = -q.b / (2 * q.a);
  return { x, y: valueAt(q, x) };
}

/** `count` points of the curve on [x0, x1], as a flat [x, y, 0, …] array (for line geometry). */
function samples(q: Quadratic, x0: number, x1: number, count: number): number[] {
  const out: number[] = [];
  for (let index = 0; index < count; index++) {
    const x = x0 + ((x1 - x0) * index) / (count - 1);
    out.push(x, valueAt(q, x), 0);
  }
  return out;
}

/** The equation as text, e.g. "2x² − 3x + 1 = 0" (signs folded, unit coefficients dropped). */
function formatEquation({ a, b, c }: Quadratic, digits = 1): string {
  const number = (value: number) => Number(value.toFixed(digits)).toString();
  const term = (coefficient: number, variable: string, first: boolean) => {
    if (Math.abs(coefficient) < 10 ** -digits / 2) return '';
    const sign = coefficient < 0 ? (first ? '−' : ' − ') : first ? '' : ' + ';
    const magnitude = Math.abs(coefficient);
    const shown = variable && Math.abs(magnitude - 1) < 10 ** -digits / 2 ? '' : number(magnitude);
    return `${sign}${shown}${variable}`;
  };
  const left = [term(a, 'x²', true)];
  left.push(term(b, 'x', left.join('') === ''));
  left.push(term(c, '', left.join('') === ''));
  return `${left.join('') || '0'} = 0`;
}

export { A_EPSILON, discriminant, formatEquation, realRoots, samples, valueAt, vertex };
export type { Quadratic };
