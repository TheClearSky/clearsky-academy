import * as THREE from 'three';

/**
 * The poker-effects reference's backdrop: a violet radial god-ray sunburst
 * with soft bokeh, drawn behind the deck — and only there: it is masked to
 * a DOM element's rect (the deck section) and fades out softly at its edges
 * into the night stage (research › F6), so the night scene stays the
 * page's world.
 *
 * Two counter-rotating ray layers (24 and 37 rays, each ray's width random)
 * give depth; a radial core glow runs warm white → orchid → deep violet;
 * bokeh is cell-hashed discs drifting upward in screen space. One full-screen
 * draw, drawn first in the UI pass (premultiplied "over", in the OPAQUE
 * list, so it can never land on a card — v1's veil bug, review G3).
 */

type Sunburst = {
  mesh: THREE.Mesh;
  /** The element the burst sits behind (null hides it). */
  setTarget(element: HTMLElement | null): void;
  setStrength(strength: number): void;
  update(time: number, viewportWidth: number, viewportHeight: number): void;
  dispose(): void;
};

const VERTEX = /* glsl */ `
varying vec2 vScreen;
void main() {
  vScreen = position.xy + 0.5;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime, uStrength, uAspect;
uniform vec4 uRect; // centre x, centre y (0..1, y up), half width, half height (0..1)
varying vec2 vScreen;
float burstHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float burstHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rays(float angle, float count, float time) {
  float k = angle / 6.2831853 * count + time;
  float id = floor(k);
  float width = mix(0.18, 0.5, burstHash(id + count));
  float bright = mix(0.4, 1.0, burstHash(id + count * 3.1));
  return (1.0 - smoothstep(width * 0.5 - 0.08, width * 0.5 + 0.04, abs(fract(k) - 0.5))) * bright;
}
void main() {
  if (uStrength < 0.002) discard;
  vec2 centre = uRect.xy + vec2(0.0, uRect.w * 0.12);
  // Radius 1 = the target's larger half-extent (in screen-height units).
  vec2 p = (vScreen - centre) * vec2(uAspect, 1.0) / max(max(uRect.z * uAspect, uRect.w), 0.05);
  float r = length(p);
  float angle = atan(p.y, p.x + 1e-5);
  float falloff = 1.0 - smoothstep(0.55, 1.25, r);
  if (falloff < 0.001) discard;

  float burst = rays(angle, 24.0, uTime * 0.012) + 0.6 * rays(-angle, 37.0, uTime * 0.008);
  burst *= smoothstep(0.03, 0.3, r) * exp(-r * 1.4);
  vec3 core = mix(vec3(1.0, 0.86, 0.97), vec3(0.7, 0.35, 0.81), smoothstep(0.0, 0.3, r));
  core = mix(core, vec3(0.35, 0.16, 0.57), smoothstep(0.3, 0.8, r));
  float glow = exp(-r * 3.2);
  vec3 colour = core * (glow * 0.9 + 0.25) + vec3(0.91, 0.87, 0.95) * burst * 0.55;
  float alpha = clamp(glow * 0.75 + 0.35 + burst * 0.45, 0.0, 1.0);

  // Bokeh: soft discs on two drifting layers.
  for (int layer = 0; layer < 2; layer++) {
    float scale = layer == 0 ? 7.0 : 12.0;
    vec2 grid = vec2(vScreen.x * uAspect, vScreen.y) * scale + vec2(0.0, -uTime * (0.05 + 0.04 * float(layer)));
    vec2 cell = floor(grid);
    float pick = burstHash2(cell + float(layer) * 7.3);
    if (pick > 0.68) {
      vec2 offset = vec2(burstHash2(cell + 1.3), burstHash2(cell + 2.9)) - 0.5;
      float radius = mix(0.12, 0.3, burstHash2(cell + 4.1));
      float d = length(fract(grid) - 0.5 - offset * 0.5);
      float disc = (1.0 - smoothstep(radius * 0.8, radius, d)) * (0.55 + 0.45 * smoothstep(radius * 0.5, radius * 0.95, d));
      float hue = burstHash2(cell + 5.7);
      vec3 tint = hue < 0.25 ? vec3(1.0, 0.48, 0.78) : hue < 0.5 ? vec3(0.5, 0.89, 1.0) : hue < 0.75 ? vec3(1.0, 0.82, 0.48) : vec3(0.79, 0.66, 1.0);
      float twinkle = 0.6 + 0.4 * sin(uTime * 1.3 + pick * 40.0);
      colour += tint * disc * 0.22 * twinkle;
      alpha = max(alpha, disc * 0.22);
    }
  }
  alpha *= falloff * uStrength;
  gl_FragColor = vec4(colour * alpha, alpha);
  #include <colorspace_fragment>
}
`;

function createSunburst(): Sunburst {
  const uniforms = {
    uTime: { value: 0 },
    uStrength: { value: 1 },
    uAspect: { value: 1 },
    uRect: { value: new THREE.Vector4(0.5, 0.5, 0.3, 0.3) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -90;
  let target: HTMLElement | null = null;
  let strength = 1;

  return {
    mesh,
    setTarget(element) {
      target = element;
    },
    setStrength(value) {
      strength = value;
    },
    update(time, viewportWidth, viewportHeight) {
      uniforms.uTime.value = time;
      uniforms.uAspect.value = viewportWidth / Math.max(viewportHeight, 1);
      if (!target) {
        mesh.visible = false;
        return;
      }
      const rect = target.getBoundingClientRect();
      const onScreen = rect.bottom > 0 && rect.top < viewportHeight && rect.width > 0;
      mesh.visible = onScreen && strength > 0;
      uniforms.uStrength.value = strength;
      uniforms.uRect.value.set(
        (rect.left + rect.width / 2) / viewportWidth,
        1 - (rect.top + rect.height / 2) / viewportHeight,
        rect.width / 2 / viewportWidth,
        rect.height / 2 / viewportHeight,
      );
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

export { createSunburst };
export type { Sunburst };
