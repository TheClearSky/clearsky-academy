import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE_GLSL } from '../../engine/glsl';
import { LIGHTING_GLSL, lightingUniforms, WORLD_VERTEX_GLSL } from '../../engine/lighting';
import { seededRandom } from '../../engine/random';
import type { StageContext } from '../../engine/contract';
import { BOOK_EULER_ORDER, orbitPoint } from './propLayout';
import type { Placement } from './propLayout';

/**
 * Floating books — inspired by the idea of an enchanted library, not by any
 * film's props. Most fly OPEN, their covers beating like wings; a few stay
 * shut and tumble slowly (some of those breathe ajar). Two draw calls for
 * every book on screen.
 *
 * BOOK BODIES (one instanced draw, open and closed alike): one merged
 * geometry whose vertices carry a part (leather / page block / gilt metal /
 * ribbon) and a side (−1 back, 0 spine, +1 front):
 *  - the spine is an extruded half-ring with four raised gilt bands;
 *  - each board is a leather slab with two gilt corner protectors (extruded
 *    triangles wrapping the fore-edge corners) and a page-block half glued
 *    to its inside;
 *  - the vertex shader swings every side ±1 vertex about its hinge (the
 *    spine's edge) by the book's per-frame opening angle `aOpen` — the CPU
 *    computes it from a wing-beat curve — and bows the page block's reading
 *    face as the book opens;
 *  - the ribbon bookmark hangs from the gutter in WORLD space (gravity
 *    down, a slow sway, a ripple), whichever way the book is turned;
 *  - per-instance size (width, height, thickness) is applied before the
 *    swing so the hinge stays on the spine; leather is an instance colour.
 *  The fragment shader tools the front board (a gilt or blind frame, a
 *    lozenge and boss), grains and wears the leather (scuffed edges and
 *    corners), labels the spine, stripes the page edges (anti-aliased with
 *    `fwidth`, some books gilt-edged) and sets faint text on the open pages.
 *
 * LOOSE PAGES (one instanced draw, a few sheets per open book): each sheet
 * is a quadratic Bézier from the gutter to a fan angle between the two page
 * blocks; its opening angle lags its book's a little more per sheet, so the
 * pages trail the beat like feathers, and one sheet per book flips across
 * every few seconds.
 *
 * Book space: the spine runs up the y axis at x = 0; the book opens toward
 * +x (its spread faces +x when fully open); its thickness is along z.
 * Flight: each book bobs, drifts and banks into its drift (seeded); an open
 * book also lifts a little on each beat.
 */

const BOOK_WIDTH = 0.55;
const BOOK_HEIGHT = 0.75;
/** Half the closed thickness: the spine's radius and each hinge's z. */
const SPINE_RADIUS = 0.07;
const BOARD = 0.016;
/** The page blocks' faces stop this far short of the middle plane. */
const PAGE_GAP = 0.002;
const LOOSE_PAGES = 6;
const PAGE_LENGTH = BOOK_WIDTH * 0.95;
const PART_LEATHER = 0;
const PART_PAGES = 1;
const PART_GILT = 2;
const PART_RIBBON = 3;
const LEATHERS = ['#6b1f2a', '#1f4a3a', '#1c2a5a', '#8a6a22', '#4a2a5a', '#7a3d1c', '#163a44', '#2a1a14'];

/** Constants every book shader shares. */
const BOOK_CONSTANTS_GLSL = /* glsl */ `
const float BOOK_WIDTH = ${BOOK_WIDTH.toFixed(4)};
const float BOOK_HEIGHT = ${BOOK_HEIGHT.toFixed(4)};
const float SPINE_RADIUS = ${SPINE_RADIUS.toFixed(4)};
const float BOARD = ${BOARD.toFixed(4)};
const float PAGE_GAP = ${PAGE_GAP.toFixed(4)};
const float PAGE_LENGTH = ${PAGE_LENGTH.toFixed(4)};
`;

/** Fragment-only (needs the noise and fwidth). */
const PAGE_INK_GLSL = /* glsl */ `
/** Faint printed text on a page (uv 0..1 across from the gutter, up the
 *  page): thin rows of "words" inside the margins. Where the rows would
 *  alias (far away) it fades to their average tone instead. */
float pageInk(vec2 page, float seed) {
  float inside = step(0.14, page.x) * step(page.x, 0.88) * step(0.09, page.y) * step(page.y, 0.9);
  float rowCoordinate = page.y * 36.0;
  float row = floor(rowCoordinate);
  float band = 1.0 - smoothstep(0.16, 0.24, abs(fract(rowCoordinate) - 0.5));
  float words = step(0.36, vnoise(vec2(page.x * 70.0, row * 3.7 + seed * 11.0)));
  float letters = 0.65 + 0.35 * step(0.5, fract(page.x * 260.0 + row * 0.37));
  // Short last lines of paragraphs.
  float lineEnd = step(page.x, mix(0.5, 0.88, step(0.18, hash12(vec2(row, seed * 7.0)))));
  float detail = 1.0 - smoothstep(0.25, 0.6, fwidth(rowCoordinate));
  return inside * lineEnd * mix(0.2, band * words * letters, detail);
}
`;

/** Tag a geometry's vertices with its part and side, non-indexed for the merge. */
function tagged(geometry: THREE.BufferGeometry, part: number, side: number): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  const count = flat.getAttribute('position').count;
  flat.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(count).fill(part), 1));
  flat.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(count).fill(side), 1));
  return flat;
}

/** A half-ring cross-section (x ≤ 0) in (x, z), extruded `depth` up y and centred on `centreY`. */
function halfRing(outer: number, inner: number, depth: number, centreY: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, Math.PI / 2, (Math.PI * 3) / 2, false);
  shape.lineTo(0, -inner);
  shape.absarc(0, 0, inner, (Math.PI * 3) / 2, Math.PI / 2, true);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geometry.translate(0, 0, -depth / 2);
  // Extruded along +z; stand it up: the extrusion becomes +y, the shape's y becomes −z.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, centreY, 0);
  return geometry;
}

/** A gilt corner protector: a triangle wrapping a board's fore-edge corner. */
function cornerProtector(side: number, top: boolean): THREE.BufferGeometry {
  const leg = 0.075;
  const overlap = 0.0025;
  const x = BOOK_WIDTH + overlap;
  const y = top ? BOOK_HEIGHT / 2 + overlap : -BOOK_HEIGHT / 2 - overlap;
  const shape = new THREE.Shape([new THREE.Vector2(x, y), new THREE.Vector2(x - leg, y), new THREE.Vector2(x, y + (top ? -leg : leg))]);
  const depth = BOARD + overlap * 2;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, side > 0 ? SPINE_RADIUS + overlap - depth : -(SPINE_RADIUS + overlap));
  return geometry;
}

function bookBodyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(tagged(halfRing(SPINE_RADIUS, SPINE_RADIUS - BOARD, BOOK_HEIGHT, 0, 0), PART_LEATHER, 0));
  for (const band of [-0.3, -0.1, 0.1, 0.3]) {
    parts.push(tagged(halfRing(SPINE_RADIUS + 0.004, SPINE_RADIUS - 0.004, 0.014, band * BOOK_HEIGHT, 0.003), PART_GILT, 0));
  }
  const pageWidth = BOOK_WIDTH - 0.016;
  const pageHeight = BOOK_HEIGHT - 0.026;
  const pageDepth = SPINE_RADIUS - BOARD - PAGE_GAP;
  for (const side of [1, -1]) {
    const board = new THREE.BoxGeometry(BOOK_WIDTH, BOOK_HEIGHT, BOARD, 2, 2, 1).translate(BOOK_WIDTH / 2, 0, side * (SPINE_RADIUS - BOARD / 2));
    parts.push(tagged(board, PART_LEATHER, side));
    const block = new THREE.BoxGeometry(pageWidth, pageHeight, pageDepth, 12, 1, 1).translate(0.004 + pageWidth / 2, 0, side * (PAGE_GAP + pageDepth / 2));
    parts.push(tagged(block, PART_PAGES, side));
    parts.push(tagged(cornerProtector(side, true), PART_GILT, side));
    parts.push(tagged(cornerProtector(side, false), PART_GILT, side));
  }
  // The ribbon: a strip from its anchor (y = 0) down to its end (y = −1);
  // the vertex shader hangs it in world space.
  parts.push(tagged(new THREE.PlaneGeometry(1, 1, 1, 10).translate(0, -0.5, 0), PART_RIBBON, 0));
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('[books] could not merge the book geometry');
  return merged;
}

const BOOK_VERTEX = /* glsl */ `${WORLD_VERTEX_GLSL}${BOOK_CONSTANTS_GLSL}
attribute float aPart;
attribute float aSide;
attribute float aOpen;
attribute vec3 aSize;
attribute vec4 aStyle;
uniform float uTime;
varying vec3 vLocal;
varying vec3 vObjectNormal;
varying vec3 vNormal;
varying vec3 vToEye;
varying float vPart;
varying float vSide;
varying vec3 vLeather;
varying vec4 vStyle;
varying vec2 vUv;
/** Rotate (x, z) about the origin by angle (counter-clockwise, x toward z). */
vec2 swing(vec2 xz, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec2(xz.x * c - xz.y * s, xz.x * s + xz.y * c);
}
void main() {
  mat4 world = worldMatrix();
  vec3 worldPosition;
  vec3 worldNormal;
  if (aPart > 2.5) {
    // Ribbon: hangs from the gutter at the tail, under gravity, in world space.
    float openness = clamp(aOpen, 0.0, 1.0);
    vec3 anchorLocal = vec3(mix(0.3, 0.05, openness) * BOOK_WIDTH, -0.5 * BOOK_HEIGHT + 0.012, 0.0) * aSize;
    vec3 anchor = (world * vec4(anchorLocal, 1.0)).xyz;
    float bookScale = length(world[0].xyz);
    float along = -position.y;
    float phase = aStyle.x * 40.0;
    vec3 down = normalize(vec3(0.22 * sin(uTime * 1.3 + phase), -1.0, 0.22 * cos(uTime * 0.9 + phase * 1.7)));
    vec3 bookAcross = normalize(mat3(world) * vec3(1.0, 0.0, 0.0));
    vec3 widthDirection = bookAcross - dot(bookAcross, down) * down;
    // Never normalize a zero vector (NaN on some GPUs): fall back when the
    // book's x axis points straight down.
    float widthLength = length(widthDirection);
    widthDirection = widthLength > 0.001 ? widthDirection / max(widthLength, 0.001) : vec3(1.0, 0.0, 0.0);
    vec3 faceNormal = cross(widthDirection, down);
    float ribbonLength = aStyle.y * BOOK_HEIGHT * bookScale;
    float ripple = sin(along * 6.0 - uTime * 2.6 + phase) * 0.07 * along * ribbonLength;
    worldPosition = anchor + down * along * ribbonLength + faceNormal * ripple + widthDirection * position.x * 0.032 * bookScale;
    worldNormal = faceNormal;
  } else {
    vec3 local = position * aSize;
    vec3 localNormal = normalize(normal / aSize);
    if (abs(aSide) > 0.5) {
      // The page block's reading face bows out as the book opens.
      if (aPart > 0.5 && aPart < 1.5 && abs(position.z) < PAGE_GAP + 0.001) {
        float across = clamp(position.x / BOOK_WIDTH, 0.0, 1.0);
        local.z -= aSide * 0.026 * aSize.z * smoothstep(0.0, 0.3, across) * (1.0 - 0.5 * across) * sin(min(aOpen, 1.5));
      }
      float hingeZ = aSide * SPINE_RADIUS * aSize.z;
      vec2 swung = swing(vec2(local.x, local.z - hingeZ), aSide * aOpen);
      local.xz = vec2(swung.x, swung.y + hingeZ);
      localNormal.xz = swing(localNormal.xz, aSide * aOpen);
    }
    worldPosition = (world * vec4(local, 1.0)).xyz;
    worldNormal = normalize(mat3(world) * localNormal);
  }
  vLocal = position;
  vObjectNormal = normal;
  vNormal = worldNormal;
  vToEye = cameraPosition - worldPosition;
  vPart = aPart;
  vSide = aSide;
  vStyle = aStyle;
  vUv = uv;
  #ifdef USE_INSTANCING_COLOR
    vLeather = instanceColor;
  #else
    vLeather = vec3(0.4, 0.12, 0.15);
  #endif
  gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
}
`;

const BOOK_FRAGMENT = /* glsl */ `${NOISE_GLSL}${LIGHTING_GLSL}${BOOK_CONSTANTS_GLSL}${PAGE_INK_GLSL}
uniform vec3 uGold;
uniform vec3 uCandleFill;
varying vec3 vLocal;
varying vec3 vObjectNormal;
varying vec3 vNormal;
varying vec3 vToEye;
varying float vPart;
varying float vSide;
varying vec3 vLeather;
varying vec4 vStyle;
varying vec2 vUv;
float boxDistance(vec2 point, vec2 halfSize) {
  vec2 outside = abs(point) - halfSize;
  return length(max(outside, 0.0)) + min(max(outside.x, outside.y), 0.0);
}
/** An anti-aliased line of half-width w along the zero of a distance. */
float lineMask(float signedDistance, float halfWidth) {
  float pixel = fwidth(signedDistance);
  return 1.0 - smoothstep(halfWidth - pixel, halfWidth + pixel, abs(signedDistance));
}
vec3 leatherGrain(vec3 local, vec3 base, float seed) {
  vec2 point = local.xy + vec2(local.z * 1.7, local.z * 0.6) + seed * 13.0;
  float pebble = vnoise(point * 75.0);
  float pores = vnoise(point * 230.0);
  float mottle = fbm3(point * 5.0);
  return base * (0.6 + 0.22 * pebble + 0.1 * pores + 0.38 * mottle);
}
vec3 ribbonColour(float choice) {
  if (choice < 0.25) return vec3(0.42, 0.03, 0.05);
  if (choice < 0.5) return vec3(0.62, 0.42, 0.1);
  if (choice < 0.75) return vec3(0.04, 0.24, 0.12);
  return vec3(0.06, 0.1, 0.4);
}
void main() {
  vec3 normal = gl_FrontFacing ? vNormal : -vNormal;
  float seed = vStyle.x;
  float gloss = 18.0;
  float specular = 0.14;
  vec3 albedo;
  if (vPart < 0.5) {
    albedo = leatherGrain(vLocal, vLeather, seed);
    float gilt = 0.0;
    bool giltTooling = fract(seed * 7.31) > 0.3;
    if (abs(vSide) > 0.5) {
      // A board. Its outer face is tooled; every edge and corner is worn.
      float outerFace = step(0.5, vObjectNormal.z * vSide);
      vec2 board = vLocal.xy;
      vec2 panel = board - vec2(0.5 * BOOK_WIDTH + 0.008, 0.0);
      float frame = boxDistance(panel, vec2(0.5 * BOOK_WIDTH - 0.06, 0.5 * BOOK_HEIGHT - 0.055));
      float outerRule = lineMask(frame, 0.0032);
      float innerGroove = lineMask(frame + 0.022, 0.0028);
      float raised = 1.0 - smoothstep(-0.026, -0.022, frame);
      float lozenge = abs(panel.x) / 0.115 + abs(panel.y) / 0.17 - 1.0;
      float lozengeRule = lineMask(lozenge * 0.09, 0.0032);
      float boss = 1.0 - smoothstep(0.016, 0.02, length(panel));
      float tooled = outerRule + lozengeRule + boss;
      albedo *= 1.0 + 0.14 * raised * outerFace;
      albedo *= 1.0 - 0.55 * innerGroove * outerFace;
      gilt = giltTooling ? clamp(tooled, 0.0, 1.0) * outerFace : 0.0;
      if (!giltTooling) albedo *= 1.0 - 0.5 * clamp(tooled, 0.0, 1.0) * outerFace;
      float edge = min(BOOK_WIDTH - board.x, 0.5 * BOOK_HEIGHT - abs(board.y));
      float wear = (1.0 - smoothstep(0.0, 0.045, edge)) * (0.35 + 0.65 * vnoise(board * 45.0 + seed * 9.0));
      wear += smoothstep(0.64, 0.82, fbm3(board * 8.0 + seed * 5.0)) * 0.6 * outerFace;
      albedo = mix(albedo, albedo * 1.8 + vec3(0.025, 0.02, 0.012), clamp(wear, 0.0, 1.0) * 0.6);
    } else {
      // The spine: a contrasting title label with gilt "lettering", gilt rules.
      float around = atan(vLocal.z, -vLocal.x + 1e-6);
      float y = vLocal.y / BOOK_HEIGHT;
      float label = step(abs(y - 0.2), 0.082) * step(abs(around), 1.25);
      vec3 labelColour = fract(seed * 3.1) > 0.5 ? vec3(0.32, 0.05, 0.04) : vec3(0.03, 0.025, 0.02);
      albedo = mix(albedo, labelColour * (0.8 + 0.3 * vnoise(vLocal.xy * 90.0)), label);
      float letters = step(abs(y - 0.2), 0.03) * step(abs(around), 0.95) * step(0.42, vnoise(vec2(around * 16.0 + seed * 30.0, floor(y * 70.0))));
      float rules = lineMask(abs(y - 0.2) - 0.075, 0.0035) * step(abs(around), 1.25) + lineMask(abs(y) - 0.46, 0.003);
      gilt = clamp(letters + rules, 0.0, 1.0);
      float wear = (1.0 - smoothstep(0.0, 0.04, 0.5 - abs(y))) * vnoise(vLocal.xy * 60.0);
      albedo = mix(albedo, albedo * 1.7, wear * 0.5);
    }
    vec3 gold = uGold * (0.75 + 0.35 * vnoise(vLocal.xy * 120.0));
    albedo = mix(albedo, gold, gilt);
    gloss = mix(gloss, 55.0, gilt);
    specular = mix(specular, 1.1, gilt);
  } else if (vPart < 1.5) {
    vec3 paper = vec3(0.8, 0.74, 0.6) * (0.92 + 0.1 * vnoise(vLocal.xy * 25.0 + seed * 7.0));
    float depthInBlock = (abs(vLocal.z) - PAGE_GAP) / (SPINE_RADIUS - BOARD - PAGE_GAP);
    if (abs(vObjectNormal.z) < 0.5) {
      // The page edges: one stripe per few sheets, faded where they would alias.
      float stripes = vLocal.z * 520.0 + vnoise(vLocal.xy * 18.0 + seed * 3.0) * 1.6;
      float pixel = fwidth(stripes);
      float striation = (0.5 + 0.5 * sin(stripes * 6.2831853)) * (1.0 - smoothstep(0.25, 0.9, pixel));
      paper *= 0.84 + 0.22 * striation;
      // Foxing: older, darker toward the boards and in blotches.
      paper *= 1.0 - 0.22 * smoothstep(0.55, 1.0, depthInBlock) - 0.15 * smoothstep(0.6, 0.85, fbm3(vLocal.xy * 14.0 + seed));
      if (vStyle.z > 0.5) {
        paper = mix(paper, uGold * (0.7 + 0.35 * striation), 0.85);
        gloss = 45.0;
        specular = 0.9;
      }
    } else {
      // The reading face: a margin, rows of faint text, the gutter's shadow.
      vec2 page = vec2(vLocal.x / BOOK_WIDTH, vLocal.y / BOOK_HEIGHT + 0.5);
      paper = mix(paper, vec3(0.2, 0.16, 0.13), pageInk(page, seed) * 0.42);
      paper *= 0.45 + 0.55 * smoothstep(0.0, 0.2, page.x);
    }
    albedo = paper;
    gloss = max(gloss, 8.0);
    specular = max(specular, 0.05);
  } else if (vPart < 2.5) {
    // Gilt metal: corner protectors and spine bands, lightly tarnished.
    float tarnish = fbm3(vLocal.xy * 40.0 + seed * 5.0);
    albedo = uGold * (0.55 + 0.45 * tarnish);
    gloss = 60.0;
    specular = 1.25;
  } else {
    // Silk ribbon with a swallow-tail end.
    float along = 1.0 - vUv.y;
    if (along > 1.0 - 0.08 * (1.0 - 2.0 * abs(vUv.x - 0.5))) discard;
    albedo = ribbonColour(vStyle.w) * (0.85 + 0.15 * sin(vUv.x * 40.0));
    gloss = 28.0;
    specular = 0.55;
  }
  // Kept in range whatever a varying did (a negative exponent → Inf → NaN,
  // and the bloom smears a NaN over the whole frame).
  vec3 colour = shadeSurface(albedo, normal, vToEye, clamp(gloss, 2.0, 80.0), clamp(specular, 0.0, 1.5));
  // The floating candles' warm fill: it brings the leather's own hue out
  // of the blue moonlight.
  colour += albedo * uCandleFill;
  gl_FragColor = vec4(fogFromEye(colour, vToEye), 1.0);
}
`;

/** Loose pages of the open books: x along the page from the gutter, y up the page. */
const PAGE_VERTEX = /* glsl */ `${WORLD_VERTEX_GLSL}${BOOK_CONSTANTS_GLSL}
attribute float aPage;
attribute float aFlipper;
attribute float aBookSeed;
attribute float aOpen;
attribute vec3 aSize;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vToEye;
varying vec2 vPageUv;
varying float vSheetSeed;
void main() {
  vSheetSeed = fract(aBookSeed * 13.0 + aPage * 7.31 + aFlipper * 0.5);
  // The fan spans the opening between the two page blocks.
  float spread = max(aOpen - 0.16, 0.05);
  float fan = aPage;
  if (aFlipper > 0.5) {
    float cycle = fract(uTime / 6.5 + aBookSeed * 3.0);
    float flip = smoothstep(0.0, 0.32, cycle);
    fan = flip * flip * (3.0 - 2.0 * flip);
  }
  float angle = mix(spread, -spread, fan);
  angle += 0.05 * sin(uTime * 3.1 + aPage * 9.0 + aBookSeed * 20.0) * (0.4 + aOpen);
  float pageLength = PAGE_LENGTH * aSize.x;
  float along = clamp(position.x / PAGE_LENGTH, 0.0, 1.0);
  // A quadratic Bézier: out of the gutter along the middle, curving to its angle.
  vec2 control = vec2(pageLength * 0.42, 0.0);
  vec2 end = pageLength * vec2(cos(angle), sin(angle));
  vec2 point = 2.0 * along * (1.0 - along) * control + along * along * end;
  vec2 tangent = 2.0 * (1.0 - along) * control + 2.0 * along * (end - control);
  tangent /= max(length(tangent), 0.0001);
  vec2 across = vec2(-tangent.y, tangent.x);
  point += across * sin(uTime * 4.3 + aPage * 7.0 + aBookSeed * 31.0 + along * 2.5) * 0.016 * along * along * aSize.x;
  vec3 local = vec3(point.x, position.y * aSize.y, point.y);
  mat4 world = worldMatrix();
  vec4 worldPosition = world * vec4(local, 1.0);
  vNormal = normalize(mat3(world) * vec3(across.x, 0.0, across.y));
  vToEye = cameraPosition - worldPosition.xyz;
  vPageUv = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const PAGE_FRAGMENT = /* glsl */ `${NOISE_GLSL}${LIGHTING_GLSL}${PAGE_INK_GLSL}
varying vec3 vNormal;
varying vec3 vToEye;
varying vec2 vPageUv;
varying float vSheetSeed;
void main() {
  vec3 normal = gl_FrontFacing ? vNormal : -vNormal;
  vec3 paper = vec3(0.86, 0.81, 0.7) * (0.92 + 0.08 * vnoise(vPageUv * 30.0 + vSheetSeed * 17.0));
  paper = mix(paper, vec3(0.2, 0.16, 0.13), pageInk(vPageUv, vSheetSeed) * 0.4);
  // Darker toward the gutter and a little at the worn outer edge.
  paper *= (0.55 + 0.45 * smoothstep(0.0, 0.18, vPageUv.x)) * (1.0 - 0.15 * smoothstep(0.93, 1.0, vPageUv.x));
  vec3 colour = shadeSurface(paper, normal, vToEye, 6.0, 0.04);
  gl_FragColor = vec4(fogFromEye(colour, vToEye), 1.0);
}
`;

type Books = {
  group: THREE.Group;
  /** New base placements (after a resize changed the layout). */
  place(closed: Placement[], open: Placement[]): void;
  update(t: number): void;
  dispose(): void;
};

/** What a book keeps between frames, all derived from its seed. */
type BookFlight = {
  placement: Placement;
  open: boolean;
  /** Wing-beat rate (rad/s) and phase. */
  beatRate: number;
  beatPhase: number;
  /** Closed books: the tumble axis and rate; how far it breathes ajar. */
  tumbleAxis: THREE.Vector3;
  tumbleRate: number;
  ajar: number;
};

const position = new THREE.Vector3();
const scaleVector = new THREE.Vector3();
const orientation = new THREE.Quaternion();
const tumble = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, BOOK_EULER_ORDER);

/** The opening half-angle of an open book: a wing beat, quicker on the downstroke. */
function beatAngle(flight: BookFlight, t: number): number {
  const x = t * flight.beatRate + flight.beatPhase;
  return 0.95 + 0.5 * ((Math.sin(x) + 0.22 * Math.sin(2 * x + 0.6)) / 1.1);
}

/** The opening half-angle of a book at time t (closed books breathe ajar). */
function openingAngle(flight: BookFlight, t: number): number {
  if (flight.open) return beatAngle(flight, t);
  return flight.ajar * (0.5 + 0.5 * Math.sin(t * 0.4 + flight.beatPhase));
}

/** The book's matrix at time t: its place on the carousel plus a seeded flight (bob, drift, bank) and tumble. */
function bookMatrix(flight: BookFlight, t: number, target: THREE.Matrix4): THREE.Matrix4 {
  const { placement } = flight;
  const phase = placement.seed * 6.2831853;
  const base = placement.orbit ? orbitPoint(placement.orbit, t, placement.y) : { x: placement.x, z: placement.z, rise: 0 };
  // An open book keeps turning its spread to the viewer as it circles.
  const turn = placement.orbit && flight.open ? Math.atan2(base.z, -base.x) - Math.atan2(placement.z, -placement.x) : 0;
  const driftX = 0.2 * Math.sin(t * 0.23 + phase);
  const driftVelocity = 0.2 * 0.23 * Math.cos(t * 0.23 + phase);
  const lift = flight.open ? -0.05 * Math.sin(t * flight.beatRate + flight.beatPhase - 0.6) : 0;
  position.set(base.x + driftX, placement.y + base.rise + Math.sin(t * 0.5 + phase) * 0.17 + lift, base.z + 0.35 * Math.sin(t * 0.17 + phase * 1.3));
  // Bank into the drift (≈ ±0.4 rad), plus a slow sway of heading and lean.
  const bank = -driftVelocity * 9;
  euler.set(
    placement.pitch + bank + Math.sin(t * 0.37 + phase) * 0.08,
    placement.yaw + turn + Math.sin(t * 0.11 + phase * 2) * 0.25,
    placement.roll + Math.sin(t * 0.29 + phase * 1.7) * 0.1,
    BOOK_EULER_ORDER,
  );
  orientation.setFromEuler(euler);
  if (!flight.open) orientation.multiply(tumble.setFromAxisAngle(flight.tumbleAxis, t * flight.tumbleRate + phase));
  scaleVector.setScalar(placement.scale);
  return target.compose(position, orientation, scaleVector);
}

function createBooks(context: StageContext, closedCapacity: number, openCapacity: number): Books {
  const group = new THREE.Group();
  const uniforms = {
    ...lightingUniforms(context.palette),
    uGold: { value: context.palette.gold },
    uCandleFill: { value: context.palette.candleFlame.clone().multiplyScalar(0.12) },
    uTime: context.uniforms.uTime,
  };
  const capacity = Math.max(1, closedCapacity + openCapacity);

  const bodyGeometry = bookBodyGeometry();
  const bodyOpen = new Float32Array(capacity);
  const bodySize = new Float32Array(capacity * 3).fill(1);
  const bodyStyle = new Float32Array(capacity * 4);
  const bodyOpenAttribute = new THREE.InstancedBufferAttribute(bodyOpen, 1);
  bodyOpenAttribute.setUsage(THREE.DynamicDrawUsage);
  bodyGeometry.setAttribute('aOpen', bodyOpenAttribute);
  bodyGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(bodySize, 3));
  bodyGeometry.setAttribute('aStyle', new THREE.InstancedBufferAttribute(bodyStyle, 4));
  const bodyMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: BOOK_VERTEX, fragmentShader: BOOK_FRAGMENT, side: THREE.DoubleSide });
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, capacity);
  bodies.frustumCulled = false;
  const leather = new THREE.Color();
  for (let index = 0; index < capacity; index++) bodies.setColorAt(index, leather.set(LEATHERS[index % LEATHERS.length]));
  group.add(bodies);

  // Loose pages: LOOSE_PAGES resting sheets + 1 flipper per open book.
  const pageGeometry = new THREE.PlaneGeometry(PAGE_LENGTH, BOOK_HEIGHT * 0.94, 10, 1).translate(PAGE_LENGTH / 2, 0, 0);
  const perBook = LOOSE_PAGES + 1;
  const pageCount = Math.max(1, openCapacity * perBook);
  const pageFan = new Float32Array(pageCount);
  const pageFlipper = new Float32Array(pageCount);
  const pageBookSeed = new Float32Array(pageCount);
  const pageOpen = new Float32Array(pageCount);
  const pageSize = new Float32Array(pageCount * 3).fill(1);
  const pageOpenAttribute = new THREE.InstancedBufferAttribute(pageOpen, 1);
  pageOpenAttribute.setUsage(THREE.DynamicDrawUsage);
  pageGeometry.setAttribute('aPage', new THREE.InstancedBufferAttribute(pageFan, 1));
  pageGeometry.setAttribute('aFlipper', new THREE.InstancedBufferAttribute(pageFlipper, 1));
  pageGeometry.setAttribute('aBookSeed', new THREE.InstancedBufferAttribute(pageBookSeed, 1));
  pageGeometry.setAttribute('aOpen', pageOpenAttribute);
  pageGeometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(pageSize, 3));
  const pageMaterial = new THREE.ShaderMaterial({ uniforms, vertexShader: PAGE_VERTEX, fragmentShader: PAGE_FRAGMENT, side: THREE.DoubleSide });
  const pages = new THREE.InstancedMesh(pageGeometry, pageMaterial, pageCount);
  pages.frustumCulled = false;
  group.add(pages);

  let flights: BookFlight[] = [];
  let openBookCount = 0;
  const matrix = new THREE.Matrix4();

  const place = (closed: Placement[], open: Placement[]) => {
    const openPlacements = open.slice(0, openCapacity);
    const closedPlacements = closed.slice(0, closedCapacity);
    openBookCount = openPlacements.length;
    flights = [...openPlacements.map((placement) => ({ placement, open: true })), ...closedPlacements.map((placement) => ({ placement, open: false }))].map(
      ({ placement, open: isOpen }, index) => {
        const random = seededRandom(Math.floor(placement.seed * 4294967296));
        const tumbleAxis = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5);
        if (tumbleAxis.lengthSq() < 1e-4) tumbleAxis.set(0.3, 1, 0.2);
        tumbleAxis.normalize();
        // Size: a little narrower or wider, much taller or squatter, thin to fat.
        bodySize.set([0.85 + random() * 0.3, 0.8 + random() * 0.45, 0.55 + random() * 1.15], index * 3);
        const ribbonLength = isOpen ? 0.4 + random() * 0.3 : 0.18 + random() * 0.15;
        bodyStyle.set([placement.seed, ribbonLength, random() < 0.35 ? 1 : 0, random()], index * 4);
        leather.set(LEATHERS[Math.floor(random() * LEATHERS.length)]).multiplyScalar(0.8 + random() * 0.4);
        bodies.setColorAt(index, leather);
        return {
          placement,
          open: isOpen,
          beatRate: 6.2831853 * (0.32 + random() * 0.3),
          beatPhase: random() * 6.2831853,
          tumbleAxis,
          tumbleRate: (random() < 0.5 ? -1 : 1) * (0.08 + random() * 0.12),
          ajar: !isOpen && random() < 0.35 ? 0.12 + random() * 0.2 : 0,
        };
      },
    );
    bodies.count = flights.length;
    pages.count = openBookCount * perBook;
    for (let bookIndex = 0; bookIndex < openBookCount; bookIndex++) {
      for (let sheet = 0; sheet < perBook; sheet++) {
        const index = bookIndex * perBook + sheet;
        const isFlipper = sheet === LOOSE_PAGES;
        pageFan[index] = isFlipper ? 0 : (sheet + 0.5) / LOOSE_PAGES;
        pageFlipper[index] = isFlipper ? 1 : 0;
        pageBookSeed[index] = flights[bookIndex].placement.seed;
        pageSize.set(bodySize.subarray(bookIndex * 3, bookIndex * 3 + 3), index * 3);
      }
    }
    for (const name of ['aSize', 'aStyle']) bodyGeometry.getAttribute(name).needsUpdate = true;
    for (const name of ['aPage', 'aFlipper', 'aBookSeed', 'aSize']) pageGeometry.getAttribute(name).needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  };

  return {
    group,
    place,
    update(t) {
      flights.forEach((flight, index) => {
        bookMatrix(flight, t, matrix);
        bodies.setMatrixAt(index, matrix);
        bodyOpen[index] = openingAngle(flight, t);
        if (index >= openBookCount) return;
        for (let sheet = 0; sheet < perBook; sheet++) {
          const pageIndex = index * perBook + sheet;
          pages.setMatrixAt(pageIndex, matrix);
          // Each sheet trails the beat a little more: the pages fan like feathers.
          pageOpen[pageIndex] = beatAngle(flight, t - 0.05 - 0.035 * Math.abs(sheet - LOOSE_PAGES / 2));
        }
      });
      bodies.instanceMatrix.needsUpdate = true;
      pages.instanceMatrix.needsUpdate = true;
      bodyOpenAttribute.needsUpdate = true;
      pageOpenAttribute.needsUpdate = true;
    },
    dispose() {
      bodyGeometry.dispose();
      pageGeometry.dispose();
      bodyMaterial.dispose();
      pageMaterial.dispose();
      bodies.dispose();
      pages.dispose();
    },
  };
}

export { createBooks };
// The book's parts, for the spell's summoned book (`world/spellProps.ts`), which
// builds its own single book from them with its own uniforms.
export { BOOK_FRAGMENT, BOOK_HEIGHT, BOOK_VERTEX, BOOK_WIDTH, LOOSE_PAGES, PAGE_FRAGMENT, PAGE_LENGTH, PAGE_VERTEX, bookBodyGeometry };
export type { Books };
