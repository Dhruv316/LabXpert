import type { CircuitComponent, EvaluateInput, RuleResult } from '../model/types';
import { conductingEdges, findPath, findSupply, rawNodeIndex, stateError } from './stage-support';

/** Stage 2 (rules-spec §D): is there a loop, and if not, what is the likeliest reason? */
export function checkCompleteness(input: EvaluateInput): RuleResult[] {
  const { circuit } = input;
  const supply = findSupply(circuit);
  if (supply === undefined) return [];
  const nodeOf = rawNodeIndex(circuit);
  const pos = nodeOf.get(`${supply.id}.pos`);
  const neg = nodeOf.get(`${supply.id}.neg`);
  if (pos === undefined || neg === undefined) return [];

  const connected = (conducts: (component: CircuitComponent) => boolean): boolean =>
    findPath(pos, neg, conductingEdges(circuit, nodeOf, conducts)) !== null;

  // 1. Resistors, closed switches and ammeters already make a loop: Stage 3 takes over.
  const isLoopPart = (c: CircuitComponent): boolean =>
    c.type === 'resistor' || c.type === 'ammeter' || (c.type === 'switch' && c.closed);
  if (connected(isLoopPart)) return [];

  // 2. The loop would exist if every switch were closed and at least one is open.
  const isLoopPartWithSwitchesClosed = (c: CircuitComponent): boolean =>
    c.type === 'resistor' || c.type === 'ammeter' || c.type === 'switch';
  const openSwitches = circuit.components.filter((c) => c.type === 'switch' && !c.closed);
  if (openSwitches.length > 0 && connected(isLoopPartWithSwitchesClosed)) {
    return [stateError(input, 'OPEN_CIRCUIT', 'OPEN_CIRCUIT.switch_open', openSwitches.map((c) => c.id))];
  }

  // 3. It would also need the voltmeter to conduct: the voltmeter is breaking the main path.
  if (connected((c) => isLoopPartWithSwitchesClosed(c) || c.type === 'voltmeter')) {
    const voltmeters = circuit.components.filter((c) => c.type === 'voltmeter');
    return [stateError(input, 'VOLTMETER_SERIES', 'VOLTMETER_SERIES', voltmeters.map((c) => c.id))];
  }

  // 4. Nothing explains it except a missing wire.
  return [stateError(input, 'OPEN_CIRCUIT', 'OPEN_CIRCUIT.gap', [])];
}
