// Where HTML controls sit over the bench. Pure maths; the layer component only applies the result.
import { BENCH_VIEW, PART_SIZE } from './catalog';
import { benchToLocal, sceneLayout, type SceneLayout } from './coords';
import type { Point } from './geometry';
import { TERMINAL_OFFSETS, terminalPosition, WIRE_SAG } from './wires';
import type { Circuit, ComponentType } from '../model/types';
import tokens from '../spec/design-tokens.json';

/** DESIGN.md §9: every control is at least 44 × 44 screen px, at any bench scale. */
export const CONTROL_MIN_PX = 44;

/** Space between a part and the control next to it, in screen px. */
export const CONTROL_GAP_PX = 8;

export interface BoxSize {
  width: number;
  height: number;
}

/** The layout to use for a box that may not be measured yet: before layout the scene is drawn 1:1. */
export function layoutOrDefault(size: BoxSize | undefined): { layout: SceneLayout; size: BoxSize } {
  const known = size === undefined ? undefined : sceneLayout(size.width, size.height);
  if (size !== undefined && known !== undefined) return { layout: known, size };
  return {
    layout: { scale: 1, offsetX: 0, offsetY: 0 },
    size: { width: BENCH_VIEW.width, height: BENCH_VIEW.height },
  };
}

export type SlotEdge = 'below' | 'above';

/** A control can also go beside its part (see `placeClear`). */
export type ClearEdge = SlotEdge | 'right' | 'left';

export interface SlotPlacement {
  /** Pixels from the left of the layer to the control's centre line (its left edge for `start`, its right edge for `end`). */
  left: number;
  /** Which side of the layer the control is pinned to, and how far in. */
  anchor: 'top' | 'bottom';
  offset: number;
  edge: ClearEdge;
  /** What `left` means. Left out for the usual centred control. */
  align?: 'start' | 'end';
}

export interface PartBox {
  type: ComponentType;
  x: number;
  y: number;
}

/**
 * A control centred under (or over) its part. It goes on the other side when the preferred side
 * has no room, so a part at the bottom of the mat still gets a visible, reachable control.
 */
export function slotPlacement(
  layout: SceneLayout,
  size: BoxSize,
  part: PartBox,
  preferred: SlotEdge = 'below',
  controlHeight: number = CONTROL_MIN_PX,
  gap: number = CONTROL_GAP_PX,
): SlotPlacement {
  const { width, height } = PART_SIZE[part.type];
  const centre = benchToLocal(layout, part.x + width / 2, part.y);
  const bottomEdge = benchToLocal(layout, part.x, part.y + height).y;
  const topEdge = centre.y;

  const belowTop = bottomEdge + gap;
  const fitsBelow = belowTop + controlHeight <= size.height;
  const aboveBottom = topEdge - gap;
  const fitsAbove = aboveBottom - controlHeight >= 0;

  const edge: SlotEdge = preferred === 'below' ? (fitsBelow || !fitsAbove ? 'below' : 'above') : fitsAbove || !fitsBelow ? 'above' : 'below';
  return edge === 'below'
    ? { left: centre.x, anchor: 'top', offset: belowTop, edge }
    : { left: centre.x, anchor: 'bottom', offset: size.height - aboveBottom, edge };
}

/**
 * Keeps a control of this width inside the layer: its centre line is pulled in until both edges show.
 * A control wider than the layer is centred (nothing better is possible). Width 0 (not measured) changes nothing.
 */
export function clampCentre(centre: number, width: number, boxWidth: number): number {
  if (width >= boxWidth) return boxWidth / 2;
  const half = width / 2;
  return Math.min(Math.max(centre, half), boxWidth - half);
}

/** A rectangle in the layer's pixels. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A straight piece of a wire, in the layer's pixels. */
export interface Segment {
  from: Point;
  to: Point;
}

/** How much of each wire leaving a terminal counts as "its first part", in screen px along the wire. */
export const WIRE_LEAD_PX = 100;
/** A control stays this far (screen px) from a terminal's hit ring and from the first part of a wire. */
export const CLEAR_MARGIN_PX = 6;
const LEAD_STEPS = 40;

/** The rectangle a placement occupies, for a control of this size. */
export function placementRect(place: SlotPlacement, size: BoxSize, box: BoxSize): Rect {
  const left = place.align === 'start' ? place.left : place.align === 'end' ? place.left - box.width : place.left - box.width / 2;
  const top = place.anchor === 'top' ? place.offset : size.height - place.offset - box.height;
  return { left, top, right: left + box.width, bottom: top + box.height };
}

/** Whether a segment touches a rectangle (Liang–Barsky clip). */
export function segmentHitsRect(segment: Segment, rect: Rect): boolean {
  const dx = segment.to.x - segment.from.x;
  const dy = segment.to.y - segment.from.y;
  const edges: readonly (readonly [number, number])[] = [
    [-dx, segment.from.x - rect.left],
    [dx, rect.right - segment.from.x],
    [-dy, segment.from.y - rect.top],
    [dy, rect.bottom - segment.from.y],
  ];
  let enter = 0;
  let leave = 1;
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const ratio = q / p;
      if (p < 0) enter = Math.max(enter, ratio);
      else leave = Math.min(leave, ratio);
      if (enter > leave) return false;
    }
  }
  return true;
}

/** Whether a circle (a terminal's hit ring) touches a rectangle. */
export function circleHitsRect(centre: Point, radius: number, rect: Rect): boolean {
  const nearestX = Math.min(Math.max(centre.x, rect.left), rect.right);
  const nearestY = Math.min(Math.max(centre.y, rect.top), rect.bottom);
  return Math.hypot(centre.x - nearestX, centre.y - nearestY) <= radius;
}

function inflate(rect: Rect, by: number): Rect {
  return { left: rect.left - by, top: rect.top - by, right: rect.right + by, bottom: rect.bottom + by };
}

/**
 * The first part (WIRE_LEAD_PX of its length) of every wire that ends at one of this part's terminals, as
 * short straight pieces in the layer's pixels. The curve is the same one the wire layer draws (a cubic whose
 * control points sag), so the pieces follow what is on screen, not the straight line between the ends.
 */
export function wireLeads(layout: SceneLayout, circuit: Circuit, partId: string): Segment[] {
  const leads: Segment[] = [];
  for (const wire of circuit.wires) {
    const a = terminalPosition(circuit, wire.from);
    const b = terminalPosition(circuit, wire.to);
    if (a === undefined || b === undefined) continue;
    const fromHere = wire.from.startsWith(`${partId}.`);
    if (!fromHere && !wire.to.startsWith(`${partId}.`)) continue;
    const start = fromHere ? a : b;
    const end = fromHere ? b : a;
    const drop = WIRE_SAG * Math.hypot(end.x - start.x, end.y - start.y);
    const c1 = { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 + drop };
    const c2 = { x: start.x + ((end.x - start.x) * 2) / 3, y: start.y + ((end.y - start.y) * 2) / 3 + drop };
    const origin = benchToLocal(layout, start.x, start.y);
    let previous = origin;
    for (let step = 1; step <= LEAD_STEPS; step += 1) {
      const t = step / LEAD_STEPS;
      const u = 1 - t;
      const x = u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x;
      const y = u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y;
      const here = benchToLocal(layout, x, y);
      leads.push({ from: previous, to: here });
      if (Math.hypot(here.x - origin.x, here.y - origin.y) >= WIRE_LEAD_PX) break;
      previous = here;
    }
  }
  return leads;
}

/** The part's terminal centres relative to its corner (the offsets table may leave a name out). */
function terminalOffsets(type: ComponentType): Point[] {
  return Object.values(TERMINAL_OFFSETS[type]).filter((offset): offset is Point => offset !== undefined);
}

/** The placement of a control on one named side, or undefined when it does not fit in the layer there. */
function edgePlacement(
  layout: SceneLayout,
  size: BoxSize,
  part: PartBox,
  edge: ClearEdge,
  box: BoxSize,
  clearAbove: number,
): SlotPlacement | undefined {
  const { width, height } = PART_SIZE[part.type];
  const centre = benchToLocal(layout, part.x + width / 2, part.y);
  if (edge === 'below' || edge === 'above') {
    if (edge === 'below') {
      const top = benchToLocal(layout, part.x, part.y + height).y + CONTROL_GAP_PX;
      return top + box.height <= size.height ? { left: centre.x, anchor: 'top', offset: top, edge } : undefined;
    }
    const bottom = centre.y - clearAbove - CONTROL_GAP_PX;
    return bottom - box.height >= 0 ? { left: centre.x, anchor: 'bottom', offset: size.height - bottom, edge } : undefined;
  }
  // Beside the part, its bottom edge above the terminals' hit ring so a wire leaving a post sideways passes under it.
  const rows = terminalOffsets(part.type).map((offset) => offset.y);
  const ringTop = benchToLocal(layout, part.x, part.y + Math.min(...rows) - tokens.terminal.hitRadius).y;
  const top = Math.max(0, ringTop - CLEAR_MARGIN_PX - box.height);
  if (edge === 'right') {
    const left = benchToLocal(layout, part.x + width, part.y).x + CONTROL_GAP_PX;
    return left + box.width <= size.width ? { left, anchor: 'top', offset: top, edge, align: 'start' } : undefined;
  }
  const right = benchToLocal(layout, part.x, part.y).x - CONTROL_GAP_PX;
  return right - box.width >= 0 ? { left: right, anchor: 'top', offset: top, edge, align: 'end' } : undefined;
}

/**
 * A control (of this size) placed where it covers no terminal ring and none of the first part of a wire leaving
 * one of the part's terminals. The preferred side is tried first. If it is clear, that is the answer (so with no
 * wires the result is the same as `slotPlacement`). If it has no room in the layer, the opposite side comes next,
 * as in `slotPlacement`; if it has room but a wire is in the way, the sides right and left are tried first and the
 * opposite side is the last resort. A side must fit in the layer. When nothing is clear, it falls back to
 * `slotPlacement`. `clearAbove` is space above the part that something else uses (its label), in screen px.
 */
export function placeClear(
  layout: SceneLayout,
  size: BoxSize,
  part: PartBox,
  preferred: SlotEdge,
  box: BoxSize,
  leads: readonly Segment[],
  clearAbove = 0,
): SlotPlacement {
  const rings = terminalOffsets(part.type).map((offset) => benchToLocal(layout, part.x + offset.x, part.y + offset.y));
  const radius = tokens.terminal.hitRadius * layout.scale;
  const opposite: SlotEdge = preferred === 'below' ? 'above' : 'below';
  const roomOnPreferred = edgePlacement(layout, size, part, preferred, box, clearAbove) !== undefined;
  const order: readonly ClearEdge[] = roomOnPreferred ? [preferred, 'right', 'left', opposite] : [opposite, 'right', 'left'];
  for (const edge of order) {
    const place = edgePlacement(layout, size, part, edge, box, clearAbove);
    if (place === undefined) continue;
    const rect = inflate(placementRect(place, size, box), CLEAR_MARGIN_PX);
    if (leads.some((lead) => segmentHitsRect(lead, rect))) continue;
    if (rings.some((ring) => circleHitsRect(ring, radius, rect))) continue;
    return place;
  }
  return slotPlacement(layout, size, part, preferred, box.height);
}
