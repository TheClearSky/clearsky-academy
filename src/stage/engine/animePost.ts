import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { animeFinishColours, NIGHT_ANIME_TONES } from './animeTones';
import type { AnimeTones, RgbTriple } from './animeTones';
import type { StageOverlay, StagePost } from './post';

/**
 * Post option `anime`: the hellscape landing's "Anime finish", PORTED from
 * Nodestra (`react-blender-nodes-sound/src/landing/hell/hell-src/`, H below).
 * The landing selects `post: 'anime'` (H `hell-stage.ts:59-71`); that look is
 * `LOOKS.anime` in H `scene/post.ts:93` — tight bloom, a glow stack, edge
 * fringe, a split tone, halation, 24 fps grain, a tinted vignette, paper
 * glued to the view and a triangular dither (every one ported; the fringe is
 * switched off here, below). Its shader code is COPIED here
 * from H `hell-12-anime-post-passes.ts` and H `scene/post-glow.ts`; only the
 * branches the anime look runs are kept.
 *
 * Pass order (linear HDR → display), with what each sees:
 *
 *   World RenderPass                       the world (sky, floor, fog, props)
 *   GlowStackPass      WORLD ONLY          H post-glow.ts (whole file)
 *   HalationPass key   WORLD ONLY          H hell-12 :331-390
 *   Overlay RenderPass                     the cards and rings, depth cleared
 *   UiCoveragePass     (own target)        NEW: where the UI is, for the finish
 *   UnrealBloom tight  WHOLE FRAME         H scene/post.ts:233-238
 *   OutputPass                             neutral tone mapping + sRGB
 *   Finish             world-only effects, H hell-12 :664-925 + the patches of
 *                      dither on all       H scene/post.ts:109-121
 *
 * What changed, and why:
 *  - THE UI IS NOT GRADED. The hellscape has no UI in its canvas; here the
 *    white cards and gold rings share it, and they were tuned to read bright
 *    and crisp. The glow stack and the halation key read the world before
 *    the overlay is drawn; the finish's fringe, halation, split tone,
 *    vignette, paper and grain are mixed back out wherever the UI covers the
 *    pixel (a coverage render of the overlay, below). The bloom runs on the
 *    whole frame, so the cards' foil sparkle and the rings' comet heads still
 *    glow, and the dither runs everywhere (8-bit banding is not a look).
 *  - Thresholds: the landing keys its glow at 0.6–1.4 and blooms above 0.85
 *    (its circles peak at ~1.5× HDR, H scene/post.ts:147-155). Measured here
 *    (float target, 800×450, the hero): the lit checker tiles sit at
 *    0.98–0.99 linear (34 % of floor pixels > 0.6), only stars, motes and
 *    candle flames pass 1.0 (max 2.5). So the glow keys from 1.0 to 1.8
 *    (post-glow.ts's own default top) and the bloom threshold stays 1.0 —
 *    at 0.75 the card paper bloomed into a halo round every card (v1).
 *    The halation keeps the landing's 1.2.
 *  - Bloom strength 0.7 → 0.42, the tight mip shape kept: at 0.7 the cards'
 *    HDR bevel rims bloomed into a white rim round EVERY card (screenshot
 *    review) — every card looked "selected" and the chosen card's accent
 *    glow was lost. 0.42 matches the clean post's near-field bloom (0.6 ×
 *    its radius-0.6 mip-0 factor 0.68 ≈ 0.41).
 *  - Edge fringe OFF (the shader keeps it; `uFringeMax` 0 is the hellscape's
 *    own switch). Measured at the landing's 0.5–1.5 px and again at 0–0.5 px:
 *    every edge of the 1–2 px far checker tiles turned red / yellow / green
 *    and the pinpoint stars orange — detail the hellscape's soft, large
 *    forms do not have.
 *  - Colours: the blue-white night's (`engine/animeTones.ts`), not the dusk
 *    palette's violet/peach/salmon.
 *  - Dropped (the anime look never runs them): the hard-forms prepass and
 *    its Sobel ink, posterise, the mono / LUT grades, brush paper, the
 *    blue-noise texture (only the posterise jitter and the blue dither used
 *    it) and the band finder. The paper reads no hard-forms mask: the
 *    hellscape scene cleared that mask to "soft world" anyway
 *    (H scene/post.ts:159-174).
 *  - NaN guards (a NaN in the HDR target is smeared over the whole frame by
 *    the bloom): both HDR keys clamp their input to 0..8 (the glow key
 *    already capped at 8); the paper's view direction never meets atan(0, 0).
 */

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** H hell-12 :26-39. */
const COMMON_GLSL = /* glsl */ `
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;

/** A linear-filtered HDR target without depth (H hell-12 :41-43). */
function createHalfFloatTarget(): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
}

/** A 9-tap separable gaussian with linear-sampling taps (H hell-12 :45-66). */
function createBlurMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec2 uStep;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
        c += texture2D(tSrc, vUv + uStep * 1.3846).rgb * 0.316216;
        c += texture2D(tSrc, vUv - uStep * 1.3846).rgb * 0.316216;
        c += texture2D(tSrc, vUv + uStep * 3.2308).rgb * 0.070270;
        c += texture2D(tSrc, vUv - uStep * 3.2308).rgb * 0.070270;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}

/** A size divided down, never below one pixel. */
function scaledSize(size: number, divisor: number): number {
  return Math.max(1, Math.round(size / divisor));
}

/**
 * The "transmitted light" (透過光) glow stack — COPIED from H
 * `scene/post-glow.ts:51-156` (itself hell-12's CircleGlowPass, keyed on the
 * frame's bright HDR pixels instead of a layer). The key is blurred at 1/2,
 * 1/4 and 1/8 resolution and each level is added back in its own hue, so the
 * glow shifts colour as it falls off.
 */
class GlowStackPass extends Pass {
  readonly levels = [createHalfFloatTarget(), createHalfFloatTarget(), createHalfFloatTarget()];
  readonly temporaries = [createHalfFloatTarget(), createHalfFloatTarget(), createHalfFloatTarget()];
  readonly key: THREE.ShaderMaterial;
  readonly blur = createBlurMaterial();
  readonly composite: THREE.ShaderMaterial;
  private readonly keyQuad: FullScreenQuad;
  private readonly blurQuad: FullScreenQuad;
  private readonly compositeQuad: FullScreenQuad;

  constructor() {
    super();
    // Key: keep only the HDR-bright pixels (soft knee), 4 taps while halving.
    this.key = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uLow: { value: 0.8 }, uHigh: { value: 1.8 } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uLow, uHigh;
        varying vec2 vUv;
        vec3 keyed(vec2 uv) {
          // ADAPTED: clamp(0..8) for H's min(c, 8.0) — a negative or NaN-prone input never enters the blur.
          vec3 c = clamp(texture2D(tDiffuse, uv).rgb, 0.0, 8.0);
          float m = max(c.r, max(c.g, c.b));
          return c * smoothstep(uLow, uHigh, m);
        }
        void main() {
          vec3 c = keyed(vUv + uTexel * vec2(-0.5, -0.5)) + keyed(vUv + uTexel * vec2(0.5, -0.5))
                 + keyed(vUv + uTexel * vec2(-0.5, 0.5)) + keyed(vUv + uTexel * vec2(0.5, 0.5));
          gl_FragColor = vec4(c * 0.25, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.composite = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        t0: { value: this.levels[0].texture },
        t1: { value: this.levels[1].texture },
        t2: { value: this.levels[2].texture },
        c0: { value: new THREE.Color() },
        c1: { value: new THREE.Color() },
        c2: { value: new THREE.Color() },
        uGain: { value: 1 },
      },
      vertexShader: QUAD_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse, t0, t1, t2;
        uniform vec3 c0, c1, c2;
        uniform float uGain;
        varying vec2 vUv;
        float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)) + c.r * 0.3; }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          // Each level becomes one hue keyed by its brightness (hue shifts with the fall-off).
          vec3 g = c0 * lum(texture2D(t0, vUv).rgb) + c1 * lum(texture2D(t1, vUv).rgb) + c2 * lum(texture2D(t2, vUv).rgb);
          gl_FragColor = vec4(base.rgb + g * uGain, base.a);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.keyQuad = new FullScreenQuad(this.key);
    this.blurQuad = new FullScreenQuad(this.blur);
    this.compositeQuad = new FullScreenQuad(this.composite);
  }

  setSize(width: number, height: number): void {
    [2, 4, 8].forEach((divisor, level) => {
      this.levels[level].setSize(scaledSize(width, divisor), scaledSize(height, divisor));
      this.temporaries[level].setSize(scaledSize(width, divisor), scaledSize(height, divisor));
    });
    this.key.uniforms.uTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  private blurInto(source: THREE.WebGLRenderTarget, temporary: THREE.WebGLRenderTarget, destination: THREE.WebGLRenderTarget, renderer: THREE.WebGLRenderer, spread: number): void {
    this.blur.uniforms.tSrc.value = source.texture;
    this.blur.uniforms.uStep.value.set(spread / source.width, 0);
    renderer.setRenderTarget(temporary);
    this.blurQuad.render(renderer);
    this.blur.uniforms.tSrc.value = temporary.texture;
    this.blur.uniforms.uStep.value.set(0, spread / temporary.height);
    renderer.setRenderTarget(destination);
    this.blurQuad.render(renderer);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const [level0, level1, level2] = this.levels;
    const [temporary0, temporary1, temporary2] = this.temporaries;
    // 1. the bright pixels alone, at half resolution
    this.key.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(level0);
    this.keyQuad.render(renderer);
    // 2. three blur levels: 1/2, 1/4, 1/8 (each from the previous one)
    this.blurInto(level0, temporary0, level0, renderer, 1.0);
    this.blurInto(level0, temporary1, level1, renderer, 1.6);
    this.blurInto(level1, temporary2, level2, renderer, 2.2);
    // 3. add the tinted levels onto the HDR frame
    this.composite.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compositeQuad.render(renderer);
  }

  dispose(): void {
    for (const target of [...this.levels, ...this.temporaries]) target.dispose();
    for (const material of [this.key, this.blur, this.composite]) material.dispose();
    for (const quad of [this.keyQuad, this.blurQuad, this.compositeQuad]) quad.dispose();
  }
}

/**
 * Halation: the HDR key at quarter resolution, blurred twice — COPIED from
 * H `hell-12-anime-post-passes.ts:331-390`. It only writes its own targets;
 * the finish reads `texture` and screens a ring of colour round the
 * brightest things.
 */
class HalationPass extends Pass {
  readonly key: THREE.ShaderMaterial;
  readonly blur = createBlurMaterial();
  private readonly keyQuad: FullScreenQuad;
  private readonly blurQuad: FullScreenQuad;
  private readonly targetA = createHalfFloatTarget();
  private readonly targetB = createHalfFloatTarget();

  constructor() {
    super();
    this.needsSwap = false; // only writes its own targets; the finish pass reads them
    this.key = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 2.2 } },
      vertexShader: QUAD_VERTEX,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uThreshold;
        varying vec2 vUv;
        vec3 keyed(vec2 uv) {
          // ADAPTED: clamped to 0..8 (H reads it raw) — the NaN guard of the glow key.
          vec3 c = clamp(texture2D(tDiffuse, uv).rgb, 0.0, 8.0);
          float l = max(c.r, max(c.g, c.b));
          return c * smoothstep(uThreshold, uThreshold * 2.0, l);
        }
        void main() {
          // 4-tap box while downsampling 4x
          vec3 c = keyed(vUv + uTexel * vec2(-1.0, -1.0)) + keyed(vUv + uTexel * vec2(1.0, -1.0))
                 + keyed(vUv + uTexel * vec2(-1.0, 1.0)) + keyed(vUv + uTexel * vec2(1.0, 1.0));
          gl_FragColor = vec4(c * 0.25, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.keyQuad = new FullScreenQuad(this.key);
    this.blurQuad = new FullScreenQuad(this.blur);
  }

  get texture(): THREE.Texture {
    return this.targetA.texture;
  }

  setSize(width: number, height: number): void {
    this.targetA.setSize(scaledSize(width, 4), scaledSize(height, 4));
    this.targetB.setSize(scaledSize(width, 4), scaledSize(height, 4));
    this.key.uniforms.uTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.key.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.targetA);
    this.keyQuad.render(renderer);
    for (let pass = 0; pass < 2; pass++) {
      this.blur.uniforms.tSrc.value = this.targetA.texture;
      this.blur.uniforms.uStep.value.set((1 + pass) / this.targetA.width, 0);
      renderer.setRenderTarget(this.targetB);
      this.blurQuad.render(renderer);
      this.blur.uniforms.tSrc.value = this.targetB.texture;
      this.blur.uniforms.uStep.value.set(0, (1 + pass) / this.targetA.height);
      renderer.setRenderTarget(this.targetA);
      this.blurQuad.render(renderer);
    }
  }

  dispose(): void {
    this.targetA.dispose();
    this.targetB.dispose();
    this.key.dispose();
    this.blur.dispose();
    this.keyQuad.dispose();
    this.blurQuad.dispose();
  }
}

/** A coverage stand-in drawn for an opaque UI material, with the same vertex stage. */
type CoverageEntry = { vertexShader: string; material: THREE.ShaderMaterial };

/**
 * NEW (no hellscape counterpart — its canvas has no UI): WHERE the UI is,
 * for the finish to keep its world-only effects off the cards and rings.
 *
 * The overlay is drawn a second time into its own 8-bit target, cleared
 * black, the way hell-12's hard-forms prepass swaps materials for one draw
 * (H `hell-12-anime-post-passes.ts:118-145`):
 *  - opaque UI (the cards, the chips) is drawn PURE WHITE by a stand-in that
 *    keeps its vertex stage — full cover, whatever the card's colour (an
 *    obsidian card is nearly black), and nothing of the card shader's cost;
 *  - blended UI keeps its own shader, so its cover is the LIGHT it adds:
 *    the rings' lines and comet heads, the sparkles and the sunburst count,
 *    while the world-dimming veil (near-black) and the cards' soft shadows
 *    (dark) do not — they are the world, dimmed.
 * Why not the colour buffer's alpha: the rings add their lines with alpha 0
 * (only the disc behind the label has cover), the veil blends its alpha
 * squared, and UnrealBloom adds its brightness to alpha.
 */
class UiCoveragePass extends Pass {
  /** The overlay of the frame being drawn (none: the target stays black). */
  overlay: StageOverlay | undefined;
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: true });
  private readonly coverage = new Map<THREE.Material, CoverageEntry>();
  /** For opaque UI that is not a ShaderMaterial: three's own white. */
  private readonly plainCoverage = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly clearColour = new THREE.Color();

  constructor() {
    super();
    this.needsSwap = false; // only writes its own target; the finish reads it
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  setSize(width: number, height: number): void {
    this.target.setSize(scaledSize(width, 1), scaledSize(height, 1));
  }

  /** The stand-in for an opaque material, or null for a blended one (drawn as itself). */
  private coverageFor(material: THREE.Material): THREE.Material | null {
    const opaque = !material.transparent && material.blending === THREE.NormalBlending;
    if (!opaque) return null;
    // A raw shader declares its own outputs; a stand-in fragment could not match them.
    if (material instanceof THREE.RawShaderMaterial) return null;
    if (!(material instanceof THREE.ShaderMaterial)) return this.plainCoverage;
    const cached = this.coverage.get(material);
    if (cached && cached.vertexShader === material.vertexShader) return cached.material;
    cached?.material.dispose();
    const stand = new THREE.ShaderMaterial({
      // Shared, not copied: the stand-in moves with the card's live uniforms.
      uniforms: material.uniforms,
      defines: material.defines,
      vertexShader: material.vertexShader,
      fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
      glslVersion: material.glslVersion,
      side: material.side,
      depthTest: material.depthTest,
      depthWrite: material.depthWrite,
    });
    this.coverage.set(material, { vertexShader: material.vertexShader, material: stand });
    return stand;
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.getClearColor(this.clearColour);
    const clearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    const overlay = this.overlay;
    if (overlay) {
      const swapped: [THREE.Mesh, THREE.Material][] = [];
      const used = new Set<THREE.Material>();
      overlay.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
        const material: THREE.Material = object.material;
        const stand = this.coverageFor(material);
        if (!stand) return;
        used.add(material);
        swapped.push([object, material]);
        object.material = stand;
      });
      try {
        renderer.render(overlay.scene, overlay.camera);
      } finally {
        for (const [mesh, material] of swapped) mesh.material = material;
      }
      // A card that left the table takes its stand-in with it (no leak).
      for (const [material, entry] of this.coverage) {
        if (used.has(material)) continue;
        entry.material.dispose();
        this.coverage.delete(material);
      }
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(this.clearColour, clearAlpha);
  }

  dispose(): void {
    for (const entry of this.coverage.values()) entry.material.dispose();
    this.coverage.clear();
    this.plainCoverage.dispose();
    this.target.dispose();
  }
}

/** How strongly the UI's added light counts as cover (a ring line at 0.25 already protects fully). */
const UI_LIGHT_GAIN = 4;

/**
 * The display-referred finish, the very last pass — COPIED from H
 * `hell-12-anime-post-passes.ts:664-925` (`finishMaterial`) with the anime
 * look's branches only: R4 fringe (mode 0, along the brightness gradient),
 * R6 halation, R5 split grade (with H `scene/post.ts:109-121`'s patches: the
 * CDL slope, shadow tint and highlight tint from uniforms, offset 0, power
 * 1.12), the tinted cos⁴ vignette (mode 0), R7 paper glued to the view
 * sphere (mode 0), R6 mono grain at 24 fps, and R8 triangular dither (mode 2).
 * NEW: `tUiMask` — the world-only effects are mixed back out over the UI.
 */
function createFinishMaterial(halation: THREE.Texture, uiMask: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      tHalo: { value: halation },
      tUiMask: { value: uiMask },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPR: { value: 1 },
      uTime: { value: 0 },
      uFrame: { value: 0 },
      // fringe — OFF here (uFringeMax 0, the hellscape's own switch, H scene/post.ts:248-249).
      // Measured on this scene at H's 0.5–1.5 px and at 0–0.5 px: every edge of the
      // 1–2 px far checker tiles turned red / yellow / green and the pinpoint stars
      // orange. The hellscape's soft, large forms have no such detail.
      uFringeMin: { value: 0.5 },
      uFringeMax: { value: 0 },
      // Lens chromatic aberration: red and blue pulled apart RADIALLY, full
      // strength from about a third of the way out. OFF: the owner first asked
      // for "2px abberation and increase area", then, after trying 0–4 px on
      // a slider (2026-10-17): "i think it doesnt add to the scene, set to 0".
      // The shader keeps it (px; > 0 turns it on).
      uAberration: { value: 0 },
      // halation
      uHalo: { value: 0.28 },
      uHaloCore: { value: 0.6 },
      uHaloTint: { value: new THREE.Vector3(1, 1, 1) },
      // split grade (H scene/post.ts's patch uniforms)
      uSlope: { value: new THREE.Vector3(1, 1, 1) },
      uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
      uHiTint: { value: new THREE.Vector3(1, 1, 1) },
      // vignette / grain / paper
      uVig: { value: 0.6 },
      uVigTint: { value: new THREE.Vector3(1, 1, 1) },
      uGrain: { value: 0.035 },
      uGrainFps: { value: 24 },
      uPaper: { value: 0.25 },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      // UI protection: 1 while an overlay is drawn
      uUiProtect: { value: 0 },
      uUiGain: { value: UI_LIGHT_GAIN },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse, tHalo, tUiMask;
      uniform vec2 uRes;
      uniform float uPR, uTime, uFrame;
      uniform float uFringeMin, uFringeMax, uAberration;
      uniform float uHalo, uHaloCore;
      uniform vec3 uHaloTint;
      uniform vec3 uSlope, uShadowTint, uHiTint, uVigTint;
      uniform float uVig;
      uniform float uGrain, uGrainFps;
      uniform float uPaper;
      uniform mat4 uInvProj, uCamWorld;
      uniform float uUiProtect, uUiGain;
      varying vec2 vUv;
      ${COMMON_GLSL}

      float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
      float fibres(vec2 p) {
        float f = 0.0;
        for (int k = 0; k < 3; k++) {
          float a = float(k) * 2.1 + 0.4;
          mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
          f += vnoise((r * p) * vec2(1.0, 9.0));
        }
        return f / 3.0;
      }
      // NEW: how much of this pixel is UI (cards, rings, sparkles) — 0 = world.
      float uiCover(vec2 uv) {
        vec3 m = texture2D(tUiMask, uv).rgb;
        return clamp(max(m.r, max(m.g, m.b)) * uUiGain, 0.0, 1.0) * uUiProtect;
      }

      void main() {
        vec2 tx = 1.0 / uRes;
        vec3 c0 = texture2D(tDiffuse, vUv).rgb;
        float lxp = luma(texture2D(tDiffuse, vUv + vec2(tx.x, 0.0)).rgb);
        float lxm = luma(texture2D(tDiffuse, vUv - vec2(tx.x, 0.0)).rgb);
        float lyp = luma(texture2D(tDiffuse, vUv + vec2(0.0, tx.y)).rgb);
        float lym = luma(texture2D(tDiffuse, vUv - vec2(0.0, tx.y)).rgb);
        vec2 grad = vec2(lxp - lxm, lyp - lym);
        float gl = length(grad);
        float L0 = luma(c0);
        vec3 c = c0;

        // R4 chromatic fringe: strongest at bright edges (mode 0: along the gradient).
        if (uFringeMax > 0.0) {
          float edge = smoothstep(0.03, 0.18, gl) * smoothstep(0.15, 0.6, L0 + gl);
          vec2 dir = grad;
          float px = mix(uFringeMin, uFringeMax, edge) * step(0.001, edge);
          dir /= max(length(dir), 1e-5);
          vec2 off = dir * px * uPR * tx;
          // ADAPTED: a tap that lands on the UI keeps this pixel's own channel,
          // so no card colour fringes the world round a card's edge.
          float red = mix(texture2D(tDiffuse, vUv + off).r, c0.r, uiCover(vUv + off));
          float blue = mix(texture2D(tDiffuse, vUv - off).b, c0.b, uiCover(vUv - off));
          c = vec3(red, c0.g, blue);
        }

        // Lens chromatic aberration: radial, full strength from a third of
        // the way out (r = 1 at the corners).
        if (uAberration > 0.0) {
          vec2 fromCentre = vUv - 0.5;
          float reach = smoothstep(0.05, 0.35, length(fromCentre) * 1.4142);
          vec2 radial = fromCentre * inversesqrt(max(dot(fromCentre, fromCentre), 1e-8));
          vec2 shift = radial * reach * uAberration * uPR * tx;
          // As the fringe: a tap that lands on the UI keeps this pixel's own channel.
          float red = mix(texture2D(tDiffuse, vUv + shift).r, c.r, uiCover(vUv + shift));
          float blue = mix(texture2D(tDiffuse, vUv - shift).b, c.b, uiCover(vUv - shift));
          c = vec3(red, c.g, blue);
        }

        // R6 halation: a ring of colour around the brightest things.
        if (uHalo > 0.0) {
          vec3 h = texture2D(tHalo, vUv).rgb;
          float hl = max(h.r, max(h.g, h.b));
          float ring = 1.0 - uHaloCore * smoothstep(0.35, 0.8, L0);
          vec3 add = uHaloTint * (1.0 - exp(-hl * uHalo)) * ring;
          c = c + add * (1.0 - c); // screen
        }

        // R5 grade: ASC CDL then a shadow / highlight split.
        {
          vec3 slope = uSlope;
          vec3 offset = vec3(0.0);
          vec3 power = vec3(1.12);
          c = pow(max(c * slope + offset, 0.0), power);
          float l2 = luma(c);
          float wS = 1.0 - smoothstep(0.0, 0.32, l2);
          float wH = smoothstep(0.3, 0.95, l2);
          vec3 shadowTint = uShadowTint;
          vec3 hiTint = uHiTint;
          c += (shadowTint - 0.18) * wS * 0.22;
          c = mix(c, c * (hiTint * 1.15), wH * 0.45);
          c = mix(vec3(luma(c)), c, 1.12);
        }
        c = max(c, 0.0);

        // Vignette: cos^4, tinted (mode 0).
        if (uVig > 0.0) {
          vec2 d = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
          float v = pow(cos(clamp(length(d) * 0.95, 0.0, 1.5707)), 4.0);
          float k = mix(1.0, v, uVig);
          c = mix(c * uVigTint * 0.9, c, k);
        }

        // R7 paper texture on FLAT areas, glued to the view sphere (mode 0).
        if (uPaper > 0.0) {
          vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec3 dir = normalize((uCamWorld * vec4(vp.xyz / vp.w, 0.0)).xyz);
          // ADAPTED: never atan(0, 0) (a view straight up or down).
          vec2 sp = vec2(atan(dir.x, -dir.z + 1e-6), asin(clamp(dir.y, -1.0, 1.0)));
          float p = 0.45 * vnoise(sp * 520.0) + 0.35 * fibres(sp * 140.0) + 0.2 * vnoise(sp * 22.0);
          p -= 0.18 * smoothstep(0.82, 0.92, vnoise(sp * 90.0 + 7.0)); // a few small pigment drops
          float flatness = 1.0 - smoothstep(0.015, 0.09, gl);
          c *= mix(1.0, 0.86 + 0.28 * p, uPaper * flatness);
        }

        // R6 film grain: luminance-weighted, held for 1/fps.
        if (uGrain > 0.0) {
          float tt = floor(uTime * uGrainFps);
          vec2 gp = floor(gl_FragCoord.xy / max(uPR, 1.0));
          float n = hash12(gp + tt * 17.13) - 0.5;
          float l3 = luma(c);
          float w = smoothstep(0.0, 0.2, l3) * (1.0 - smoothstep(0.7, 1.0, l3)) * 0.8 + 0.2;
          c += vec3(n) * uGrain * w;
        }

        // NEW: everything above is the world's look; the UI keeps its own colours.
        c = mix(c, c0, uiCover(vUv));

        // R8 dither: the very last thing before the 8-bit canvas (triangular, -1..1 LSB).
        c = clamp(c, 0.0, 1.0);
        vec2 p = gl_FragCoord.xy + mod(uFrame, 64.0) * 5.588238;
        float dn = ign(p) + ign(p + vec2(47.0, 17.0)) - 1.0;
        c += dn / 255.0;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}

/** The anime look's strengths (H `scene/post.ts:93` `LOOKS.anime` and `apply`, :227-278). */
const ANIME_LOOK = {
  /** H: 0.7 — the cards' rims bloomed into a white rim at that (see the header). */
  bloomStrength: 0.42,
  bloomRadius: 0,
  /** H: 0.85 — kept at this stage's 1.0 (see the header). */
  bloomThreshold: 1.0,
  /** Core + a ~4 %-of-frame halo: only mips 0–1 contribute. */
  bloomFactors: [1.0, 0.7, 0.08, 0.0, 0.0],
  /** H: 0.6 → 1.4 against circles at ~1.5×; here above the 0.99 checker tiles. */
  glowLow: 1.0,
  glowHigh: 1.8,
  glowGain: 2.5,
  halationThreshold: 1.2,
  halation: 0.28,
} as const;

/** A colour uniform from display-referred components. */
function setVector(uniform: THREE.IUniform, colour: RgbTriple): void {
  (uniform.value as THREE.Vector3).set(colour[0], colour[1], colour[2]);
}

/** The anime post plus what a video drives on it: its tones per shot. */
type AnimePost = StagePost & {
  /** Re-tone the glow stack and the finish (the landing keeps the night's). */
  setTones(tones: AnimeTones): void;
  /** As `render`, but the finished frame stays in a target (for averaging
   *  sub-frames); returns its texture, valid until the next render. */
  renderToTexture(scene: THREE.Scene, camera: THREE.Camera, time: number, overlay?: StageOverlay): THREE.Texture;
  /** The finish's strengths (the video kit compares looks on the bench). */
  setLook(look: AnimeLookOverrides): void;
};

type AnimeLookOverrides = {
  vignette?: number;
  grain?: number;
  paper?: number;
  halation?: number;
  bloomStrength?: number;
  glowGain?: number;
};

type AnimePostOptions = {
  tones?: AnimeTones;
  /** Seed the dither from the frame TIME (60 steps a second) instead of a
   *  counter of rendered frames: a video's frame must not depend on how many
   *  frames were drawn before it (`topics/contract.ts` › VideoScript). */
  ditherFromTime?: boolean;
  /** Extra passes on the linear world image, before the glow stack (ink lines). */
  worldPasses?: Pass[];
  /** Extra display-referred passes between the tone map and the finish (a grade). */
  displayPasses?: Pass[];
  /** A bloom to use instead of the tight UnrealBloom (e.g. an energy-conserving pyramid). */
  bloom?: Pass;
};

function createAnimePost(renderer: THREE.WebGLRenderer, samples: number, options: AnimePostOptions = {}): AnimePost {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, target);
  const worldPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
  composer.addPass(worldPass);
  for (const pass of options.worldPasses ?? []) composer.addPass(pass);

  // World only: the glow stack and the halation key read the world before the UI is drawn.
  const glow = new GlowStackPass();
  glow.key.uniforms.uLow.value = ANIME_LOOK.glowLow;
  glow.key.uniforms.uHigh.value = ANIME_LOOK.glowHigh;
  glow.composite.uniforms.uGain.value = ANIME_LOOK.glowGain;
  composer.addPass(glow);
  const halation = new HalationPass();
  halation.key.uniforms.uThreshold.value = ANIME_LOOK.halationThreshold;
  composer.addPass(halation);

  // The UI layer: over the world, its own depth, before the bloom (so the
  // cards' sparkle and the rings' comet heads glow) — as the clean post.
  const overlayPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
  overlayPass.clear = false;
  overlayPass.clearDepth = true;
  composer.addPass(overlayPass);
  const uiCoverage = new UiCoveragePass();
  composer.addPass(uiCoverage);

  // Tight bloom over the whole frame (H scene/post.ts:233-238).
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), ANIME_LOOK.bloomStrength, ANIME_LOOK.bloomRadius, ANIME_LOOK.bloomThreshold);
  bloom.compositeMaterial.uniforms.bloomFactors.value = [...ANIME_LOOK.bloomFactors];
  composer.addPass(options.bloom ?? bloom);
  if (options.bloom) bloom.enabled = false;
  const output = new OutputPass();
  composer.addPass(output);
  for (const pass of options.displayPasses ?? []) composer.addPass(pass);

  const finishMaterial = createFinishMaterial(halation.texture, uiCoverage.texture);
  const finishUniforms = finishMaterial.uniforms;
  const setTones = (tones: AnimeTones) => {
    // Highlight core → violet → shadow hue, at hell-12's strengths (H scene/post.ts:216-220); linear.
    (glow.composite.uniforms.c0.value as THREE.Color).set(tones.highlights).multiplyScalar(0.16);
    (glow.composite.uniforms.c1.value as THREE.Color).set(tones.glowMiddle).multiplyScalar(0.06);
    (glow.composite.uniforms.c2.value as THREE.Color).set(tones.shadows).multiplyScalar(0.16);
    const colours = animeFinishColours(tones);
    setVector(finishUniforms.uSlope, colours.slope);
    setVector(finishUniforms.uShadowTint, colours.shadowTint);
    setVector(finishUniforms.uHiTint, colours.highlightTint);
    setVector(finishUniforms.uVigTint, colours.vignetteTint);
    setVector(finishUniforms.uHaloTint, colours.halationTint);
  };
  setTones(options.tones ?? NIGHT_ANIME_TONES);
  const finish = new ShaderPass(finishMaterial);
  composer.addPass(finish);

  let bloomScale = 1;
  let size = { width: 1, height: 1 };
  let frame = 0;
  const drawingBuffer = new THREE.Vector2();
  const applyBloom = () => {
    // The ladder's "bloom off" turns every glow off: bloom, glow stack, halation.
    const glowing = bloomScale > 0;
    bloom.enabled = glowing && !options.bloom;
    if (options.bloom) options.bloom.enabled = glowing;
    glow.enabled = glowing;
    halation.enabled = glowing;
    finishUniforms.uHalo.value = glowing ? ANIME_LOOK.halation : 0;
    // Always re-applied (a ladder step back UP to 1 must restore full size).
    if (glowing) {
      const pixelRatio = renderer.getPixelRatio();
      bloom.setSize(Math.max(1, size.width * pixelRatio * bloomScale), Math.max(1, size.height * pixelRatio * bloomScale));
    }
  };
  const draw = (scene: THREE.Scene, camera: THREE.Camera, time: number, overlay: StageOverlay | undefined, toScreen: boolean) => {
    worldPass.scene = scene;
    worldPass.camera = camera;
    overlayPass.enabled = overlay !== undefined;
    if (overlay) {
      overlayPass.scene = overlay.scene;
      overlayPass.camera = overlay.camera;
    }
    uiCoverage.overlay = overlay;
    finishUniforms.uUiProtect.value = overlay ? 1 : 0;
    finishUniforms.uTime.value = time;
    frame = options.ditherFromTime ? Math.floor(Math.max(0, time) * 60) % 100000 : (frame + 1) % 100000;
    finishUniforms.uFrame.value = frame;
    // The paper is glued to the view sphere: the live camera (its lens-shifted inverse projection).
    finishUniforms.uInvProj.value = camera.projectionMatrixInverse;
    finishUniforms.uCamWorld.value = camera.matrixWorld;
    composer.renderToScreen = toScreen;
    composer.render();
  };
  return {
    render(scene, camera, time, overlay) {
      draw(scene, camera, time, overlay, true);
    },
    renderToTexture(scene, camera, time, overlay) {
      draw(scene, camera, time, overlay, false);
      // The last pass swapped its output into the read buffer.
      return composer.readBuffer.texture;
    },
    setLook(look) {
      if (look.vignette !== undefined) finishUniforms.uVig.value = look.vignette;
      if (look.grain !== undefined) finishUniforms.uGrain.value = look.grain;
      if (look.paper !== undefined) finishUniforms.uPaper.value = look.paper;
      if (look.halation !== undefined) finishUniforms.uHalo.value = look.halation;
      if (look.bloomStrength !== undefined) bloom.strength = look.bloomStrength;
      if (look.glowGain !== undefined) glow.composite.uniforms.uGain.value = look.glowGain;
    },
    setSize(width, height) {
      size = { width, height };
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      renderer.getDrawingBufferSize(drawingBuffer);
      (finishUniforms.uRes.value as THREE.Vector2).set(Math.max(1, drawingBuffer.x), Math.max(1, drawingBuffer.y));
      finishUniforms.uPR.value = renderer.getPixelRatio();
      applyBloom();
    },
    setBloomScale(scale) {
      bloomScale = scale;
      applyBloom();
    },
    setTones,
    dispose() {
      glow.dispose();
      halation.dispose();
      uiCoverage.dispose();
      bloom.dispose();
      output.dispose();
      finish.dispose();
      composer.dispose();
      target.dispose();
    },
  };
}

export { createAnimePost };
export type { AnimeLookOverrides, AnimePost, AnimePostOptions };
