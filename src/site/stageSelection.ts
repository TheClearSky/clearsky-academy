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
  floor: 'checker',
  motes: 'circles',
  props: 'full',
  cardEdition: 'earned',
  cardBackdrop: 'sunburst',
  cardDeal: 'scroll',
  ring: 'astrolabe',
};

export { STAGE_SELECTION };
