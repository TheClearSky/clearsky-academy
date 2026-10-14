import type { ComponentType } from 'react';
import type { CardSuit } from '../../stage/cards/model';

/**
 * The HUD contract (research `.claude/research/hud/` — REFERENCES.md §3,
 * TECHNIQUES.md §7): every HUD design renders the SAME model, so the HUD
 * style toggle only swaps visuals. A design owns the whole progress section
 * below the deck — its heading (an `<h2>` naming the course), its subject
 * switch (`kit/SubjectTabs`), its chapters (each one `kit/HudChapter`, the
 * shared accessible core) and its decoration (`aria-hidden`).
 */

type HudChapter = {
  /** Stable across renders: `${subjectId}:${index}`. */
  key: string;
  /** 0-based, in syllabus order. */
  index: number;
  /** 1-based, as shown (the sources restart numbers per unit, so we number 1..n). */
  number: number;
  title: string;
  unitTitle: string;
  unitIndex: number;
  /** Topics learnt and in all. */
  done: number;
  total: number;
  fraction: number;
  complete: boolean;
};

type HudSubject = {
  /** The syllabus document's id. */
  id: string;
  subject: 'mathematics' | 'science' | 'physics' | 'chemistry';
  label: string;
  /** The subject's colour (`--color-subject-*`; science is violet). */
  colour: string;
  chapters: HudChapter[];
  done: number;
  total: number;
  fraction: number;
  /** Chapters at 100 %. */
  completeChapters: number;
};

type HudModel = {
  course: {
    key: string;
    /** "CBSE", "NTA", "IIT". */
    kicker: string;
    /** "Class X", "JEE Main". */
    title: string;
    /** The playing card's rank ("IX".."XII", "K", "A"), suit and accent. */
    rank: string;
    suit: CardSuit;
    accent: string;
  };
  subjects: HudSubject[];
  active: HudSubject;
  setActive(id: string): void;
  /** The whole course: topics learnt and in all, chapters complete and in all. */
  overall: { done: number; total: number; fraction: number; chapters: number; completeChapters: number };
  reducedMotion: boolean;
  /** True while the picker's "Sample progress" preview is on (the numbers are made up). */
  sample: boolean;
};

type HudDesignProps = { model: HudModel };

type HudDesign = {
  id: string;
  label: string;
  /** The picker groups designs by family ("Chapter Deck", "Mixes", …). */
  family: string;
  /** One line for the picker's tooltip. */
  blurb: string;
  load: () => Promise<{ default: ComponentType<HudDesignProps> }>;
};

export type { HudChapter, HudDesign, HudDesignProps, HudModel, HudSubject };
