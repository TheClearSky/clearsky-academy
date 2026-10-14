/**
 * Crystal Line — the rail's layout, pure and unit-tested
 * (`src/__tests__/hud-mix-crystalline.test.ts`). Shared by the HUD's
 * chapter line and the chapter page's topic line (`src/chapter/`), whose
 * labels are long syllabus sentences: `LineOptions` gives them taller
 * labels and a wider pitch. Route Map's line drawn the
 * Mini Metro way: stations alternate between two levels joined by 45°
 * runs (one angle, no crossings), rows wrap through the side gutters, and
 * the labels sit outside the rail — above the upper stations, below the
 * lower ones — so the zig-zag itself makes room for them. One filleted
 * polyline for the lit-path engine.
 */
import { pointAt, stopsAlong, tracePath } from '../../kit/litPath';
import type { Stop, Trace } from '../../kit/litPath';

type Station = { x: number; y: number; row: number; up: boolean; label: { left: number; top: number; width: number; height: number } };

type Line = {
  width: number;
  height: number;
  compact: boolean;
  perRow: number;
  pitch: number;
  radius: number;
  /** The orbit arc round each station (on its label's side). */
  orbit: number;
  stations: Station[];
  trace: Trace;
  stops: Stop[];
  /** Rail sleepers: short ties across the rail every few px, with their distance along. */
  sleepers: { d: string; along: number }[];
};

/** Label room (px) and the narrowest station pitch, compact (< 600 px) and wide. */
type LineOptions = { labelHeight?: [number, number]; minPitch?: [number, number]; labelWidth?: [number, number] };

function lineLayout(count: number, width: number, options: LineOptions = {}): Line {
  const compact = width < 600;
  const pick = (pair: [number, number] | undefined, fallback: [number, number]) => (pair ?? fallback)[compact ? 0 : 1];
  const radius = compact ? 12 : 15;
  const orbit = radius + (compact ? 9 : 13);
  const gutter = compact ? 14 : 34;
  const minPitch = pick(options.minPitch, [100, 134]);
  const inner = width - gutter * 2;
  const perRow = Math.max(2, Math.min(count, Math.floor(inner / minPitch)));
  const pitch = inner / perRow;
  const rise = compact ? 40 : 48;
  const labelHeight = pick(options.labelHeight, [56, 60]);
  const arcRoom = orbit + (compact ? 6 : 8);
  const rowGap = compact ? 14 : 18;
  const rowHeight = labelHeight + arcRoom + rise + arcRoom + labelHeight + rowGap;
  const rows = Math.ceil(count / perRow);
  // Same-side labels are two stations apart (1.6 × pitch clears them); on rows of three both end labels
  // are clamped inwards, so they must also fit side by side within the row.
  const labelWidth = Math.min(pitch * 1.6, pick(options.labelWidth, [190, 230]), perRow === 3 ? (width - gutter) / 2 - 4 : Infinity);

  const stations: Station[] = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / perRow);
    const step = index % perRow;
    const forward = row % 2 === 0;
    const column = forward ? step : perRow - 1 - step;
    const up = index % 2 === 0;
    const x = gutter + (column + 0.5) * pitch;
    const top = row * rowHeight;
    const y = top + labelHeight + arcRoom + (up ? 0 : rise);
    const left = Math.max(gutter * 0.5, Math.min(width - gutter * 0.5 - labelWidth, x - labelWidth / 2));
    const labelTop = up ? y - arcRoom - labelHeight : y + arcRoom;
    return { x, y, row, up, label: { left, top: labelTop, width: labelWidth, height: labelHeight } };
  });

  const points: { x: number; y: number }[] = [];
  const stationPoint: number[] = [];
  const run = Math.max(radius + 6, (pitch - rise) / 2);
  const lead = pitch * 0.42;
  if (count > 0) points.push({ x: stations[0].x - lead, y: stations[0].y });
  stations.forEach((station, index) => {
    stationPoint.push(points.length);
    points.push({ x: station.x, y: station.y });
    const next = stations[index + 1];
    if (!next) return;
    if (next.row === station.row) {
      const direction = Math.sign(next.x - station.x);
      points.push({ x: station.x + direction * run, y: station.y }, { x: next.x - direction * run, y: next.y });
    } else {
      const side = stations[index].row % 2 === 0 ? width - gutter / 2 : gutter / 2;
      points.push({ x: side, y: station.y }, { x: side, y: next.y });
    }
  });
  const last = stations[count - 1];
  if (last) points.push({ x: last.x + (last.row % 2 === 0 ? 1 : -1) * lead, y: last.y });
  const trace = tracePath(points, compact ? 9 : 12);
  const ats = stationPoint.map((index) => trace.vertices[index]);
  const stops = stopsAlong(ats, orbit * 0.5 + 4, lead);

  const sleepers: { d: string; along: number }[] = [];
  const spacing = compact ? 11 : 13;
  const half = compact ? 4 : 5;
  for (let along = spacing / 2; along < trace.length; along += spacing) {
    if (ats.some((at) => Math.abs(at - along) < radius + 3)) continue;
    const point = pointAt(trace, along);
    const radians = ((point.angle + 90) * Math.PI) / 180;
    const dx = Math.cos(radians) * half;
    const dy = Math.sin(radians) * half;
    sleepers.push({ d: `M${(point.x - dx).toFixed(1)} ${(point.y - dy).toFixed(1)}L${(point.x + dx).toFixed(1)} ${(point.y + dy).toFixed(1)}`, along });
  }

  return { width, height: rows * rowHeight - rowGap, compact, perRow, pitch, radius, orbit, stations, trace, stops, sleepers };
}

/** Topic gems on a station's half-orbit (over the top for upper stations, under for lower), in order. */
function orbitGems(total: number, orbit: number, up: boolean): { x: number; y: number }[] {
  return Array.from({ length: total }, (_, index) => {
    const t = (index + 0.5) / total;
    const angle = up ? Math.PI + t * Math.PI : Math.PI - t * Math.PI;
    return { x: Math.cos(angle) * orbit, y: Math.sin(angle) * orbit };
  });
}

/** The half-orbit as path data, from 9 to 3 o'clock on the label's side. */
function halfOrbit(orbit: number, up: boolean): string {
  return up ? `M${-orbit} 0A${orbit} ${orbit} 0 0 1 ${orbit} 0` : `M${-orbit} 0A${orbit} ${orbit} 0 0 0 ${orbit} 0`;
}

export { halfOrbit, lineLayout, orbitGems };
export type { Line, LineOptions, Station };
