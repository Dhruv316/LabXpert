import type { Circuit, CircuitComponent, SimulationResult, SupplyComponent, TerminalRef } from '../model/types';
import { rawNodes, sameContractedNode } from './graph';

/** Resistance of a closed switch or an ammeter: keeps the matrix non-singular and stands in for "ideal". */
export const CLOSED_PATH_RESISTANCE = 1e-6;
/** Rules decide on a probe solve at this supply voltage (rules-spec §A); `probeSolve` runs it. */
export const PROBE_VOLTAGE = 1;
/** A probe reading is positive only above this, negative only below its negation (rules-spec §A). */
export const SIGN_THRESHOLD = 1e-4;

/** +1 above the threshold, -1 below its negation, 0 for noise. Rules never compare against 0 directly. */
export function readingSign(value: number): -1 | 0 | 1 {
  if (value > SIGN_THRESHOLD) return 1;
  if (value < -SIGN_THRESHOLD) return -1;
  return 0;
}

interface Edge {
  a: string;
  b: string;
  conductance: number;
}

type Meter = Extract<CircuitComponent, { type: 'ammeter' | 'voltmeter' }>;

function findSupply(circuit: Circuit): SupplyComponent | undefined {
  return circuit.components.find((component): component is SupplyComponent => component.type === 'supply');
}

function findMeter(circuit: Circuit, type: Meter['type']): Meter | undefined {
  return circuit.components.find((component): component is Meter => component.type === type);
}

/** Every meter reads 0 when nothing flows; a meter that is not on the bench reads null. */
function zeroResult(circuit: Circuit, overload: boolean): SimulationResult {
  return {
    overload,
    complete: false,
    supplyCurrent: 0,
    ammeter: findMeter(circuit, 'ammeter') ? 0 : null,
    voltmeter: findMeter(circuit, 'voltmeter') ? 0 : null,
  };
}

/** Conducting edges between raw nodes: resistors, closed switches and ammeters (rules-spec §B.2). */
function buildEdges(circuit: Circuit, nodeOf: ReadonlyMap<TerminalRef, string>): Edge[] {
  const edges: Edge[] = [];
  for (const component of circuit.components) {
    let conductance: number;
    let first: TerminalRef;
    let second: TerminalRef;
    switch (component.type) {
      case 'resistor':
        conductance = 1 / component.ohms;
        first = `${component.id}.a`;
        second = `${component.id}.b`;
        break;
      case 'switch':
        if (!component.closed) continue;
        conductance = 1 / CLOSED_PATH_RESISTANCE;
        first = `${component.id}.a`;
        second = `${component.id}.b`;
        break;
      case 'ammeter':
        conductance = 1 / CLOSED_PATH_RESISTANCE;
        first = `${component.id}.pos`;
        second = `${component.id}.neg`;
        break;
      default:
        continue;
    }
    const a = nodeOf.get(first);
    const b = nodeOf.get(second);
    // Both ends on one raw node means the part is bypassed by wires: skip it.
    if (a === undefined || b === undefined || a === b) continue;
    edges.push({ a, b, conductance });
  }
  return edges;
}

/** Raw nodes reachable from `start` over the conducting edges. */
function reachableFrom(start: string, edges: readonly Edge[]): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) break;
    for (const edge of edges) {
      const next = edge.a === current ? edge.b : edge.b === current ? edge.a : undefined;
      if (next !== undefined && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Gaussian elimination with partial pivoting. The matrix is symmetric and grounded, so it is non-singular. */
function solveLinear(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    }
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    const diagonal = matrix[col][col];
    for (let row = col + 1; row < n; row += 1) {
      const factor = matrix[row][col] / diagonal;
      if (factor === 0) continue;
      for (let k = col; k < n; k += 1) matrix[row][k] -= factor * matrix[col][k];
      rhs[row] -= factor * rhs[col];
    }
  }
  const solution = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = rhs[row];
    for (let k = row + 1; k < n; k += 1) sum -= matrix[row][k] * solution[k];
    solution[row] = sum / matrix[row][row];
  }
  return solution;
}

/** Node voltages for every raw node in the energised component. `ground` is 0 V, `source` is `supplyVoltage`. */
function solveVoltages(
  energised: ReadonlySet<string>,
  edges: readonly Edge[],
  ground: string,
  source: string,
  supplyVoltage: number,
): Map<string, number> {
  const voltages = new Map<string, number>([
    [ground, 0],
    [source, supplyVoltage],
  ]);
  const unknown = [...energised].filter((id) => id !== ground && id !== source);
  const slot = new Map(unknown.map((id, index) => [id, index]));
  const matrix = unknown.map(() => new Array<number>(unknown.length).fill(0));
  const rhs = new Array<number>(unknown.length).fill(0);

  for (const { a, b, conductance } of edges) {
    const rowA = slot.get(a);
    const rowB = slot.get(b);
    if (rowA !== undefined) {
      matrix[rowA][rowA] += conductance;
      if (rowB !== undefined) matrix[rowA][rowB] -= conductance;
      else rhs[rowA] += conductance * (voltages.get(b) ?? 0);
    }
    if (rowB !== undefined) {
      matrix[rowB][rowB] += conductance;
      if (rowA !== undefined) matrix[rowB][rowA] -= conductance;
      else rhs[rowB] += conductance * (voltages.get(a) ?? 0);
    }
  }

  const solution = solveLinear(matrix, rhs);
  unknown.forEach((id, index) => voltages.set(id, solution[index]));
  return voltages;
}

/** (V(pos) - V(neg)); 0 when either terminal sits on a floating node. */
function meterDifference(
  meter: Meter,
  nodeOf: ReadonlyMap<TerminalRef, string>,
  voltages: ReadonlyMap<string, number>,
): number {
  const posNode = nodeOf.get(`${meter.id}.pos`);
  const negNode = nodeOf.get(`${meter.id}.neg`);
  const pos = posNode === undefined ? undefined : voltages.get(posNode);
  const neg = negNode === undefined ? undefined : voltages.get(negNode);
  return pos === undefined || neg === undefined ? 0 : pos - neg;
}

/**
 * rules-spec §B, steps 1-6. Returns unrounded values so rule code can compare them exactly;
 * use `roundReadings` for what the student sees. `supplyVoltage` overrides the supply's own setting
 * (the probe solve passes PROBE_VOLTAGE); it defaults to the supply component's voltage.
 */
export function simulate(circuit: Circuit, supplyVoltage?: number): SimulationResult {
  const supply = findSupply(circuit);
  // No supply on the bench: nothing can flow. Not an overload, and not a complete loop.
  if (!supply) return zeroResult(circuit, false);
  const voltage = supplyVoltage ?? supply.voltage;
  const pos: TerminalRef = `${supply.id}.pos`;
  const neg: TerminalRef = `${supply.id}.neg`;

  // Step 1: overload check comes first, before any solve.
  if (sameContractedNode(circuit, pos, neg)) return zeroResult(circuit, true);

  const nodeOf = new Map<TerminalRef, string>();
  for (const node of rawNodes(circuit)) for (const terminal of node.terminals) nodeOf.set(terminal, node.id);
  const posNode = nodeOf.get(pos);
  const negNode = nodeOf.get(neg);
  if (posNode === undefined || negNode === undefined) return zeroResult(circuit, false);

  // Steps 2-3: completeness over resistors, closed switches and ammeters.
  const edges = buildEdges(circuit, nodeOf);
  const energised = reachableFrom(negNode, edges);
  if (!energised.has(posNode)) return zeroResult(circuit, false);

  // Steps 4-6: nodal analysis, meter readings, supply current.
  const voltages = solveVoltages(energised, edges, negNode, posNode, voltage);
  let supplyCurrent = 0;
  for (const { a, b, conductance } of edges) {
    if (a === posNode) supplyCurrent += conductance * ((voltages.get(a) ?? 0) - (voltages.get(b) ?? 0));
    if (b === posNode) supplyCurrent += conductance * ((voltages.get(b) ?? 0) - (voltages.get(a) ?? 0));
  }

  const ammeter = findMeter(circuit, 'ammeter');
  const voltmeter = findMeter(circuit, 'voltmeter');
  return {
    overload: false,
    complete: true,
    supplyCurrent,
    ammeter: ammeter ? meterDifference(ammeter, nodeOf, voltages) / CLOSED_PATH_RESISTANCE : null,
    voltmeter: voltmeter ? meterDifference(voltmeter, nodeOf, voltages) : null,
  };
}

/**
 * rules-spec §A probe solve: the real switch states at 1 V, whatever the supply is set to, so a 0 V supply
 * never changes a verdict. Values stay unrounded; compare them with `readingSign`, never with 0.
 */
export function probeSolve(circuit: Circuit): SimulationResult {
  return simulate(circuit, PROBE_VOLTAGE);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
  return rounded === 0 ? 0 : rounded; // never show -0.00
}

/** rules-spec §B.7: round what the meters display. Kept apart from `simulate` so rules see raw values. */
export function roundReadings(result: SimulationResult, decimals: number): SimulationResult {
  return {
    ...result,
    ammeter: result.ammeter === null ? null : roundTo(result.ammeter, decimals),
    voltmeter: result.voltmeter === null ? null : roundTo(result.voltmeter, decimals),
  };
}

/**
 * Read-only companion to `simulate` for the flow dots: the current each part pushes out of each of
 * its terminals into the wires, in amps, at the supply's own setting. Positive means the current
 * leaves the part there; a resistor, a closed switch or an ammeter draws current in at one end
 * (negative) and returns it at the other (positive). A supply pushes out at `pos` and takes it back
 * at `neg`. An open switch and a voltmeter carry none, so they never appear.
 *
 * It is a separate function, and `simulate` is untouched, so no existing result can change. Returns
 * undefined when there is nothing to solve (no supply, a short, or no conducting loop); callers
 * that already hold `liveState` have ruled those out.
 */
export function terminalCurrents(circuit: Circuit): ReadonlyMap<TerminalRef, number> | undefined {
  const supply = findSupply(circuit);
  if (!supply) return undefined;
  const pos: TerminalRef = `${supply.id}.pos`;
  const neg: TerminalRef = `${supply.id}.neg`;
  if (sameContractedNode(circuit, pos, neg)) return undefined;

  const nodeOf = new Map<TerminalRef, string>();
  for (const node of rawNodes(circuit)) for (const terminal of node.terminals) nodeOf.set(terminal, node.id);
  const posNode = nodeOf.get(pos);
  const negNode = nodeOf.get(neg);
  if (posNode === undefined || negNode === undefined) return undefined;

  const edges = buildEdges(circuit, nodeOf);
  const energised = reachableFrom(negNode, edges);
  if (!energised.has(posNode)) return undefined;
  const voltages = solveVoltages(energised, edges, negNode, posNode, supply.voltage);

  const out = new Map<TerminalRef, number>();
  // One shared rule for every conducting part. A part with both ends on one raw node (bypassed by
  // wires) has equal voltages at both ends, so it comes out as exactly 0.
  const through = (first: TerminalRef, second: TerminalRef, conductance: number): void => {
    const firstNode = nodeOf.get(first);
    const secondNode = nodeOf.get(second);
    const high = firstNode === undefined ? undefined : voltages.get(firstNode);
    const low = secondNode === undefined ? undefined : voltages.get(secondNode);
    if (high === undefined || low === undefined) return;
    const amps = conductance * (high - low);
    out.set(first, -amps);
    out.set(second, amps);
  };
  for (const component of circuit.components) {
    if (component.type === 'resistor') through(`${component.id}.a`, `${component.id}.b`, 1 / component.ohms);
    else if (component.type === 'switch' && component.closed) {
      through(`${component.id}.a`, `${component.id}.b`, 1 / CLOSED_PATH_RESISTANCE);
    } else if (component.type === 'ammeter') {
      through(`${component.id}.pos`, `${component.id}.neg`, 1 / CLOSED_PATH_RESISTANCE);
    }
  }

  // Same sum `simulate` uses for the supply current, read from the same voltages.
  let supplyCurrent = 0;
  for (const { a, b, conductance } of edges) {
    if (a === posNode) supplyCurrent += conductance * ((voltages.get(a) ?? 0) - (voltages.get(b) ?? 0));
    if (b === posNode) supplyCurrent += conductance * ((voltages.get(b) ?? 0) - (voltages.get(a) ?? 0));
  }
  out.set(pos, supplyCurrent);
  out.set(neg, -supplyCurrent);
  return out;
}
