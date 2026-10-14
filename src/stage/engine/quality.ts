/**
 * Quality tiers for the landing stage (`src/stage/stage.ts`): a startup
 * guess from cheap signals, then runtime adaptation from measured frame
 * times. PORTED from Nodestra's `src/landing/stageQuality.ts` (2026-10-12):
 * the tier pick, the GPU probe and the adaptive ladder are its logic,
 * unchanged, with its measurements; only the tier PARAMETERS are this
 * scene's (from `.claude/research/stage/SCENE-PROPS-LOGO.md` › Quality tiers).
 *
 * Why it exists (Nodestra, 2026-10-09, Deepak: "the landing page lags really
 * hard on phone and less powerful devices"): one frame drawn the same
 * everywhere is too much for phones and too little for desktops.
 *
 * Startup (`?quality=low|medium|high` forces a tier and turns the runtime
 * adaptation off, so a forced tier is what is measured):
 *  - WebGL renderer string: mobile GPUs (Mali, Adreno, PowerVR, Apple's
 *    mobile GPUs) → low; software (SwiftShader, llvmpipe) → low;
 *  - navigator.hardwareConcurrency ≤ 4 or navigator.deviceMemory ≤ 4 → one
 *    step down (one in total);
 *  - pixel load (screen pixels × DPR²) → one step down above ~4.5 M, or
 *    above ~2.5 M on an integrated GPU (Intel, AMD APU "Radeon(TM)
 *    Graphics", "Vega 8"). An integrated GPU alone does NOT demote: the
 *    budget is fill rate, so it only lowers the bar for a big screen.
 *    Measured in Nodestra on Deepak's Intel UHD: 1280×800 @1 (1.0 M) 41–46
 *    fps → HIGH; 1707×1067 @1.5 (4.1 M) 12.5 fps → MEDIUM. Never two steps
 *    for the screen;
 *  - coarse pointer (phones, tablets) → at most medium.
 *
 * Runtime: a ladder of finer levels inside the tier (pixel-ratio scale →
 * bloom resolution → bloom off → fewer motes). After a 4 s warm up, the
 * MEDIAN rendered-frame interval of every 2 s window is checked (sporadic
 * hitches don't count): three windows in a row over budget (> 18.5 ms) →
 * one level down; 12 s at the vsync cap (< 17.4 ms) → one level up. A level
 * that had to be left again within 20 s of stepping up becomes the new
 * ceiling, so the stage never oscillates between two levels.
 */

type StageTier = 'high' | 'medium' | 'low';

type StageTierParams = {
  tier: StageTier;
  /** Pixel-ratio cap. */
  prCap: number;
  /** Bloom resolution scale (1 = full, 0 = off). */
  bloom: number;
  /** MSAA samples of the scene's HDR render target. The floor is
   *  antialiased analytically; MSAA only smooths prop and card edges. */
  msaa: number;
  /** The nebula is drawn live every frame (true) or baked once into a
   *  texture (false: about 25 noise evaluations per sky pixel are too many
   *  for a phone). */
  liveSky: boolean;
  /** Ground-mist noise samples per ray (`engine/air.ts`, every world
   *  fragment): each is two texture fetches; 0 = the smooth analytic sheet. */
  mistSamples: number;
  /** Round motes over the horizon. */
  motes: number;
  /** Floating books and candles. */
  books: number;
  candles: number;
};

const STAGE_TIERS: Record<StageTier, StageTierParams> = {
  high: { tier: 'high', prCap: 1.5, bloom: 1, msaa: 4, liveSky: true, mistSamples: 4, motes: 300, books: 24, candles: 20 },
  medium: { tier: 'medium', prCap: 1.0, bloom: 0.5, msaa: 2, liveSky: true, mistSamples: 3, motes: 200, books: 14, candles: 12 },
  low: { tier: 'low', prCap: 0.75, bloom: 0, msaa: 0, liveSky: false, mistSamples: 2, motes: 120, books: 6, candles: 6 },
};

/** Everything the startup guess looks at — plain data, so it can be tested. */
type StageSignals = {
  /** Unmasked WebGL renderer string ('' when unavailable). */
  gpu: string;
  cores?: number;
  /** navigator.deviceMemory (GB, Chromium only). */
  memory?: number;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  coarsePointer: boolean;
  /** The `?quality=` search parameter, if any. */
  forced?: string | null;
};

type StageTierGuess = { params: StageTierParams; reasons: string[]; forced: boolean; gpu: string };

const MOBILE_GPU = /mali|adreno|powervr|apple a\d|sgx|tegra|videocore/i;
const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|basic render/i;
const INTEGRATED_GPU = /intel|radeon\(tm\) graphics|vega \d|uhd|iris/i;
/** Pixel load over which the stage starts a tier lower (screen px × DPR²). */
const PIXEL_LOAD = 4.5e6;
/** The same on an integrated GPU. */
const PIXEL_LOAD_INTEGRATED = 2.5e6;
/** Intel's discrete cards ("Arc(TM) A770") — not the "Arc(TM) Graphics"
 *  integrated into Meteor Lake. */
const DISCRETE_INTEL = /arc\(tm\) a\d/i;

function isStageTier(value: unknown): value is StageTier {
  return value === 'high' || value === 'medium' || value === 'low';
}

/** The startup tier for these signals. */
function pickStageTier(signals: StageSignals): StageTierGuess {
  const { gpu } = signals;
  if (isStageTier(signals.forced)) {
    return { params: STAGE_TIERS[signals.forced], reasons: ['forced by ?quality'], forced: true, gpu };
  }
  const reasons: string[] = [];
  let level = 2; // 2 high, 1 medium, 0 low
  // Safari reports every Apple GPU as "Apple GPU" — an iPhone's and an M2
  // Mac's alike. Only a touch-first device is taken for a phone or tablet.
  const appleMobile = /apple gpu/i.test(gpu) && signals.coarsePointer;
  if (MOBILE_GPU.test(gpu) || appleMobile) {
    level = 0;
    reasons.push('mobile GPU');
  } else if (SOFTWARE_GPU.test(gpu)) {
    level = 0;
    reasons.push('software renderer');
  }
  const integrated = level === 2 && INTEGRATED_GPU.test(gpu) && !DISCRETE_INTEL.test(gpu);
  const cores = signals.cores ?? 8;
  const memory = signals.memory ?? 8;
  if (cores <= 4 || memory <= 4) {
    level -= 1;
    reasons.push(cores <= 4 ? `${cores} cores` : `${memory} GB memory`);
  }
  const dpr = Math.min(signals.devicePixelRatio || 1, 2);
  const pixels = signals.screenWidth * signals.screenHeight * dpr * dpr;
  if (pixels > (integrated ? PIXEL_LOAD_INTEGRATED : PIXEL_LOAD)) {
    level -= 1;
    reasons.push(`${(pixels / 1e6).toFixed(1)} M px${integrated ? ' on an integrated GPU' : ''}`);
  }
  if (signals.coarsePointer && level > 1) {
    level = 1;
    reasons.push('touch device');
  }
  const tier: StageTier = level >= 2 ? 'high' : level === 1 ? 'medium' : 'low';
  if (reasons.length === 0) reasons.push('capable GPU');
  return { params: STAGE_TIERS[tier], reasons, forced: false, gpu };
}

/** The renderer string of the GPU a high-performance context would get —
 *  the stage asks for one, and on a dual-GPU laptop a default context may
 *  name the other GPU. */
function probeGpu(): string {
  try {
    const canvas = document.createElement('canvas');
    const attributes: WebGLContextAttributes = { powerPreference: 'high-performance' };
    const gl = (canvas.getContext('webgl2', attributes) ?? canvas.getContext('webgl', attributes)) as
      | WebGLRenderingContext
      | null;
    if (!gl) return '';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return gpu;
  } catch {
    return '';
  }
}

/** The stage's tier on this device (reads the browser). */
function detectStageTier(): StageTierGuess {
  return pickStageTier({
    gpu: probeGpu(),
    cores: navigator.hardwareConcurrency,
    memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    screenWidth: screen.width,
    screenHeight: screen.height,
    devicePixelRatio: window.devicePixelRatio || 1,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    forced: new URLSearchParams(location.search).get('quality'),
  });
}

// ── the runtime ladder ──────────────────────────────────────────────────

/** One level of the ladder, in absolute settings. */
type StageLevel = {
  pixelRatio: number;
  /** Bloom resolution scale (0 = off). */
  bloom: number;
  motes: number;
};

/** Each step relative to the tier: pixel ratio first (the cost is all fill
 *  rate), then the bloom's resolution, then the bloom itself, then half the
 *  motes. */
const LADDER_STEPS: readonly { prScale: number; bloomScale: number; particles: number }[] = [
  { prScale: 1, bloomScale: 1, particles: 1 },
  { prScale: 0.85, bloomScale: 1, particles: 1 },
  { prScale: 0.7, bloomScale: 1, particles: 1 },
  { prScale: 0.7, bloomScale: 0.5, particles: 1 },
  { prScale: 0.7, bloomScale: 0, particles: 1 },
  { prScale: 0.7, bloomScale: 0, particles: 0.5 },
];

/** Below this the stage is a smear; the ladder never goes lower. */
const MIN_PIXEL_RATIO = 0.5;

/** The tier's ladder on this screen. A step that changes nothing here
 *  (the bloom steps on LOW, where the bloom is already off) is left out, so
 *  stepping down never wastes three windows on a no-op. */
function stageLadder(params: StageTierParams, devicePixelRatio: number): StageLevel[] {
  const base = Math.min(devicePixelRatio || 1, params.prCap);
  const levels: StageLevel[] = [];
  for (const step of LADDER_STEPS) {
    const level: StageLevel = {
      // Level 0 is exactly the tier (no rounding: HIGH stays as it was).
      pixelRatio: step.prScale === 1 ? base : Math.max(MIN_PIXEL_RATIO, base * step.prScale),
      bloom: params.bloom * step.bloomScale,
      motes: Math.round(params.motes * step.particles),
    };
    const previous = levels[levels.length - 1];
    if (
      previous &&
      Math.abs(previous.pixelRatio - level.pixelRatio) < 1e-3 &&
      previous.bloom === level.bloom &&
      previous.motes === level.motes
    ) {
      continue;
    }
    levels.push(level);
  }
  return levels;
}

/** Frame-time budget: over this median a window is "slow" (60 Hz + 10 %). */
const SLOW_MS = 18.5;
/** Under this median a window is "at the vsync cap". */
const SMOOTH_MS = 17.4;
const WARM_UP_MS = 4000;
const WINDOW_MS = 2000;
const SLOW_WINDOWS = 3;
const SMOOTH_FOR_MS = 12000;
const CEILING_WITHIN_MS = 20000;

type StageAdaptive = {
  /**
   * Call once per RENDERED frame. `capped`: the loop skipped at least one
   * animation frame since the last render because of its own 61 fps cap —
   * the browser was keeping up, so this interval is the cap's, not load.
   * (On a 144 Hz screen the cap renders every third vsync, 20.8 ms apart;
   * without this, a fast desktop would read as a slow one.)
   */
  frame(now: number, capped?: boolean): void;
  /** Forget the running window (after a pause or a hidden tab): the gap is
   *  not a slow frame, and the first frames back warm up again. */
  reset(): void;
  level(): number;
  /** '' at full quality, ' · auto −N' below it. */
  label(): string;
};

function createStageAdaptive(
  levels: number,
  apply: (level: number) => void,
  options: { enabled: boolean },
): StageAdaptive {
  let level = 0;
  let ceiling = 0; // the best level allowed (0 = the tier itself)
  const intervals: number[] = [];
  let last = -1;
  let startedAt = -1;
  let windowStart = -1;
  let slow = 0;
  let smoothSince = -1;
  let steppedUpAt = -Infinity;
  const set = (next: number) => {
    const clamped = Math.max(ceiling, Math.min(levels - 1, next));
    if (clamped === level) return;
    level = clamped;
    apply(level);
  };
  return {
    frame(now, capped = false) {
      // Nothing to adapt (a forced tier, reduced motion, a one-level ladder):
      // nothing is recorded either, so the intervals cannot pile up for the
      // page's life.
      if (!options.enabled || levels < 2) return;
      if (startedAt < 0) {
        startedAt = now;
        windowStart = now;
      }
      if (last >= 0) {
        const interval = now - last;
        intervals.push(capped ? Math.min(interval, 1000 / 60) : interval);
      }
      last = now;
      if (now - startedAt < WARM_UP_MS) {
        // Shader compiles and the first uploads: not the stage's pace.
        intervals.length = 0;
        windowStart = now;
        return;
      }
      if (now - windowStart < WINDOW_MS) return;
      windowStart = now;
      const sorted = intervals.splice(0).sort((a, b) => a - b);
      // A window of 1–3 frames is a device under 2 fps when every one of
      // them was slow; that is the device the ladder most needs to help. A
      // short window with any fast frame in it says too little: it is
      // dropped.
      if (sorted.length === 0 || (sorted.length < 4 && sorted[0] <= SLOW_MS)) return;
      const median = sorted[sorted.length >> 1];
      if (median > SLOW_MS) {
        slow++;
        smoothSince = -1;
        if (slow >= SLOW_WINDOWS && level < levels - 1) {
          // Left again soon after a step up: that level is too much here.
          if (now - steppedUpAt < CEILING_WITHIN_MS) ceiling = level + 1;
          set(level + 1);
          slow = 0;
        }
      } else {
        slow = 0;
        if (median < SMOOTH_MS) {
          if (smoothSince < 0) smoothSince = now;
          if (now - smoothSince > SMOOTH_FOR_MS && level > ceiling) {
            set(level - 1);
            steppedUpAt = now;
            smoothSince = now;
          }
        } else smoothSince = -1;
      }
    },
    reset() {
      intervals.length = 0;
      last = -1;
      startedAt = -1;
      windowStart = -1;
      slow = 0;
      smoothSince = -1;
    },
    level: () => level,
    label: () => (level === 0 ? '' : ` · auto −${level}`),
  };
}

export { STAGE_TIERS, isStageTier, pickStageTier, probeGpu, detectStageTier, stageLadder, createStageAdaptive };
export type { StageTier, StageTierParams, StageSignals, StageTierGuess, StageLevel, StageAdaptive };
