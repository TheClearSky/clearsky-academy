import { CARD_ASPECT } from './model';
import type { CardFaceModel, CardSuit } from './model';
import { drawIllustration } from './illustrations';
import type { Pen } from './pen';
import { MASK, maskPen, inkPen } from './pen';

/**
 * Paints a card's face and back with Canvas2D (vector paths + real text at
 * device pixels) into an ALBEDO canvas and a MASK canvas that tells the
 * shader where the finishes go (research `.claude/research/stage-v2/CARDS.md`
 * › D):
 *  - R — gold foil: 0.5 = foils from the Foil edition up (frame lines,
 *    divider jewel), 1 = always foil (the JEE King's and Ace's index);
 *  - G — holo: the illustration window's background;
 *  - B — spot-UV gloss: every ink (index, pips, linework, text) — premium
 *    printed cards varnish the ink, so it catches the light differently from
 *    the paper; also raised (the shader embosses R + B).
 *
 * Every drawing routine takes a `Pen` (`pen.ts`) that maps a ROLE to a fill:
 * the albedo pen returns the colour, the mask pen the role's channel colour
 * (drawn with "lighter", so channels add). One routine, two passes, always in
 * register.
 *
 * Layout in millimetres on a 63 × 88 card (the poker size), scaled to the
 * canvas — a modern take on the reference deck: bright white stock, rank and
 * suit in two corners and big pips in the other two, a double hairline frame
 * with concave bites round the corners, an illustration window, and a
 * centred nameplate (kicker, title, subjects, progress). Text in the site's
 * font (system-ui, as Nodestra — the owner's ruling).
 */

const CARD_WIDTH_MM = 63;
const CARD_HEIGHT_MM = 88;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

type CardTheme = 'light' | 'dark';

/** The card's inks per theme: bright white stock with dark ink, or an
 *  ink-navy "obsidian" stock with light ink and the accents lifted to pastel
 *  so they read on it (the owner: "make a dark mode of cards too"). */
type CardInks = { stock: string; ink: string; inkSoft: string; track: string };
const INKS: Record<CardTheme, CardInks> = {
  light: { stock: '#fbfaf7', ink: '#1c1a2b', inkSoft: '#4a4560', track: '#e6e2ec' },
  dark: { stock: '#17162b', ink: '#eeedf7', inkSoft: '#a9a6c4', track: '#2e2c48' },
};
type BackInks = { base: string; edge: string; check: string; line: string; medallion: string };
const BACK_INKS: Record<CardTheme, BackInks> = {
  light: { base: '#7448c8', edge: '#5a35a8', check: '#8459d6', line: '#f6f1ff', medallion: '#6a3fc0' },
  dark: { base: '#3a2276', edge: '#221349', check: '#47298c', line: '#d9ccff', medallion: '#2f1b63' },
};

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
function rgbToHex([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue].map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('')}`;
}
function mixHex(from: string, to: string, amount: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]);
}
/** An accent lifted to at least `lightness` (HSL), hue kept — for dark stock. */
function liftAccent(hex: string, lightness = 0.7): string {
  const [red, green, blue] = hexToRgb(hex).map((channel) => channel / 255);
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const current = (high + low) / 2;
  if (current >= lightness) return hex;
  const delta = high - low;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * current - 1));
  let hue = 0;
  if (delta !== 0) {
    if (high === red) hue = ((green - blue) / delta) % 6;
    else if (high === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }
  hue = (hue * 60 + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * Math.min(saturation, 0.85);
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const sector = Math.floor(hue / 60);
  const [r1, g1, b1] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ][sector % 6];
  const offset = lightness - chroma / 2;
  return rgbToHex([(r1 + offset) * 255, (g1 + offset) * 255, (b1 + offset) * 255]);
}

/** The model as painted in a theme: its accent and tint adapted to the stock. */
function themedModel(model: CardFaceModel, theme: CardTheme): CardFaceModel {
  if (theme === 'light') return model;
  const accent = liftAccent(model.accent);
  return { ...model, accent, tint: mixHex(INKS.dark.stock, accent, 0.14) };
}

type Bite = { x: number; y: number; radius: number };

/** A rectangle with concave quarter-circle bites at its corners (TL, TR,
 *  BR, BL; null = a square corner), as a Path2D. */
function bittenRect(x0: number, y0: number, x1: number, y1: number, bites: readonly (Bite | null)[]): Path2D {
  const path = new Path2D();
  const reach = (bite: Bite, offset: number) => Math.sqrt(Math.max(bite.radius * bite.radius - offset * offset, 0));
  const arcTo = (bite: Bite, fromX: number, fromY: number, toX: number, toY: number) => {
    const start = Math.atan2(fromY - bite.y, fromX - bite.x);
    const end = Math.atan2(toY - bite.y, toX - bite.x);
    let delta = end - start;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    path.arc(bite.x, bite.y, bite.radius, start, end, delta < 0);
  };
  const [topLeft, topRight, bottomRight, bottomLeft] = bites;
  const topStart = topLeft ? topLeft.x + reach(topLeft, y0 - topLeft.y) : x0;
  path.moveTo(topStart, y0);
  if (topRight) {
    const topEnd = topRight.x - reach(topRight, y0 - topRight.y);
    const rightStart = topRight.y + reach(topRight, x1 - topRight.x);
    path.lineTo(topEnd, y0);
    arcTo(topRight, topEnd, y0, x1, rightStart);
  } else path.lineTo(x1, y0);
  if (bottomRight) {
    const rightEnd = bottomRight.y - reach(bottomRight, x1 - bottomRight.x);
    const bottomStart = bottomRight.x - reach(bottomRight, y1 - bottomRight.y);
    path.lineTo(x1, rightEnd);
    arcTo(bottomRight, x1, rightEnd, bottomStart, y1);
  } else path.lineTo(x1, y1);
  if (bottomLeft) {
    const bottomEnd = bottomLeft.x + reach(bottomLeft, y1 - bottomLeft.y);
    const leftStart = bottomLeft.y - reach(bottomLeft, x0 - bottomLeft.x);
    path.lineTo(bottomEnd, y1);
    arcTo(bottomLeft, bottomEnd, y1, x0, leftStart);
  } else path.lineTo(x0, y1);
  if (topLeft) {
    const leftEnd = topLeft.y + reach(topLeft, x0 - topLeft.x);
    path.lineTo(x0, leftEnd);
    arcTo(topLeft, x0, leftEnd, topStart, y0);
  }
  path.closePath();
  return path;
}

/** The four suits plus the academy's star, as filled paths in a unit box
 *  centred on the origin (y down). */
function suitPath(suit: CardSuit): Path2D {
  const path = new Path2D();
  switch (suit) {
    case 'heart':
      path.moveTo(0, 0.46);
      path.bezierCurveTo(-0.12, 0.3, -0.5, 0.08, -0.5, -0.17);
      path.bezierCurveTo(-0.5, -0.38, -0.34, -0.48, -0.2, -0.48);
      path.bezierCurveTo(-0.09, -0.48, -0.02, -0.41, 0, -0.32);
      path.bezierCurveTo(0.02, -0.41, 0.09, -0.48, 0.2, -0.48);
      path.bezierCurveTo(0.34, -0.48, 0.5, -0.38, 0.5, -0.17);
      path.bezierCurveTo(0.5, 0.08, 0.12, 0.3, 0, 0.46);
      break;
    case 'diamond':
      path.moveTo(0, -0.5);
      path.quadraticCurveTo(0.18, -0.2, 0.38, 0);
      path.quadraticCurveTo(0.18, 0.2, 0, 0.5);
      path.quadraticCurveTo(-0.18, 0.2, -0.38, 0);
      path.quadraticCurveTo(-0.18, -0.2, 0, -0.5);
      break;
    case 'spade':
      path.moveTo(0, -0.5);
      path.bezierCurveTo(0.1, -0.32, 0.5, -0.1, 0.5, 0.13);
      path.bezierCurveTo(0.5, 0.3, 0.36, 0.38, 0.23, 0.38);
      path.bezierCurveTo(0.13, 0.38, 0.06, 0.33, 0.03, 0.27);
      path.quadraticCurveTo(0.06, 0.42, 0.17, 0.5);
      path.lineTo(-0.17, 0.5);
      path.quadraticCurveTo(-0.06, 0.42, -0.03, 0.27);
      path.bezierCurveTo(-0.06, 0.33, -0.13, 0.38, -0.23, 0.38);
      path.bezierCurveTo(-0.36, 0.38, -0.5, 0.3, -0.5, 0.13);
      path.bezierCurveTo(-0.5, -0.1, -0.1, -0.32, 0, -0.5);
      break;
    case 'club':
      path.arc(0, -0.24, 0.2, 0, Math.PI * 2);
      path.moveTo(-0.04, 0.1);
      path.arc(-0.24, 0.1, 0.2, 0, Math.PI * 2);
      path.moveTo(0.44, 0.1);
      path.arc(0.24, 0.1, 0.2, 0, Math.PI * 2);
      path.moveTo(-0.05, 0);
      path.lineTo(0.05, 0);
      path.quadraticCurveTo(0.06, 0.38, 0.18, 0.5);
      path.lineTo(-0.18, 0.5);
      path.quadraticCurveTo(-0.06, 0.38, -0.05, 0);
      break;
    case 'star':
      // The academy's four-point star (the sparkle of the effects reference).
      path.moveTo(0, -0.5);
      path.quadraticCurveTo(0.05, -0.05, 0.5, 0);
      path.quadraticCurveTo(0.05, 0.05, 0, 0.5);
      path.quadraticCurveTo(-0.05, 0.05, -0.5, 0);
      path.quadraticCurveTo(-0.05, -0.05, 0, -0.5);
      break;
  }
  return path;
}

function drawSuit(context: CanvasRenderingContext2D, suit: CardSuit, x: number, y: number, size: number, fill: string) {
  context.save();
  context.translate(x, y);
  context.scale(size, size);
  context.fillStyle = fill;
  context.fill(suitPath(suit));
  context.restore();
}

/** Sets the font, shrinking it until `text` fits in `maxWidth` (mm). */
function fitFont(context: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number) {
  let fitted = size;
  context.font = `${weight} ${fitted}px ${FONT}`;
  while (fitted > size * 0.6 && context.measureText(text).width > maxWidth) {
    fitted *= 0.94;
    context.font = `${weight} ${fitted}px ${FONT}`;
  }
}

/** A corner index centred on x: rank over suit at the top, suit over rank
 *  at the bottom. Both stay UPRIGHT — a Roman numeral turned 180° reads as
 *  another rank ("IX" as "XI"). */
function drawIndex(context: CanvasRenderingContext2D, pen: Pen, model: CardFaceModel, x: number, top: number, suitFirst: boolean) {
  const role = model.suit === 'star' ? 'foil' : 'ink';
  const narrow = model.rank.length >= 3;
  context.fillStyle = pen(role, model.accent);
  context.font = `700 ${narrow ? 5.2 : 6.4}px ${FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.letterSpacing = narrow ? '-0.3px' : '0px';
  context.fillText(model.rank, x, suitFirst ? top + 5.2 : top);
  context.letterSpacing = '0px';
  drawSuit(context, model.suit, x, suitFirst ? top + 2 : top + 9.4, 3.9, pen(role, model.accent));
}

function setUp(canvas: HTMLCanvasElement | OffscreenCanvas, width: number): CanvasRenderingContext2D {
  const height = Math.round(width / CARD_ASPECT);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D;
  context.setTransform(width / CARD_WIDTH_MM, 0, 0, height / CARD_HEIGHT_MM, 0, 0);
  context.globalCompositeOperation = 'source-over';
  context.lineJoin = 'round';
  context.lineCap = 'round';
  return context;
}

const FRAME_OUTER = 3;
const FRAME_INNER = 4.1;
const BITE = 14;
const WINDOW = { left: 7, top: 7, right: 56, bottom: 55.5 };

function frameBites(inset: number): Bite[] {
  const radius = BITE + (inset - FRAME_OUTER);
  return [
    { x: FRAME_OUTER, y: FRAME_OUTER, radius },
    { x: CARD_WIDTH_MM - FRAME_OUTER, y: FRAME_OUTER, radius },
    { x: CARD_WIDTH_MM - FRAME_OUTER, y: CARD_HEIGHT_MM - FRAME_OUTER, radius },
    { x: FRAME_OUTER, y: CARD_HEIGHT_MM - FRAME_OUTER, radius },
  ];
}

function windowPath(): Path2D {
  const bites = frameBites(FRAME_INNER + 2.6);
  return bittenRect(WINDOW.left, WINDOW.top, WINDOW.right, WINDOW.bottom, [bites[0], bites[1], null, null]);
}

function drawFace(context: CanvasRenderingContext2D, pen: Pen, model: CardFaceModel, inks: CardInks) {
  // Stock.
  context.fillStyle = pen('paper', inks.stock);
  context.fillRect(0, 0, CARD_WIDTH_MM, CARD_HEIGHT_MM);

  // The illustration window: tint, a soft ray burst, the course's line art.
  const window = windowPath();
  context.save();
  context.clip(window);
  context.fillStyle = pen('window', model.tint);
  context.fillRect(WINDOW.left, WINDOW.top, WINDOW.right - WINDOW.left, WINDOW.bottom - WINDOW.top);
  const centreX = (WINDOW.left + WINDOW.right) / 2;
  const centreY = (WINDOW.top + WINDOW.bottom) / 2 + 2;
  context.strokeStyle = pen('window', model.accent);
  context.globalAlpha = pen.mask ? 1 : 0.09;
  context.lineWidth = 1.1;
  for (let ray = 0; ray < 36; ray++) {
    const angle = (ray / 36) * Math.PI * 2;
    context.beginPath();
    context.moveTo(centreX + Math.cos(angle) * 6, centreY + Math.sin(angle) * 6);
    context.lineTo(centreX + Math.cos(angle) * 50, centreY + Math.sin(angle) * 50);
    context.stroke();
  }
  context.globalAlpha = 1;
  drawIllustration(context, pen, model, { left: WINDOW.left, top: WINDOW.top, width: WINDOW.right - WINDOW.left, height: WINDOW.bottom - WINDOW.top });
  context.restore();
  context.lineWidth = 0.28;
  context.strokeStyle = pen('frame', model.accent);
  context.stroke(window);

  // The double hairline frame with concave bites round all four corners.
  context.strokeStyle = pen('frame', model.accent);
  context.lineWidth = 0.32;
  context.stroke(bittenRect(FRAME_OUTER, FRAME_OUTER, CARD_WIDTH_MM - FRAME_OUTER, CARD_HEIGHT_MM - FRAME_OUTER, frameBites(FRAME_OUTER)));
  context.lineWidth = 0.18;
  context.stroke(bittenRect(FRAME_INNER, FRAME_INNER, CARD_WIDTH_MM - FRAME_INNER, CARD_HEIGHT_MM - FRAME_INNER, frameBites(FRAME_INNER)));

  // Corners: rank + suit top-left and (turned) bottom-right; big pips in the other two.
  drawIndex(context, pen, model, 7.6, 3.9, false);
  drawIndex(context, pen, model, CARD_WIDTH_MM - 7.6, CARD_HEIGHT_MM - 15.2, true);
  const pipRole = model.suit === 'star' ? 'foil' : 'ink';
  drawSuit(context, model.suit, CARD_WIDTH_MM - 7.6, 7.6, 5.4, pen(pipRole, model.accent));
  drawSuit(context, model.suit, 7.6, CARD_HEIGHT_MM - 7.6, 5.4, pen(pipRole, model.accent));

  // The nameplate, centred between the bottom bites.
  const middle = CARD_WIDTH_MM / 2;
  context.strokeStyle = pen('frame', model.accent);
  context.lineWidth = 0.18;
  context.beginPath();
  context.moveTo(middle - 15, 59.2);
  context.lineTo(middle - 2.2, 59.2);
  context.moveTo(middle + 2.2, 59.2);
  context.lineTo(middle + 15, 59.2);
  context.stroke();
  context.save();
  context.translate(middle, 59.2);
  context.rotate(Math.PI / 4);
  context.fillStyle = pen('frame', model.accent);
  context.fillRect(-0.9, -0.9, 1.8, 1.8);
  context.restore();

  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillStyle = pen('ink', model.accent);
  context.letterSpacing = '0.55px';
  fitFont(context, model.kicker.toUpperCase(), 650, 2.5, 38);
  context.fillText(model.kicker.toUpperCase(), middle, 64.4);
  context.letterSpacing = '-0.15px';
  context.fillStyle = pen('ink', inks.ink);
  fitFont(context, model.title, 700, 6.8, 40);
  context.fillText(model.title, middle, 71.6);
  context.letterSpacing = '0px';
  context.fillStyle = pen('ink', inks.inkSoft);
  const subjects = model.subjects.join('  ·  ');
  fitFont(context, subjects, 500, 2.75, 34);
  context.fillText(subjects, middle, 75.9);

  // Progress: a hairline track, the accent fill, a jewel at its head, the percentage.
  const trackLeft = middle - 12;
  const trackRight = middle + 7;
  const trackY = 79.6;
  context.fillStyle = pen('paper', inks.track);
  context.beginPath();
  context.roundRect(trackLeft, trackY - 0.45, trackRight - trackLeft, 0.9, 0.45);
  context.fill();
  const head = trackLeft + (trackRight - trackLeft) * Math.min(1, Math.max(0, model.fraction));
  if (model.fraction > 0) {
    context.fillStyle = pen('ink', model.accent);
    context.beginPath();
    context.roundRect(trackLeft, trackY - 0.45, Math.max(head - trackLeft, 0.9), 0.9, 0.45);
    context.fill();
  }
  context.save();
  context.translate(head, trackY);
  context.rotate(Math.PI / 4);
  context.fillStyle = pen('frame', model.accent);
  context.fillRect(-0.85, -0.85, 1.7, 1.7);
  context.restore();
  context.textAlign = 'left';
  context.fillStyle = pen('ink', inks.ink);
  context.font = `650 2.5px ${FONT}`;
  context.fillText(`${Math.round(model.fraction * 100)}%`, trackRight + 1.8, trackY + 0.9);
}

/** Paints the face's albedo and mask at `width` device pixels. */
function paintFace(albedo: HTMLCanvasElement | OffscreenCanvas, mask: HTMLCanvasElement | OffscreenCanvas, model: CardFaceModel, width: number, theme: CardTheme = 'light'): void {
  const painted = themedModel(model, theme);
  drawFace(setUp(albedo, width), inkPen, painted, INKS[theme]);
  const maskContext = setUp(mask, width);
  maskContext.fillStyle = '#000';
  maskContext.fillRect(0, 0, CARD_WIDTH_MM, CARD_HEIGHT_MM);
  maskContext.globalCompositeOperation = 'lighter';
  drawFace(maskContext, maskPen, painted, INKS[theme]);
}

/** The shared back: lilac-purple with a tone-on-tone harlequin, white
 *  hairlines with concave bites, white corner pips, and a medallion with
 *  the academy's star on the harlequin. */
function drawBack(context: CanvasRenderingContext2D, pen: Pen, inks: BackInks) {
  const middleX = CARD_WIDTH_MM / 2;
  const middleY = CARD_HEIGHT_MM / 2;
  const base = context.createRadialGradient(middleX, middleY, 8, middleX, middleY, 56);
  base.addColorStop(0, inks.base);
  base.addColorStop(1, inks.edge);
  context.fillStyle = pen.mask ? pen('paper', inks.base) : base;
  context.fillRect(0, 0, CARD_WIDTH_MM, CARD_HEIGHT_MM);

  // Harlequin: diamonds on a w × h lattice; the base shows between them as
  // the other colour of the checker.
  context.fillStyle = pen('window', inks.check);
  const cellWidth = 4.6;
  const cellHeight = 6.4;
  for (let row = 0; row <= Math.ceil(CARD_HEIGHT_MM / cellHeight); row++) {
    for (let column = 0; column <= Math.ceil(CARD_WIDTH_MM / cellWidth); column++) {
      const x = column * cellWidth + (CARD_WIDTH_MM % cellWidth) / 2;
      const y = row * cellHeight + (CARD_HEIGHT_MM % cellHeight) / 2;
      context.beginPath();
      context.moveTo(x, y - cellHeight / 2);
      context.lineTo(x + cellWidth / 2, y);
      context.lineTo(x, y + cellHeight / 2);
      context.lineTo(x - cellWidth / 2, y);
      context.closePath();
      context.fill();
    }
  }

  // Border: a white hairline pair with concave bites.
  context.strokeStyle = pen('frame', inks.line);
  context.lineWidth = 0.45;
  const borderBites = (inset: number): Bite[] => {
    const radius = 4 + inset - 6.5;
    return [
      { x: 6.5, y: 6.5, radius },
      { x: CARD_WIDTH_MM - 6.5, y: 6.5, radius },
      { x: CARD_WIDTH_MM - 6.5, y: CARD_HEIGHT_MM - 6.5, radius },
      { x: 6.5, y: CARD_HEIGHT_MM - 6.5, radius },
    ];
  };
  context.stroke(bittenRect(6.5, 6.5, CARD_WIDTH_MM - 6.5, CARD_HEIGHT_MM - 6.5, borderBites(6.5)));
  context.lineWidth = 0.2;
  context.stroke(bittenRect(7.4, 7.4, CARD_WIDTH_MM - 7.4, CARD_HEIGHT_MM - 7.4, borderBites(7.4)));

  // Corner pips: ♦ ♠ / ♣ ♥.
  const pip = pen('ink', inks.line);
  drawSuit(context, 'diamond', 4.3, 4.3, 4.2, pip);
  drawSuit(context, 'spade', CARD_WIDTH_MM - 4.3, 4.3, 4.2, pip);
  drawSuit(context, 'club', 4.3, CARD_HEIGHT_MM - 4.3, 4.2, pip);
  drawSuit(context, 'heart', CARD_WIDTH_MM - 4.3, CARD_HEIGHT_MM - 4.3, 4.2, pip);

  // The medallion: a rounded square with the academy's star and name.
  context.fillStyle = pen('paper', inks.medallion);
  context.beginPath();
  context.roundRect(middleX - 9.5, middleY - 9.5, 19, 19, 3.2);
  context.fill();
  context.strokeStyle = pen('frame', inks.line);
  context.lineWidth = 0.35;
  context.stroke();
  drawSuit(context, 'star', middleX, middleY - 2.4, 8.5, pen('foil', '#f3d58a'));
  context.fillStyle = pen('ink', inks.line);
  context.font = `650 1.9px ${FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.letterSpacing = '0.5px';
  context.fillText('CLEARSKY', middleX, middleY + 6.2);
  context.letterSpacing = '0px';
  context.lineWidth = 0.2;
  context.beginPath();
  context.moveTo(middleX - 4, middleY + 3.1);
  context.lineTo(middleX + 4, middleY + 3.1);
  context.stroke();
}

function paintBack(albedo: HTMLCanvasElement | OffscreenCanvas, mask: HTMLCanvasElement | OffscreenCanvas, width: number, theme: CardTheme = 'light', inks: BackInks = BACK_INKS[theme]): void {
  drawBack(setUp(albedo, width), inkPen, inks);
  const maskContext = setUp(mask, width);
  maskContext.fillStyle = '#000';
  maskContext.fillRect(0, 0, CARD_WIDTH_MM, CARD_HEIGHT_MM);
  maskContext.globalCompositeOperation = 'lighter';
  drawBack(maskContext, maskPen, inks);
}

/** The texture width (device px) for a card shown `cssWidth` wide: room for
 *  the hover scale, in 128 px buckets so a resize doesn't repaint every frame. */
function textureWidthFor(cssWidth: number, devicePixelRatio: number): number {
  const wanted = cssWidth * devicePixelRatio * 1.2;
  return Math.min(1024, Math.max(256, Math.ceil(wanted / 128) * 128));
}

export { bittenRect, liftAccent, MASK, paintBack, paintFace, suitPath, textureWidthFor };
export type { BackInks, CardTheme };
