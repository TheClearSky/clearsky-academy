import * as THREE from 'three';
import { CARD_ASPECT } from './model';

/**
 * One playing card as ONE geometry (one draw call): a rounded rectangle
 * extruded to a real thickness, with a small bevel so the edge is rounded
 * and catches the light. Unit width (scaled to the slot's CSS width), height
 * 1 / CARD_ASPECT, centred, the face toward +z.
 *
 * Attributes for `cardShader.ts`:
 *  - `uv` — 0..1 across the card on both caps (the back is mirrored in the
 *    shader so it reads the right way round when flipped);
 *  - `aPart` — 0 the face, 1 the back, 2 the edge (sides and bevels).
 *
 * The thickness is exaggerated about 6× over real card stock so it reads at
 * screen sizes (owner: "card's thickness is not perceivable, make it more
 * prominent"); the face shader adds a bevel rim highlight on top.
 */

const CARD_WIDTH = 1;
const CARD_HEIGHT = 1 / CARD_ASPECT;
/** 3.5 mm on a 63 mm card. */
const CARD_RADIUS = 3.5 / 63;
const CARD_THICKNESS = 0.03;
const BEVEL = 0.008;

function roundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function createCardGeometry(): THREE.BufferGeometry {
  // The bevel grows the outline, so the shape is inset by it.
  const shape = roundedRectShape(CARD_WIDTH - BEVEL * 2, CARD_HEIGHT - BEVEL * 2, CARD_RADIUS - BEVEL);
  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: CARD_THICKNESS - BEVEL * 2,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL,
    bevelSegments: 3,
    curveSegments: 10,
  });
  extruded.translate(0, 0, -(CARD_THICKNESS - BEVEL * 2) / 2);
  const geometry = extruded.toNonIndexed();
  extruded.dispose();
  geometry.computeVertexNormals();

  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const count = position.count;
  const uv = new Float32Array(count * 2);
  const part = new Float32Array(count);
  // Caps are the triangles whose three normals all point along ±z.
  for (let triangle = 0; triangle < count; triangle += 3) {
    let minimumZ = 1;
    let maximumZ = -1;
    for (let corner = 0; corner < 3; corner++) {
      minimumZ = Math.min(minimumZ, normal.getZ(triangle + corner));
      maximumZ = Math.max(maximumZ, normal.getZ(triangle + corner));
    }
    const value = minimumZ > 0.999 ? 0 : maximumZ < -0.999 ? 1 : 2;
    for (let corner = 0; corner < 3; corner++) part[triangle + corner] = value;
  }
  for (let index = 0; index < count; index++) {
    uv[index * 2] = position.getX(index) / CARD_WIDTH + 0.5;
    uv[index * 2 + 1] = position.getY(index) / CARD_HEIGHT + 0.5;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The card's outline as a flat quad for its shadow (a little larger). */
function createShadowGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(CARD_WIDTH * 1.5, CARD_HEIGHT * 1.4);
}

export { CARD_HEIGHT, CARD_RADIUS, CARD_THICKNESS, CARD_WIDTH, createCardGeometry, createShadowGeometry, roundedRectShape };
