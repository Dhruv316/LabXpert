import type {
  Circuit,
  CircuitComponent,
  ErrorCode,
  EvaluateInput,
  OkCode,
  RuleResult,
  SupplyComponent,
  TerminalRef,
} from '../model/types';
import { rawNodes, terminalsOf } from './graph';

/** Terminal -> id of the raw node that holds it. Built once per stage so lookups stay cheap. */
export type NodeIndex = ReadonlyMap<TerminalRef, string>;

/** One component seen as an edge between two raw nodes. */
export interface PathEdge {
  componentId: string;
  a: string;
  b: string;
}

export function rawNodeIndex(circuit: Circuit): NodeIndex {
  const index = new Map<TerminalRef, string>();
  for (const node of rawNodes(circuit)) for (const terminal of node.terminals) index.set(terminal, node.id);
  return index;
}

/** The rules assume exactly one supply (rules-spec §A); if there are several the first is used. */
export function findSupply(circuit: Circuit): SupplyComponent | undefined {
  return circuit.components.find((component): component is SupplyComponent => component.type === 'supply');
}

/** Edges for every component the caller says conducts; supplies and non-conducting parts are left out. */
export function conductingEdges(
  circuit: Circuit,
  nodeOf: NodeIndex,
  conducts: (component: CircuitComponent) => boolean,
): PathEdge[] {
  const edges: PathEdge[] = [];
  for (const component of circuit.components) {
    if (!conducts(component)) continue;
    const [first, second] = terminalsOf(component);
    const a = first === undefined ? undefined : nodeOf.get(first);
    const b = second === undefined ? undefined : nodeOf.get(second);
    if (a !== undefined && b !== undefined) edges.push({ componentId: component.id, a, b });
  }
  return edges;
}

/**
 * Shortest path from one raw node to another, as the edges walked (breadth-first, so the result is
 * deterministic for a given component order). An empty array means the nodes are the same; null means
 * they are not connected.
 */
export function findPath(from: string, to: string, edges: readonly PathEdge[]): PathEdge[] | null {
  if (from === to) return [];
  const arrivedBy = new Map<string, { previous: string; edge: PathEdge }>();
  const seen = new Set<string>([from]);
  const queue: string[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const edge of edges) {
      const next = edge.a === current ? edge.b : edge.b === current ? edge.a : undefined;
      if (next === undefined || seen.has(next)) continue;
      seen.add(next);
      arrivedBy.set(next, { previous: current, edge });
      if (next === to) {
        const path: PathEdge[] = [];
        for (let node = to; node !== from; ) {
          const step = arrivedBy.get(node);
          if (step === undefined) break;
          path.unshift(step.edge);
          node = step.previous;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** Only componentIds is filled; wireIds and terminals stay empty (DECISIONS.md, feedback behaviour). */
function ruleResult(
  input: EvaluateInput,
  code: ErrorCode | OkCode,
  severity: 'error' | 'ok',
  stage: RuleResult['stage'],
  feedbackKey: string,
  componentIds: string[],
  params?: RuleResult['params'],
): RuleResult {
  return {
    code,
    severity,
    stage,
    checkpoint: input.checkpoint,
    feedbackKey,
    affected: { componentIds, wireIds: [], terminals: [] },
    ...(params === undefined ? {} : { params }),
  };
}

export function stateError(
  input: EvaluateInput,
  code: ErrorCode,
  feedbackKey: string,
  componentIds: string[],
  params?: RuleResult['params'],
): RuleResult {
  return ruleResult(input, code, 'error', 'state', feedbackKey, componentIds, params);
}

/** A confirmation from the state stages. It highlights nothing, so affected stays empty. */
export function stateOk(input: EvaluateInput, code: OkCode, feedbackKey: string = code): RuleResult {
  return ruleResult(input, code, 'ok', 'state', feedbackKey, []);
}

/** Answer and finish checks are action-level results (stage 'action'). */
export function actionError(
  input: EvaluateInput,
  code: ErrorCode,
  feedbackKey: string,
  params?: RuleResult['params'],
): RuleResult {
  return ruleResult(input, code, 'error', 'action', feedbackKey, [], params);
}

export function actionOk(input: EvaluateInput, code: OkCode): RuleResult {
  return ruleResult(input, code, 'ok', 'action', code, []);
}
