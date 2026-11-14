import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { AIR_GLSL, airUniforms } from '../engine/air';
import type { AssetClass, AssetOption, StageContext } from '../engine/contract';
import { NOISE_GLSL } from '../engine/glsl';
import { INLAY_INSET, KERB, lampLight, PATH_HALF_WIDTH, plazaFor } from './promenade/layout';
import { PATH_GLSL } from './promenade/pathShader';

/**
 * Floor class: the infinite black / lavender-white checker of the scene
 * reference.
 *
 * The checker is iq's exact BOX-FILTERED checker — the pattern integrated
 * over each pixel's footprint — so the edges are razor sharp near the
 * camera with no MSAA, and the far field converges to the true mean (a
 * smooth lavender band, exactly the reference's horizon glow) instead of
 * moiré. Past about one tile per pixel it fades to that mean outright, which
 * removes the last curved moiré at the far sides (the prototype's finding).
 * The dark tiles pick up a little of the sky's blue toward the horizon (a
 * Fresnel sheen), and the far field fogs into the sky behind it through
 * the shared air (`engine/air.ts`), so floor and sky meet without a line.
 *
 * Options:
 *  - `checker` — the procedural floor alone (one plane, ~10 ALU per pixel).
 *  - `mirror`  — the same floor as a half-resolution three.js `Reflector`:
 *    the dark tiles really mirror the motes, props and sky (25 %), the light
 *    tiles barely (5 %). The scene is drawn twice; desktop only.
 *  - `meadow`  — EXPERIMENT (2026-10-17, the promenade, `promenade/layout.ts`):
 *    no checker. A moonlit lawn, and drawn into it a royal footpath running
 *    straight away from the camera into the mist — pale limestone flags in
 *    courses, dark granite kerbs, a gold inlay line inside each kerb and gold
 *    lozenges down the middle — widening into a round plaza paved in rings
 *    under the summoning circle. The magic lamp's light pools on both. All
 *    patterns fade to their mean once a stone is a few pixels (no moiré).
 */

const OPTIONS: readonly AssetOption[] = [
  { id: 'checker', label: 'Matte checker', description: 'Box-filtered analytic checker, distance haze and a fake Fresnel sky sheen on the dark tiles.' },
  { id: 'mirror', label: 'Glossy mirror', description: 'The same checker over a half-resolution planar reflection: dark tiles mirror the scene. Draws the scene twice.' },
  { id: 'meadow', label: 'Meadow and royal path', description: 'A moonlit lawn with a paved royal footpath and a ringed plaza under the circle, lit by the magic lamp.' },
  { id: 'path', label: 'Lawn and brick path', description: 'The refined footpath (`promenade/pathShader.ts`): brick in a basket weave with relief, on a rolling, tufted lawn.' },
];

function pathMaterial(uniforms: Record<string, THREE.IUniform>, low: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    defines: low ? { LOW_DETAIL: '' } : {},
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `${PATH_GLSL}
      varying vec3 vWorld;
      void main() {
        gl_FragColor = vec4(airFog(meadowGround(vWorld), vWorld), 1.0);
      }`,
  });
}

const MEADOW_GLSL = /* glsl */ `${AIR_GLSL}
${NOISE_GLSL}
uniform vec4 uPath;   // half width, kerb, inlay inset, -
uniform vec2 uPlaza;  // centre z, radius
uniform vec4 uLamp;   // x, y, z, strength
uniform vec3 uLampColour;
uniform vec3 uKeyDirection, uKeyColour, uAmbientSky;
/** How much detail a pixel can hold for cells of this coordinate (1 near, 0 once a cell is ~3 px). */
float detailOf(vec2 cells) {
  vec2 w = fwidth(cells);
  return 1.0 - smoothstep(0.2, 0.45, max(w.x, w.y));
}
/** A joint line of width j (cell units) at the cell edges of f, anti-aliased by the cell's footprint. */
float jointsOf(vec2 f, vec2 cells, vec2 j) {
  vec2 w = fwidth(cells) + 1e-4;
  vec2 e = min(f, 1.0 - f);
  return 1.0 - smoothstep(j.x, j.x + w.x * 1.5, e.x) * smoothstep(j.y, j.y + w.y * 1.5, e.y);
}
vec3 lawn(vec3 p) {
  float field = fbm3(p.xz * 0.08);
  vec3 grass = mix(vec3(0.040, 0.120, 0.070), vec3(0.090, 0.200, 0.100), field);
  // Blade-scale speckle near the eye, smoothed away with distance.
  float speckle = vnoise(p.xz * 7.0) * detailOf(p.xz * 7.0);
  grass *= 0.85 + 0.3 * speckle;
  // A dew-silvered sheen toward the horizon.
  return grass;
}
vec3 flagstones(vec3 p, float across) {
  // Courses across the path, three to four flags per course, staggered.
  float rowF = -p.z / 0.85;
  float row = floor(rowF);
  float u = (p.x + 7.0) / (0.95 + 0.35 * hash12(vec2(row, 1.3))) + hash12(vec2(row, 7.7));
  float col = floor(u);
  vec2 cells = vec2(u, rowF);
  float detail = detailOf(cells);
  float joint = jointsOf(vec2(fract(u), fract(rowF)), cells, vec2(0.035, 0.045)) * detail;
  float h = hash12(vec2(col * 3.1, row * 1.7));
  vec3 stone = mix(vec3(0.33, 0.32, 0.30), vec3(0.42, 0.40, 0.36), h) * (0.9 + 0.2 * hash12(vec2(row, col + 4.0)));
  stone = mix(vec3(0.37, 0.36, 0.33), stone, 0.4 + 0.6 * detail);
  // Worn smooth and paler down the middle where feet go.
  stone *= 1.0 + 0.12 * (1.0 - smoothstep(0.0, 0.9, abs(across)));
  return mix(stone, vec3(0.08, 0.08, 0.09), joint);
}
vec3 plazaStones(vec3 p, vec2 centre) {
  vec2 d = p.xz - centre;
  float r = length(d);
  float ringF = r / 0.75;
  float ring = floor(ringF);
  float count = max(6.0, floor(6.2831853 * (ring + 0.5) * 0.75 / 0.9));
  float a = atan(d.y, d.x) / 6.2831853 + 0.5 + hash12(vec2(ring, 2.0));
  float u = a * count;
  vec2 cells = vec2(u, ringF);
  float detail = detailOf(cells);
  float joint = jointsOf(vec2(fract(u), fract(ringF)), cells, vec2(0.04, 0.05)) * detail;
  float h = hash12(vec2(floor(u), ring));
  vec3 stone = mix(vec3(0.34, 0.33, 0.31), vec3(0.43, 0.41, 0.37), h);
  stone = mix(vec3(0.38, 0.37, 0.34), stone, 0.4 + 0.6 * detail);
  return mix(stone, vec3(0.08, 0.08, 0.09), joint);
}
vec3 kerbStones(vec3 p) {
  float u = -p.z / 0.6;
  float detail = detailOf(vec2(u, 0.0));
  float joint = (1.0 - smoothstep(0.04, 0.04 + fwidth(u) * 1.5, min(fract(u), 1.0 - fract(u)))) * detail;
  vec3 granite = vec3(0.13, 0.13, 0.15) * (0.85 + 0.3 * hash12(vec2(floor(u), 5.0)));
  return mix(granite, vec3(0.04), joint);
}
/** The lawn, the path and the plaza at p, before light. emissive: the gold inlay's own sheen. */
vec3 meadowColour(vec3 p, out float gold) {
  gold = 0.0;
  float halfWidth = uPath.x;
  float kerb = uPath.y;
  float across = p.x;
  float dPath = abs(across) - halfWidth;
  float plazaR = length(p.xz - vec2(0.0, uPlaza.x)) - uPlaza.y;
  // The lawn's edge is not a ruler line: a little noise eats into the kerb's outer side.
  float ragged = (vnoise(p.xz * 2.3) - 0.5) * 0.12;
  float onPlaza = step(plazaR, 0.0);
  float onPath = step(dPath, 0.0) * step(p.z, 1.0);
  vec3 colour = lawn(p);
  // Kerbs: along the path's sides (not across the plaza), and round the plaza.
  float kerbPath = step(dPath, kerb + ragged) * step(0.0, dPath) * step(0.0, plazaR) * step(p.z, 1.0);
  float kerbPlaza = step(plazaR, kerb + ragged) * step(0.0, plazaR) * step(0.0, dPath);
  if (kerbPath + kerbPlaza > 0.0) colour = kerbStones(p);
  if (onPath > 0.5) colour = flagstones(p, across / halfWidth);
  if (onPlaza > 0.5) colour = plazaStones(p, vec2(0.0, uPlaza.x));
  // Gold: a line inside each kerb (off the plaza), a ring inside the plaza's edge, lozenges down the middle.
  float px = fwidth(p.x) + fwidth(p.z);
  float line = (1.0 - smoothstep(0.03, 0.03 + px, abs(dPath + uPath.z))) * onPath * step(0.0, plazaR);
  float ring = (1.0 - smoothstep(0.035, 0.035 + px, abs(plazaR + uPath.z * 2.0))) * onPlaza;
  vec2 lozenge = vec2(abs(across), abs(fract(-p.z / 4.0) - 0.5) * 4.0);
  float diamond = (1.0 - smoothstep(0.0, px * 2.0, lozenge.x / 0.32 + lozenge.y / 0.55 - 1.0)) * onPath * step(0.0, plazaR);
  gold = max(max(line, ring), diamond * 0.9);
  colour = mix(colour, vec3(0.62, 0.48, 0.22), gold);
  return colour;
}
/** Moonlight and the magic lamp on the ground (normal up). */
vec3 lightMeadow(vec3 colour, vec3 p, float gold) {
  vec3 lit = colour * (uAmbientSky * 2.2 + uKeyColour * max(uKeyDirection.y, 0.0) * 0.75);
  vec3 toLamp = uLamp.xyz - p;
  float d2 = dot(toLamp, toLamp);
  float lamp = uLamp.w * max(toLamp.y, 0.0) / sqrt(d2 + 1e-4) / (1.0 + d2 * 0.09);
  lit += colour * uLampColour * lamp;
  // The gold catches the lamp and the moon.
  lit += gold * vec3(0.9, 0.7, 0.35) * (0.08 + lamp * 0.6);
  return lit;
}
`;

function meadowMaterial(uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `${MEADOW_GLSL}
      varying vec3 vWorld;
      void main() {
        float gold;
        vec3 colour = meadowColour(vWorld, gold);
        colour = lightMeadow(colour, vWorld, gold);
        gl_FragColor = vec4(airFog(colour, vWorld), 1.0);
      }`,
  });
}

/** Tile size in metres: about 15 tiles across the bottom of the frame. */
const TILE = 0.95;
const FLOOR_SIZE = 6000;

const CHECKER_GLSL = /* glsl */ `${AIR_GLSL}
uniform vec3 uTileLight, uTileDark, uSheen;
uniform float uTile;
// iq, "filterable procedurals": the checker's box-filtered integral over the pixel footprint.
float checker(vec2 p) {
  vec2 w = max(abs(dFdx(p)), abs(dFdy(p))) + 1e-4;
  vec2 i = 2.0 * (abs(fract((p - 0.5 * w) * 0.5) - 0.5) - abs(fract((p + 0.5 * w) * 0.5) - 0.5)) / w;
  float c = 0.5 - 0.5 * i.x * i.y;
  return mix(c, 0.5, smoothstep(0.7, 1.6, max(w.x, w.y)));
}
vec3 floorColour(vec3 worldPosition, out float lightness) {
  float c = checker(worldPosition.xz / uTile);
  lightness = c;
  vec3 toPoint = worldPosition - cameraPosition;
  float distance = length(toPoint);
  vec3 colour = mix(uTileDark, uTileLight, c);
  colour *= mix(1.0, 0.8, smoothstep(4.0, 40.0, distance));
  float fresnel = pow(1.0 - abs(normalize(toPoint).y), 5.0);
  colour += (1.0 - c) * uSheen * fresnel * 0.6;
  return colour;
}
`;

function checkerMaterial(uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `${CHECKER_GLSL}
      varying vec3 vWorld;
      void main() {
        float lightness;
        vec3 colour = floorColour(vWorld, lightness);
        gl_FragColor = vec4(airFog(colour, vWorld), 1.0);
      }`,
  });
}

/** A Reflector shader (its `color`, `tDiffuse` and `textureMatrix` uniforms
 *  are filled in by the Reflector) that mixes the reflection into the
 *  checker by tile lightness. */
function mirrorShader(uniforms: Record<string, THREE.IUniform>) {
  return {
    name: 'StageMirrorFloor',
    uniforms: {
      ...uniforms,
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vReflectUv;
      varying vec3 vWorld;
      void main() {
        vReflectUv = textureMatrix * vec4(position, 1.0);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `${CHECKER_GLSL}
      uniform sampler2D tDiffuse;
      varying vec4 vReflectUv;
      varying vec3 vWorld;
      void main() {
        float lightness;
        vec3 colour = floorColour(vWorld, lightness);
        vec3 reflection = texture2DProj(tDiffuse, vReflectUv).rgb;
        colour += reflection * mix(0.25, 0.05, lightness);
        gl_FragColor = vec4(airFog(colour, vWorld), 1.0);
      }`,
  };
}

function create(context: StageContext): AssetClass {
  const { palette, renderer } = context;
  const uniforms = {
    uTileLight: { value: palette.tileLight },
    uTileDark: { value: palette.tileDark },
    uSheen: { value: palette.floorSheen },
    ...airUniforms(palette),
    uTile: { value: TILE },
  };
  // The meadow's own (the promenade experiment).
  const plaza = plazaFor(16 / 9);
  const meadowUniforms = {
    ...airUniforms(palette),
    uPath: { value: new THREE.Vector4(PATH_HALF_WIDTH, KERB, INLAY_INSET, 0) },
    uPlaza: { value: new THREE.Vector2(plaza.z, plaza.radius) },
    uLamp: { value: new THREE.Vector4(...lampLight(16 / 9), 4) },
    uLampColour: { value: new THREE.Color('#9fe6ff') },
    uKeyDirection: { value: new THREE.Vector3(-0.45, 0.8, 0.4).normalize() },
    uKeyColour: { value: palette.moonlight },
    uAmbientSky: { value: palette.ambientSky },
  };
  const geometry = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE).rotateX(-Math.PI / 2);
  let mesh: THREE.Mesh | null = null;
  let current = '';

  const setOption = (id: string) => {
    if (id === current) return;
    if (!OPTIONS.some((option) => option.id === id)) throw new Error(`[floor] unknown option "${id}"`);
    if (mesh) {
      context.scene.remove(mesh);
      (mesh.material as THREE.Material).dispose();
      if (mesh instanceof Reflector) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
    }
    if (id === 'mirror') {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      // Reflector's own geometry is in its local XY plane, facing +Z: lay it down.
      const plane = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE);
      const reflector = new Reflector(plane, {
        textureWidth: Math.max(256, Math.round(size.x / 2)),
        textureHeight: Math.max(256, Math.round(size.y / 2)),
        clipBias: 0.003,
        multisample: 0,
        shader: mirrorShader(uniforms),
      });
      reflector.rotateX(-Math.PI / 2);
      // Reflector CLONES its shader's uniforms: point the air's back at the
      // shared objects, or the mirror floor's mist would never drift.
      const reflectorUniforms = (reflector.material as THREE.ShaderMaterial).uniforms;
      for (const [name, uniform] of Object.entries(airUniforms(palette))) reflectorUniforms[name] = uniform;
      mesh = reflector;
    } else if (id === 'meadow') {
      mesh = new THREE.Mesh(geometry, meadowMaterial(meadowUniforms));
    } else if (id === 'path') {
      mesh = new THREE.Mesh(geometry, pathMaterial(meadowUniforms, context.tier.tier === 'low'));
    } else {
      mesh = new THREE.Mesh(geometry, checkerMaterial(uniforms));
    }
    context.scene.add(mesh);
    current = id;
  };

  setOption('checker');

  return {
    id: 'floor',
    label: 'Floor',
    options: OPTIONS,
    current: () => current,
    setOption,
    setAspect(aspect) {
      // The plaza follows the summoning circle (nearer and smaller on a tall screen).
      const next = plazaFor(aspect);
      meadowUniforms.uPlaza.value.set(next.z, next.radius);
      const [x, y, z] = lampLight(aspect);
      meadowUniforms.uLamp.value.set(x, y, z, meadowUniforms.uLamp.value.w);
    },
    dispose() {
      if (mesh) {
        context.scene.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        if (mesh instanceof Reflector) {
          mesh.geometry.dispose();
          mesh.dispose();
        }
      }
      geometry.dispose();
    },
  };
}

export { create };
