/**
 * The site's subjects. Biology is deliberately absent for now (user,
 * 2026-10-12: "don't include biology for now, only physics and chemistry").
 */
const subjects = ['mathematics', 'physics', 'chemistry'] as const;
type Subject = (typeof subjects)[number];

const subjectLabelMap: Record<Subject, string> = {
  mathematics: 'Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
};

/**
 * One colour per subject for code that cannot use a Tailwind class (the 3D
 * scenes' materials, inline styles). These MUST equal the
 * `--color-subject-*` tokens in `src/index.css`; markup uses the
 * `text-subject-*` / `bg-subject-*` utilities instead.
 */
const subjectColorMap: Record<Subject, string> = {
  mathematics: '#f1c40f',
  physics: '#3498db',
  chemistry: '#2ecc71',
};

export { subjectColorMap, subjectLabelMap, subjects };
export type { Subject };
