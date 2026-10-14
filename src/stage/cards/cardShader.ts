import { STUDIO_GLSL } from './studioEnv';

/**
 * The card's ONE shader program (research `.claude/research/stage-v2/CARDS.md`
 * › C, E): every card, face, back and edge, every edition — the edition is
 * a set of uniform strengths, not another program.
 *
 *  - Paper: the painted albedo, capped under white so it never blooms, a
 *    soft key light, and VARNISH — reflections of the procedural studio
 *    (`studioEnv.ts`). The owner: "make the shine appear more prominently
 *    only on the edges and corners and for the main face make the shine
 *    more spread out, textured and less intense" — so the face varnish is
 *    rough and faint, broken up by an "air-cushion" dimple finish (the
 *    embossed texture of real playing-card stock), while a BEVEL RIM round
 *    the face (normals rolled outward over its last ~3 %) catches bright,
 *    sharp highlights that pile up in the rounded corners; with the thick
 *    edge, that is what makes the card read as a solid slab.
 *  - Emboss: the mask's ink and foil are raised; their height gradient
 *    bends the normal, so the linework rakes the light.
 *  - Gold foil (mask R): metal that mirrors the studio, plus a light sweep
 *    that crosses the card every few seconds and follows the pointer on
 *    hover. Bright enough (HDR) for the bloom to catch.
 *  - Holo (mask G, Holo edition up): a thin-film rainbow that shifts with
 *    the view angle and moves AGAINST the pointer (the pokemon-cards idea),
 *    plus glitter flakes that flash as the card tilts.
 *  - Prism (complete): a faint rainbow over the whole card.
 *  - Glare: a soft white light where the pointer is, on hover.
 *  - Edge (aPart 2): white stock with a dark core line (casino card
 *    stock), gilded from the Foil edition up.
 *
 * Tone mapping and colour space are applied here (the chunks below): when
 * the stage draws straight to the canvas (the `none` post) three only does
 * that for a ShaderMaterial that includes them — v1's cards didn't (review
 * G1), which crushed them on phones.
 */

const CARD_VERTEX = /* glsl */ `
attribute float aPart;
uniform float uThickness;
varying vec2 vUv;
varying float vPart;
varying float vDepth;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vBitangent;
void main() {
  vUv = uv;
  vPart = aPart;
  vDepth = position.z / (uThickness * 0.5);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  mat3 basis = mat3(modelMatrix);
  vNormal = normalize(basis * normal);
  vTangent = normalize(basis * vec3(1.0, 0.0, 0.0));
  vBitangent = normalize(basis * vec3(0.0, 1.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const CARD_FRAGMENT = /* glsl */ `${STUDIO_GLSL}
uniform sampler2D uFace, uFaceMask, uBack, uBackMask;
uniform vec2 uFaceTexel, uBackTexel;
uniform vec3 uGold, uKeyDirection, uEdgeCore;
uniform vec2 uPointer;
uniform float uTime, uSeed, uHover, uFoil, uHolo, uPrism, uAspect;
varying vec2 vUv;
varying float vPart;
varying float vDepth;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vBitangent;

float cardHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec3 rainbow(float t) {
  return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67)));
}
float reliefAt(sampler2D mask, vec2 p) {
  vec3 m = texture2D(mask, p).rgb;
  return m.b * 0.6 + m.r * 0.4;
}
/** Signed distance to the card's rounded outline, in card widths (< 0 inside). */
float cardOutline(vec2 uv) {
  vec2 halfSize = vec2(0.5, 0.5 / uAspect);
  vec2 p = (uv - 0.5) * vec2(1.0, 1.0 / uAspect);
  float radius = ${(3.5 / 63).toFixed(4)};
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

/** Gold foil: metal mirroring the studio, and the travelling light sweep. */
vec3 goldFoil(vec3 reflected, float diffuse, vec2 uv) {
  vec3 metal = uGold * (0.16 + 1.2 * studio(reflected, 0.12)) + uGold * 0.22 * diffuse;
  float position = fract(uTime * 0.085 + uSeed) * 2.8 - 0.9 + (uPointer.x - 0.5) * 0.8 * uHover;
  // x * x, never pow(x, 2.0): pow of a negative base is undefined in GLSL
  // (NaN on D3D/Mali), and the bloom smears one NaN over the whole frame.
  float offset = (dot(uv, normalize(vec2(1.0, 0.55))) - position) * 9.0;
  float band = exp(-offset * offset);
  return metal + uGold * band * (1.5 + 1.5 * uHover);
}

void main() {
  vec3 viewDirection = normalize(cameraPosition - vWorld);
  vec3 lightDirection = normalize(uKeyDirection);
  vec3 normal = normalize(vNormal);
  vec3 colour;

  if (vPart > 1.5) {
    // The edge: white stock, a dark core line, gilt from the Foil edition.
    vec3 reflected = reflect(-viewDirection, normal);
    float core = 1.0 - smoothstep(0.1, 0.28, abs(vDepth));
    vec3 stock = mix(vec3(0.9, 0.88, 0.93), uEdgeCore, core);
    vec3 paper = stock * (0.55 + 0.45 * max(dot(normal, lightDirection), 0.0)) + studio(reflected, 0.22) * 0.45;
    vec3 gilt = uGold * (0.22 + 1.3 * studio(reflected, 0.15));
    colour = mix(paper, gilt, uFoil);
  } else {
    bool isBack = vPart > 0.5;
    // The back is seen through the card's other side: mirror it so it reads the right way round.
    vec2 uv = isBack ? vec2(1.0 - vUv.x, vUv.y) : vUv;
    vec3 albedo = isBack ? texture2D(uBack, uv).rgb : texture2D(uFace, uv).rgb;
    vec3 mask = isBack ? texture2D(uBackMask, uv).rgb : texture2D(uFaceMask, uv).rgb;
    vec2 texel = isBack ? uBackTexel : uFaceTexel;

    // Emboss: the raised ink and foil bend the normal.
    float left = isBack ? reliefAt(uBackMask, uv - vec2(texel.x, 0.0)) : reliefAt(uFaceMask, uv - vec2(texel.x, 0.0));
    float right = isBack ? reliefAt(uBackMask, uv + vec2(texel.x, 0.0)) : reliefAt(uFaceMask, uv + vec2(texel.x, 0.0));
    float down = isBack ? reliefAt(uBackMask, uv - vec2(0.0, texel.y)) : reliefAt(uFaceMask, uv - vec2(0.0, texel.y));
    float up = isBack ? reliefAt(uBackMask, uv + vec2(0.0, texel.y)) : reliefAt(uFaceMask, uv + vec2(0.0, texel.y));
    vec3 tangent = isBack ? -vTangent : vTangent;
    normal = normalize(normal - (tangent * (right - left) + vBitangent * (up - down)) * 0.6);

    // The bevel rim: over the last ~3 % of the face the normal rolls outward
    // (toward the outline's gradient), as on a rounded slab edge.
    float outline = cardOutline(uv);
    float rimStep = 0.002;
    vec2 outward = vec2(cardOutline(uv + vec2(rimStep, 0.0)) - cardOutline(uv - vec2(rimStep, 0.0)), cardOutline(uv + vec2(0.0, rimStep)) - cardOutline(uv - vec2(0.0, rimStep)));
    outward /= max(length(outward), 1e-5);
    float rim = 1.0 - smoothstep(0.0, 0.03, -outline);
    normal = normalize(normal + (tangent * outward.x + vBitangent * outward.y) * rim * 1.4);

    // The air-cushion finish: a fine grid of shallow dimples that scatters
    // the varnish into a soft, textured sheen; faded out where it would alias.
    vec2 dimpleCells = uv * vec2(130.0, 130.0 / uAspect);
    vec2 dimple = fract(dimpleCells) - 0.5;
    float dimpleDetail = 1.0 - smoothstep(0.35, 0.7, fwidth(dimpleCells.x));
    vec3 texturedNormal = normalize(normal + (tangent * dimple.x + vBitangent * dimple.y) * 0.55 * dimpleDetail * (1.0 - rim));

    float diffuse = max(dot(normal, lightDirection), 0.0);
    float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
    vec3 reflected = reflect(-viewDirection, normal);
    float gloss = mask.b;

    // Paper under the key light, then a faint, wide, textured varnish
    // (a little glossier on the ink)…
    colour = min(albedo, vec3(0.94)) * (0.84 + 0.16 * diffuse);
    vec3 texturedReflection = reflect(-viewDirection, texturedNormal);
    colour += studio(texturedReflection, mix(0.62, 0.42, gloss)) * mix(0.05, 0.09, gloss) * (0.4 + fresnel * 1.6);
    // …and the bright bevel rim, brightest where two edges meet in a corner.
    vec2 cornerQ = abs((uv - 0.5) * vec2(1.0, 1.0 / uAspect)) - vec2(0.5, 0.5 / uAspect) + ${(3.5 / 63).toFixed(4)};
    float corner = smoothstep(-0.02, 0.01, min(cornerQ.x, cornerQ.y));
    vec3 rimLight = studio(reflected, 0.08) * 1.5 + vec3(pow(max(dot(reflected, lightDirection), 0.0), 16.0)) * 1.2 + vec3(0.16);
    colour += rimLight * rim * (0.75 + 0.9 * corner);
    // A hair of shade where the face turns into the edge.
    colour *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.004, -outline));

    // Gold foil: R ½ foils from the Foil edition up, R 1 always.
    float foil = max(smoothstep(0.6, 0.95, mask.r), min(mask.r * 2.0, 1.0) * uFoil);
    colour = mix(colour, goldFoil(reflected, diffuse, uv), foil);

    // Holo: a thin-film rainbow against the pointer, and glitter.
    vec2 pointer = isBack ? vec2(1.0 - uPointer.x, uPointer.y) : uPointer;
    // Holo on the back's harlequin is a quieter pearl than on the face's window.
    float holo = mask.g * uHolo * (isBack ? 0.4 : 1.0);
    float film = dot(uv - 0.5, vec2(0.8, 0.45)) * 2.2 - (pointer.x - 0.5) * 1.3 - (pointer.y - 0.5) * 0.6 + (1.0 - facing) * 3.0 + uTime * 0.02;
    colour = mix(colour, colour * 0.6 + rainbow(film) * 0.45, holo * 0.75);
    vec2 cells = uv * vec2(110.0, 154.0);
    vec2 cell = floor(cells);
    float flake = step(0.8, cardHash(cell + uSeed * 13.0));
    vec3 flakeNormal = normalize(normal + vec3(cardHash(cell + 1.7) - 0.5, cardHash(cell + 3.1) - 0.5, 0.0) * 0.9);
    vec3 glintLight = normalize(vec3((pointer - 0.5) * 1.2 + vec2(0.3 * sin(uTime * 0.7 + uSeed * 6.0), 0.3 * cos(uTime * 0.5)), 1.0));
    float glint = pow(max(dot(reflect(-viewDirection, flakeNormal), glintLight), 0.0), 80.0);
    float flakeDot = 1.0 - smoothstep(0.12, 0.38, length(fract(cells) - 0.5));
    colour += vec3(1.0, 0.95, 0.85) * glint * flakeDot * flake * holo * 3.5;

    // Prism (complete): a faint rainbow over the whole card.
    colour += rainbow(dot(uv, vec2(2.6, 1.7)) + uTime * 0.05 + (1.0 - facing) * 2.0) * 0.07 * uPrism * (1.0 - gloss);

    // Glare where the pointer is: wide and soft.
    float glare = 1.0 - smoothstep(0.0, 1.0, distance(uv, pointer));
    colour += vec3(glare * glare * uHover * 0.06);
  }

  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** The card's soft shadow on the table: a blurred rounded box, offset and
 *  softened as the card lifts; tinted with the accent for the chosen card. */
const SHADOW_VERTEX = /* glsl */ `
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SHADOW_FRAGMENT = /* glsl */ `
uniform vec2 uHalfSize;
uniform float uRadius, uBlur, uOpacity, uGlow;
uniform vec3 uColour, uGlowColour;
varying vec2 vLocal;
float roundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}
void main() {
  float distanceToCard = roundedBox(vLocal, uHalfSize, uRadius);
  float shadow = (1.0 - smoothstep(-uBlur, uBlur, distanceToCard)) * uOpacity;
  float glow = (1.0 - smoothstep(-0.02, uBlur * 3.0 + 0.08, distanceToCard)) * uGlow;
  float alpha = clamp(shadow + glow * 0.6, 0.0, 1.0);
  vec3 colour = mix(uColour, uGlowColour, glow / max(shadow + glow, 1e-4));
  gl_FragColor = vec4(colour, alpha);
  #include <colorspace_fragment>
}
`;

export { CARD_FRAGMENT, CARD_VERTEX, SHADOW_FRAGMENT, SHADOW_VERTEX };
