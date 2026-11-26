// What a press on the bench lands on (15C-3). Pure maths: no React, no DOM, so the order can be tested without a browser.
//
// The order is fixed: a terminal beats a part body, a part body beats a wire. The wire's click band is wide (32 screen
// px, `wireHitHalfWidth`), and it would otherwise cover parts and posts; with this order it only ever takes presses
// that nothing else wants. The screen uses the same function, so what the test says is what a press does.
import { PART_SIZE } from './catalog';
import type { Point } from './geometry';
import { partsInTabOrder } from './order';
import { terminalHitRadius, wireHitHalfWidth } from './targets';
import { allTerminals, terminalPosition, wireCurve } from './wires';
import type { Circuit, TerminalRef } from '../model/types';
import tokens from '../spec/design-tokens.json';

export type HitTarget =
  | { kind: 'terminal'; ref: TerminalRef }
  | { kind: 'part'; id: string }
  | { kind: 'wire'; id: string };

export interface HitResult {
  /** What the press goes to: the first of `order`, or undefined for empty mat. */
  target: HitTarget | undefined;
  /** Everything under the press, best first: terminals (nearest first), parts (topmost first), then wires. */
  order: readonly HitTarget[];
}

/** The drawn lead is `outlineWidth` across; a press this close to a wire's centre line is on the wire itself. */
const VISIBLE_HALF_WIDTH: number = tokens.wire.outlineWidth / 2;

/** A curve is cut into pieces about this long (design units) to measure how far a point is from it. */
const FLATTEN_STEP = 6;
const FLATTEN_MIN = 8;
const FLATTEN_MAX = 160;

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const along = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + along * dx), p.y - (a.y + along * dy));
}

/**
 * How far `point` is from the wire's centre line (design units). The curve is the one `wireGeometry` draws, cut into
 * short straight pieces; at about 6 units a piece the cut is well under a tenth of a unit away from the curve.
 */
export function distanceToWire(point: Point, from: Point, to: Point): number {
  const { c1, c2 } = wireCurve(from, to);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const pieces = Math.min(FLATTEN_MAX, Math.max(FLATTEN_MIN, Math.ceil(length / FLATTEN_STEP)));
  const at = (t: number): Point => {
    const u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return {
      x: w[0] * from.x + w[1] * c1.x + w[2] * c2.x + w[3] * to.x,
      y: w[0] * from.y + w[1] * c1.y + w[2] * c2.y + w[3] * to.y,
    };
  };
  let best = Infinity;
  let previous = at(0);
  for (let i = 1; i <= pieces; i += 1) {
    const next = at(i / pieces);
    best = Math.min(best, distanceToSegment(point, previous, next));
    previous = next;
  }
  return best;
}

/**
 * What a press at `point` (mat coordinates) lands on, at bench scale `scale` (screen px per design unit).
 *
 * 1. Terminals: inside a terminal's press circle (the same radius the screen draws, `terminalHitRadius`). Where circles
 *    overlap the nearest post wins, so a press near two close posts never goes to the farther one.
 * 2. Parts: inside a part's picture rectangle. A part drawn later is on top (the switch is drawn last, as in the page).
 * 3. Wires: within half the click band of the wire's centre line. A press on the drawn lead itself beats one that is only
 *    in another wire's band; inside each of those two groups the wire drawn last (the topmost) wins, every time.
 */
export function hitTest(circuit: Circuit, point: Point, scale: number): HitResult {
  const terminals = allTerminals(circuit);
  const nearTerminals = terminals
    .map((terminal) => ({ terminal, distance: Math.hypot(terminal.x - point.x, terminal.y - point.y) }))
    .filter(({ terminal, distance }) => distance <= terminalHitRadius(terminal, terminals, scale))
    .sort((a, b) => a.distance - b.distance);

  const parts = partsInTabOrder(circuit.components)
    .filter((part) => {
      const size = PART_SIZE[part.type];
      return point.x >= part.x && point.x <= part.x + size.width && point.y >= part.y && point.y <= part.y + size.height;
    })
    .reverse();

  const half = wireHitHalfWidth(scale);
  const near = circuit.wires
    .flatMap((wire) => {
      const a = terminalPosition(circuit, wire.from);
      const b = terminalPosition(circuit, wire.to);
      return a === undefined || b === undefined ? [] : [{ id: wire.id, distance: distanceToWire(point, a, b) }];
    })
    .filter(({ distance }) => distance <= half)
    .reverse();
  const onLead = near.filter(({ distance }) => distance <= VISIBLE_HALF_WIDTH);
  const inBand = near.filter(({ distance }) => distance > VISIBLE_HALF_WIDTH);

  const order: HitTarget[] = [
    ...nearTerminals.map(({ terminal }): HitTarget => ({ kind: 'terminal', ref: terminal.ref })),
    ...parts.map((part): HitTarget => ({ kind: 'part', id: part.id })),
    ...[...onLead, ...inBand].map(({ id }): HitTarget => ({ kind: 'wire', id })),
  ];
  return { target: order[0], order };
}
