// Pure wire operations: no React, no clock, no randomness, no student-facing text. A wire only
// names two terminals ("R1.a"), so it follows its parts for free: positions are always derived
// from where the parts are now, never stored on the wire.
import componentsSpec from '../spec/components.json';
import tokens from '../spec/design-tokens.json';
import { TERMINALS_BY_TYPE } from '../model/types';
import { findComponent } from './ops';
import type { Point } from './geometry';
import type { Circuit, CircuitComponent, ComponentType, TerminalName, TerminalRef, Wire } from '../model/types';

/** Distance in design units within which a release or click snaps to a terminal (components.json › bench). */
export const SNAP_RADIUS: number = componentsSpec.bench.snapRadius;

/** Wire sag as a share of the wire's length (design-tokens › wire). */
export const WIRE_SAG: number = tokens.wire.sag;

type Offsets = Readonly<Partial<Record<TerminalName, Point>>>;

function offsetsFor(type: ComponentType): Offsets {
  const spec: Readonly<Record<string, Point>> = componentsSpec.components[type].terminals;
  const out: Partial<Record<TerminalName, Point>> = {};
  for (const name of TERMINALS_BY_TYPE[type]) {
    const at = spec[name];
    if (at !== undefined) out[name] = { x: at.x, y: at.y };
  }
  return out;
}

/** Terminal centres relative to a part's top-left corner, straight from components.json. */
export const TERMINAL_OFFSETS: Readonly<Record<ComponentType, Offsets>> = {
  supply: offsetsFor('supply'),
  resistor: offsetsFor('resistor'),
  ammeter: offsetsFor('ammeter'),
  voltmeter: offsetsFor('voltmeter'),
  switch: offsetsFor('switch'),
};

export interface PlacedTerminal {
  ref: TerminalRef;
  componentId: string;
  type: ComponentType;
  name: TerminalName;
  /** Centre in workspace (mat) coordinates. */
  x: number;
  y: number;
}

export function terminalRef(componentId: string, name: TerminalName): TerminalRef {
  return `${componentId}.${name}`;
}

/** Splits "R1.a" at the last dot, so an id that ever contains a dot still works. */
export function parseTerminalRef(ref: TerminalRef): { componentId: string; name: TerminalName } {
  const dot = ref.lastIndexOf('.');
  return { componentId: ref.slice(0, dot), name: ref.slice(dot + 1) as TerminalName };
}

function placedTerminals(part: CircuitComponent): PlacedTerminal[] {
  const offsets = TERMINAL_OFFSETS[part.type];
  return TERMINALS_BY_TYPE[part.type].flatMap((name) => {
    const at = offsets[name];
    return at === undefined
      ? []
      : [{ ref: terminalRef(part.id, name), componentId: part.id, type: part.type, name, x: part.x + at.x, y: part.y + at.y }];
  });
}

/** Every terminal of every placed part, in part order, at the parts' current positions. */
export function allTerminals(circuit: Circuit): PlacedTerminal[] {
  return circuit.components.flatMap(placedTerminals);
}

/** Where a terminal is now (after any move). Undefined when the part or terminal does not exist. */
export function terminalPosition(circuit: Circuit, ref: TerminalRef): Point | undefined {
  const { componentId, name } = parseTerminalRef(ref);
  const part = findComponent(circuit, componentId);
  const at = part === undefined ? undefined : TERMINAL_OFFSETS[part.type][name];
  return part === undefined || at === undefined ? undefined : { x: part.x + at.x, y: part.y + at.y };
}

/**
 * The terminal closest to `point` that is within `radius` (inclusive), or undefined. A tie goes to
 * the terminal that comes first in part order. `exclude` skips one terminal, e.g. the one a wire
 * is being drawn from.
 */
export function nearestTerminal(
  circuit: Circuit,
  point: Point,
  radius: number = SNAP_RADIUS,
  exclude?: TerminalRef,
): PlacedTerminal | undefined {
  let best: PlacedTerminal | undefined;
  let bestDistance = Infinity;
  for (const terminal of allTerminals(circuit)) {
    if (terminal.ref === exclude) continue;
    const distance = Math.hypot(terminal.x - point.x, terminal.y - point.y);
    if (distance <= radius && distance < bestDistance) {
      best = terminal;
      bestDistance = distance;
    }
  }
  return best;
}

export function findWire(circuit: Circuit, id: string): Wire | undefined {
  return circuit.wires.find((w) => w.id === id);
}

/** The wire already joining two terminals, in either direction. */
export function wireBetween(circuit: Circuit, a: TerminalRef, b: TerminalRef): Wire | undefined {
  return circuit.wires.find((w) => (w.from === a && w.to === b) || (w.from === b && w.to === a));
}

/** Wires touching a terminal (a terminal can take several: junctions). */
export function wiresAt(circuit: Circuit, ref: TerminalRef): Wire[] {
  return circuit.wires.filter((w) => w.from === ref || w.to === ref);
}

/** w1, w2, ... like the spec test cases. One past the highest number in use, so a gap is never refilled mid-run. */
export function nextWireId(circuit: Circuit): string {
  let highest = 0;
  for (const wire of circuit.wires) {
    const match = /^w(\d+)$/.exec(wire.id);
    if (match?.[1] !== undefined) highest = Math.max(highest, Number(match[1]));
  }
  return `w${highest + 1}`;
}

/** Why a wire was refused. The screen maps each code to a `bench.*` string. */
export type WireRejection = 'same-terminal' | 'duplicate';

export type AddWireResult =
  | { ok: true; circuit: Circuit; wire: Wire }
  | { ok: false; reason: WireRejection };

/**
 * Adds a wire from one terminal to another. Undefined when either terminal is not on the bench
 * (nothing to reject; the caller never offers such a terminal). The wire keeps the direction it
 * was drawn in; the engine treats wires as undirected.
 */
export function addWire(circuit: Circuit, from: TerminalRef, to: TerminalRef): AddWireResult | undefined {
  if (terminalPosition(circuit, from) === undefined || terminalPosition(circuit, to) === undefined) return undefined;
  if (from === to) return { ok: false, reason: 'same-terminal' };
  if (wireBetween(circuit, from, to) !== undefined) return { ok: false, reason: 'duplicate' };
  const wire: Wire = { id: nextWireId(circuit), from, to };
  return { ok: true, circuit: { ...circuit, wires: [...circuit.wires, wire] }, wire };
}

export interface DeleteWireResult {
  circuit: Circuit;
  removed: Wire;
}

/** Deletes one wire. Undefined for an unknown id. Parts are untouched. */
export function deleteWire(circuit: Circuit, id: string): DeleteWireResult | undefined {
  const removed = findWire(circuit, id);
  if (removed === undefined) return undefined;
  return { circuit: { ...circuit, wires: circuit.wires.filter((w) => w.id !== id) }, removed };
}

/** Where keyboard focus goes after a wire is deleted: a wire that stays on the bench, or a terminal. */
export type FocusTarget = { kind: 'wire'; id: string } | { kind: 'terminal'; ref: TerminalRef };

/**
 * The element that should take focus when wire `id` is deleted, so focus never drops to the page.
 * The next wire in order, else the one before it, else the terminal the deleted wire started at
 * (it stays on the bench, and it is where the learner would carry on wiring). Undefined for an
 * unknown id.
 */
export function focusAfterWireDelete(circuit: Circuit, id: string): FocusTarget | undefined {
  const index = circuit.wires.findIndex((w) => w.id === id);
  const gone = circuit.wires[index];
  if (gone === undefined) return undefined;
  const neighbour = circuit.wires[index + 1] ?? circuit.wires[index - 1];
  return neighbour === undefined ? { kind: 'terminal', ref: gone.from } : { kind: 'wire', id: neighbour.id };
}

export interface WireGeometry {
  /** SVG path: one cubic curve from `from` to `to`. */
  d: string;
  /** The curve's midpoint (t = 0.5), where the selected wire's trash button sits. */
  mid: Point;
  length: number;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * A lead lying on the mat: a cubic whose two control points sit a third and two thirds of the way
 * along, both pushed straight down by `sag` × the distance (DESIGN §7). SVG y grows downward, so
 * a positive push is "falling". The midpoint of such a curve is the straight midpoint plus
 * 0.75 × that push.
 */
export function wireGeometry(from: Point, to: Point, sag: number = WIRE_SAG): WireGeometry {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const drop = sag * length;
  const c1 = { x: from.x + (to.x - from.x) / 3, y: from.y + (to.y - from.y) / 3 + drop };
  const c2 = { x: from.x + ((to.x - from.x) * 2) / 3, y: from.y + ((to.y - from.y) * 2) / 3 + drop };
  const d = `M ${round(from.x)} ${round(from.y)} C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(to.x)} ${round(to.y)}`;
  const mid = { x: round((from.x + to.x) / 2), y: round((from.y + to.y) / 2 + 0.75 * drop) };
  return { d, mid, length: round(length) };
}

/** Geometry of a wire in the circuit as it is now. Undefined if an end has no terminal. */
export function wirePath(circuit: Circuit, wire: Wire): WireGeometry | undefined {
  const a = terminalPosition(circuit, wire.from);
  const b = terminalPosition(circuit, wire.to);
  return a === undefined || b === undefined ? undefined : wireGeometry(a, b);
}
