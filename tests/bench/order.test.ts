import { describe, expect, it } from 'vitest';
import { partsInTabOrder } from '../../src/bench/order';
import type { CircuitComponent } from '../../src/model/types';

const supply: CircuitComponent = { id: 'S', type: 'supply', x: 0, y: 0, voltage: 6 };
const resistor: CircuitComponent = { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 10 };
const ammeter: CircuitComponent = { id: 'A', type: 'ammeter', x: 0, y: 0 };
const switchA: CircuitComponent = { id: 'SW', type: 'switch', x: 0, y: 0, closed: false };
const switchB: CircuitComponent = { id: 'SW2', type: 'switch', x: 0, y: 0, closed: true };

const ids = (parts: readonly CircuitComponent[]) => parts.map((part) => part.id);

describe('partsInTabOrder (DESIGN.md §11: parts, then the switch)', () => {
  it('moves a switch placed first to the end and keeps the others in placement order', () => {
    expect(ids(partsInTabOrder([switchA, supply, resistor, ammeter]))).toEqual(['S', 'R', 'A', 'SW']);
  });

  it('a switch placed in the middle also ends last', () => {
    expect(ids(partsInTabOrder([supply, switchA, ammeter]))).toEqual(['S', 'A', 'SW']);
  });

  it('several switches keep their own order, after every other part', () => {
    expect(ids(partsInTabOrder([switchB, supply, switchA]))).toEqual(['S', 'SW2', 'SW']);
  });

  it('changes nothing without a switch, and does not change its input', () => {
    const input = [supply, resistor];
    expect(ids(partsInTabOrder(input))).toEqual(['S', 'R']);
    const withSwitch = [switchA, supply];
    partsInTabOrder(withSwitch);
    expect(ids(withSwitch)).toEqual(['SW', 'S']);
  });

  it('an empty bench is empty', () => {
    expect(partsInTabOrder([])).toEqual([]);
  });
});
