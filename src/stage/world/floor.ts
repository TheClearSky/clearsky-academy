import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { AIR_GLSL, airUniforms } from '../engine/air';
import type { AssetClass, AssetOption, StageContext } from '../engine/contract';

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
 */

const OPTIONS: readonly AssetOption[] = [
  { id: 'checker', label: 'Matte checker', description: 'Box-filtered analytic checker, distance haze and a fake Fresnel sky sheen on the dark tiles.' },
  { id: 'mirror', label: 'Glossy mirror', description: 'The same checker over a half-resolution planar reflection: dark tiles mirror the scene. Draws the scene twice.' },
];

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
