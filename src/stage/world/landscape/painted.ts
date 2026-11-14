import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from '../../engine/random';
import type { StagePalette } from '../../engine/palette';
import { LANDSCAPE_GLSL, landUniforms } from './kit';

/**
 * PAINTED TREES — the hero trees, ported from Nodestra's meadow trees
 * (`react-blender-nodes-sound/src/landing/meadow/env/{foliage,tree2,sakura}.ts`)
 * after Deepak: "the tree is too undetailed, see nodestra trees".
 *
 * What makes them read (all Nodestra's, kept):
 *  - the crown is a list of spherical CLUMPS gathered into big LOBES on an
 *    ellipsoidal shell, a few hanging, the bottom-centre left open so the
 *    limbs show; every clump is fed by its own twig from the nearest limb;
 *  - LEAF CARDS: camera-facing quads scattered through each clump (more near
 *    its surface), cut from a canvas ATLAS of brush dabs — jagged leaf stamps
 *    (oak), five-petal blossoms (blossom);
 *  - each dab's fill ENCODES its own centre, so the shader lights the whole
 *    dab at one point: every leaf is one flat stroke of paint (the mosaic);
 *  - SPHERISED shading: the normal blends the clump's, the lobe's and the
 *    whole crown's, then five painted tone bands, a per-dab jitter, a broad
 *    brush-pressure fbm, and occlusion by the other clumps toward the light;
 *  - painted bark: tapered tubes with root flares, three tones and moss.
 *
 * Adapted to this scene: the light is the moon (`uKeyDirection`, fixed — so
 * the clump occlusion is computed ONCE on the CPU per card instead of per
 * vertex per frame), the tones are a moonlit night's, the "translucency" is
 * the sky's silver rim on the crown's edge, and the air is the landscape's
 * (`landFog`). Built in Nodestra's own units (an oak ~12.5 m) and scaled by
 * the caller, so every density and card size is exactly as tuned there.
 */

type Clump = { centre: THREE.Vector3; radius: number; lobe?: { centre: THREE.Vector3; radius: number } };
type PaintedKind = 'oak' | 'blossom';

/** The moon's direction (the stage rig's key light, `engine/lighting.ts`). */
const MOON = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();

// ── the tapered tube (Nodestra's) ─────────────────────────────────────────

function taperedTube(curve: THREE.Curve<THREE.Vector3>, segments: number, radial: number, radius: (t: number, angle: number) => number): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const length = curve.getLength();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a)).normalize();
      const r = radius(t, a);
      positions.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      normals.push(n.x, n.y, n.z);
      uvs.push(j / radial, t * length);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// ── the leaf atlas (Nodestra's canvas dabs) ─────────────────────────────

/** Each dab's fill = (its centre x, its centre y, a random value); alpha = coverage. */
function makeLeafAtlas(kind: PaintedKind, seed: number): THREE.Texture {
  if (typeof document === 'undefined') {
    // No canvas (tests): a flat opaque texture; the geometry is what is tested.
    const texture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    texture.needsUpdate = true;
    return texture;
  }
  const SIZE = 1024;
  const CELL = SIZE / 2;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, SIZE, SIZE);
  const rnd = seededRandom(seed);
  const fill = (cx: number, cy: number, r: number) => {
    ctx.fillStyle = `rgb(${Math.round(cx * 255)}, ${Math.round((1 - cy) * 255)}, ${Math.round(r * 255)})`;
  };
  const leafPath = (len: number, width: number) => {
    ctx.beginPath();
    ctx.moveTo(-len * 0.5, 0);
    ctx.bezierCurveTo(-len * 0.2, -width, len * 0.25, -width * 0.9, len * 0.5, 0);
    ctx.bezierCurveTo(len * 0.25, width * 0.9, -len * 0.2, width, -len * 0.5, 0);
    ctx.closePath();
  };
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * CELL;
    const oy = Math.floor(cell / 2) * CELL;
    if (kind === 'oak') {
      // A rounded spray of jagged leaf stamps, pointing outward.
      const count = 44 + Math.floor(rnd() * 10);
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 0.34 * Math.sqrt(rnd());
        const cx = 0.5 + Math.cos(a) * r;
        const cy = 0.5 + Math.sin(a) * r;
        const len = (0.13 + rnd() * 0.09) * (1 - r * 0.6);
        const rot = a + (rnd() - 0.5) * 1.3;
        fill(cx, cy, rnd());
        ctx.save();
        ctx.translate(ox + cx * CELL, oy + cy * CELL);
        ctx.rotate(rot);
        const lobes = 2 + Math.floor(rnd() * 2);
        for (let k = 0; k < lobes; k++) {
          ctx.save();
          ctx.rotate((k - (lobes - 1) / 2) * 0.55 + (rnd() - 0.5) * 0.2);
          ctx.translate(len * 0.12, 0);
          leafPath(len * CELL * (k === 1 ? 1 : 0.8), len * CELL * 0.24);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }
    } else {
      // Bunches of five-petal blossoms.
      const bunches = 6 + Math.floor(rnd() * 3);
      for (let b = 0; b < bunches; b++) {
        const ba = rnd() * Math.PI * 2;
        const br = 0.3 * Math.sqrt(rnd());
        const bx = 0.5 + Math.cos(ba) * br;
        const by = 0.5 + Math.sin(ba) * br;
        const n = 6 + Math.floor(rnd() * 6);
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2;
          const r = 0.09 * Math.sqrt(rnd());
          const cx = bx + Math.cos(a) * r;
          const cy = by + Math.sin(a) * r;
          if (Math.hypot(cx - 0.5, cy - 0.5) > 0.43) continue;
          const size = (0.032 + rnd() * 0.022) * CELL;
          ctx.save();
          ctx.translate(ox + cx * CELL, oy + cy * CELL);
          ctx.rotate(rnd() * Math.PI * 2);
          fill(cx, cy, 0.12 + rnd() * 0.88);
          for (let k = 0; k < 5; k++) {
            ctx.save();
            ctx.rotate((k / 5) * Math.PI * 2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(size * 0.55, -size * 0.55, size * 1.05, -size * 0.4, size * 1.0, -size * 0.08);
            ctx.lineTo(size * 0.86, 0);
            ctx.lineTo(size * 1.0, size * 0.08);
            ctx.bezierCurveTo(size * 1.05, size * 0.4, size * 0.55, size * 0.55, 0, 0);
            ctx.fill();
            ctx.restore();
          }
          fill(cx, cy, 0.02);
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// ── the cards ───────────────────────────────────────────────────────────

type CardOptions = { density: number; size: [number, number]; flatten: number; shell: number };

/** Occlusion of a point by the OTHER clumps toward the moon (Nodestra's clumpOcclusion, once, on the CPU). */
function moonOcclusion(p: THREE.Vector3, clumps: Clump[], self: number): number {
  let occ = 0;
  const d = new THREE.Vector3();
  for (let i = 0; i < clumps.length; i++) {
    if (i === self) continue;
    const c = clumps[i];
    d.subVectors(c.centre, p);
    const t = d.dot(MOON);
    if (t < 0) continue;
    const d2 = d.lengthSq() - t * t;
    const r2 = c.radius * c.radius;
    occ += (1 - THREE.MathUtils.smoothstep(d2, r2 * 0.1, r2 * 1.1)) * Math.min(t / c.radius, 1);
  }
  return 1 - Math.exp(-occ * 0.85);
}

function buildCards(clumps: Clump[], rnd: () => number, options: CardOptions): THREE.InstancedBufferGeometry {
  const aCard: number[] = [];
  const aClump: number[] = [];
  const aInfo: number[] = [];
  const aLobe: number[] = [];
  const aOcc: number[] = [];
  // Occlusion toward the moon, once per clump (n² over ~120 clumps, not per card); each card then
  // shades a little lighter on its clump's moon side and darker on the far side.
  const clumpOcclusion = clumps.map((clump, ci) => moonOcclusion(clump.centre, clumps, ci));
  clumps.forEach((clump, ci) => {
    const lobe = clump.lobe ?? clump;
    const count = Math.max(6, Math.round(options.density * clump.radius * clump.radius));
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      const l = dir.lengthSq();
      if (l > 1 || l < 1e-4) {
        i--;
        continue;
      }
      dir.normalize();
      dir.y *= options.flatten;
      const depth = Math.pow(rnd(), 1 / options.shell);
      const p = clump.centre.clone().addScaledVector(dir, clump.radius * depth);
      const size = options.size[0] + rnd() * (options.size[1] - options.size[0]);
      aCard.push(p.x, p.y, p.z, size * (0.75 + (0.25 * clump.radius) / 1.4));
      aClump.push(clump.centre.x, clump.centre.y, clump.centre.z, clump.radius);
      aLobe.push(lobe.centre.x, lobe.centre.y, lobe.centre.z, lobe.radius);
      aInfo.push(Math.floor(rnd() * 4), rnd() * Math.PI * 2, rnd(), depth);
      aOcc.push(THREE.MathUtils.clamp(clumpOcclusion[ci] - dir.dot(MOON) * depth * 0.25, 0, 1));
    }
  });
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('aCard', new THREE.InstancedBufferAttribute(new Float32Array(aCard), 4));
  geometry.setAttribute('aClump', new THREE.InstancedBufferAttribute(new Float32Array(aClump), 4));
  geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(aInfo), 4));
  geometry.setAttribute('aLobe', new THREE.InstancedBufferAttribute(new Float32Array(aLobe), 4));
  geometry.setAttribute('aOcc', new THREE.InstancedBufferAttribute(new Float32Array(aOcc), 1));
  geometry.instanceCount = aCard.length / 4;
  return geometry;
}

// ── the materials ───────────────────────────────────────────────────────

/** Wind (local units): the crown bends more with height, slowly, out of phase across it. */
const SWAY_GLSL = /* glsl */ `
uniform float uSway;
vec3 treeSway(vec3 p) {
  float k = smoothstep(2.0, 10.0, p.y) * (0.55 + 0.45 * smoothstep(0.0, 6.0, length(p.xz)));
  return vec3(sin(uTime * 0.7 + p.y * 0.35 + p.x * 0.2), 0.0, cos(uTime * 0.53 + p.z * 0.3 + p.y * 0.2) * 0.6) * uSway * k;
}
`;

type FoliageLook = {
  /** Five painted tones, darkest → brightest. */
  tones: [string, string, string, string, string];
  steps: [number, number, number, number];
  /** The sky's silver on the crown's rim. */
  rim: number;
  /** Normal blend: clump, lobe, crown. */
  weights: [number, number, number];
  lift: number;
  jitter: number;
  occlusion: number;
  /** Ambient floor (blossom stays luminous in its shade). */
  floor: number;
  soften: number;
  /** A blossom's eye colour (blossom only). */
  eye?: string;
};

function createFoliageMaterial(palette: StagePalette, time: { value: number }, haze: number, atlas: THREE.Texture, crown: { centre: THREE.Vector3; radii: THREE.Vector3 }, look: FoliageLook): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...landUniforms(palette, time, haze),
      tLeaf: { value: atlas },
      uTone: { value: look.tones.map((tone) => new THREE.Color(tone)) },
      uSteps: { value: new THREE.Vector4(...look.steps) },
      uRimGain: { value: look.rim },
      uWeights: { value: new THREE.Vector3(...look.weights) },
      uLift: { value: look.lift },
      uJitter: { value: look.jitter },
      uOccl: { value: look.occlusion },
      uFloor: { value: look.floor },
      uSoften: { value: look.soften },
      uEye: { value: new THREE.Color(look.eye ?? '#000000') },
      uCrownC: { value: crown.centre.clone() },
      uCrownR: { value: crown.radii.clone() },
      uSway: { value: 0.12 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      ${SWAY_GLSL}
      uniform vec3 uCrownC;
      uniform vec3 uCrownR;
      attribute vec4 aCard;
      attribute vec4 aClump;
      attribute vec4 aInfo;
      attribute vec4 aLobe;
      attribute float aOcc;
      varying vec2 vUv;
      varying vec3 vCentre;
      varying vec3 vAxX;
      varying vec3 vAxY;
      varying vec4 vClump;
      varying vec4 vLobe;
      varying vec3 vCrownC;
      varying vec3 vCrownR;
      varying float vOcc;
      varying float vDepth;
      void main() {
        float scale = length(modelMatrix[0].xyz);
        vec3 sway = treeSway(aClump.xyz);
        float flutter = sin(uTime * (2.2 + aInfo.z * 3.0) + aInfo.z * 40.0) * 0.05;
        vec3 centre = (modelMatrix * vec4(aCard.xyz + sway + vec3(0.0, flutter * 0.1, 0.0), 1.0)).xyz;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float a = aInfo.y + flutter;
        vec3 ax = (right * cos(a) + up * sin(a)) * aCard.w * scale;
        vec3 ay = (-right * sin(a) + up * cos(a)) * aCard.w * scale;
        vec3 p = centre + ax * position.x + ay * position.y;
        float cell = aInfo.x;
        vUv = (vec2(mod(cell, 2.0), floor(cell / 2.0)) + position.xy * 0.5 + 0.5) * 0.5;
        vUv.y = 1.0 - vUv.y;
        vCentre = centre;
        vAxX = ax;
        vAxY = ay;
        vClump = vec4((modelMatrix * vec4(aClump.xyz + sway, 1.0)).xyz, aClump.w * scale);
        vLobe = vec4((modelMatrix * vec4(aLobe.xyz + sway, 1.0)).xyz, aLobe.w * scale);
        vCrownC = (modelMatrix * vec4(uCrownC, 1.0)).xyz;
        vCrownR = uCrownR * scale;
        vOcc = aOcc;
        vDepth = aInfo.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `${LANDSCAPE_GLSL}
      uniform sampler2D tLeaf;
      uniform vec3 uTone[5];
      uniform vec4 uSteps;
      uniform float uRimGain;
      uniform vec3 uWeights;
      uniform float uLift;
      uniform float uJitter;
      uniform float uOccl;
      uniform float uFloor;
      uniform float uSoften;
      uniform vec3 uEye;
      varying vec2 vUv;
      varying vec3 vCentre;
      varying vec3 vAxX;
      varying vec3 vAxY;
      varying vec4 vClump;
      varying vec4 vLobe;
      varying vec3 vCrownC;
      varying vec3 vCrownR;
      varying float vOcc;
      varying float vDepth;
      float band(float x, float edge) { return smoothstep(edge - uSoften - 0.004, edge + uSoften + 0.004, x); }
      void main() {
        vec4 tx = texture2D(tLeaf, vUv);
        if (tx.a < 0.4) discard;
        // The dab's own centre: the whole leaf is lit at one point (one stroke of paint).
        vec2 lc = vec2(tx.r, tx.g) * 2.0 - 1.0;
        vec3 L = vCentre + vAxX * lc.x + vAxY * lc.y;
        vec3 nC = normalize(L - vClump.xyz);
        vec3 nK = normalize((L - vCrownC) / vCrownR);
        vec3 nL = normalize(L - vLobe.xyz);
        vec3 n = normalize(nC * uWeights.x + nL * uWeights.y + nK * uWeights.z);
        vec3 V = normalize(L - cameraPosition);
        float ndl = dot(n, normalize(uKeyDirection + vec3(0.0, uLift, 0.0)));
        float occ = vOcc * uOccl;
        float light = (ndl * 0.5 + 0.5) * (1.0 - occ * 0.75);
        light *= mix(0.82, 1.0, vDepth);
        light = mix(light, 1.0, uFloor);
        light += (tx.b - 0.5) * uJitter;
        light += max(nL.y, 0.0) * 0.12;
        // Broad brush-pressure across the crown (in crown units: the same strokes at any scale).
        vec3 q = (L - vCrownC) / max(vCrownR.x, 1e-3) * 3.3;
        light += (fbm3(q.xz * 0.45 + q.y * 0.3) - 0.5) * 0.16;
        vec3 col = uTone[0];
        col = mix(col, uTone[1], band(light, uSteps.x));
        col = mix(col, uTone[2], band(light, uSteps.y));
        col = mix(col, uTone[3], band(light, uSteps.z));
        col = mix(col, uTone[4], band(light, uSteps.w));
        if (uEye.r + uEye.g + uEye.b > 0.0 && tx.b < 0.06) col = mix(col, uEye * (0.55 + 0.6 * light), 0.75);
        // The sky's silver on the crown's edge (where a crown meets the night sky).
        float rim = 1.0 - abs(dot(nK, V));
        col += uRimColour * pow(rim, 3.0) * uRimGain * (1.0 - occ) * mix(0.55, 1.0, vDepth);
        gl_FragColor = vec4(landFog(col, L), smoothstep(0.4, 0.62, tx.a));
      }
    `,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
  });
}

type BarkLook = { dark: string; mid: string; lit: string; moss: string };

/** Painted bark: three tones by the moon, moss on the upward faces, swaying with its crown. */
function createBarkMaterial(palette: StagePalette, time: { value: number }, haze: number, look: BarkLook): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...landUniforms(palette, time, haze),
      uDark: { value: new THREE.Color(look.dark) },
      uMid: { value: new THREE.Color(look.mid) },
      uLit: { value: new THREE.Color(look.lit) },
      uMoss: { value: new THREE.Color(look.moss) },
      uSway: { value: 0.12 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      ${SWAY_GLSL}
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position + treeSway(position), 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `${LANDSCAPE_GLSL}
      uniform vec3 uDark, uMid, uLit, uMoss;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vec3 n = normalize(vNormal);
        float ndl = dot(n, normalize(uKeyDirection));
        // Bark furrows along the limb, then three painted tones.
        float furrow = vnoise(vec2(vUv.x * 9.0, vUv.y * 0.9)) * 0.25;
        float light = ndl * 0.5 + 0.5 - furrow;
        vec3 col = mix(uDark, uMid, smoothstep(0.32, 0.4, light));
        col = mix(col, uLit, smoothstep(0.62, 0.7, light));
        col = mix(col, uMoss, smoothstep(0.55, 0.85, n.y) * 0.6);
        vec3 v = normalize(cameraPosition - vWorld);
        col += uRimColour * pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.12;
        gl_FragColor = vec4(landFog(col, vWorld), 1.0);
      }
    `,
  });
}

// ── the trees ───────────────────────────────────────────────────────────

type PaintedTree = { group: THREE.Group; height: number; dispose(): void };

/** The Ghibli oak (Nodestra `tree2.ts` createOak): about 12.5 m tall in its own units. */
function oakSkeleton(rnd: () => number) {
  const crownC = new THREE.Vector3(0.2, 7.9, 0);
  type Lobe = { centre: THREE.Vector3; radius: number; hang?: boolean };
  const lobes: Lobe[] = [];
  const shell = new THREE.Vector3(5.0, 2.6, 4.4);
  const addLobe = (az: number, el: number, radius: number, reach = 1, hang = false) => {
    const d = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    lobes.push({ centre: new THREE.Vector3(d.x * shell.x, d.y * shell.y, d.z * shell.z).multiplyScalar(reach).add(crownC), radius, hang });
  };
  addLobe(0, Math.PI / 2, 2.7, 0.85);
  for (let i = 0; i < 5; i++) addLobe((i / 5) * Math.PI * 2 + 0.3 + (rnd() - 0.5) * 0.5, 0.55 + rnd() * 0.25, 2.3 + rnd() * 0.5, 0.9 + rnd() * 0.15);
  for (let i = 0; i < 7; i++) addLobe((i / 7) * Math.PI * 2 + (rnd() - 0.5) * 0.5, -0.18 - rnd() * 0.3, 2.0 + rnd() * 0.5, 0.95 + rnd() * 0.2);
  for (let i = 0; i < 6; i++) addLobe((i / 6) * Math.PI * 2 + 0.7 + (rnd() - 0.5) * 0.4, -0.8, 1.7 + rnd() * 0.3, 0.7, true);
  const clumps: Clump[] = [];
  for (const lobe of lobes) {
    const outward = lobe.centre.clone().sub(crownC).normalize();
    const n = lobe.hang ? 4 : 7;
    for (let k = 0; k < n; k++) {
      const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1 + 0.55, rnd() * 2 - 1).addScaledVector(outward, 0.6).normalize();
      const centre = lobe.centre.clone().addScaledVector(dir, lobe.radius * (0.45 + rnd() * 0.3));
      clumps.push({ centre, radius: 0.95 + rnd() * 0.45, lobe });
    }
  }
  const trunkTop = new THREE.Vector3(0.1, 2.9, 0.05);
  const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0.05, 1.0, 0.0), new THREE.Vector3(-0.05, 2.0, 0.04), trunkTop]);
  const parts: THREE.BufferGeometry[] = [
    taperedTube(trunk, 56, 32, (t, a) => {
      const base = THREE.MathUtils.lerp(0.68, 0.52, t);
      const flare = Math.exp(-t * 9) * 0.8 * Math.pow(0.5 + 0.5 * Math.cos(a * 5 + 0.6), 2.0);
      const bark = 1 + 0.04 * Math.sin(a * 11 + t * 9) + 0.025 * Math.sin(a * 23);
      return (base + flare) * bark;
    }),
  ];
  type Limb = { samples: THREE.Vector3[] };
  const limbs: Limb[] = [];
  const sampleOf = (curve: THREE.CatmullRomCurve3, from: number) => Array.from({ length: 16 }, (_, k) => curve.getPointAt(from + (k / 15) * (1 - from)));
  lobes.forEach((lobe, li) => {
    if (li < 1 || li > 5) return;
    const out = lobe.centre.clone().sub(crownC).setY(0).normalize();
    const start = trunkTop.clone().add(new THREE.Vector3(out.x * 0.2, -0.3 + rnd() * 0.3, out.z * 0.2));
    const end = lobe.centre.clone().lerp(crownC, 0.2);
    const flat = end.clone().sub(start).setY(0);
    const rise = end.y - start.y;
    const wander = new THREE.Vector3(-out.z, 0, out.x);
    const pts = [0, 0.2, 0.45, 0.7, 1].map((t) =>
      start
        .clone()
        .addScaledVector(flat, Math.pow(t, 0.6))
        .add(new THREE.Vector3(0, rise * Math.pow(t, 1.25), 0))
        .addScaledVector(wander, Math.sin(t * Math.PI) * (rnd() - 0.5) * 0.8),
    );
    const curve = new THREE.CatmullRomCurve3(pts);
    parts.push(taperedTube(curve, 36, 14, (t) => THREE.MathUtils.lerp(0.34, 0.07, Math.pow(t, 0.75))));
    limbs.push({ samples: sampleOf(curve, 0.3) });
  });
  const mains = limbs.slice();
  lobes.forEach((lobe, li) => {
    if (li <= 5) return;
    let best = Infinity;
    let from = new THREE.Vector3();
    let fromK = 0;
    for (const limb of mains) {
      limb.samples.forEach((p, k) => {
        if (k > 9) return;
        const d = p.distanceToSquared(lobe.centre);
        if (d < best) {
          best = d;
          from = p;
          fromK = k;
        }
      });
    }
    const end = lobe.centre.clone().lerp(from, 0.2);
    const mid = from.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.45, 0));
    const curve = new THREE.CatmullRomCurve3([from, mid, end]);
    const r0 = THREE.MathUtils.lerp(0.16, 0.1, fromK / 9);
    parts.push(taperedTube(curve, 20, 10, (t) => THREE.MathUtils.lerp(r0, 0.04, t)));
    limbs.push({ samples: sampleOf(curve, 0.4) });
  });
  for (const c of clumps) {
    let best = Infinity;
    let from = new THREE.Vector3();
    let fromT = 0;
    for (const limb of limbs) {
      limb.samples.forEach((s, k) => {
        const d = s.distanceToSquared(c.centre);
        if (d < best) {
          best = d;
          from = s;
          fromT = k / 15;
        }
      });
    }
    const to = c.centre.clone().lerp(from, 0.3);
    const bend = from.clone().lerp(to, 0.5).add(new THREE.Vector3((rnd() - 0.5) * 0.5, 0.35, (rnd() - 0.5) * 0.5));
    const twig = new THREE.CatmullRomCurve3([from, bend, to]);
    const r0 = THREE.MathUtils.lerp(0.11, 0.05, fromT);
    parts.push(taperedTube(twig, 12, 7, (t) => THREE.MathUtils.lerp(r0, 0.015, t)));
  }
  return { clumps, parts, crown: { centre: crownC, radii: new THREE.Vector3(7.4, 4.6, 6.6) }, height: 12.5 };
}

/** The blossom tree (Nodestra `sakura.ts` createSakura): gnarled limbs arching out, blossom along them; ~8.5 m. */
function blossomSkeleton(rnd: () => number) {
  const parts: THREE.BufferGeometry[] = [];
  const clumps: Clump[] = [];
  const gnarl = (start: THREE.Vector3, dir: THREE.Vector3, length: number, droop: number, wobble: number, n = 6, minY = -Infinity) => {
    const pts = [start.clone()];
    const d = dir.clone().normalize();
    const p = start.clone();
    const step = length / (n - 1);
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      d.add(new THREE.Vector3((rnd() - 0.5) * wobble, (rnd() - 0.5) * wobble * 0.6 - droop * t * 0.5, (rnd() - 0.5) * wobble)).normalize();
      p.addScaledVector(d, step);
      if (p.y < minY) {
        p.y = minY;
        d.y = Math.max(d.y, 0.1);
        d.normalize();
      }
      pts.push(p.clone());
    }
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  };
  const trunk = gnarl(new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0.25, 1, 0.1), 3.0, 0, 0.35, 5);
  parts.push(
    taperedTube(trunk, 48, 26, (t, a) => {
      const base = THREE.MathUtils.lerp(0.36, 0.25, t);
      const flare = Math.exp(-t * 8) * 0.55 * Math.pow(0.5 + 0.5 * Math.cos(a * 4 + 1.1), 2);
      return (base + flare) * (1 + 0.07 * Math.sin(a * 3 + t * 14) + 0.05 * Math.sin(a * 7 - t * 9));
    }),
  );
  const addClump = (centre: THREE.Vector3, radius: number) => {
    if (clumps.length < 126) clumps.push({ centre, radius });
  };
  for (let i = 0; i < 6; i++) {
    const az = (i / 6) * Math.PI * 2 + 0.4 + (rnd() - 0.5) * 0.6;
    const rise = 0.32 + rnd() * 0.4;
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(rise), Math.sin(rise), Math.sin(az) * Math.cos(rise));
    const start = trunk.getPointAt(0.82 + rnd() * 0.15);
    const limb = gnarl(start, dir, 5.0 + rnd() * 1.6, 0.22, 0.6, 8, 2.4);
    parts.push(taperedTube(limb, 48, 14, (t, a) => THREE.MathUtils.lerp(0.22, 0.04, Math.pow(t, 0.8)) * (1 + 0.08 * Math.sin(a * 3 + t * 20))));
    addClump(limb.getPointAt(1).add(new THREE.Vector3(0, 0.5, 0)), 1.2 + rnd() * 0.3);
    for (let b = 0; b < 4; b++) {
      const at = 0.3 + (b / 4) * 0.6 + rnd() * 0.08;
      const from = limb.getPointAt(at);
      const tangent = limb.getTangentAt(at);
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(rnd() < 0.5 ? -1 : 1);
      const bDir = tangent.clone().multiplyScalar(0.6).add(side.multiplyScalar(0.7)).add(new THREE.Vector3(0, 0.35 + rnd() * 0.5, 0));
      const branch = gnarl(from, bDir, 1.6 + rnd() * 1.6, 0.25, 0.7, 5, 2.0);
      const r0 = THREE.MathUtils.lerp(0.14, 0.06, at);
      parts.push(taperedTube(branch, 20, 8, (t) => THREE.MathUtils.lerp(r0, 0.02, t)));
      addClump(branch.getPointAt(1).add(new THREE.Vector3(0, 0.4, 0)), 1.1 + rnd() * 0.4);
      addClump(branch.getPointAt(0.55).add(new THREE.Vector3(0, 0.45, 0)), 0.7 + rnd() * 0.3);
      for (let k = 0; k < 2; k++) {
        const tFrom = branch.getPointAt(0.35 + rnd() * 0.55);
        const twig = gnarl(tFrom, new THREE.Vector3(rnd() - 0.5, 0.2 + rnd() * 0.6, rnd() - 0.5), 0.7 + rnd() * 0.8, 0.3, 0.8, 4, 1.8);
        parts.push(taperedTube(twig, 10, 6, (t) => THREE.MathUtils.lerp(0.035, 0.01, t)));
        addClump(twig.getPointAt(1).add(new THREE.Vector3(0, 0.2, 0)), 0.6 + rnd() * 0.3);
      }
    }
    for (let k = 0; k < 2; k++) addClump(limb.getPointAt(0.62 + k * 0.18).add(new THREE.Vector3(0, 0.55, 0)), 0.75 + rnd() * 0.3);
  }
  const box = new THREE.Box3();
  for (const c of clumps) box.union(new THREE.Sphere(c.centre, c.radius).getBoundingBox(new THREE.Box3()));
  return { clumps, parts, crown: { centre: box.getCenter(new THREE.Vector3()), radii: box.getSize(new THREE.Vector3()).multiplyScalar(0.5) }, height: box.max.y };
}

const LOOKS: Record<PaintedKind, { cards: CardOptions; foliage: FoliageLook; bark: BarkLook }> = {
  // Nodestra's oak tones, carried into a moonlit night: deep blue-greens to a cool silver-green.
  oak: {
    cards: { density: 34, size: [0.6, 0.9], flatten: 0.85, shell: 4 },
    foliage: { tones: ['#030e17', '#081d24', '#11312f', '#21493f', '#46705f'], steps: [0.25, 0.41, 0.57, 0.73], rim: 0.55, weights: [0.25, 0.32, 0.45], lift: 0.45, jitter: 0.09, occlusion: 0.9, floor: 0, soften: 0 },
    bark: { dark: '#08070c', mid: '#1a1620', lit: '#3a3442', moss: '#1d3328' },
  },
  // Nodestra's sakura tones, moonlit: mauve shade to a cool pearl.
  blossom: {
    cards: { density: 36, size: [0.45, 0.66], flatten: 0.72, shell: 2.2 },
    foliage: { tones: ['#3b2a46', '#6b4d6e', '#a27a98', '#d6aac2', '#f1dbe8'], steps: [0.2, 0.36, 0.54, 0.72], rim: 0.45, weights: [0.45, 0.25, 0.3], lift: 0.35, jitter: 0.14, occlusion: 0.75, floor: 0.25, soften: 0.04, eye: '#a8476e' },
    bark: { dark: '#07050a', mid: '#18121a', lit: '#382b34', moss: '#252b20' },
  },
};

/**
 * A painted tree in its own units (an oak ~12.5 m, a blossom tree ~8.5 m),
 * its foot at the origin. `density` thins the cards (phones; far trees) and
 * `cardScale` grows them to keep the crown full (a far tree's leaves are
 * sub-pixel: fewer, bigger cards read the same).
 */
function createPaintedTree(kind: PaintedKind, seed: number, palette: StagePalette, time: { value: number }, haze: number, density = 1, cardScale = 1): PaintedTree {
  const rnd = seededRandom(seed);
  const skeleton = kind === 'blossom' ? blossomSkeleton(rnd) : oakSkeleton(rnd);
  const look = LOOKS[kind];
  const group = new THREE.Group();
  const barkGeometry = mergeGeometries(skeleton.parts);
  for (const part of skeleton.parts) part.dispose();
  const barkMaterial = createBarkMaterial(palette, time, haze, look.bark);
  const bark = new THREE.Mesh(barkGeometry, barkMaterial);
  bark.frustumCulled = false;
  group.add(bark);
  const atlas = makeLeafAtlas(kind, seed * 7 + 1);
  const cards = buildCards(skeleton.clumps, rnd, { ...look.cards, density: look.cards.density * density, size: [look.cards.size[0] * cardScale, look.cards.size[1] * cardScale] });
  const leafMaterial = createFoliageMaterial(palette, time, haze, atlas, skeleton.crown, look.foliage);
  const leaves = new THREE.Mesh(cards, leafMaterial);
  leaves.frustumCulled = false;
  group.add(leaves);
  return {
    group,
    height: skeleton.height,
    dispose() {
      barkGeometry.dispose();
      barkMaterial.dispose();
      cards.dispose();
      leafMaterial.dispose();
      atlas.dispose();
    },
  };
}

/**
 * Painted leaf clusters with no tree under them — ivy over a wall, vines
 * hanging from it — with the trees' atlas, cards and tones. Shaded by each
 * clump and its lobe only (the "crown" would be the whole building), with a
 * softer rim. `cards` sets the card density and size (far greenery takes
 * fewer, bigger cards, as the far trees do).
 */
function createPaintedClumps(kind: PaintedKind, clumps: Clump[], cards: CardOptions, seed: number, palette: StagePalette, time: { value: number }, haze: number): { mesh: THREE.Mesh; dispose(): void } {
  const rnd = seededRandom(seed);
  const atlas = makeLeafAtlas(kind, seed * 7 + 1);
  const geometry = buildCards(clumps, rnd, cards);
  const box = new THREE.Box3();
  for (const clump of clumps) box.expandByPoint(clump.centre);
  const crown = { centre: box.getCenter(new THREE.Vector3()), radii: box.getSize(new THREE.Vector3()).multiplyScalar(0.5).max(new THREE.Vector3(1, 1, 1)) };
  const material = createFoliageMaterial(palette, time, haze, atlas, crown, { ...LOOKS[kind].foliage, weights: [0.65, 0.35, 0], rim: 0.2 });
  // Barely any sway: ivy holds to its wall.
  material.uniforms.uSway.value = 0.02;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
      atlas.dispose();
    },
  };
}

export { createPaintedClumps, createPaintedTree };
export type { CardOptions, Clump, PaintedKind, PaintedTree };
