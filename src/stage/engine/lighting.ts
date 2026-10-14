import * as THREE from 'three';
import { AIR_GLSL, airUniforms } from './air';
import type { StagePalette } from './palette';

/**
 * One light rig for every prop, so they read as lit by the same night:
 * a cool moonlight key from up-left-front, a hemisphere ambient (the sky's
 * blue above, the dark floor below), a Blinn highlight for varnish and gilt,
 * a rim in the horizon haze colour (it separates dark props from the dark
 * sky), and the shared air (`air.ts`): a far chess piece fogs into the
 * sky behind it exactly as the tiles do.
 */

const LIGHTING_GLSL = /* glsl */ `${AIR_GLSL}
uniform vec3 uKeyDirection, uKeyColour, uAmbientSky, uAmbientGround, uRimColour;
vec3 shadeSurface(vec3 albedo, vec3 normal, vec3 toEye, float gloss, float specular) {
  vec3 n = normalize(normal);
  vec3 v = normalize(toEye);
  vec3 l = normalize(uKeyDirection);
  vec3 ambient = mix(uAmbientGround, uAmbientSky, n.y * 0.5 + 0.5);
  float diffuse = max(dot(n, l), 0.0);
  // max(gloss, 1.0): pow(0, a negative exponent) is Inf, and the fog's mix
  // turns it into a NaN the bloom smears over the frame.
  float highlight = pow(max(dot(n, normalize(l + v)), 0.0), max(gloss, 1.0)) * specular;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  return albedo * (ambient + uKeyColour * diffuse) + uKeyColour * highlight + uRimColour * rim * 0.35;
}
/** The air's fog for a surface seen along toEye (= cameraPosition - world). */
vec3 fogFromEye(vec3 colour, vec3 toEye) {
  return airFog(colour, cameraPosition - toEye);
}
`;

function lightingUniforms(palette: StagePalette): Record<string, THREE.IUniform> {
  return {
    uKeyDirection: { value: new THREE.Vector3(-0.45, 0.8, 0.4).normalize() },
    uKeyColour: { value: palette.moonlight },
    uAmbientSky: { value: palette.ambientSky },
    uAmbientGround: { value: palette.ambientGround },
    uRimColour: { value: palette.haze },
    ...airUniforms(palette),
  };
}

/** Instanced-or-not world position and normal, for ShaderMaterial vertex
 *  shaders (three defines `instanceMatrix` when the mesh is instanced). */
const WORLD_VERTEX_GLSL = /* glsl */ `
mat4 worldMatrix() {
  #ifdef USE_INSTANCING
    return modelMatrix * instanceMatrix;
  #else
    return modelMatrix;
  #endif
}
`;

export { LIGHTING_GLSL, lightingUniforms, WORLD_VERTEX_GLSL };
