/**
 * The landing's asset-class picks (the hellscape's method: the owner picks
 * one option per class in the lab, `/lab.html` › "Copy selection", and pastes
 * it here). Classes left out follow the device's quality tier (e.g. the sky
 * is live on desktops and baked on phones).
 *
 * Until Deepak picks, these are the research's recommendations
 * (`.claude/research/stage/*.md` ★, `.claude/research/stage-v2/*.md`).
 */
const STAGE_SELECTION: Record<string, string> = {
  // The footpath scene (2026-10-17, Deepak: "switch permanently to footpath"): LandingPage sets the
  // rest (fog, props, promenade, landscape) from the visitor's landscape choice (`landingStage.ts` › stageOptions).
  floor: 'path',
  motes: 'circles',
  props: 'books',
  cardEdition: 'earned',
  cardBackdrop: 'sunburst',
  cardDeal: 'scroll',
  ring: 'astrolabe',
  // The anchor (2026-10-17): the Academy in its oak grove; the visitor can switch to blossom
  // (`LandscapeToggle.tsx`; LandingPage starts the stage on their stored choice).
  landscape: 'grove',
};

export { STAGE_SELECTION };
