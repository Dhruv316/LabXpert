// Pure bench operations: no React, no clock, no randomness. Every function returns a new
// circuit and never changes its input, which is what lets history keep plain references.
import { clampPosition, type Point } from './geometry';
import { ID_PREFIX, isResistorRole, type ResistorRole } from './catalog';
import type {
  Circuit,
  CircuitComponent,
  ComponentType,
  ExperimentConfig,
  ShelfItem,
  Wire,
} from '../model/types';

/** The parts of an experiment the bench needs. Reading it from the config keeps experiments pure data. */
export type BenchRules = Pick<ExperimentConfig, 'shelf' | 'supply' | 'resistorValues'>;

export const EMPTY_CIRCUIT: Circuit = { components: [], wires: [] };

/**
 * Parts of a type that the learner put on the bench. A locked part comes from a practice task's
 * prebuilt circuit, so it never uses up the shelf's `max` (the shelf says how many the learner may add).
 */
function placedOfType(circuit: Circuit, type: ComponentType): number {
  return circuit.components.filter((c) => c.type === type && c.locked !== true).length;
}

export function findComponent(circuit: Circuit, id: string): CircuitComponent | undefined {
  return circuit.components.find((c) => c.id === id);
}

function shelfItem(rules: BenchRules, type: ComponentType): ShelfItem | undefined {
  return rules.shelf.find((item) => item.type === type);
}

export interface ShelfStatus {
  type: ComponentType;
  max: number;
  placed: number;
  /** True at `max`: the tile shows "All placed" and is disabled until a part is removed. */
  full: boolean;
}

/** One entry per shelf tile, in the experiment's order. */
export function shelfStatus(circuit: Circuit, rules: BenchRules): ShelfStatus[] {
  return rules.shelf.map((item) => {
    const placed = placedOfType(circuit, item.type);
    return { type: item.type, max: item.max, placed, full: placed >= item.max };
  });
}

/** A part that is not on the shelf, or whose shelf count is used up, cannot be placed. */
export function canPlace(circuit: Circuit, rules: BenchRules, type: ComponentType): boolean {
  const item = shelfItem(rules, type);
  return item !== undefined && placedOfType(circuit, type) < item.max;
}

/**
 * The next resistor role: the first one on the shelf that no resistor on the bench holds, so
 * the first resistor placed is R1 and the second R2. If R1 is removed, the next one placed
 * takes R1 again and the one called R2 keeps its name.
 */
export function nextResistorRole(circuit: Circuit, rules: BenchRules): ResistorRole {
  const roles = (shelfItem(rules, 'resistor')?.roles ?? []).filter(isResistorRole);
  const used = new Set(
    circuit.components.flatMap((c) => (c.type === 'resistor' ? [c.role] : [])),
  );
  return roles.find((role) => !used.has(role)) ?? roles[0] ?? 'R';
}

function defaultOhms(rules: BenchRules, role: ResistorRole): number {
  const configured = shelfItem(rules, 'resistor')?.defaultOhms;
  if (typeof configured === 'number') return configured;
  const byRole = configured?.[role];
  if (byRole !== undefined) return byRole;
  return rules.resistorValues[0] ?? 0;
}

/** Spec-style ids: S, SW, A, V and, for a resistor, its role. A clash gets a number (S2). */
function newComponentId(circuit: Circuit, base: string): string {
  const taken = new Set(circuit.components.map((c) => c.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

function build(circuit: Circuit, rules: BenchRules, type: ComponentType, at: Point): CircuitComponent {
  const { x, y } = at;
  switch (type) {
    case 'supply':
      return { id: newComponentId(circuit, ID_PREFIX.supply), type, x, y, voltage: rules.supply.default };
    case 'switch':
      return { id: newComponentId(circuit, ID_PREFIX.switch), type, x, y, closed: false };
    case 'ammeter':
      return { id: newComponentId(circuit, ID_PREFIX.ammeter), type, x, y };
    case 'voltmeter':
      return { id: newComponentId(circuit, ID_PREFIX.voltmeter), type, x, y };
    case 'resistor': {
      const role = nextResistorRole(circuit, rules);
      return { id: newComponentId(circuit, role), type, x, y, role, ohms: defaultOhms(rules, role) };
    }
  }
}

export interface PlaceResult {
  circuit: Circuit;
  component: CircuitComponent;
}

/** Places a part with its top-left corner at `at`, clamped inside the mat. Undefined when `max` is reached. */
export function placeComponent(
  circuit: Circuit,
  rules: BenchRules,
  type: ComponentType,
  at: Point,
): PlaceResult | undefined {
  if (!canPlace(circuit, rules, type)) return undefined;
  const component = build(circuit, rules, type, clampPosition(type, at.x, at.y));
  return { circuit: { ...circuit, components: [...circuit.components, component] }, component };
}

/** Moves a part, clamped. Returns the same circuit object when nothing changes (unknown id, locked, same spot). */
export function moveComponent(circuit: Circuit, id: string, x: number, y: number): Circuit {
  const part = findComponent(circuit, id);
  if (part === undefined || part.locked === true) return circuit;
  const next = clampPosition(part.type, x, y);
  if (next.x === part.x && next.y === part.y) return circuit;
  return {
    ...circuit,
    components: circuit.components.map((c) => (c.id === id ? { ...c, ...next } : c)),
  };
}

export function moveComponentBy(circuit: Circuit, id: string, dx: number, dy: number): Circuit {
  const part = findComponent(circuit, id);
  return part === undefined ? circuit : moveComponent(circuit, id, part.x + dx, part.y + dy);
}

function touches(wire: Wire, componentId: string): boolean {
  const prefix = `${componentId}.`;
  return wire.from.startsWith(prefix) || wire.to.startsWith(prefix);
}

export interface RemoveResult {
  circuit: Circuit;
  removed: CircuitComponent;
  removedWires: Wire[];
}

/** Removes a part and every wire on it. Locked parts stay (undefined). */
export function removeComponent(circuit: Circuit, id: string): RemoveResult | undefined {
  const removed = findComponent(circuit, id);
  if (removed === undefined || removed.locked === true) return undefined;
  return {
    circuit: {
      components: circuit.components.filter((c) => c.id !== id),
      wires: circuit.wires.filter((w) => !touches(w, id)),
    },
    removed,
    removedWires: circuit.wires.filter((w) => touches(w, id)),
  };
}

export function isEmpty(circuit: Circuit): boolean {
  return circuit.components.length === 0 && circuit.wires.length === 0;
}

export interface ClearResult {
  circuit: Circuit;
  removedComponents: CircuitComponent[];
  removedWires: Wire[];
}

/**
 * Clear bench empties the mat. It is a reset, not a removal, so it also takes locked parts
 * (the dialog says "all parts and wires"). Undefined when there is nothing to clear.
 */
export function clearCircuit(circuit: Circuit): ClearResult | undefined {
  if (isEmpty(circuit)) return undefined;
  return { circuit: EMPTY_CIRCUIT, removedComponents: circuit.components, removedWires: circuit.wires };
}

/**
 * Clear bench on a practice bench. Locked parts cannot be removed, so the reset goes back to the task's
 * starting circuit (its prebuilt parts and wires, or nothing) instead of to an empty mat. Undefined when
 * the bench already is the starting circuit. `removedComponents` and `removedWires` are the ones the
 * starting circuit does not have, which is what the `RESET_BENCH` event lists.
 */
export function resetToStart(circuit: Circuit, start: Circuit): ClearResult | undefined {
  if (JSON.stringify(circuit) === JSON.stringify(start)) return undefined;
  const keptParts = new Set(start.components.map((c) => c.id));
  const keptWires = new Set(start.wires.map((w) => w.id));
  return {
    circuit: start,
    removedComponents: circuit.components.filter((c) => !keptParts.has(c.id)),
    removedWires: circuit.wires.filter((w) => !keptWires.has(w.id)),
  };
}
