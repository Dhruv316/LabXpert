// Which wires carry current, and which way. Pure: no clock, no DOM, no student-facing text.
//
// Method (a documented rule, not a second circuit solve). Wires are ideal, so a wire's two ends share
// one potential and the potentials say nothing about the current inside it. What is known is each
// part's own current at each of its terminals (`terminalCurrents`, from the same voltages the meters
// use). The wires that join terminals form nets, and each net is a graph. Current that a part pushes
// into a net must come out of it somewhere else, so the flow in the wires is whatever balances those
// currents, found like this:
//   1. Walk the wires in circuit order and keep a wire only if it joins two terminals that were not
//      yet connected. Those wires form a spanning tree of each net; a wire that closes a loop is
//      redundant and carries nothing (its two ends are already on the same node). Ideal wires leave
//      that split undefined, and this is the simplest fixed choice: the wire drawn last gives way.
//   2. On a tree the flow is unique. The wire above a terminal carries the sum of the part currents
//      injected at that terminal and everything below it, towards the root if the sum is positive.
// A junction of three or more wires is just a tree node with several children: each branch wire
// carries what its subtree injects or draws, so the branches add up to the trunk by construction.
// A voltmeter's terminals inject nothing, so its wires always come out at zero.
//
// Why not tiny resistances for the wires: that would add a second solve whose accuracy depends on how
// small the resistance is, and it would share a loop's current between redundant wires in a way a
// student cannot read off the picture.
import { allTerminals, TerminalSets } from '../engine/graph';
import { readingSign, terminalCurrents } from '../engine/solver';
import type { Circuit, ExperimentConfig, TerminalRef, Wire } from '../model/types';
import { liveState, type LiveState } from './live';

/** One wire: either still, or carrying current from `from` to `to` (conventional current). */
export type WireCurrent =
  | { flowing: false }
  | {
      flowing: true;
      /** The terminal at the end of the wire where the current enters it. */
      from: TerminalRef;
      /** The terminal at the other end, where it leaves. */
      to: TerminalRef;
      /** Size of the current in amps, unrounded. */
      amps: number;
    };

/** Every wire of the circuit, by wire id, in circuit order. */
export type WireFlow = ReadonlyMap<string, WireCurrent>;

const STILL: WireCurrent = { flowing: false };

interface Link {
  wire: Wire;
  other: TerminalRef;
}

interface Visit {
  terminal: TerminalRef;
  parent: TerminalRef;
  wire: Wire;
}

/** Step 1: the wires that join terminals not yet joined, as a neighbour list per terminal. */
function spanningLinks(circuit: Circuit): Map<TerminalRef, Link[]> {
  const sets = new TerminalSets(allTerminals(circuit));
  const links = new Map<TerminalRef, Link[]>();
  const add = (at: TerminalRef, link: Link): void => {
    const list = links.get(at);
    if (list) list.push(link);
    else links.set(at, [link]);
  };
  for (const wire of circuit.wires) {
    // A wire to a terminal that is not on the bench joins nothing, as in the graph helpers.
    if (!sets.has(wire.from) || !sets.has(wire.to)) continue;
    if (sets.find(wire.from) === sets.find(wire.to)) continue;
    sets.union(wire.from, wire.to);
    add(wire.from, { wire, other: wire.to });
    add(wire.to, { wire, other: wire.from });
  }
  return links;
}

/** Step 2: the flow on every tree wire, from the currents the parts inject. */
function treeFlow(
  circuit: Circuit,
  injected: ReadonlyMap<TerminalRef, number>,
  links: ReadonlyMap<TerminalRef, readonly Link[]>,
  flow: Map<string, WireCurrent>,
): void {
  const terminals = allTerminals(circuit);
  const subtree = new Map<TerminalRef, number>(terminals.map((terminal) => [terminal, injected.get(terminal) ?? 0]));
  const seen = new Set<TerminalRef>();
  for (const root of terminals) {
    if (seen.has(root)) continue;
    seen.add(root);
    // Breadth-first from the root: a terminal always comes after its parent.
    const queue: TerminalRef[] = [root];
    const visits: Visit[] = [];
    for (let at = 0; at < queue.length; at += 1) {
      const terminal = queue[at];
      for (const { wire, other } of links.get(terminal) ?? []) {
        if (seen.has(other)) continue;
        seen.add(other);
        queue.push(other);
        visits.push({ terminal: other, parent: terminal, wire });
      }
    }
    // Children before parents, so each terminal's total is complete when it is passed up.
    for (let at = visits.length - 1; at >= 0; at -= 1) {
      const { terminal, parent, wire } = visits[at];
      const total = subtree.get(terminal) ?? 0;
      subtree.set(parent, (subtree.get(parent) ?? 0) + total);
      // Never compared with 0 directly: a sum that should cancel leaves rounding noise.
      const sign = readingSign(total);
      if (sign > 0) flow.set(wire.id, { flowing: true, from: terminal, to: parent, amps: total });
      else if (sign < 0) flow.set(wire.id, { flowing: true, from: parent, to: terminal, amps: -total });
    }
  }
}

/**
 * Which way current runs in each wire, given the live state of the same circuit. Nothing flows unless
 * `live.flowing` (switch closed, loop complete, no overload, supply above 0 V): that test is read from
 * `liveState`, not repeated here.
 */
export function wireFlowFromLive(circuit: Circuit, live: Pick<LiveState, 'flowing'>): WireFlow {
  const flow = new Map<string, WireCurrent>(circuit.wires.map((wire) => [wire.id, STILL]));
  if (!live.flowing) return flow;
  const injected = terminalCurrents(circuit);
  if (injected === undefined) return flow;
  treeFlow(circuit, injected, spanningLinks(circuit), flow);
  return flow;
}

/** Same, solving the live state itself; for callers that do not already hold it. */
export function wireFlow(circuit: Circuit, experiment: Pick<ExperimentConfig, 'meterRanges'>): WireFlow {
  return wireFlowFromLive(circuit, liveState(circuit, experiment));
}
