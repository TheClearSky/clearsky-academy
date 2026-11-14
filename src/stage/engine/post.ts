import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createAnimePost } from './animePost';
import { DITHER_GLSL } from './glsl';
import type { AssetOption } from './contract';

/**
 * Post class: how the frame is finished.
 *
 *  - `anime` — "Hellscape anime", the default on high and medium: the
 *    Nodestra hellscape landing's own finish (`post: 'anime'`), ported in
 *    `engine/animePost.ts` — a hue-shifting glow stack and halation on the
 *    world, a tight bloom on the whole frame, then a split tone, halation,
 *    a tinted vignette, paper and 24 fps grain on the WORLD only (the cards
 *    and rings keep their own colours), and a triangular dither. Its edge
 *    fringe is off: it shredded the 1–2 px checker tiles and stars.
 *  - `clean` — "clean night": the scene into a HalfFloat (HDR) target, a
 *    bloom (threshold 1.0) that only catches what is brighter than white (star cores, motes,
 *    candle flames, card sparkle), neutral tone mapping, and a moving
 *    interleaved-gradient-noise dither (±1/255) — mandatory on a dark-blue
 *    gradient sky, which bands in 8 bits. A soft elliptical vignette darkens
 *    the WORLD only: it runs before the UI overlay, so cards near the edges
 *    keep their white (review: −28 % at the edges in v1).
 *  - `none` — no bloom, no vignette. The cheapest; phones' fallback. The
 *    world is drawn at the tier's low pixel ratio but the cards and rings
 *    at the screen's own (Deepak, on a phone: "the cards of class look
 *    blurry"): the world goes into one HDR target at its ratio, is scaled
 *    up onto the canvas with the tone mapping, and the UI is drawn over it
 *    at the canvas's ratio. Without float render targets it falls back to
 *    one ratio for both, straight to the canvas.
 */

const POST_OPTIONS: readonly AssetOption[] = [
  {
    id: 'anime',
    label: 'Hellscape anime',
    description: "The hellscape landing's finish: glow stack, halation, tight bloom, split tone, tinted vignette, paper and grain on the world; the cards and rings stay clean.",
  },
  { id: 'clean', label: 'Clean night', description: 'HDR bloom on what is brighter than white, neutral tone mapping, vignette, anti-banding dither.' },
  { id: 'none', label: 'None', description: 'Straight to the canvas with tone mapping: no bloom, no vignette. Cheapest.' },
];

/** A layer drawn over the world (the cards and rings), its depth cleared. */
type StageOverlay = { scene: THREE.Scene; camera: THREE.Camera };

type StagePost = {
  render(scene: THREE.Scene, camera: THREE.Camera, time: number, overlay?: StageOverlay): void;
  setSize(width: number, height: number): void;
  /** Bloom resolution scale from the runtime ladder (0 = off). */
  setBloomScale(scale: number): void;
  /**
   * The world's pixel ratio from the runtime ladder; returns the ratio the
   * CANVAS should have (the post's own sizes follow on the next `setSize`).
   * Posts that draw the UI at the world's ratio leave it out.
   */
  setWorldPixelRatio?(ratio: number): number;
  /** The target the world is drawn into (shaders compile for it), if not the canvas. */
  worldTarget?(): THREE.WebGLRenderTarget | null;
  dispose(): void;
};

const VIGNETTE_SHADER = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 colour = texture2D(tDiffuse, vUv);
      vec2 fromCentre = vUv - 0.5;
      colour.rgb *= mix(1.0, 0.72, smoothstep(0.25, 0.8, length(fromCentre * vec2(1.0, 1.25))));
      gl_FragColor = colour;
    }`,
};

const FINISH_SHADER = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */ `${DITHER_GLSL}
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec3 colour = texture2D(tDiffuse, vUv).rgb;
      colour += (interleavedGradientNoise(gl_FragCoord.xy + mod(uTime * 60.0, 64.0) * 5.588) - 0.5) / 255.0;
      gl_FragColor = vec4(colour, 1.0);
    }`,
};

function createCleanPost(renderer: THREE.WebGLRenderer, samples: number): StagePost {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
  composer.addPass(renderPass);
  const vignette = new ShaderPass(VIGNETTE_SHADER);
  composer.addPass(vignette);
  // The UI layer: over the world, its own depth, before the bloom (so the
  // cards' sparkle and the rings' comet heads glow).
  const overlayPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
  overlayPass.clear = false;
  overlayPass.clearDepth = true;
  composer.addPass(overlayPass);
  // Threshold 1.0: only HDR (> white) glows. Measured: at 0.75 the cream
  // card paper bloomed into a white halo round every card.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.6, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FINISH_SHADER);
  composer.addPass(finish);
  let bloomScale = 1;
  let size = { width: 1, height: 1 };
  const applyBloom = () => {
    bloom.enabled = bloomScale > 0;
    // Always re-applied (a ladder step back UP to 1 must restore full size).
    if (bloomScale > 0) {
      const pixelRatio = renderer.getPixelRatio();
      bloom.setSize(Math.max(1, size.width * pixelRatio * bloomScale), Math.max(1, size.height * pixelRatio * bloomScale));
    }
  };
  return {
    render(scene, camera, time, overlay) {
      renderPass.scene = scene;
      renderPass.camera = camera;
      overlayPass.enabled = overlay !== undefined;
      if (overlay) {
        overlayPass.scene = overlay.scene;
        overlayPass.camera = overlay.camera;
      }
      finish.uniforms.uTime.value = time;
      composer.render();
    },
    setSize(width, height) {
      size = { width, height };
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      applyBloom();
    },
    setBloomScale(scale) {
      bloomScale = scale;
      applyBloom();
    },
    dispose() {
      bloom.dispose();
      vignette.dispose();
      finish.dispose();
      composer.dispose();
      target.dispose();
    },
  };
}

/** The sharpest the UI is drawn on a phone (its screen's ratio, at most this). */
const UI_PIXEL_RATIO_CAP = 2;

function createPlainPost(renderer: THREE.WebGLRenderer): StagePost {
  const extensions = renderer.extensions;
  const canSplit = extensions.has('EXT_color_buffer_float') || extensions.has('EXT_color_buffer_half_float');
  const uiRatio = Math.min(window.devicePixelRatio || 1, UI_PIXEL_RATIO_CAP);
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const output = new OutputPass();
  output.renderToScreen = true;
  let worldRatio = uiRatio;
  const split = () => canSplit && worldRatio < uiRatio - 1e-3;
  return {
    render(scene, camera, _time, overlay) {
      if (split()) {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        // Scaled up (linear filtering) and tone mapped onto the canvas.
        output.render(renderer, null as unknown as THREE.WebGLRenderTarget, target, 0, false);
      } else {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      }
      if (overlay) {
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(overlay.scene, overlay.camera);
        renderer.autoClear = autoClear;
      }
    },
    setSize(width, height) {
      target.setSize(Math.max(1, Math.floor(width * worldRatio)), Math.max(1, Math.floor(height * worldRatio)));
    },
    setBloomScale() {},
    setWorldPixelRatio(ratio) {
      worldRatio = ratio;
      return split() ? uiRatio : ratio;
    },
    worldTarget: () => (split() ? target : null),
    dispose() {
      target.dispose();
      output.dispose();
    },
  };
}

function createPost(id: string, renderer: THREE.WebGLRenderer, samples: number): StagePost {
  if (id === 'none') return createPlainPost(renderer);
  if (id === 'anime') return createAnimePost(renderer, samples);
  if (id !== 'clean') throw new Error(`[post] unknown option "${id}"`);
  return createCleanPost(renderer, samples);
}

export { createPost, POST_OPTIONS };
export type { StageOverlay, StagePost };
