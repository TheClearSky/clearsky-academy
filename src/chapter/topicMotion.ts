/**
 * The topic modal's opening and closing choreography (`TopicModal.tsx`),
 * pure so it is unit-tested (`src/__tests__/topicMotion.test.ts`).
 *
 * The modal grows out of the station that was clicked, the Crystal Line
 * way: a lit rail races out of the station to both edges of the screen,
 * the sheet opens up and down from that rail, and playing cards burst out
 * of the station and fly off past the edges. Closing runs it backwards —
 * the cards fly home into the station, the sheet folds to the rail and
 * the rail shrinks into the station.
 */

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/** The sheet's clip as `inset()` at three moments: a point at the station,
 *  the full-width rail through it, and the whole sheet. */
function sheetClips(origin: Point, size: Size, radius: number): [string, string, string] {
  const x = Math.max(0, Math.min(size.width, origin.x));
  const y = Math.max(0, Math.min(size.height, origin.y));
  const point = `inset(${y - 1}px ${size.width - x - 1}px ${size.height - y - 1}px ${x - 1}px round 2px)`;
  const rail = `inset(${y - 1}px 0px ${size.height - y - 1}px 0px round 2px)`;
  const full = `inset(0px 0px 0px 0px round ${radius}px)`;
  return [point, rail, full];
}

/** A small seeded generator (mulberry32), so every opening of the same topic flies the same cards. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type CardFlight = {
  /** Where it ends, relative to the station (px). */
  dx: number;
  dy: number;
  /** Turns about the screen axis and about its own vertical axis (deg). */
  spin: number;
  flip: number;
  scale: number;
  delay: number;
  duration: number;
  /** Face up (a cream chapter card) or face down (the violet back). */
  face: boolean;
};

/** `count` card flights bursting out of the station (relative to it) to just past the screen's edges, spread round the full circle. */
function cardFlights(count: number, size: Size, seed: number): CardFlight[] {
  const random = seededRandom(seed);
  const reach = Math.hypot(size.width, size.height) * 0.62;
  return Array.from({ length: count }, (_, index) => {
    const angle = ((index + random() * 0.7) / count) * Math.PI * 2;
    const distance = reach * (0.75 + random() * 0.45);
    return {
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance * 0.8,
      spin: (random() - 0.5) * 540,
      flip: 180 + Math.round(random() * 2) * 180,
      scale: 0.9 + random() * 0.5,
      delay: index * 45 + random() * 60,
      duration: 1050 + random() * 350,
      face: index % 3 === 0,
    };
  });
}

/** A stable seed from a string (the topic's key). */
function seedOf(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  return hash;
}

export { cardFlights, seededRandom, seedOf, sheetClips };
export type { CardFlight, Point, Size };
