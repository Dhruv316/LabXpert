import type { AmmeterComponent, EvaluateInput, RuleResult } from '../model/types';
import { terminalsOf } from './graph';
import {
  conductingEdges,
  findPath,
  findSupply,
  rawNodeIndex,
  stateError,
  type NodeIndex,
  type PathEdge,
} from './stage-support';

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * 1a. An ammeter is flagged when both its terminals share a raw node, or when its pair of raw nodes
 * equals the pair of a resistor or the supply. Switches and voltmeters are deliberately not compared.
 */
function ammeterParallel(input: EvaluateInput, nodeOf: NodeIndex): RuleResult[] {
  const { components } = input.circuit;
  const pairs = components.flatMap((component) => {
    if (component.type !== 'resistor' && component.type !== 'supply') return [];
    const [first, second] = terminalsOf(component);
    const a = first === undefined ? undefined : nodeOf.get(first);
    const b = second === undefined ? undefined : nodeOf.get(second);
    return a === undefined || b === undefined ? [] : [{ id: component.id, key: pairKey(a, b) }];
  });

  const results: RuleResult[] = [];
  for (const ammeter of components.filter((c): c is AmmeterComponent => c.type === 'ammeter')) {
    const pos = nodeOf.get(`${ammeter.id}.pos`);
    const neg = nodeOf.get(`${ammeter.id}.neg`);
    if (pos === undefined || neg === undefined) continue;
    const matched = pairs.filter((pair) => pair.key === pairKey(pos, neg)).map((pair) => pair.id);
    if (pos === neg || matched.length > 0) {
      results.push(stateError(input, 'AMMETER_PARALLEL', 'AMMETER_PARALLEL', [ammeter.id, ...matched]));
    }
  }
  return results;
}

function uniqueIds(path: readonly PathEdge[]): string[] {
  return [...new Set(path.map((edge) => edge.componentId))];
}

/**
 * 1b. Edges are closed switches and ammeters between raw nodes. A path from S.pos to S.neg that needs no
 * ammeter is always a short. A path that needs an ammeter is a short only if 1a flagged no ammeter, because
 * otherwise AMMETER_PARALLEL already explains it.
 */
function shortCircuit(input: EvaluateInput, nodeOf: NodeIndex, ammeterFlagged: boolean): RuleResult[] {
  const supply = findSupply(input.circuit);
  if (supply === undefined) return [];
  const pos = nodeOf.get(`${supply.id}.pos`);
  const neg = nodeOf.get(`${supply.id}.neg`);
  if (pos === undefined || neg === undefined) return [];

  const withoutAmmeters = conductingEdges(input.circuit, nodeOf, (c) => c.type === 'switch' && c.closed);
  const direct = findPath(pos, neg, withoutAmmeters);
  if (direct !== null) {
    return [stateError(input, 'SHORT_CIRCUIT', 'SHORT_CIRCUIT', [supply.id, ...uniqueIds(direct)])];
  }
  if (ammeterFlagged) return [];

  const withAmmeters = conductingEdges(input.circuit, nodeOf, (c) => c.type === 'ammeter' || (c.type === 'switch' && c.closed));
  const viaAmmeter = findPath(pos, neg, withAmmeters);
  return viaAmmeter === null
    ? []
    : [stateError(input, 'SHORT_CIRCUIT', 'SHORT_CIRCUIT', [supply.id, ...uniqueIds(viaAmmeter)])];
}

/** Stage 1 (rules-spec §D): AMMETER_PARALLEL and SHORT_CIRCUIT may both be returned. */
export function checkHazards(input: EvaluateInput): RuleResult[] {
  const nodeOf = rawNodeIndex(input.circuit);
  const parallel = ammeterParallel(input, nodeOf);
  return [...parallel, ...shortCircuit(input, nodeOf, parallel.length > 0)];
}
