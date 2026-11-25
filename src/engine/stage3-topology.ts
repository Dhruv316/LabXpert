import type { Circuit, CircuitComponent, RawNode, ResistorComponent, TerminalRef, Topology } from '../model/types';
import { contractedNodes, terminalsOf } from './graph';

/** Terminal -> id of the c-node that holds it (rules-spec §A: wires, closed switches and ammeters contracted). */
export type CNodeIndex = ReadonlyMap<TerminalRef, string>;

/** What 3c found, plus the c-node pair a combination voltmeter has to span. */
export interface TopologyFinding {
  found: Topology;
  /** Series: the two end nodes. Parallel: the shared pair. Null when `found` is 'neither'. */
  target: string[] | null;
}

export function contractedIndex(nodes: readonly RawNode[]): CNodeIndex {
  const index = new Map<TerminalRef, string>();
  for (const node of nodes) for (const terminal of node.terminals) index.set(terminal, node.id);
  return index;
}

/** An unordered pair of c-nodes as a stable string, so two pairs compare as sets. */
export function pairKey(ids: readonly string[]): string {
  return [...new Set(ids)].sort().join('|');
}

/** The distinct c-nodes a component's two terminals sit on: two ids, or one if both share a c-node. */
export function nodesOf(component: CircuitComponent, index: CNodeIndex): string[] {
  const ids = terminalsOf(component).flatMap((terminal) => index.get(terminal) ?? []);
  return [...new Set(ids)];
}

function resistorWithRole(circuit: Circuit, role: string): ResistorComponent | undefined {
  return circuit.components.find((c): c is ResistorComponent => c.type === 'resistor' && c.role === role);
}

/** The resistor(s) the task measures; used for the single-resistor voltmeter target and for `affected`. */
export function resistorsWithRoles(circuit: Circuit, roles: readonly string[]): ResistorComponent[] {
  return roles.flatMap((role) => resistorWithRole(circuit, role) ?? []);
}

/** True when the junction holds a supply terminal or a resistor other than the two being classified. */
function junctionIsBusy(circuit: Circuit, junction: RawNode, r1: ResistorComponent, r2: ResistorComponent): boolean {
  return junction.terminals.some((terminal) => {
    const owner = circuit.components.find((c) => terminal.startsWith(`${c.id}.`));
    if (owner === undefined) return false;
    return owner.type === 'supply' || (owner.type === 'resistor' && owner.id !== r1.id && owner.id !== r2.id);
  });
}

/**
 * rules-spec §D 3c classification of R1 and R2 on c-nodes. A voltmeter's terminals are never joined into a
 * c-node, so a voltmeter sitting on the junction does not stop a series pair from being series.
 */
export function classifyTopology(circuit: Circuit): TopologyFinding {
  const neither: TopologyFinding = { found: 'neither', target: null };
  const r1 = resistorWithRole(circuit, 'R1');
  const r2 = resistorWithRole(circuit, 'R2');
  if (r1 === undefined || r2 === undefined) return neither;

  const nodes = contractedNodes(circuit);
  const index = contractedIndex(nodes);
  const p1 = nodesOf(r1, index);
  const p2 = nodesOf(r2, index);
  if (p1.length !== 2 || p2.length !== 2) return neither;
  if (pairKey(p1) === pairKey(p2)) return { found: 'parallel', target: p1 };

  const shared = p1.filter((id) => p2.includes(id));
  const junction = shared.length === 1 ? nodes.find((node) => node.id === shared[0]) : undefined;
  if (junction === undefined || junctionIsBusy(circuit, junction, r1, r2)) return neither;
  return { found: 'series', target: [...p1, ...p2].filter((id) => id !== junction.id) };
}
