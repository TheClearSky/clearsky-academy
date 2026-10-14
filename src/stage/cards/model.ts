/**
 * What a playing card shows — pure, serialisable data, painted by
 * `cardPainter.ts` and shaded by `cardShader.ts` (research
 * `.claude/research/stage-v2/CARDS.md` › D).
 *
 * The deck reads as a real poker deck (the owner's references): a rank and
 * a suit in two corners, a framed illustration, a nameplate. Courses map to
 * ranks (the four classes are IX…XII, the two JEE decks are the King and the
 * Ace) and suits (the four-colour-deck convention, plus the academy's own
 * four-point star ✦ for JEE).
 */

const CARD_SUITS = ['club', 'diamond', 'heart', 'spade', 'star'] as const;
type CardSuit = (typeof CARD_SUITS)[number];

const CARD_EDITIONS = ['base', 'foil', 'holo', 'prism'] as const;
/** The card's finish, earned by progress — and never dull: `base` is
 *  already bright white glossy stock. */
type CardEdition = (typeof CARD_EDITIONS)[number];

const CARD_ILLUSTRATIONS = ['compass', 'prism', 'projectile', 'field', 'crown', 'rosette'] as const;
type CardIllustration = (typeof CARD_ILLUSTRATIONS)[number];

type CardFaceModel = {
  /** Corner index ("XI", "K"). */
  rank: string;
  suit: CardSuit;
  /** The card's one accent colour (hex): linework, index, progress. */
  accent: string;
  /** The illustration window's pale tint (hex). */
  tint: string;
  illustration: CardIllustration;
  /** Small caption above the title ("CBSE · CLASS"). */
  kicker: string;
  title: string;
  subjects: string[];
  chapters: number;
  /** 0..1 of the course's topics learnt. */
  fraction: number;
  edition: CardEdition;
};

/** Poker card proportions (63 × 88 mm). */
const CARD_ASPECT = 63 / 88;

/** The finish for a progress fraction: base at 0, foil once started, holo
 *  from half-way, prism when complete. */
function editionFor(fraction: number): CardEdition {
  if (fraction >= 1) return 'prism';
  if (fraction >= 0.5) return 'holo';
  return fraction > 0 ? 'foil' : 'base';
}

/** Edition strengths for the shader: foil, holo, prism (each 0 or 1). */
function editionStrengths(edition: CardEdition): { foil: number; holo: number; prism: number } {
  const level = CARD_EDITIONS.indexOf(edition);
  return { foil: level >= 1 ? 1 : 0, holo: level >= 2 ? 1 : 0, prism: level >= 3 ? 1 : 0 };
}

/** A stable string for "does the face need repainting". */
function faceModelKey(model: CardFaceModel): string {
  return JSON.stringify([model.rank, model.suit, model.accent, model.tint, model.illustration, model.kicker, model.title, model.subjects, model.chapters, Math.round(model.fraction * 1000), model.edition]);
}

export { CARD_ASPECT, CARD_EDITIONS, CARD_ILLUSTRATIONS, CARD_SUITS, editionFor, editionStrengths, faceModelKey };
export type { CardEdition, CardFaceModel, CardIllustration, CardSuit };
