import { Fragment } from 'react';

/**
 * Words with maths in them, for the playground's HTML (prompts, captions): words stay in the modal's Cormorant, every
 * maths character is set in STIX Two (Q-T1), and a set's letter takes its set's colour (MATH-04, venn.ts › SETS text),
 * as in the film's statements. Numbers stay in the ink: in a prompt a number's colour would hint at its group.
 */

const SET_CLASS: Record<string, string> = { ℕ: 'np-set-n', '\u{1D54E}': 'np-set-w', ℤ: 'np-set-z', ℚ: 'np-set-q', '\u{1D540}': 'np-set-i', ℝ: 'np-set-r' };
const MATH = /[ℕℤℚℝ\u{1D54E}\u{1D540}∈∉⊂⊆≠≈×÷√²⁄½¼¾…−<>={}()]|\d/u;

function MathText({ text }: { text: string }) {
  const runs: { math: boolean; text: string }[] = [];
  for (const ch of Array.from(text)) {
    const math = MATH.test(ch) || (ch === '.' && runs.at(-1)?.math === true);
    const last = runs.at(-1);
    if (last && last.math === math && !SET_CLASS[ch] && !SET_CLASS[Array.from(last.text).at(-1) ?? '']) last.text += ch;
    else runs.push({ math, text: ch });
  }
  return (
    <>
      {runs.map((run, i) =>
        run.math ? (
          <span key={i} className={`np-math ${SET_CLASS[run.text] ?? ''}`}>
            {run.text}
          </span>
        ) : (
          <Fragment key={i}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}

export { MathText };
