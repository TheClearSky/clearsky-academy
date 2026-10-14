import type { CardFaceModel } from './model';
import type { Pen } from './pen';

/**
 * The art inside each card's window: one procedural line drawing per course
 * (research › D3), flat and modern — accent hairlines, one or two solid
 * accent shapes for the focal point, white space. Coordinates are
 * millimetres inside the window box.
 *
 *  - compass    (Class IX)  — a compass-and-straightedge construction and an atom;
 *  - prism      (Class X)   — white light through a prism into a spectrum (holo);
 *  - projectile (Class XI)  — a projectile's parabola with its velocity vectors;
 *  - field      (Class XII) — the field lines of a dipole;
 *  - crown      (JEE Main, the King) — a court card's mirror symmetry: a
 *    benzene ring crowning a unit circle, turned 180° below;
 *  - rosette    (JEE Advanced, the Ace) — one big gold-foil star pip in an
 *    orbital rosette, like the ace of spades.
 */

type Box = { left: number; top: number; width: number; height: number };

function arrow(context: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, head = 1.4) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  context.beginPath();
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();
  context.beginPath();
  context.moveTo(toX, toY);
  context.lineTo(toX - Math.cos(angle - 0.4) * head, toY - Math.sin(angle - 0.4) * head);
  context.lineTo(toX - Math.cos(angle + 0.4) * head, toY - Math.sin(angle + 0.4) * head);
  context.closePath();
  context.fill();
}

function compass(context: CanvasRenderingContext2D, pen: Pen, accent: string, centreX: number, centreY: number) {
  const radius = 14;
  context.strokeStyle = pen('ink', accent);
  context.fillStyle = pen('ink', accent);
  context.lineWidth = 0.45;
  context.beginPath();
  context.arc(centreX, centreY, radius, 0, Math.PI * 2);
  context.stroke();
  const vertices = [0, 1, 2].map((index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / 3;
    return [centreX + Math.cos(angle) * radius, centreY + Math.sin(angle) * radius] as const;
  });
  context.beginPath();
  vertices.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
  context.closePath();
  context.stroke();
  // Construction arcs from two vertices.
  context.lineWidth = 0.25;
  context.setLineDash([0.9, 0.9]);
  for (const [x, y] of vertices.slice(1)) {
    context.beginPath();
    context.arc(x, y, radius * Math.sqrt(3), -Math.PI * 0.95, -Math.PI * 0.05);
    context.stroke();
  }
  context.setLineDash([]);
  for (const [x, y] of vertices) {
    context.beginPath();
    context.arc(x, y, 0.9, 0, Math.PI * 2);
    context.fill();
  }
  // The compass itself, standing on the top vertex.
  const [apexX, apexY] = vertices[0];
  context.lineWidth = 0.6;
  context.beginPath();
  context.moveTo(apexX, apexY);
  context.lineTo(apexX + 5.5, apexY - 15);
  context.lineTo(apexX + 11, apexY);
  context.stroke();
  context.beginPath();
  context.arc(apexX + 5.5, apexY - 15, 1.2, 0, Math.PI * 2);
  context.fill();
  // A small atom, bottom right.
  const atomX = centreX + 15;
  const atomY = centreY + 15;
  context.lineWidth = 0.3;
  for (const tilt of [0, Math.PI / 3, -Math.PI / 3]) {
    context.beginPath();
    context.ellipse(atomX, atomY, 5.2, 1.9, tilt, 0, Math.PI * 2);
    context.stroke();
  }
  context.beginPath();
  context.arc(atomX, atomY, 1.1, 0, Math.PI * 2);
  context.fill();
}

const SPECTRUM = ['#e2453c', '#f08a2c', '#f2c94c', '#3fb26b', '#2f80ed', '#7b4fd6'];

function prism(context: CanvasRenderingContext2D, pen: Pen, accent: string, centreX: number, centreY: number) {
  const size = 17;
  const top: [number, number] = [centreX, centreY - size * 0.62];
  const left: [number, number] = [centreX - size * 0.6, centreY + size * 0.42];
  const right: [number, number] = [centreX + size * 0.6, centreY + size * 0.42];
  // The incoming white beam.
  context.strokeStyle = pen('ink', accent);
  context.lineWidth = 0.7;
  context.beginPath();
  context.moveTo(centreX - 26, centreY + 4);
  context.lineTo(centreX - size * 0.3, centreY - 1.5);
  context.stroke();
  // The spectrum fanning out (the holo channel: it shimmers on holo cards).
  SPECTRUM.forEach((colour, index) => {
    context.strokeStyle = pen('window', colour);
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(centreX + size * 0.28, centreY - 1.2);
    context.lineTo(centreX + 27, centreY - 5 + index * 2.6);
    context.stroke();
  });
  // The prism: a solid accent triangle with a light inner edge.
  context.fillStyle = pen('ink', accent);
  context.globalAlpha = pen.mask ? 1 : 0.16;
  context.beginPath();
  context.moveTo(...top);
  context.lineTo(...right);
  context.lineTo(...left);
  context.closePath();
  context.fill();
  context.globalAlpha = 1;
  context.strokeStyle = pen('ink', accent);
  context.lineWidth = 0.55;
  context.stroke();
  // A lens below, with its two focal points.
  context.lineWidth = 0.35;
  context.beginPath();
  context.ellipse(centreX, centreY + 16.5, 1.6, 4.2, 0, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([0.8, 0.8]);
  context.beginPath();
  context.moveTo(centreX - 18, centreY + 16.5);
  context.lineTo(centreX + 18, centreY + 16.5);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = pen('ink', accent);
  for (const offset of [-9, 9]) {
    context.beginPath();
    context.arc(centreX + offset, centreY + 16.5, 0.7, 0, Math.PI * 2);
    context.fill();
  }
}

function projectile(context: CanvasRenderingContext2D, pen: Pen, accent: string, box: Box) {
  const groundY = box.top + box.height - 9;
  const startX = box.left + 6;
  const endX = box.left + box.width - 6;
  const peakY = box.top + 11;
  context.strokeStyle = pen('ink', accent);
  context.fillStyle = pen('ink', accent);
  context.lineWidth = 0.35;
  context.beginPath();
  context.moveTo(box.left + 3, groundY);
  context.lineTo(box.left + box.width - 3, groundY);
  context.stroke();
  // The parabola, dashed.
  context.lineWidth = 0.5;
  context.setLineDash([1.1, 0.9]);
  context.beginPath();
  for (let step = 0; step <= 40; step++) {
    const p = step / 40;
    const x = startX + (endX - startX) * p;
    const y = groundY - (groundY - peakY) * 4 * p * (1 - p);
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.setLineDash([]);
  // Velocity vectors at three points; the ball at the peak.
  context.lineWidth = 0.45;
  for (const p of [0.12, 0.5, 0.86]) {
    const x = startX + (endX - startX) * p;
    const y = groundY - (groundY - peakY) * 4 * p * (1 - p);
    const slope = -(groundY - peakY) * 4 * (1 - 2 * p) / (endX - startX);
    const length = 8;
    const norm = Math.hypot(1, slope);
    arrow(context, x, y, x + (length / norm), y + (slope * length) / norm);
  }
  const peakX = (startX + endX) / 2;
  context.beginPath();
  context.arc(peakX, peakY, 2.1, 0, Math.PI * 2);
  context.fill();
  // The launch vector triangle.
  context.lineWidth = 0.3;
  context.setLineDash([0.7, 0.7]);
  context.beginPath();
  context.moveTo(startX, groundY);
  context.lineTo(startX + 9, groundY);
  context.lineTo(startX + 9, groundY - 12);
  context.stroke();
  context.setLineDash([]);
  context.lineWidth = 0.45;
  arrow(context, startX, groundY, startX + 9, groundY - 12);
  context.beginPath();
  context.arc(startX, groundY, 3.4, -Math.atan2(12, 9), 0);
  context.stroke();
}

function field(context: CanvasRenderingContext2D, pen: Pen, accent: string, centreX: number, centreY: number) {
  const separation = 11;
  context.strokeStyle = pen('ink', accent);
  context.lineWidth = 0.35;
  // Field lines: circles through both charges (a dipole's lines in the plane).
  for (const offset of [5, 9, 15, 26]) {
    for (const side of [-1, 1]) {
      const radius = Math.hypot(separation, offset);
      context.beginPath();
      context.arc(centreX, centreY + side * offset, radius, 0, Math.PI * 2);
      context.stroke();
    }
  }
  context.beginPath();
  context.moveTo(centreX - 30, centreY);
  context.lineTo(centreX + 30, centreY);
  context.stroke();
  context.fillStyle = pen('ink', accent);
  for (const [x, sign] of [
    [centreX - separation, 1],
    [centreX + separation, -1],
  ] as const) {
    context.fillStyle = pen('ink', accent);
    context.beginPath();
    context.arc(x, centreY, 3.1, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = pen('paper', '#ffffff');
    context.lineWidth = 0.6;
    context.beginPath();
    context.moveTo(x - 1.4, centreY);
    context.lineTo(x + 1.4, centreY);
    if (sign > 0) {
      context.moveTo(x, centreY - 1.4);
      context.lineTo(x, centreY + 1.4);
    }
    context.stroke();
    context.strokeStyle = pen('ink', accent);
    context.lineWidth = 0.35;
  }
}

function crownHalf(context: CanvasRenderingContext2D, pen: Pen, accent: string, centreX: number, centreY: number) {
  // A benzene ring crowning the upper half of a unit circle.
  context.strokeStyle = pen('ink', accent);
  context.fillStyle = pen('ink', accent);
  context.lineWidth = 0.45;
  const ringY = centreY - 11;
  const hexagon = 5.4;
  context.beginPath();
  for (let corner = 0; corner <= 6; corner++) {
    const angle = Math.PI / 6 + (corner * Math.PI) / 3;
    const x = centreX + Math.cos(angle) * hexagon;
    const y = ringY + Math.sin(angle) * hexagon;
    if (corner === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.beginPath();
  context.arc(centreX, ringY, hexagon * 0.55, 0, Math.PI * 2);
  context.stroke();
  // Crown points rising from the ring.
  context.lineWidth = 0.35;
  for (const angle of [-0.9, -0.45, 0, 0.45, 0.9]) {
    const baseX = centreX + Math.sin(angle) * 9;
    const baseY = ringY - 4 - Math.cos(angle) * 2;
    context.beginPath();
    context.moveTo(baseX, baseY);
    context.lineTo(centreX + Math.sin(angle) * 12, ringY - 9 - Math.cos(angle) * 3);
    context.stroke();
    context.beginPath();
    context.arc(centreX + Math.sin(angle) * 12, ringY - 9 - Math.cos(angle) * 3, 0.8, 0, Math.PI * 2);
    context.fill();
  }
  // The unit circle's upper half with sin/cos projections.
  context.lineWidth = 0.4;
  context.beginPath();
  context.arc(centreX, centreY, 8, Math.PI, 0);
  context.stroke();
  const angle = -Math.PI * 0.3;
  const pointX = centreX + Math.cos(angle) * 8;
  const pointY = centreY + Math.sin(angle) * 8;
  context.setLineDash([0.7, 0.7]);
  context.beginPath();
  context.moveTo(pointX, pointY);
  context.lineTo(pointX, centreY);
  context.moveTo(centreX, centreY);
  context.lineTo(pointX, pointY);
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.arc(pointX, pointY, 0.9, 0, Math.PI * 2);
  context.fill();
}

function rosette(context: CanvasRenderingContext2D, pen: Pen, accent: string, centreX: number, centreY: number, starPath: (size: number) => Path2D) {
  context.strokeStyle = pen('ink', accent);
  context.lineWidth = 0.3;
  // An orbital rosette (a Lissajous-like rose curve).
  context.beginPath();
  for (let step = 0; step <= 720; step++) {
    const t = (step / 720) * Math.PI * 2;
    const radius = 17 * Math.cos(4 * t) * 0.35 + 13;
    const x = centreX + Math.cos(t * 3) * radius * Math.cos(t);
    const y = centreY + Math.sin(t * 3) * radius * Math.cos(t) * 0.5 + Math.sin(t) * radius * 0.6;
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.beginPath();
  context.arc(centreX, centreY, 19, 0, Math.PI * 2);
  context.stroke();
  // The big star pip, gold foil.
  context.save();
  context.translate(centreX, centreY);
  context.fillStyle = pen('foil', '#d9a93c');
  context.fill(starPath(22));
  context.restore();
}

function starPathOf(size: number): Path2D {
  const half = size / 2;
  const path = new Path2D();
  path.moveTo(0, -half);
  path.quadraticCurveTo(half * 0.1, -half * 0.1, half, 0);
  path.quadraticCurveTo(half * 0.1, half * 0.1, 0, half);
  path.quadraticCurveTo(-half * 0.1, half * 0.1, -half, 0);
  path.quadraticCurveTo(-half * 0.1, -half * 0.1, 0, -half);
  return path;
}

function drawIllustration(context: CanvasRenderingContext2D, pen: Pen, model: CardFaceModel, box: Box) {
  const centreX = box.left + box.width / 2;
  const centreY = box.top + box.height / 2 + 2;
  context.save();
  switch (model.illustration) {
    case 'compass':
      compass(context, pen, model.accent, centreX - 3, centreY);
      break;
    case 'prism':
      prism(context, pen, model.accent, centreX, centreY - 4);
      break;
    case 'projectile':
      projectile(context, pen, model.accent, box);
      break;
    case 'field':
      field(context, pen, model.accent, centreX, centreY);
      break;
    case 'crown':
      crownHalf(context, pen, model.accent, centreX, centreY);
      context.translate(centreX * 2, centreY * 2);
      context.rotate(Math.PI);
      crownHalf(context, pen, model.accent, centreX, centreY);
      break;
    case 'rosette':
      rosette(context, pen, model.accent, centreX, centreY, starPathOf);
      break;
  }
  context.restore();
}

export { drawIllustration };
