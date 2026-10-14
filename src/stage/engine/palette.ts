import * as THREE from 'three';

/**
 * The stage's colour script (the hellscape's palette idea): every asset
 * class takes its colours from here and keeps only its shapes. Values are
 * sRGB as authored (tuned against the scene reference in the stage
 * prototype); `THREE.Color` converts them to linear for the shaders.
 */
type StagePalette = {
  skyDeep: THREE.Color;
  skyBody: THREE.Color;
  skyLit: THREE.Color;
  haze: THREE.Color;
  /** The air (`air.ts`): the fog's own colour, and the sky it converges to. */
  fog: THREE.Color;
  airZenith: THREE.Color;
  airHorizon: THREE.Color;
  airHaze: THREE.Color;
  /** The ground mist (`air.ts`): moonlit lavender-white, paler than the air
   *  or it vanishes into it. */
  mist: THREE.Color;
  star: THREE.Color;
  tileLight: THREE.Color;
  tileDark: THREE.Color;
  floorSheen: THREE.Color;
  mote: THREE.Color;
  gold: THREE.Color;
  violet: THREE.Color;
  candleFlame: THREE.Color;
  /** Moonlight key for the props, from up-left-front. */
  moonlight: THREE.Color;
  /** Ambient from the sky (above) and the floor (below). */
  ambientSky: THREE.Color;
  ambientGround: THREE.Color;
};

function createPalette(): StagePalette {
  return {
    skyDeep: new THREE.Color('#030613'),
    skyBody: new THREE.Color('#122666'),
    skyLit: new THREE.Color('#3354ad'),
    haze: new THREE.Color('#8f97d8'),
    fog: new THREE.Color('#2e3a86'),
    airZenith: new THREE.Color('#0f1f55'),
    airHorizon: new THREE.Color('#26337c'),
    airHaze: new THREE.Color('#4f5bb0'),
    mist: new THREE.Color('#aab2ee'),
    star: new THREE.Color('#d1e0ff'),
    tileLight: new THREE.Color('#dbdbff'),
    tileDark: new THREE.Color('#0d0d21'),
    floorSheen: new THREE.Color('#1f3380'),
    mote: new THREE.Color('#c0d0ff'),
    gold: new THREE.Color('#e3c27a'),
    violet: new THREE.Color('#7b5cc4'),
    candleFlame: new THREE.Color('#ffc46b'),
    moonlight: new THREE.Color('#b3c2ff'),
    ambientSky: new THREE.Color('#2a3b7a'),
    ambientGround: new THREE.Color('#14142e'),
  };
}

export { createPalette };
export type { StagePalette };
