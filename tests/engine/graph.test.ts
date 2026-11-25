import { describe, expect, it } from 'vitest';
import type { Circuit } from '../../src/model/types';
import {
  allTerminals,
  contractedNodeOf,
  contractedNodes,
  rawNodeOf,
  rawNodes,
  sameContractedNode,
  sameRawNode,
} from '../../src/engine/graph';
import { buildCircuit } from './load-cases';

/** S, SW, R, A, V with the given wires and switch state. */
function bench(wires: [string, string][], closed = true): Circuit {
  return buildCircuit({
    components: [
      { id: 'S', type: 'supply', voltage: 6 },
      { id: 'SW', type: 'switch', closed },
      { id: 'R', type: 'resistor', role: 'R', ohms: 10 },
      { id: 'A', type: 'ammeter' },
      { id: 'V', type: 'voltmeter' },
    ],
    wires: wires as Parameters<typeof buildCircuit>[0]['wires'],
  });
}

describe('rawNodes', () => {
  it('gives an unwired terminal its own raw node', () => {
    const circuit = bench([['S.pos', 'SW.a']]);
    const nodes = rawNodes(circuit);
    const lonely = nodes.find((node) => node.terminals.includes('R.a'));
    expect(lonely?.terminals).toEqual(['R.a']);
    expect(nodes).toHaveLength(allTerminals(circuit).length - 1);
  });

  it('puts terminals joined by wires on one raw node, also through a chain of wires', () => {
    const circuit = bench([['S.pos', 'SW.a'], ['SW.a', 'R.a'], ['R.a', 'V.pos']]);
    const node = rawNodeOf(circuit, 'S.pos');
    expect(node?.terminals).toEqual(['S.pos', 'SW.a', 'R.a', 'V.pos']);
    expect(sameRawNode(circuit, 'S.pos', 'V.pos')).toBe(true);
    expect(sameRawNode(circuit, 'S.pos', 'S.neg')).toBe(false);
  });

  it('does not join the two sides of a closed switch or an ammeter', () => {
    const circuit = bench([['S.pos', 'SW.a'], ['SW.b', 'A.pos']]);
    expect(sameRawNode(circuit, 'SW.a', 'SW.b')).toBe(false);
    expect(sameRawNode(circuit, 'A.pos', 'A.neg')).toBe(false);
  });

  it('lists every terminal exactly once, with stable ids', () => {
    const circuit = bench([['S.pos', 'SW.a'], ['SW.b', 'R.a']]);
    const listed = rawNodes(circuit).flatMap((node) => node.terminals);
    expect([...listed].sort()).toEqual([...allTerminals(circuit)].sort());
    expect(rawNodes(circuit)).toEqual(rawNodes(circuit));
    expect(rawNodes(circuit)[0]?.id).toBe('n1');
  });

  it('ignores a wire that ends on a terminal that is not on the bench', () => {
    const circuit = bench([['S.pos', 'X.a']]);
    expect(rawNodeOf(circuit, 'S.pos')?.terminals).toEqual(['S.pos']);
    expect(rawNodeOf(circuit, 'X.a')).toBeUndefined();
  });
});

describe('contractedNodes', () => {
  it('merges across a closed switch', () => {
    const circuit = bench([['S.pos', 'SW.a'], ['SW.b', 'R.a']], true);
    expect(sameContractedNode(circuit, 'S.pos', 'R.a')).toBe(true);
    expect(sameRawNode(circuit, 'S.pos', 'R.a')).toBe(false);
  });

  it('does not merge across an open switch', () => {
    const circuit = bench([['S.pos', 'SW.a'], ['SW.b', 'R.a']], false);
    expect(sameContractedNode(circuit, 'S.pos', 'R.a')).toBe(false);
  });

  it('merges across an ammeter', () => {
    const circuit = bench([['S.pos', 'A.pos'], ['A.neg', 'R.a']]);
    expect(sameContractedNode(circuit, 'S.pos', 'R.a')).toBe(true);
  });

  it('does not merge across a voltmeter', () => {
    const circuit = bench([['S.pos', 'V.pos'], ['V.neg', 'R.a']]);
    expect(sameContractedNode(circuit, 'S.pos', 'R.a')).toBe(false);
    expect(sameContractedNode(circuit, 'V.pos', 'V.neg')).toBe(false);
  });

  it('keeps wires, a closed switch and an ammeter in one c-node and says which node holds a terminal', () => {
    const circuit = bench([['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a']]);
    const node = contractedNodeOf(circuit, 'S.pos');
    expect([...(node?.terminals ?? [])].sort()).toEqual(['A.neg', 'A.pos', 'R.a', 'S.pos', 'SW.a', 'SW.b']);
    expect(contractedNodeOf(circuit, 'R.a')).toEqual(node);
    expect(contractedNodeOf(circuit, 'S.neg')?.terminals).toEqual(['S.neg']);
    expect(contractedNodes(circuit).flatMap((n) => n.terminals)).toHaveLength(allTerminals(circuit).length);
  });

  it('returns undefined for a terminal that is not on the bench', () => {
    expect(contractedNodeOf(bench([]), 'X.a')).toBeUndefined();
    expect(sameContractedNode(bench([]), 'X.a', 'X.b')).toBe(false);
  });
});
