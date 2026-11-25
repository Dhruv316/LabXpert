import {
  TERMINALS_BY_TYPE,
  type Circuit,
  type CircuitComponent,
  type RawNode,
  type TerminalRef,
} from '../model/types';

/** Every terminal of one component, in the order TERMINALS_BY_TYPE lists them. */
export function terminalsOf(component: CircuitComponent): TerminalRef[] {
  return TERMINALS_BY_TYPE[component.type].map((name): TerminalRef => `${component.id}.${name}`);
}

/** Every terminal on the bench, in component order. */
export function allTerminals(circuit: Circuit): TerminalRef[] {
  return circuit.components.flatMap(terminalsOf);
}

/** True when the component conducts like a plain wire: a closed switch or an ammeter. */
export function isZeroResistance(component: CircuitComponent): boolean {
  return component.type === 'ammeter' || (component.type === 'switch' && component.closed);
}

/** Union-find keyed by terminal ref. Small circuits, so path halving is plenty. */
export class TerminalSets {
  private readonly parent = new Map<TerminalRef, TerminalRef>();

  constructor(terminals: readonly TerminalRef[]) {
    for (const terminal of terminals) this.parent.set(terminal, terminal);
  }

  has(terminal: TerminalRef): boolean {
    return this.parent.has(terminal);
  }

  find(terminal: TerminalRef): TerminalRef {
    let current = terminal;
    for (;;) {
      const up = this.parent.get(current);
      if (up === undefined || up === current) return current;
      const grand = this.parent.get(up) ?? up;
      this.parent.set(current, grand);
      current = grand;
    }
  }

  union(a: TerminalRef, b: TerminalRef): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

/** Groups terminals by set, ordered by the first terminal of each group (stable ids). */
function groupNodes(terminals: readonly TerminalRef[], sets: TerminalSets, idPrefix: string): RawNode[] {
  const groups = new Map<TerminalRef, TerminalRef[]>();
  for (const terminal of terminals) {
    const root = sets.find(terminal);
    const group = groups.get(root);
    if (group) group.push(terminal);
    else groups.set(root, [terminal]);
  }
  return [...groups.values()].map((group, index) => ({ id: `${idPrefix}${index + 1}`, terminals: group }));
}

function joinWires(circuit: Circuit, sets: TerminalSets): void {
  for (const wire of circuit.wires) {
    // A wire to a terminal that is not on the bench cannot join anything, so it is ignored.
    if (sets.has(wire.from) && sets.has(wire.to)) sets.union(wire.from, wire.to);
  }
}

function rawSets(circuit: Circuit): TerminalSets {
  const sets = new TerminalSets(allTerminals(circuit));
  joinWires(circuit, sets);
  return sets;
}

/** Raw nodes: terminals joined by wires. A terminal with no wire is a node by itself. Ids are n1, n2, ... */
export function rawNodes(circuit: Circuit): RawNode[] {
  return groupNodes(allTerminals(circuit), rawSets(circuit), 'n');
}

/**
 * Contracted nodes (c-nodes): raw nodes that are also joined by a closed switch or an ammeter.
 * An open switch and a voltmeter never join anything. Ids are c1, c2, ...
 * Reuses the RawNode shape because a c-node is just a bigger set of terminals.
 */
export function contractedNodes(circuit: Circuit): RawNode[] {
  const sets = rawSets(circuit);
  for (const component of circuit.components) {
    if (!isZeroResistance(component)) continue;
    const [first, second] = terminalsOf(component);
    if (first !== undefined && second !== undefined) sets.union(first, second);
  }
  return groupNodes(allTerminals(circuit), sets, 'c');
}

function nodeHolding(nodes: readonly RawNode[], terminal: TerminalRef): RawNode | undefined {
  return nodes.find((node) => node.terminals.includes(terminal));
}

/** The raw node that holds this terminal, or undefined if the terminal is not on the bench. */
export function rawNodeOf(circuit: Circuit, terminal: TerminalRef): RawNode | undefined {
  return nodeHolding(rawNodes(circuit), terminal);
}

/** The c-node that holds this terminal, or undefined if the terminal is not on the bench. */
export function contractedNodeOf(circuit: Circuit, terminal: TerminalRef): RawNode | undefined {
  return nodeHolding(contractedNodes(circuit), terminal);
}

function sameNode(nodes: readonly RawNode[], a: TerminalRef, b: TerminalRef): boolean {
  const node = nodeHolding(nodes, a);
  return node !== undefined && node.terminals.includes(b);
}

/** Are these two terminals on the same raw node (joined by wires only)? A terminal is on its own node. */
export function sameRawNode(circuit: Circuit, a: TerminalRef, b: TerminalRef): boolean {
  return sameNode(rawNodes(circuit), a, b);
}

/** Are these two terminals on the same c-node (wires, closed switches and ammeters)? */
export function sameContractedNode(circuit: Circuit, a: TerminalRef, b: TerminalRef): boolean {
  return sameNode(contractedNodes(circuit), a, b);
}
