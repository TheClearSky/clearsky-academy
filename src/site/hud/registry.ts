import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import type { HudDesign, HudDesignProps } from './contract';
import { configureHudChoice } from './hudChoice';

/**
 * The HUD design (research `.claude/research/hud/`). Rounds 1–4 built and
 * compared 14, then 22, then 18 designs behind a toggle (archived in
 * `Repos/themes/clearsky-hud-v1` … `-v4`). Deepak, 2026-10-14: "Title card
 * deck is final, remove all others" — so one design remains; its card opens
 * the chapter page (`src/chapter/`), which carries the Crystal Line. The
 * contract and this list stay, so a future design is one entry. Each design
 * is its own lazy chunk with its own CSS and display font.
 */
const HUD_DESIGNS: readonly HudDesign[] = [
  { id: 'mix-titledeck', family: 'Title Card', label: 'Title Card Deck', blurb: 'The title card over the chapter cards; a card opens its chapter.', load: () => import('./designs/mix-titledeck') },
];

const DEFAULT_HUD = 'mix-titledeck';

/** React.lazy made ONCE per design, at module scope. */
const HUD_COMPONENTS: ReadonlyMap<string, LazyExoticComponent<ComponentType<HudDesignProps>>> = new Map(HUD_DESIGNS.map((design) => [design.id, lazy(design.load)]));

configureHudChoice(
  HUD_DESIGNS.map((design) => design.id),
  DEFAULT_HUD,
);

export { DEFAULT_HUD, HUD_COMPONENTS, HUD_DESIGNS };
