import { BENCH, PART_SIZE } from './catalog';
import type { Circuit, CircuitComponent, ComponentType } from '../model/types';

export interface Point {
  x: number;
  y: number;
}

/** Top-left corner that keeps the whole part inside the mat. Rounded so positions stay tidy numbers. */
export function clampPosition(type: ComponentType, x: number, y: number): Point {
  const { width, height } = PART_SIZE[type];
  const maxX = BENCH.width - width;
  const maxY = BENCH.height - height;
  return {
    x: Math.round(Math.min(Math.max(x, 0), maxX)),
    y: Math.round(Math.min(Math.max(y, 0), maxY)),
  };
}

/** A drop lands with the part centred on the pointer. */
export function topLeftFromCenter(type: ComponentType, cx: number, cy: number): Point {
  const { width, height } = PART_SIZE[type];
  return clampPosition(type, cx - width / 2, cy - height / 2);
}

function overlaps(a: Point & { type: ComponentType }, b: CircuitComponent, gap: number): boolean {
  const sa = PART_SIZE[a.type];
  const sb = PART_SIZE[b.type];
  return (
    a.x < b.x + sb.width + gap &&
    b.x < a.x + sa.width + gap &&
    a.y < b.y + sb.height + gap &&
    b.y < a.y + sa.height + gap
  );
}

const SPOT_STEP = 24; // the dot-grid spacing, so keyboard placements line up with the mat
const SPOT_GAP = 24;
const SPOT_MARGIN = 48;

/**
 * Where Enter on a shelf tile puts a part: the first spot, scanning left to right then top to
 * bottom, that touches no other part. If the mat is crowded the scan ends on a clamped corner,
 * so placing always works.
 */
export function nextFreeSpot(circuit: Circuit, type: ComponentType): Point {
  const { width, height } = PART_SIZE[type];
  for (let y = SPOT_MARGIN; y <= BENCH.height - height - SPOT_MARGIN; y += SPOT_STEP) {
    for (let x = SPOT_MARGIN; x <= BENCH.width - width - SPOT_MARGIN; x += SPOT_STEP) {
      const candidate = { type, x, y };
      if (!circuit.components.some((c) => overlaps(candidate, c, SPOT_GAP))) return { x, y };
    }
  }
  return clampPosition(type, SPOT_MARGIN, SPOT_MARGIN);
}
