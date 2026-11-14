/**
 * THE CHAPTER'S VENN / EULER DIAGRAM (round 2026-11-07c, ruling R-V1). Deepak, verbatim: "when you show a math equation
 * or something like A belongs to be belong to c in set, also draw an amazinf venn digram color coded to give a overview".
 *
 * PURE: no DOM, no three.js, no clock, no randomness. `vennFrame(script, t)` is a function of its arguments only and
 * returns a fresh object (the painter, `vennPaint.ts`, draws it; `src/__tests__/venn.test.ts` holds it to that).
 *
 * THE CHAPTER COLOUR KEY (one colour per set, the same in every video of "Number System"; the binding colour code of
 * `types-of-numbers-3d.md` › "Rules kept", via the effects' `NUMBER_FX`):
 *   ℕ natural  gold        𝕎 whole       white-gold     ℤ integers  crystal
 *   ℚ rational lilac       𝕀 irrational  rose           ℝ real      moon silver (the whole number line)
 * THE CHAPTER GEOMETRY is fixed too: ℕ ⊂ 𝕎 ⊂ ℤ ⊂ ℚ nest to the left inside ℝ, and 𝕀 is the rest of ℝ (ℝ ∖ ℚ) on the
 * right, so a set sits in the same place in every shot; a shot shows only the sets it needs and the VIEW frames them.
 * v2 (2026-11-07, the main session's review: "text collides … give the regions room"): a wide, flat ℝ (2000 × 760
 * design space) so each set owns a clear POCKET on the right of its inner set; every symbol and member sits in its
 * pocket with clearance from every ring (tested); the names live in a KEY band outside the diagram (`vennPaint.ts`),
 * never on the rings; `layoutFaults` is the gate: text over text, text over a ring stroke, text clipped.
 *
 * Units: a 2000 × 760 diagram space, origin at the centre, y DOWN (canvas order).
 */

type SetId = 'N' | 'W' | 'Z' | 'Q' | 'I' | 'R';

type SetKey = {
  id: SetId;
  /** The set's symbol (STIX Two). */
  symbol: string;
  /** Its name in words (Cormorant). */
  name: string;
  /** The effects' owner kind (`fx/colours.ts` › NUMBER_FX), so effects and diagram agree; ℝ has its own. */
  kind: 'natural' | 'zero' | 'negative' | 'fraction' | 'irrational' | 'real';
  /** Display colours: `line` (outline light), `fill` (region tint), `text` (its symbol / members, readable on the dark). */
  line: string;
  fill: string;
  text: string;
  halo: string;
  /** The set it sits directly inside (null: ℝ). */
  parent: SetId | null;
};

const SETS: Record<SetId, SetKey> = {
  N: { id: 'N', symbol: 'ℕ', name: 'natural numbers', kind: 'natural', line: '#ffd36b', fill: '#ffcf5a', text: '#f4e2a6', halo: '#ff9a3c', parent: 'W' },
  W: { id: 'W', symbol: '\u{1D54E}', name: 'whole numbers', kind: 'zero', line: '#fff1cc', fill: '#fff0c4', text: '#ffffff', halo: '#ffc85a', parent: 'Z' },
  Z: { id: 'Z', symbol: 'ℤ', name: 'integers', kind: 'negative', line: '#8fe8ff', fill: '#6fd6ff', text: '#9feaff', halo: '#3a7cff', parent: 'Q' },
  Q: { id: 'Q', symbol: 'ℚ', name: 'rational numbers', kind: 'fraction', line: '#d4b8ff', fill: '#b48cff', text: '#d9c2ff', halo: '#8a5cff', parent: 'R' },
  I: { id: 'I', symbol: '\u{1D540}', name: 'irrational numbers', kind: 'irrational', line: '#ffa6c2', fill: '#ff7fa8', text: '#ffb3cb', halo: '#ff4f86', parent: 'R' },
  R: { id: 'R', symbol: 'ℝ', name: 'real numbers', kind: 'real', line: '#e4e9f7', fill: '#c9d3ee', text: '#eef1fb', halo: '#8f9cc8', parent: null },
};

/** Inner to outer: the chain ℕ ⊂ 𝕎 ⊂ ℤ ⊂ ℚ ⊂ ℝ (𝕀 is beside ℚ, inside ℝ). */
const CHAIN: readonly SetId[] = ['N', 'W', 'Z', 'Q', 'R'];

type Ellipse = { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };
type RoundRect = { kind: 'rect'; x0: number; y0: number; x1: number; y1: number; r: number };
/** 𝕀 = ℝ ∖ ℚ: the outer shape minus the hole. */
type Difference = { kind: 'minus'; outer: RoundRect; hole: Ellipse };
type Shape = Ellipse | RoundRect | Difference;

type Point = { x: number; y: number };

const ELLIPSES: Record<'N' | 'W' | 'Z' | 'Q', Ellipse> = {
  N: { kind: 'ellipse', cx: -600, cy: 0, rx: 200, ry: 130 },
  W: { kind: 'ellipse', cx: -487.5, cy: 0, rx: 357.5, ry: 190 },
  Z: { kind: 'ellipse', cx: -357.5, cy: 0, rx: 527.5, ry: 245 },
  Q: { kind: 'ellipse', cx: -210, cy: 0, rx: 710, ry: 300 },
};
const R_RECT: RoundRect = { kind: 'rect', x0: -950, y0: -340, x1: 950, y1: 340, r: 60 };
/** The design space the view fits into (width × height, units). */
const DESIGN = { w: 2000, h: 760 } as const;

const SHAPES: Record<SetId, Shape> = {
  ...ELLIPSES,
  R: R_RECT,
  I: { kind: 'minus', outer: R_RECT, hole: ELLIPSES.Q },
};

/** Where each set's symbol sits: the upper half of its pocket (ℕ: its left half; ℝ: its top-left corner, outside ℚ). */
const LABEL_AT: Record<SetId, Point> = {
  N: { x: -650, y: 0 },
  W: { x: -310, y: -60 },
  Z: { x: -30, y: -60 },
  Q: { x: 280, y: -60 },
  I: { x: 610, y: -60 },
  R: { x: -865, y: -262 },
};

/**
 * The member slots of each region, BY HOW MANY members it holds (one member sits centred in the pocket's lower half,
 * two stack, three fill the pocket). ℝ has no region of its own (ℝ ∖ ℚ is 𝕀): its slot is 𝕀's corner.
 */
const SLOTS_BY_COUNT: Record<SetId, Point[][]> = {
  N: [[{ x: -520, y: 0 }], [{ x: -520, y: -40 }, { x: -520, y: 40 }], [{ x: -520, y: -40 }, { x: -520, y: 40 }, { x: -650, y: 75 }]],
  W: [[{ x: -310, y: 70 }], [{ x: -345, y: 55 }, { x: -250, y: 55 }], [{ x: -345, y: 55 }, { x: -250, y: 55 }, { x: -300, y: 140 }]],
  Z: [[{ x: -20, y: 70 }], [{ x: -75, y: 60 }, { x: 55, y: 60 }], [{ x: -75, y: 60 }, { x: 55, y: 60 }, { x: -10, y: 150 }]],
  Q: [[{ x: 290, y: 70 }], [{ x: 290, y: 70 }, { x: 200, y: 170 }], [{ x: 290, y: 70 }, { x: 200, y: 170 }, { x: 200, y: -160 }]],
  I: [[{ x: 620, y: 70 }], [{ x: 620, y: 70 }, { x: 600, y: 175 }], [{ x: 620, y: 70 }, { x: 600, y: 175 }, { x: 800, y: 70 }]],
  R: [[{ x: -865, y: 262 }], [{ x: -865, y: 262 }], [{ x: -865, y: 262 }]],
};
const slotsFor = (id: SetId, count: number): Point[] => SLOTS_BY_COUNT[id][Math.max(0, Math.min(2, count - 1))];
/** The single-member slots (compatibility; the old name). */
const SLOTS: Record<SetId, Point[]> = Object.fromEntries((Object.keys(SLOTS_BY_COUNT) as SetId[]).map((id) => [id, SLOTS_BY_COUNT[id][2]])) as Record<SetId, Point[]>;

// ── geometry ────────────────────────────────────────────────────────────────────────────────────────────────────

function insideShape(shape: Shape, p: Point): boolean {
  if (shape.kind === 'ellipse') return ((p.x - shape.cx) / shape.rx) ** 2 + ((p.y - shape.cy) / shape.ry) ** 2 <= 1;
  if (shape.kind === 'rect') {
    const { x0, y0, x1, y1, r } = shape;
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return false;
    const cx = Math.min(Math.max(p.x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(p.y, y0 + r), y1 - r);
    return (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r;
  }
  return insideShape(shape.outer, p) && !insideShape(shape.hole, p);
}

/** Is `p` in set `id`? (Membership by the geometry: ℕ's points are also in 𝕎, ℤ, ℚ, ℝ.) */
const insideSet = (id: SetId, p: Point) => insideShape(SHAPES[id], p);

/** The innermost set of the chain (or 𝕀) a point lies in, or null outside ℝ. */
function regionOf(p: Point): SetId | null {
  for (const id of ['N', 'W', 'Z', 'Q', 'I', 'R'] as SetId[]) if (insideSet(id, p)) return id;
  return null;
}

/** Points round a shape's outline (closed, `n` of them), for drawing and for tests. */
function outline(shape: Shape, n = 96): Point[] {
  if (shape.kind === 'minus') return outline(shape.outer, n);
  if (shape.kind === 'ellipse')
    // From the bottom, clockwise on screen (so a drawing hairline sweeps round from where a member drops).
    return Array.from({ length: n }, (_, k) => {
      const a = Math.PI / 2 + (k / n) * Math.PI * 2;
      return { x: shape.cx + Math.cos(a) * shape.rx, y: shape.cy + Math.sin(a) * shape.ry };
    });
  const { x0, y0, x1, y1, r } = shape;
  const pts: Point[] = [];
  const corners = [
    { cx: x0 + r, cy: y1 - r, a0: Math.PI / 2 },
    { cx: x0 + r, cy: y0 + r, a0: Math.PI },
    { cx: x1 - r, cy: y0 + r, a0: Math.PI * 1.5 },
    { cx: x1 - r, cy: y1 - r, a0: 0 },
  ];
  const per = Math.max(2, Math.round(n / 4));
  for (const c of corners) for (let k = 0; k < per; k++) pts.push({ x: c.cx + Math.cos(c.a0 + (k / per) * (Math.PI / 2)) * r, y: c.cy + Math.sin(c.a0 + (k / per) * (Math.PI / 2)) * r });
  // Start at the bottom middle, like the ellipses.
  return pts;
}

/** The point on set `id`'s outline on the way from its centre to `p` (an ellipse; else its label point). */
function edgeToward(id: SetId, p: Point): Point {
  const shape = SHAPES[id];
  if (shape.kind !== 'ellipse') return LABEL_AT[id];
  const dx = p.x - shape.cx;
  const dy = p.y - shape.cy;
  const k = 1 / Math.sqrt((dx / shape.rx) ** 2 + (dy / shape.ry) ** 2);
  return { x: shape.cx + dx * k, y: shape.cy + dy * k };
}

/** The outward unit normal of set `id`'s outline at the outline point `p` (an ellipse; else straight up). */
function outwardOf(id: SetId, p: Point): Point {
  const shape = SHAPES[id];
  if (shape.kind !== 'ellipse') return { x: 0, y: -1 };
  const nx = (p.x - shape.cx) / shape.rx ** 2;
  const ny = (p.y - shape.cy) / shape.ry ** 2;
  const l = Math.hypot(nx, ny) || 1;
  return { x: nx / l, y: ny / l };
}

/** The sets inside `id`, itself included (𝕎 → ℕ, 𝕎; ℝ → all). */
function insideOf(id: SetId): SetId[] {
  if (id === 'R') return ['N', 'W', 'Z', 'Q', 'I', 'R'];
  if (id === 'I') return ['I'];
  return CHAIN.slice(0, CHAIN.indexOf(id) + 1) as SetId[];
}

/** When a refused member is at rest in its pocket, by style (seconds from its step's start). */
function notMemberLanding(style: NotMemberStyle, at: number): number {
  if (style === 'still') return at + T.appear;
  if (style === 'gate') return at + 2.0;
  if (style === 'cross') return at + T.appear * 0.6 + T.drop + 0.25 + T.refuse;
  return at + T.appear * 0.6 + T.drop;
}

function boundsOf(shape: Shape): { x0: number; y0: number; x1: number; y1: number } {
  if (shape.kind === 'ellipse') return { x0: shape.cx - shape.rx, y0: shape.cy - shape.ry, x1: shape.cx + shape.rx, y1: shape.cy + shape.ry };
  if (shape.kind === 'rect') return { x0: shape.x0, y0: shape.y0, x1: shape.x1, y1: shape.y1 };
  return boundsOf(shape.outer);
}

// ── the script ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What happens, when (seconds from the shot's start):
 *   set        the region draws (the line language: dashed → solid with a travelling glint, a pop when it closes), its
 *              tint fades in, its label appears;
 *   member     a number appears above its region (the SIMPLE appear, R-A1: particles + outline) and drops in;
 *              `refuse`: it first tries that set and is turned back at its edge (∉), then goes home;
 *   statement  a line of maths appears (one at a time; the next replaces it), its symbols tinted by set;
 *   focus      the named sets light up, the others dim, until `until` (default: the next focus);
 *   ripple     a member's membership spreads outward ring by ring (5 ∈ ℕ, ℕ ⊂ ℤ, so 5 ∈ ℤ).
 */
/**
 * HOW "NOT A MEMBER" IS SHOWN (v3, Deepak on v2's −3, verbatim: "didnt like the -3 cross and move"):
 *   cross  v2: it drops onto the refused set's edge, a rose ring + slash (∉) marks it, it slides home (kept for v2's
 *          renders and as the comparison);
 *   glow   it drops straight into its home pocket like any member; as it lands the refused set's whole ring brightens
 *          and its tint lifts for a moment: the lit set, and the member plainly outside it;
 *   edge   it drops straight home; the stretch of the refused set's boundary that faces it lights up (the wall it is on
 *          the other side of), then fades;
 *   gate   it glides toward the refused set (no bounce); a soft gate (a gap in that ring) that opened as it appeared
 *          closes before it arrives; it stops short, outside, and eases into its home pocket;
 *   still  no motion: it appears in its pocket; the refused set (and every set inside it, with their members) dims
 *          for a moment while it stays bright.
 */
type NotMemberStyle = 'cross' | 'glow' | 'edge' | 'gate' | 'still';
const NOT_MEMBER_STYLES: readonly NotMemberStyle[] = ['cross', 'glow', 'edge', 'gate', 'still'];

type VennStep =
  | { at: number; do: 'set'; set: SetId }
  | { at: number; do: 'member'; label: string; set: SetId; refuse?: SetId; /** How the refusal is shown (default 'cross', v2). */ notMember?: NotMemberStyle; /** A supposition ("suppose √2 ∈ ℚ"): it stays a dashed outline, never solid. */ suppose?: boolean }
  | { at: number; do: 'statement'; text: string }
  | { at: number; do: 'focus'; sets: SetId[]; until?: number }
  | { at: number; do: 'ripple'; label: string; through: SetId[] };

type VennScript = { steps: VennStep[]; /** Seconds the view takes to re-frame when a set is added. */ reframe?: number; /** Show only these sets' frame (else the visible ones). */ frameSets?: SetId[] };

type Token = { text: string; role: 'set' | 'member' | 'op' | 'word' | 'space'; colour: string; set: SetId | null };

/** A lit stretch of a region's boundary (v3 'edge' / 'gate'): centred on `at` (a point ON the outline, design units). */
type ArcState = { at: Point; /** The lit stretch's light (0..1). */ glow: number; /** The gate's opening (0 closed .. 1 open). */ gap: number; /** A short seam (the gate) rather than a wall (edge). */ seam: boolean };
type RegionState = {
  id: SetId;
  draw: number;
  fill: number;
  label: number;
  /** Its name in words, held for a while after it arrives. */ name: number;
  focus: number;
  dim: number;
  pop: number;
  /** v3 'glow': the whole ring brightens (0..1). */ flash: number;
  /** v3 'edge' / 'gate': a lit (or opened) stretch of the boundary. */ arc: ArcState | null;
};
type MemberState = { label: string; set: SetId; x: number; y: number; appear: number; alpha: number; refused: number; refuseAt: Point | null; glint: number; seed: number; suppose: boolean; /** At rest in its slot. */ landed: boolean; /** v3 'still': dimmed with its set (0..1). */ dim: number };
type RippleState = { label: string; rings: { set: SetId; p: number }[] };
type StatementState = { text: string; tokens: Token[]; alpha: number; rise: number };
type VennView = { cx: number; cy: number; scale: number };
type VennFrame = { t: number; view: VennView; regions: RegionState[]; members: MemberState[]; statement: StatementState | null; previous: StatementState | null; ripples: RippleState[] };

// ── easing (local: this module imports nothing) ─────────────────────────────────────────────────────────────────

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
const outCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const outBack = (x: number) => {
  const c = 1.70158;
  const u = clamp01(x) - 1;
  return 1 + (c + 1) * u ** 3 + c * u ** 2;
};

/** Timings of the line language and the simple appear (seconds). */
const T = { draw: 0.9, fill: 0.5, label: 0.35, appear: 0.45, drop: 0.55, refuse: 0.5, statement: 0.3, ripple: 0.35, name: 2.2 } as const;

// ── tokens ─────────────────────────────────────────────────────────────────────────────────────────────────────

const SYMBOL_SET: Record<string, SetId> = { ℕ: 'N', '\u{1D54E}': 'W', W: 'W', ℤ: 'Z', ℚ: 'Q', '\u{1D540}': 'I', ℝ: 'R' };
const OPS = new Set(['∈', '∉', '⊂', '⊆', '∪', '∩', '=', '≠', ':', ',', '{', '}', '∅', '⇒', '<', '>', '≤', '≥', '⁄', '/', '+', '−', '×', '(', ')']);
const INK = '#fbf3dc';

/**
 * Splits a statement into coloured tokens: set symbols in their set's colour, the script's members (5, −3, ½, √2 …)
 * in their home set's colour, operators and words in the ink. `members` maps a member label to its home set.
 */
function tokenise(text: string, members: Record<string, SetId> = {}): Token[] {
  const out: Token[] = [];
  const labels = Object.keys(members).sort((a, b) => b.length - a.length);
  const chars = Array.from(text);
  let i = 0;
  const startsAt = (k: number, s: string) => chars.slice(k, k + Array.from(s).length).join('') === s;
  while (i < chars.length) {
    const ch = chars[i];
    const member = labels.find((m) => startsAt(i, m) && !/[A-Za-z0-9.]/.test(chars[i + Array.from(m).length] ?? ' ') && !/[A-Za-z0-9.]/.test(chars[i - 1] ?? ' '));
    if (member) {
      const set = members[member];
      out.push({ text: member, role: 'member', colour: SETS[set].text, set });
      i += Array.from(member).length;
      continue;
    }
    if (SYMBOL_SET[ch] && !(ch === 'W' && /[A-Za-z]/.test((chars[i - 1] ?? '') + (chars[i + 1] ?? '')))) {
      const set = SYMBOL_SET[ch];
      out.push({ text: ch, role: 'set', colour: SETS[set].text, set });
      i++;
      continue;
    }
    if (ch === ' ') {
      let j = i;
      while (chars[j] === ' ') j++;
      out.push({ text: chars.slice(i, j).join(''), role: 'space', colour: INK, set: null });
      i = j;
      continue;
    }
    if (OPS.has(ch)) {
      out.push({ text: ch, role: 'op', colour: INK, set: null });
      i++;
      continue;
    }
    let j = i;
    while (j < chars.length && chars[j] !== ' ' && !OPS.has(chars[j]) && !SYMBOL_SET[chars[j]]) j++;
    if (j === i) j = i + 1;
    const word = chars.slice(i, j).join('');
    out.push({ text: word, role: /^[A-Za-z]+$/.test(word) && word.length > 1 ? 'word' : 'op', colour: INK, set: null });
    i = j;
  }
  return out;
}

// ── the frame ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The view that fits `sets` into the 2000 × 760 design space with a margin (≈ 1 = the whole of ℝ). */
function fitView(sets: SetId[]): VennView {
  if (!sets.length) return { cx: 0, cy: 0, scale: 1 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of sets) {
    const b = boundsOf(SHAPES[id]);
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  const pad = 40;
  const scale = Math.min(DESIGN.w / (x1 - x0 + 2 * pad), DESIGN.h / (y1 - y0 + 2 * pad), 2.2);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale };
}

const lerpView = (a: VennView, b: VennView, u: number): VennView => ({ cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u, scale: a.scale * (b.scale / a.scale) ** u });

/** The members of a script and their home sets (for tinting statements). */
function membersOf(script: VennScript): Record<string, SetId> {
  const out: Record<string, SetId> = {};
  for (const s of script.steps) if (s.do === 'member') out[s.label] = s.set;
  return out;
}

/** The state of the diagram at time t (seconds from the shot's start). Pure. */
function vennFrame(script: VennScript, t: number): VennFrame {
  const steps = [...script.steps].sort((a, b) => a.at - b.at);
  const reframe = script.reframe ?? 0.7;
  const members = membersOf(script);

  // The sets in order of arrival, and the view: re-fit (eased) as each one arrives.
  const arrivals = steps.filter((s): s is Extract<VennStep, { do: 'set' }> => s.do === 'set');
  const fitFor = (n: number) => fitView(script.frameSets ?? arrivals.slice(0, Math.max(1, n)).map((s) => (s.set === 'I' ? 'R' : s.set)));
  let view = fitFor(1);
  for (let n = 2; n <= arrivals.length; n++) view = lerpView(view, fitFor(n), smooth(ramp(t, arrivals[n - 1].at - 0.15, arrivals[n - 1].at - 0.15 + reframe)));

  // Focus: the latest focus step whose window holds t.
  const focuses = steps.filter((s): s is Extract<VennStep, { do: 'focus' }> => s.do === 'focus');
  const focusLevel = (id: SetId) => {
    let lit = 0;
    let dim = 0;
    focuses.forEach((f, k) => {
      const until = f.until ?? focuses[k + 1]?.at ?? Infinity;
      const w = smooth(ramp(t, f.at, f.at + 0.3)) * (Number.isFinite(until) ? 1 - smooth(ramp(t, until, until + 0.3)) : 1);
      if (w <= 0) return;
      if (f.sets.includes(id)) lit = Math.max(lit, w);
      else dim = Math.max(dim, w);
    });
    return { lit, dim: dim * (1 - lit) };
  };

  const regions: RegionState[] = arrivals.map((s) => {
    const f = focusLevel(s.set);
    const drawn = ramp(t, s.at, s.at + T.draw);
    return {
      id: s.set,
      draw: outCubic(drawn),
      fill: smooth(ramp(t, s.at + T.draw * 0.6, s.at + T.draw * 0.6 + T.fill)),
      label: smooth(ramp(t, s.at + T.draw * 0.7, s.at + T.draw * 0.7 + T.label)),
      name: smooth(ramp(t, s.at + T.draw * 0.7, s.at + T.draw * 0.7 + T.label)) * (1 - smooth(ramp(t, s.at + T.draw + T.name, s.at + T.draw + T.name + 0.4))),
      focus: f.lit,
      dim: f.dim,
      // The pop when the outline closes (a ring that grows and fades over 0.4 s).
      pop: drawn >= 1 ? 1 - ramp(t, s.at + T.draw, s.at + T.draw + 0.4) : 0,
      flash: 0,
      arc: null,
    };
  });
  const regionById = new Map(regions.map((r) => [r.id, r]));

  // Members: each takes its region's next slot, from the layout for that region's member count.
  const used: Record<SetId, number> = { N: 0, W: 0, Z: 0, Q: 0, I: 0, R: 0 };
  const counts: Record<SetId, number> = { N: 0, W: 0, Z: 0, Q: 0, I: 0, R: 0 };
  for (const s of steps) if (s.do === 'member') counts[s.set]++;
  const memberStates: MemberState[] = [];
  const stillDims: { sets: SetId[]; d: number }[] = [];
  steps.forEach((s, index) => {
    if (s.do !== 'member') return;
    const slots = slotsFor(s.set, counts[s.set]);
    const home = slots[Math.min(slots.length - 1, used[s.set]++)];
    const appear = ramp(t, s.at, s.at + T.appear);
    let x = home.x;
    let y = home.y;
    let refused = 0;
    let refuseAt: Point | null = null;
    const above = 210;
    const style: NotMemberStyle = s.refuse ? (s.notMember ?? 'cross') : 'cross';
    if (s.refuse && style !== 'cross') {
      // v3: the calmer ways (no ∉ mark, no turn-back). Times from the step's start.
      const land = notMemberLanding(style, s.at);
      const edge = edgeToward(s.refuse, home);
      const lit = (from: number) => smooth(ramp(t, from - 0.1, from + 0.3)) * (1 - smooth(ramp(t, from + 1.3, from + 1.85)));
      const target = regionById.get(s.refuse);
      // It appears up and to the right of its pocket (clear of ℤ's symbol above the pocket and of 𝕎's edge on its left).
      const from = { x: home.x + 110, y: home.y - 80 };
      if (style === 'glow' || style === 'edge') {
        // A short eased glide on a slight arc into its pocket (no drop over ℤ's symbol, no detour).
        const go = smooth(ramp(t, s.at + T.appear * 0.6, s.at + T.appear * 0.6 + T.drop));
        x = from.x + (home.x - from.x) * go;
        y = from.y + (home.y - from.y) * go - 18 * Math.sin(Math.PI * go);
        if (target && style === 'glow') target.flash = Math.max(target.flash, lit(land));
        if (target && style === 'edge') target.arc = { at: edge, glow: lit(land - 0.15), gap: 0, seam: false };
      } else if (style === 'gate') {
        // It glides toward the gate (eased, on a slight arc, no overshoot), stops short OUTSIDE the closed gate, then
        // eases back into its pocket.
        const out = outwardOf(s.refuse, edge);
        const stop = { x: edge.x + out.x * 80, y: edge.y + out.y * 80 };
        const go = smooth(ramp(t, s.at + 0.3, s.at + 1.15));
        const settle = smooth(ramp(t, s.at + 1.45, land));
        const gx = from.x + (stop.x - from.x) * go;
        const gy = from.y + (stop.y - from.y) * go - 18 * Math.sin(Math.PI * go);
        x = gx + (home.x - gx) * settle;
        y = gy + (home.y - gy) * settle;
        // The gate opens as it appears and has closed (softly) before it gets there; the seam glows as it closes.
        const open = smooth(ramp(t, s.at, s.at + 0.35)) * (1 - smooth(ramp(t, s.at + 0.6, s.at + 1.0)));
        const seam = smooth(ramp(t, s.at + 0.75, s.at + 1.0)) * (1 - smooth(ramp(t, s.at + 1.6, s.at + 2.2)));
        if (target) target.arc = { at: edge, glow: seam, gap: open, seam: true };
      } else {
        // 'still': it appears in place; the refused set and everything inside it dims, then comes back.
        y = home.y;
        const d = 0.62 * smooth(ramp(t, s.at + 0.55, s.at + 0.95)) * (1 - smooth(ramp(t, s.at + 2.1, s.at + 2.6)));
        for (const id of insideOf(s.refuse)) {
          const r = regionById.get(id);
          if (r) r.dim = Math.max(r.dim, d);
        }
        stillDims.push({ sets: insideOf(s.refuse), d });
      }
      const landed = t >= land;
      memberStates.push({ label: s.label, set: s.set, x, y, appear, alpha: smooth(appear), refused: 0, refuseAt: null, glint: landed && !s.suppose ? 1 - ramp(t, land, land + 0.45) : 0, seed: index * 7919 + 13, suppose: Boolean(s.suppose), landed, dim: 0 });
      return;
    }
    if (s.refuse) {
      // It aims at the refused set's label area, is stopped at the edge, then slides home.
      // The point ON the refused set's edge facing home: it lands there and is turned back across the line.
      const shape = SHAPES[s.refuse];
      const centre = shape.kind === 'ellipse' ? { x: shape.cx, y: shape.cy } : LABEL_AT[s.refuse];
      const dx = home.x - centre.x;
      const dy = home.y - centre.y;
      const k = shape.kind === 'ellipse' ? 1 / Math.sqrt((dx / shape.rx) ** 2 + (dy / shape.ry) ** 2) : 0.5;
      const edge = { x: centre.x + dx * k, y: centre.y + dy * k };
      const fall = outCubic(ramp(t, s.at + T.appear * 0.6, s.at + T.appear * 0.6 + T.drop));
      const back = smooth(ramp(t, s.at + T.appear * 0.6 + T.drop + 0.25, s.at + T.appear * 0.6 + T.drop + 0.25 + T.refuse));
      const start = { x: edge.x, y: edge.y - above };
      const p1 = { x: start.x + (edge.x - start.x) * fall, y: start.y + (edge.y - start.y) * fall };
      x = p1.x + (home.x - p1.x) * back;
      y = p1.y + (home.y - p1.y) * outBack(back);
      const hit = s.at + T.appear * 0.6 + T.drop;
      // The ∉ mark fades before the member lands (hit + 0.75), so it never lies over a resting label.
      refused = t >= hit - 0.05 ? 1 - smooth(ramp(t, hit + 0.45, hit + 0.72)) : 0;
      refuseAt = edge;
    } else {
      const fall = outBack(ramp(t, s.at + T.appear * 0.6, s.at + T.appear * 0.6 + T.drop));
      y = home.y - above * (1 - fall);
    }
    const landed = s.at + T.appear * 0.6 + T.drop + (s.refuse ? 0.25 + T.refuse : 0);
    memberStates.push({ label: s.label, set: s.set, x, y, appear, alpha: smooth(appear), refused, refuseAt, glint: t >= landed && !s.suppose ? 1 - ramp(t, landed, landed + 0.45) : 0, seed: index * 7919 + 13, suppose: Boolean(s.suppose), landed: t >= landed, dim: 0 });
  });
  // 'still': the members at home in a dimmed set dim with it.
  for (const { sets, d } of stillDims) for (const m of memberStates) if (sets.includes(m.set)) m.dim = Math.max(m.dim, d);

  // Statements: the latest one shown, the one before fading out.
  const said = steps.filter((s): s is Extract<VennStep, { do: 'statement' }> => s.do === 'statement' && s.at <= t);
  const stateOf = (s: Extract<VennStep, { do: 'statement' }> | undefined, out: number | null): StatementState | null => {
    if (!s) return null;
    // The next statement waits for the previous one to leave (0.15 s), so two never overlap.
    const a = smooth(ramp(t, s.at + 0.15, s.at + 0.15 + T.statement));
    const alpha = out === null ? a : a * (1 - smooth(ramp(t, out, out + 0.15)));
    return { text: s.text, tokens: tokenise(s.text, members), alpha, rise: 1 - outCubic(ramp(t, s.at + 0.15, s.at + 0.15 + T.statement * 1.6)) };
  };
  const current = said.at(-1);
  const before = said.at(-2);
  const statement = stateOf(current, null);
  const previous = before && current && t < current.at + 0.15 ? stateOf(before, current.at) : null;

  const ripples: RippleState[] = steps
    .filter((s): s is Extract<VennStep, { do: 'ripple' }> => s.do === 'ripple')
    .map((s) => ({ label: s.label, rings: s.through.map((set, k) => ({ set, p: ramp(t, s.at + k * T.ripple * 1.6, s.at + k * T.ripple * 1.6 + T.ripple * 2.2) })) }));

  return { t, view, regions, members: memberStates, statement, previous, ripples };
}

/** The script's own length: its last event plus the time it takes to settle. */
function vennDuration(script: VennScript): number {
  return Math.max(0, ...script.steps.map((s) => s.at)) + 2.0;
}

// ── the layout gate (pure) ────────────────────────────────────────────────────────────────────────────────────────

type TextBox = { id: string; x: number; y: number; w: number; h: number };
type Polyline = { id: string; points: Point[] };
type LayoutFault = { kind: 'overlap' | 'cross' | 'clip'; a: string; b?: string };

/**
 * The faults of a drawn frame: two text boxes overlapping (with `gap` px between them required), a text box that a ring
 * stroke passes through (the stroke's points within `clearance` px of the box), a text box not wholly inside `bounds`.
 * Boxes and rings in the same pixel space (the canvas the painter drew on).
 */
function layoutFaults(texts: TextBox[], rings: Polyline[], bounds: { x: number; y: number; w: number; h: number }, clearance = 6, gap = 2): LayoutFault[] {
  const faults: LayoutFault[] = [];
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap) faults.push({ kind: 'overlap', a: a.id, b: b.id });
    }
  for (const t of texts) {
    for (const r of rings) {
      // Densify each segment so a long straight edge (ℝ's) is sampled every 2 px.
      const pts = r.points;
      let hit = false;
      for (let k = 0; k < pts.length - 1 && !hit; k++) {
        const p = pts[k];
        const q = pts[k + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 2));
        for (let m = 0; m <= n && !hit; m++) {
          const x = p.x + ((q.x - p.x) * m) / n;
          const y = p.y + ((q.y - p.y) * m) / n;
          if (x > t.x - clearance && x < t.x + t.w + clearance && y > t.y - clearance && y < t.y + t.h + clearance) hit = true;
        }
      }
      if (hit) faults.push({ kind: 'cross', a: t.id, b: r.id });
    }
    if (t.x < bounds.x || t.y < bounds.y || t.x + t.w > bounds.x + bounds.w || t.y + t.h > bounds.y + bounds.h) faults.push({ kind: 'clip', a: t.id });
  }
  return faults;
}

/** Every set statement of the chapter's videos, as the storyboard cites them (R-V1's catalogue). */
const STATEMENT_KINDS = ['member', 'not-member', 'subset-chain', 'union', 'intersection-empty', 'transitive', 'set-builder'] as const;
type StatementKind = (typeof STATEMENT_KINDS)[number];

export { CHAIN, DESIGN, edgeToward, fitView, insideOf, layoutFaults, NOT_MEMBER_STYLES, notMemberLanding, slotsFor, SLOTS_BY_COUNT, insideSet, insideShape, LABEL_AT, membersOf, outline, boundsOf, regionOf, SETS, SHAPES, SLOTS, STATEMENT_KINDS, T as VENN_TIMING, tokenise, vennDuration, vennFrame };
export type { ArcState, Ellipse, LayoutFault, MemberState, NotMemberStyle, Polyline, TextBox, Point, RegionState, RippleState, RoundRect, SetId, SetKey, Shape, StatementKind, StatementState, Token, VennFrame, VennScript, VennStep, VennView };
