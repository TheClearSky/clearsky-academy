import * as THREE from 'three';

/**
 * A procedural photo-studio environment for the cards' reflections — the
 * missing ingredient of v1 (research › 0.6: "nothing reads as varnished card
 * stock"). Premium cards read as premium because broad softbox highlights
 * slide across the varnish as the card tilts (the classic aces reference).
 *
 * A latitude–longitude canvas (512 × 256): a dim violet room, a large
 * key softbox up-left, a tall strip light right, a long overhead strip and a
 * warm low fill — all placed around +z (behind the viewer: what a card
 * facing the viewer reflects). Mipmapped, so `textureLod` by roughness gives
 * glossy (sharp boxes) to satin (soft glow) from one texture.
 *
 * Lookup (`STUDIO_GLSL`): u = atan(x, z) / 2π + 0.5, v = asin(y) / π + 0.5.
 */

const WIDTH = 512;
const HEIGHT = 256;

/** Canvas x, y for an azimuth (radians, 0 = +z) and elevation (radians). */
function toCanvas(azimuth: number, elevation: number): [number, number] {
  return [(azimuth / (Math.PI * 2) + 0.5) * WIDTH, (0.5 - elevation / Math.PI) * HEIGHT];
}

function softbox(context: CanvasRenderingContext2D, azimuth: number, elevation: number, width: number, height: number, colour: string, blur: number) {
  const [x, y] = toCanvas(azimuth, elevation);
  context.save();
  context.filter = `blur(${blur}px)`;
  context.fillStyle = colour;
  context.beginPath();
  context.roundRect(x - width / 2, y - height / 2, width, height, Math.min(width, height) * 0.2);
  context.fill();
  context.restore();
}

function paintStudio(canvas: HTMLCanvasElement | OffscreenCanvas): void {
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  const room = context.createLinearGradient(0, 0, 0, HEIGHT);
  room.addColorStop(0, '#3a3466');
  room.addColorStop(0.5, '#1d1a3a');
  room.addColorStop(1, '#0a0916');
  context.fillStyle = room;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  softbox(context, -0.55, 0.42, 92, 70, '#ffffff', 3);
  softbox(context, 0.75, 0.12, 26, 120, '#f4f0ff', 2);
  softbox(context, 0.05, 1.05, 260, 16, '#e8e4ff', 3);
  softbox(context, -0.1, -0.35, 160, 30, '#ffd9a8', 10);
  softbox(context, Math.PI - 0.2, 0.3, 120, 60, '#8070c0', 12);
}

function createStudioTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  paintStudio(canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

/** The environment lookup (needs `uniform sampler2D uStudio`). */
const STUDIO_GLSL = /* glsl */ `
uniform sampler2D uStudio;
vec3 studio(vec3 direction, float roughness) {
  vec3 d = normalize(direction);
  // +1e-5: atan(0, 0) is undefined straight up or down.
  vec2 uv = vec2(atan(d.x, d.z + 1e-5) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);
  return textureLod(uStudio, uv, roughness * 7.0).rgb;
}
`;

export { createStudioTexture, STUDIO_GLSL };
