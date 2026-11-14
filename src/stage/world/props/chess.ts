import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LIGHTING_GLSL, lightingUniforms } from '../../engine/lighting';
import type { StageContext } from '../../engine/contract';
import type { ChessPiece, Placement } from './propLayout';

/**
 * Giant chess pieces standing on the checker far off near the horizon — the
 * floor IS a board, and a few pieces there give the scene its scale. Generic
 * Staunton-like silhouettes (not any film's set): the rook, bishop and pawn
 * are `LatheGeometry` profiles; the knight is an original horse-head outline
 * extruded with a bevel, on a turned base. Lacquered ebony or ivory under the
 * moonlight; distance haze makes them melt into the horizon like the tiles.
 * The rook's turret carries five solid merlons — extruded annular sectors
 * merged with its lathe — round a recessed top.
 */

type Profile = [number, number][];

const BASE: Profile = [
  [0, 0],
  [0.2, 0],
  [0.21, 0.03],
  [0.19, 0.06],
  [0.16, 0.08],
  [0.17, 0.1],
  [0.13, 0.12],
];

/** The rook's turret: the merlons stand on its rim, from these radii up. */
const ROOK_TURRET_TOP = 0.56;
const ROOK_TURRET_OUTER = 0.152;
const ROOK_TURRET_INNER = 0.104;
const ROOK_MERLON_HEIGHT = 0.08;
const ROOK_MERLONS = 5;

const PROFILES: Record<Exclude<ChessPiece, 'knight'>, Profile> = {
  pawn: [...BASE, [0.08, 0.3], [0.12, 0.32], [0.07, 0.35], [0.09, 0.38], [0.1, 0.43], [0.08, 0.48], [0.04, 0.51], [0, 0.515]],
  // Staunton rook: a tower tapering up from the base, a collar ring, a
  // flared turret, then (`rookGeometry`) five merlons round a recessed top.
  rook: [
    ...BASE,
    [0.128, 0.16],
    [0.118, 0.26],
    [0.108, 0.35],
    [0.104, 0.38],
    [0.128, 0.385],
    [0.134, 0.398],
    [0.128, 0.41],
    [0.108, 0.416],
    [0.108, 0.43],
    [0.122, 0.445],
    [0.142, 0.462],
    [ROOK_TURRET_OUTER, 0.478],
    [ROOK_TURRET_OUTER, ROOK_TURRET_TOP],
    [ROOK_TURRET_INNER, ROOK_TURRET_TOP],
    [ROOK_TURRET_INNER, 0.53],
    [0.09, 0.52],
    [0, 0.52],
  ],
  bishop: [...BASE, [0.07, 0.4], [0.12, 0.43], [0.07, 0.46], [0.1, 0.52], [0.11, 0.6], [0.08, 0.68], [0.03, 0.73], [0.04, 0.76], [0, 0.78]],
};

function latheOf(profile: Profile): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([radius, y]) => new THREE.Vector2(radius, y)),
    32,
  ).toNonIndexed();
}

/** One merlon: an annular sector of the turret's rim, extruded upward. */
function merlonGeometry(index: number): THREE.BufferGeometry {
  const step = (Math.PI * 2) / ROOK_MERLONS;
  // Merlons fill 58 % of the rim; the crenels (gaps) the rest.
  const halfSpan = step * 0.29;
  const centre = index * step;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, ROOK_TURRET_OUTER, centre - halfSpan, centre + halfSpan, false);
  shape.absarc(0, 0, ROOK_TURRET_INNER, centre + halfSpan * 1.12, centre - halfSpan * 1.12, true);
  shape.closePath();
  const bevel = 0.006;
  const merlon = new THREE.ExtrudeGeometry(shape, {
    depth: ROOK_MERLON_HEIGHT - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: 0.004,
    bevelOffset: -0.004,
    bevelSegments: 2,
    curveSegments: 6,
  });
  // Extruded along +z: stand it up (the extrusion becomes +y) on the rim.
  merlon.rotateX(-Math.PI / 2);
  merlon.translate(0, ROOK_TURRET_TOP + bevel, 0);
  return merlon;
}

function rookGeometry(): THREE.BufferGeometry {
  const tower = latheOf(PROFILES.rook).deleteAttribute('uv');
  const merlons = Array.from({ length: ROOK_MERLONS }, (_, index) => merlonGeometry(index).deleteAttribute('uv'));
  const merged = mergeGeometries([tower, ...merlons]);
  tower.dispose();
  for (const merlon of merlons) merlon.dispose();
  if (!merged) throw new Error('[chess] could not merge the rook');
  return merged;
}

/** An original stylised horse head, facing +x, in a 0.4 × 0.5 box. */
function knightGeometry(): THREE.BufferGeometry {
  const head = new THREE.Shape();
  head.moveTo(-0.12, 0.12);
  head.lineTo(0.11, 0.12);
  head.quadraticCurveTo(0.06, 0.24, 0.12, 0.34);
  head.lineTo(0.2, 0.38);
  head.quadraticCurveTo(0.22, 0.43, 0.17, 0.45);
  head.lineTo(0.07, 0.47);
  head.lineTo(0.03, 0.56);
  head.lineTo(-0.01, 0.5);
  head.quadraticCurveTo(-0.13, 0.46, -0.14, 0.3);
  head.quadraticCurveTo(-0.15, 0.2, -0.12, 0.12);
  const extruded = new THREE.ExtrudeGeometry(head, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 3, curveSegments: 8 });
  extruded.translate(0, 0, -0.06);
  const base = latheOf(BASE);
  // Extrude output is already non-indexed.
  const merged = mergeGeometries([extruded.deleteAttribute('uv'), base.deleteAttribute('uv')]);
  extruded.dispose();
  base.dispose();
  if (!merged) throw new Error('[chess] could not merge the knight');
  return merged;
}

const PIECE_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vToEye;
varying float vDistance;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vToEye = cameraPosition - worldPosition.xyz;
  vDistance = length(vToEye);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const PIECE_FRAGMENT = /* glsl */ `${LIGHTING_GLSL}
uniform vec3 uAlbedo;
varying vec3 vNormal;
varying vec3 vToEye;
varying float vDistance;
void main() {
  vec3 colour = shadeSurface(uAlbedo, vNormal, vToEye, 70.0, 0.6);
  gl_FragColor = vec4(fogFromEye(colour, vToEye), 1.0);
}
`;

type Chess = {
  group: THREE.Group;
  place(placements: (Placement & { piece: ChessPiece })[]): void;
  dispose(): void;
};

function createChess(context: StageContext): Chess {
  const group = new THREE.Group();
  const geometries: Record<ChessPiece, THREE.BufferGeometry> = {
    pawn: latheOf(PROFILES.pawn),
    rook: rookGeometry(),
    bishop: latheOf(PROFILES.bishop),
    knight: knightGeometry(),
  };
  const lighting = lightingUniforms(context.palette);
  const ebony = new THREE.ShaderMaterial({ uniforms: { ...lighting, uAlbedo: { value: new THREE.Color('#14141c') } }, vertexShader: PIECE_VERTEX, fragmentShader: PIECE_FRAGMENT });
  const ivory = new THREE.ShaderMaterial({ uniforms: { ...lighting, uAlbedo: { value: new THREE.Color('#d9d3c4') } }, vertexShader: PIECE_VERTEX, fragmentShader: PIECE_FRAGMENT });
  const meshes: THREE.Mesh[] = [];

  return {
    group,
    place(placements) {
      for (const mesh of meshes) group.remove(mesh);
      meshes.length = 0;
      placements.forEach((placement, index) => {
        const mesh = new THREE.Mesh(geometries[placement.piece], index % 2 === 0 ? ebony : ivory);
        mesh.position.set(placement.x, placement.y, placement.z);
        mesh.rotation.y = placement.yaw;
        mesh.scale.setScalar(placement.scale);
        meshes.push(mesh);
        group.add(mesh);
      });
    },
    dispose() {
      for (const geometry of Object.values(geometries)) geometry.dispose();
      ebony.dispose();
      ivory.dispose();
    },
  };
}

/** One piece's geometry (base at y = 0, ~0.5–0.8 tall): the video kit's crystal board reuses the silhouettes. */
function chessPieceGeometry(piece: ChessPiece): THREE.BufferGeometry {
  if (piece === 'rook') return rookGeometry();
  if (piece === 'knight') return knightGeometry();
  return latheOf(PROFILES[piece]);
}

export { chessPieceGeometry, createChess };
export type { Chess };
