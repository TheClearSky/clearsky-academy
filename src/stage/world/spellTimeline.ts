/**
 * The spell's choreography as a PURE function of time (`world/spell.ts`
 * draws it): every number a frame needs — how much of each ring is drawn,
 * how fast the rings have turned, the ignition flash, the pulses, where the
 * summoned book and candle are — comes from the loop time alone, so any
 * moment can be drawn directly (`__stage.debug.renderAt(t)`), a test can
 * check the story, and nothing drifts between frames.
 *
 * The beat sheet follows Nodestra's hellscape "living seal"
 * (`hell/hell-src/scene/circles-life.ts:150-211` › `drawOn`, `ignite`,
 * `pulse`, `lifecycle`: rings traced by angle with a stagger, then the star
 * strokes, then the glyph pop; a white-hot ignition with a shock ring and a
 * spin kick; outward light pulses; rest), retold for a dreamy summoning:
 *
 *   0.0  idle      faint embers over an empty floor
 *   2.0  draw      the rings trace themselves on, inner to outer (staggered),
 *                  the eight-point star is drawn stroke by stroke, the runes pop
 *   5.2  ignite    a white flash, a shock ring, the rings kick into a spin, the
 *                  light column rises and sparkles stream up
 *   6.0  summon    the BOOK rises out of the circle (materialising, closed,
 *                  then opening); from 7.0 the CANDLE rises, its flame lights at 9.0
 *   9.2  float     both drift and turn gently above the circle, the pages
 *                  flutter, the circle breathes and pulses
 *  13.6  return    the book closes, both glow white and sink back INTO the
 *                  circle, dissolving into light
 *  17.0  unwind    a last pulse; the circle un-draws itself, outer ring first,
 *                  the rings spinning backwards, and fades
 *  20.0  idle      rest (an empty floor matters, as in the hellscape)
 *  22.0  (loop)
 *
 * Angles are closed-form integrals of a speed profile (the hellscape
 * integrates per frame, `circles-life.ts` › `Rig.integrate`; a pure function
 * cannot), so a frame at any t is exact.
 */

/** Rings of the circle, inner to outer (the hellscape's six rotation layers). */
const SPELL_LAYERS = 6;

/** Seconds into the loop. */
const SPELL_TIMELINE = {
  period: 22,
  drawStart: 2.0,
  ringDuration: 1.1,
  ringStagger: 0.3,
  starStart: 3.2,
  starDuration: 1.4,
  glyphStart: 4.0,
  ignite: 5.2,
  bookRiseStart: 6.0,
  bookOpenStart: 7.7,
  bookOpenDuration: 1.0,
  candleRiseStart: 7.0,
  candleIgnite: 9.0,
  riseDuration: 2.2,
  floatStart: 9.2,
  bookCloseStart: 13.6,
  bookCloseDuration: 0.8,
  bookSinkStart: 14.2,
  candleSinkStart: 14.8,
  sinkDuration: 2.0,
  lastPulse: 17.0,
  unwindStart: 17.2,
  fadeEnd: 20.0,
} as const;

type SpellPhase = 'idle' | 'draw' | 'summon' | 'float' | 'return' | 'unwind';

/** A summoned object (the book or the candle) in this frame. */
type SummonedState = {
  /** False while it is entirely below the floor or dissolved. */
  visible: boolean;
  /** Height of its base above the floor (m); negative = still under it. */
  elevation: number;
  /** Turn about the vertical (rad). */
  yaw: number;
  /** Size relative to its floating size. */
  scale: number;
  /** 0 = whole, 1 = dissolved into light. */
  dissolve: number;
  /** White-blue spectral glow over its own colours, 0..1. */
  glow: number;
  /** Book: how open (0 shut, 1 beating); candle: the flame (0 out, 1 lit). */
  action: number;
};

type SpellFrame = {
  phase: SpellPhase;
  /** Seconds into the loop. */
  loopTime: number;
  /** Per ring, inner to outer: how much of it is drawn (0..1, by angle). */
  reveal: number[];
  /** The star's strokes, 0..1 in pen order. */
  star: number;
  /** Seconds since the rune pop began (≥ 100: all shown). */
  glyphTime: number;
  /** Turn of each ring (rad). */
  ringAngles: number[];
  /** How far each rune band has scrolled inside its ring (rad): inner, outer. */
  scroll: [number, number];
  /** Overall brightness of the circle. */
  gain: number;
  /** Line brightness rhythm, 0.72..1 (the hellscape's breath). */
  breath: number;
  /** Ignition: 1 = white-hot. */
  flash: number;
  /** Lines read thicker during a flash. */
  swell: number;
  shockRadius: number;
  shockAmount: number;
  pulseRadius: number;
  pulseAmount: number;
  /** The soft light the circle casts on the floor round it. */
  floorGlow: number;
  /** The light column, 0..1 (its height follows). */
  column: number;
  /** Rising sparkles, 0..1. */
  sparkles: number;
  book: SummonedState;
  candle: SummonedState;
};

/** Inner ring's speed (rad/s at full spin) and each ring's ratio — the
 *  hellscape's "planned" counter-rotation (`circles-life.ts:73-76`). */
const RING_BASE_SPEED = 0.32;
const RING_RATIOS = [1, -0.6, 0.35, -0.22, 0.15, -0.1];
/** The rune bands' own drift inside their rings (rad per unit of travel). */
const SCROLL_SPEEDS: [number, number] = [0.22, -0.1];
/** Where the book and candle float (base height above the floor, m). */
const BOOK_FLOAT_HEIGHT = 1.2;
const CANDLE_FLOAT_HEIGHT = 1.0;
/** Where they start and end: this far below the floor (m), hidden by it. */
const BELOW_FLOOR = -1.6;

// ── small maths ─────────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function positiveModulo(x: number, m: number): number {
  return ((x % m) + m) % m;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function easeInOutCubic(x: number): number {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

function easeOutCubic(x: number): number {
  return 1 - (1 - clamp01(x)) ** 3;
}

function easeInCubic(x: number): number {
  const c = clamp01(x);
  return c * c * c;
}

function easeOutQuad(x: number): number {
  const c = clamp01(x);
  return 1 - (1 - c) * (1 - c);
}

function easeInOutSine(x: number): number {
  return (1 - Math.cos(Math.PI * clamp01(x))) / 2;
}

/** 0 → 1 over [start, start + duration]. */
function ramp(t: number, start: number, duration: number): number {
  return clamp01((t - start) / duration);
}

/** Quick inhale, slow exhale: 0.72..1 (the hellscape's `breath`). */
function breath(t: number, period: number): number {
  const x = positiveModulo(t / period, 1);
  const value = x < 0.3 ? easeOutCubic(x / 0.3) : 1 - easeInOutSine((x - 0.3) / 0.7);
  return 0.72 + 0.28 * value;
}

/**
 * How far the rings have turned, in seconds at full speed: slow while the
 * circle draws (0.4), a kick at the ignition that settles to full speed
 * (speed 1 + 2.5·e^(−1.2·age), the hellscape's `ignite` spin kick), then a
 * reversal while it unwinds (speed 1 − 2.6·(1 − e^(−2u)): it slows, stops
 * and spins backwards). Each piece is the exact integral of its speed.
 */
function spinTravel(loopTime: number): number {
  const { drawStart, ignite, unwindStart } = SPELL_TIMELINE;
  if (loopTime <= drawStart) return 0;
  const drawn = 0.4 * (Math.min(loopTime, ignite) - drawStart);
  if (loopTime <= ignite) return drawn;
  const kicked = (age: number) => age + (2.5 / 1.2) * (1 - Math.exp(-1.2 * age));
  if (loopTime <= unwindStart) return drawn + kicked(loopTime - ignite);
  const atUnwind = drawn + kicked(unwindStart - ignite);
  const u = loopTime - unwindStart;
  return atUnwind + u - 2.6 * (u - (1 - Math.exp(-2 * u)) / 2);
}

function phaseAt(loopTime: number): SpellPhase {
  const T = SPELL_TIMELINE;
  if (loopTime < T.drawStart || loopTime >= T.fadeEnd) return 'idle';
  if (loopTime < T.ignite) return 'draw';
  if (loopTime < T.floatStart) return 'summon';
  if (loopTime < T.bookCloseStart) return 'float';
  if (loopTime < T.lastPulse) return 'return';
  return 'unwind';
}

function hiddenObject(): SummonedState {
  return { visible: false, elevation: BELOW_FLOOR, yaw: 0, scale: 0.6, dissolve: 1, glow: 1, action: 0 };
}

/**
 * A summoned object's flight: up out of the circle (materialising, a twirl
 * that unwinds as it rises), a gentle float and turn, then down into the
 * circle again (twirling, shrinking, dissolving into light).
 */
function summoned(loopTime: number, riseStart: number, sinkStart: number, floatHeight: number, phase: number): SummonedState {
  const T = SPELL_TIMELINE;
  const rise = easeOutCubic(ramp(loopTime, riseStart, T.riseDuration));
  const sink = easeInCubic(ramp(loopTime, sinkStart, T.sinkDuration));
  const bob = 0.09 * Math.sin(loopTime * 1.25 + phase) * rise * (1 - sink);
  const elevation = mix(mix(BELOW_FLOOR, floatHeight, rise), BELOW_FLOOR, sink) + bob;
  const materialise = 1 - ramp(loopTime, riseStart, 1.4);
  const fade = ramp(loopTime, sinkStart + 0.5, 1.4);
  const dissolve = Math.max(materialise, fade);
  const glow = Math.max(1 - ramp(loopTime, riseStart + 0.4, 1.8) * 0.85, smoothstep(sinkStart - 0.4, sinkStart + 0.8, loopTime));
  const yaw = 0.35 * Math.sin(loopTime * 0.45 + phase) + (1 - rise) * 2.4 + sink * 2.8;
  const scale = mix(0.6, 1, rise) * mix(1, 0.45, sink);
  const visible = dissolve < 0.999 && elevation > BELOW_FLOOR + 0.05 && loopTime >= riseStart && loopTime < sinkStart + T.sinkDuration;
  return { visible, elevation, yaw, scale, dissolve, glow, action: 0 };
}

/** The full spell at stage time t (seconds). */
function spellFrame(t: number): SpellFrame {
  const T = SPELL_TIMELINE;
  const loopTime = positiveModulo(t, T.period);
  const ignitionAge = loopTime - T.ignite;

  // Draw-on, inner to outer; un-draw outer to inner.
  const reveal: number[] = [];
  for (let layer = 0; layer < SPELL_LAYERS; layer++) {
    const drawn = easeInOutCubic(ramp(loopTime, T.drawStart + T.ringStagger * layer, T.ringDuration));
    const undrawn = easeInOutCubic(ramp(loopTime, T.unwindStart + T.ringStagger * (SPELL_LAYERS - 1 - layer), T.ringDuration));
    reveal.push(drawn * (1 - undrawn));
  }
  const star = ramp(loopTime, T.starStart, T.starDuration) * (1 - ramp(loopTime, T.unwindStart + 0.5, 1.0));
  const glyphTime = loopTime - T.glyphStart > 50 ? 1000 : loopTime - T.glyphStart;

  const travel = spinTravel(loopTime);
  const ringAngles = RING_RATIOS.map((ratio) => RING_BASE_SPEED * ratio * travel);
  const scroll: [number, number] = [SCROLL_SPEEDS[0] * travel, SCROLL_SPEEDS[1] * travel];

  // Ignition (hellscape `ignite`): white-hot ~0.1 s, an exponential cool-down,
  // a shock ring; a smaller farewell flash on the last pulse.
  let flash = 0;
  let shockRadius = 0;
  let shockAmount = 0;
  if (ignitionAge >= 0) {
    flash = ignitionAge < 0.1 ? 1 : Math.exp(-(ignitionAge - 0.1) * 3.5);
    shockRadius = easeOutCubic(ignitionAge / 1.6) * 1.55;
    shockAmount = Math.exp(-ignitionAge * 1.6) * 1.4;
  }
  const farewellAge = loopTime - T.lastPulse;
  if (farewellAge >= 0) {
    flash = Math.max(flash, 0.55 * (farewellAge < 0.1 ? 1 : Math.exp(-(farewellAge - 0.1) * 3.0)));
    const farewellShock = Math.exp(-farewellAge * 1.4) * 1.1;
    if (farewellShock > shockAmount) {
      shockAmount = farewellShock;
      shockRadius = easeOutCubic(farewellAge / 1.8) * 1.6;
    }
  }

  // Pulses (hellscape `pulse`): an outward light wave every 2.5 s while held.
  let pulseRadius = 0;
  let pulseAmount = 0;
  const pulseFrom = T.ignite + 1.5;
  if (loopTime > pulseFrom && loopTime < T.lastPulse) {
    const pulsePhase = positiveModulo((loopTime - pulseFrom) / 2.5, 1);
    pulseRadius = mix(-0.1, 1.25, easeOutQuad(pulsePhase));
    pulseAmount = (1 - pulsePhase) * 0.8;
  }
  const held = loopTime > T.ignite && loopTime < T.unwindStart;
  const charged = smoothstep(T.drawStart, T.ignite, loopTime);
  const gain = (0.55 + 0.45 * charged) * (1 - smoothstep(T.unwindStart + 1.4, T.fadeEnd, loopTime));

  const book = loopTime >= T.bookRiseStart && loopTime < T.bookSinkStart + T.sinkDuration ? summoned(loopTime, T.bookRiseStart, T.bookSinkStart, BOOK_FLOAT_HEIGHT, 0) : hiddenObject();
  book.action = easeInOutSine(ramp(loopTime, T.bookOpenStart, T.bookOpenDuration)) * (1 - easeInOutSine(ramp(loopTime, T.bookCloseStart, T.bookCloseDuration)));
  const candle = loopTime >= T.candleRiseStart && loopTime < T.candleSinkStart + T.sinkDuration ? summoned(loopTime, T.candleRiseStart, T.candleSinkStart, CANDLE_FLOAT_HEIGHT, 2.1) : hiddenObject();
  candle.action = clamp01((loopTime - T.candleIgnite) / 0.45) * (1 - ramp(loopTime, T.candleSinkStart - 0.3, 0.7));

  const column = smoothstep(T.ignite - 0.3, T.ignite + 1.2, loopTime) * (1 - smoothstep(T.lastPulse - 0.6, T.lastPulse + 1.4, loopTime));
  const embers = 0.1;
  const sparkles = Math.max(embers, 0.55 * smoothstep(T.drawStart, T.ignite, loopTime) * (1 - smoothstep(T.unwindStart, T.fadeEnd - 0.5, loopTime)), column);

  return {
    phase: phaseAt(loopTime),
    loopTime,
    reveal,
    star,
    glyphTime,
    ringAngles,
    scroll,
    gain,
    breath: held ? breath(loopTime, 3.3) : 1,
    flash,
    swell: 0.35 * flash,
    shockRadius,
    shockAmount,
    pulseRadius,
    pulseAmount,
    floorGlow: gain * (0.35 + 0.65 * charged) * Math.max(Math.min(1, reveal[SPELL_LAYERS - 1] + reveal[0]), column),
    column,
    sparkles,
    book,
    candle,
  };
}

/**
 * The calm circle: fully drawn, turning slowly and breathing, nothing
 * summoned — the `circle` option, and (at a fixed t) the still frame drawn
 * under reduced motion.
 */
function calmSpellFrame(t: number): SpellFrame {
  const travel = 0.35 * t + 6;
  return {
    phase: 'float',
    loopTime: SPELL_TIMELINE.floatStart,
    reveal: Array.from({ length: SPELL_LAYERS }, () => 1),
    star: 1,
    glyphTime: 1000,
    ringAngles: RING_RATIOS.map((ratio) => RING_BASE_SPEED * ratio * travel),
    scroll: [SCROLL_SPEEDS[0] * travel, SCROLL_SPEEDS[1] * travel],
    gain: 0.8,
    breath: breath(t, 5.3),
    flash: 0,
    swell: 0,
    shockRadius: 0,
    shockAmount: 0,
    pulseRadius: 0,
    pulseAmount: 0,
    floorGlow: 0.7,
    column: 0,
    sparkles: 0.18,
    book: hiddenObject(),
    candle: hiddenObject(),
  };
}

/** Where the spell lies on the floor for a canvas shape: its centre's
 *  distance in front of the camera and its radius (m). Landscape: 12 m out,
 *  3 m across the radius — about the middle quarter of the screen width,
 *  below the hero's buttons. Portrait: farther and smaller, so it still
 *  fits the narrow screen. */
function spellPlacement(aspect: number): { distance: number; radius: number } {
  return aspect < 1 ? { distance: 14, radius: 2.4 } : { distance: 12, radius: 3 };
}

export {
  BELOW_FLOOR,
  BOOK_FLOAT_HEIGHT,
  CANDLE_FLOAT_HEIGHT,
  RING_BASE_SPEED,
  RING_RATIOS,
  SPELL_LAYERS,
  SPELL_TIMELINE,
  calmSpellFrame,
  spellFrame,
  spellPlacement,
  spinTravel,
};
export type { SpellFrame, SpellPhase, SummonedState };
