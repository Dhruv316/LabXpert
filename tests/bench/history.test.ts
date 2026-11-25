import { describe, expect, it } from 'vitest';
import { EMPTY_HISTORY, HISTORY_LIMIT, popSnapshot, pushSnapshot, type History } from '../../src/bench/history';
import { placeComponent } from '../../src/bench/ops';
import type { Circuit } from '../../src/model/types';
import { EMPTY_CIRCUIT, ohmsLaw, withPart } from './helpers';

function circuitWithX(x: number): Circuit {
  return { components: [{ id: 'A', type: 'ammeter', x, y: 0 }], wires: [] };
}

describe('history', () => {
  it('keeps at most 50 snapshots and drops the oldest first', () => {
    expect(HISTORY_LIMIT).toBe(50);
    let history: History = EMPTY_HISTORY;
    for (let i = 0; i < 60; i += 1) history = pushSnapshot(history, circuitWithX(i));
    expect(history).toHaveLength(50);
    expect(history[0]?.components[0]?.x).toBe(10);
    expect(history[49]?.components[0]?.x).toBe(59);
  });

  it('pops the newest snapshot and shortens the history', () => {
    const history = pushSnapshot(pushSnapshot(EMPTY_HISTORY, circuitWithX(1)), circuitWithX(2));
    const popped = popSnapshot(history);
    expect(popped?.snapshot.components[0]?.x).toBe(2);
    expect(popped?.history).toHaveLength(1);
  });

  it('has nothing to pop when empty', () => {
    expect(popSnapshot(EMPTY_HISTORY)).toBeUndefined();
  });

  it('does not change the history it was given', () => {
    const history = pushSnapshot(EMPTY_HISTORY, circuitWithX(1));
    pushSnapshot(history, circuitWithX(2));
    popSnapshot(history);
    expect(history).toHaveLength(1);
  });

  it('undo restores the bench exactly: the same object, deeply equal to what it was', () => {
    const before = withPart(withPart(EMPTY_CIRCUIT, ohmsLaw, 'supply', 50, 50), ohmsLaw, 'switch', 400, 50);
    const frozen = structuredClone(before);
    const placed = placeComponent(before, ohmsLaw, 'resistor', { x: 700, y: 300 });
    const history = pushSnapshot(EMPTY_HISTORY, before);
    expect(placed?.circuit.components).toHaveLength(3);
    const restored = popSnapshot(history)?.snapshot;
    expect(restored).toBe(before);
    expect(restored).toEqual(frozen);
  });
});
