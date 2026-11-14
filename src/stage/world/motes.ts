import * as THREE from 'three';
import { AIR_GLSL, airUniforms } from '../engine/air';
import { worldBufferSize } from '../engine/contract';
import type { AssetClass, AssetOption, StageContext } from '../engine/contract';
import { moteLayout } from './moteLayout';

/**
 * Motes class: the small particles hanging over the horizon in the scene
 * reference — most faintly glowing, some dark — drawn ROUND (the owner:
 * "change the square particles to circles").
 *
 * Drawn the hellscape's way (Nodestra `hell-10-particles-and-mist-sparks.ts`):
 * INSTANCED camera-facing quads, never `THREE.Points` (which stalled that
 * machine's ANGLE/D3D11 path and caps the sprite size), sized in pixels from
 * the projection and clamped, faded in near the lens, dimmed by the shared
 * air's fog. One draw with PREMULTIPLIED "over" blending: a bright mote
 * writes colour with alpha 0 (purely additive), a dark mote writes black
 * with alpha (it occludes).
 *
 * Options:
 *  - `circles` — crisp round dots with a soft halo (the hellscape's round
 *    falloff reaches exactly 0 inside the quad: no square ever shows).
 *  - `bokeh` — larger, out-of-focus discs with a brighter rim, like the
 *    defocused lights of a photograph (the poker-effects reference).
 *
 * Both drift, bob and slowly rise (wrapping), and honour the runtime
 * ladder's mote budget.
 */

const OPTIONS: readonly AssetOption[] = [
  { id: 'circles', label: 'Round motes', description: 'Instanced round dots with a soft halo plus a third dark ones, premultiplied over (hellscape embers technique).' },
  { id: 'bokeh', label: 'Bokeh discs', description: 'Larger out-of-focus discs with a bright rim, like defocused lights.' },
];

const VERTEX = /* glsl */ `${AIR_GLSL}
attribute vec3 aOrigin;
attribute float aSeed;
uniform float uTime, uSizeScale;
uniform vec2 uViewport;
varying vec2 vCorner;
varying float vSeed;
varying float vFade;
// The owner: "particles too slow, make them faster" — the drift runs ×2.6
// and every mote climbs steadily (0.25–0.6 m/s), wrapping back to the floor.
vec3 driftMote(vec3 p, float seed, float time) {
  float fast = time * 2.6;
  p.y += sin(fast * (0.2 + 0.3 * seed) + seed * 40.0) * 0.6 + time * (0.25 + 0.35 * seed);
  p.x += sin(fast * 0.13 + seed * 17.0) * 0.8 + sin(fast * 0.07 + seed * 5.0) * 0.6;
  p.y = mod(p.y, 8.0) + 0.3;
  return p;
}
void main() {
  vec3 world = driftMote(aOrigin, aSeed, uTime);
  vec4 view = viewMatrix * vec4(world, 1.0);
  float depth = max(-view.z, 0.05);
  float size = mix(0.045, 0.15, pow(fract(aSeed * 7.3), 3.0)) * uSizeScale;
  float focal = projectionMatrix[1][1] * uViewport.y * 0.5;
  float radiusPx = clamp(size * focal / depth, 1.2, 9.0 * uSizeScale * uViewport.y / 900.0);
  vec4 clip = projectionMatrix * view;
  clip.xy += position.xy * radiusPx / (uViewport * 0.5) * clip.w;
  gl_Position = clip;
  vCorner = position.xy;
  vSeed = aSeed;
  // Near fade (no pop at the lens), then the air: an additive light only dims.
  vFade = smoothstep(1.0, 3.0, depth) * (1.0 - airFogAmount(world));
  // Fade in from the floor and out at the top, so the wrap never pops.
  vFade *= smoothstep(0.3, 1.2, world.y) * (1.0 - smoothstep(7.2, 8.3, world.y));
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime, uBokeh;
uniform vec3 uMote;
varying vec2 vCorner;
varying float vSeed;
varying float vFade;
void main() {
  float d = length(vCorner);
  if (d > 1.0) discard;
  bool darkMote = fract(vSeed * 13.7) < 0.3;
  if (uBokeh > 0.5) {
    // A defocused light: flat disc, a brighter rim, a soft edge.
    float disc = 1.0 - smoothstep(0.82, 1.0, d);
    float rim = smoothstep(0.55, 0.9, d) * disc;
    float shimmer = 0.8 + 0.2 * sin(uTime * 1.3 + vSeed * 40.0);
    if (darkMote) { gl_FragColor = vec4(vec3(0.0), disc * 0.25 * vFade); return; }
    gl_FragColor = vec4(uMote * (disc * 0.28 + rim * 0.35) * shimmer * vFade, 0.0);
    return;
  }
  float core = 1.0 - smoothstep(0.28, 0.4, d);
  float glow = pow(max(1.0 - d, 0.0), 2.0) * 0.6;
  if (darkMote) { gl_FragColor = vec4(vec3(0.0), core * 0.85 * vFade); return; }
  float twinkle = 0.75 + 0.25 * sin(uTime * 2.0 + vSeed * 50.0);
  gl_FragColor = vec4(uMote * (core * 1.6 + glow) * twinkle * vFade, 0.0);
}
`;

function create(context: StageContext): AssetClass {
  const count = context.tier.motes;
  const layout = moteLayout(count);
  const viewport = { value: new THREE.Vector2(1, 1) };
  const quad = new THREE.PlaneGeometry(2, 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(layout.positions, 3));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(layout.seeds, 1));
  geometry.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...airUniforms(context.palette),
      uTime: context.uniforms.uTime,
      uViewport: viewport,
      uMote: { value: context.palette.mote },
      uSizeScale: { value: 1 },
      uBokeh: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  context.scene.add(mesh);
  const drawingBuffer = new THREE.Vector2();
  let current = '';

  const setOption = (id: string) => {
    if (id === current) return;
    if (!OPTIONS.some((option) => option.id === id)) throw new Error(`[motes] unknown option "${id}"`);
    const bokeh = id === 'bokeh';
    material.uniforms.uBokeh.value = bokeh ? 1 : 0;
    material.uniforms.uSizeScale.value = bokeh ? 2.6 : 1;
    current = id;
  };

  setOption('circles');

  return {
    id: 'motes',
    label: 'Motes',
    options: OPTIONS,
    current: () => current,
    setOption,
    update() {
      viewport.value.copy(worldBufferSize(context, drawingBuffer));
    },
    setMoteBudget(next) {
      geometry.instanceCount = Math.max(0, Math.min(count, Math.round(next)));
    },
    dispose() {
      context.scene.remove(mesh);
      quad.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

export { create };
