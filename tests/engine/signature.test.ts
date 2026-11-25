import { describe, expect, it } from 'vitest';
import { actionSignature, circuitSignature } from '../../src/engine/signature';
import type { Circuit } from '../../src/model/types';

function base(): Circuit {
  return {
    components: [
      { id: 'S', type: 'supply', voltage: 6, x: 10, y: 10 },
      { id: 'R', type: 'resistor', role: 'R', ohms: 10, x: 200, y: 10 },
      { id: 'A', type: 'ammeter', x: 100, y: 100 },
    ],
    wires: [
      { id: 'w1', from: 'S.pos', to: 'A.pos' },
      { id: 'w2', from: 'A.neg', to: 'R.a' },
      { id: 'w3', from: 'R.b', to: 'S.neg' },
    ],
  };
}

describe('circuitSignature', () => {
  it('gives the same string for the same circuit', () => {
    expect(circuitSignature(base())).toBe(circuitSignature(base()));
  });

  it('ignores positions', () => {
    const moved = base();
    moved.components = moved.components.map((c) => ({ ...c, x: c.x + 50, y: c.y + 70 }));
    expect(circuitSignature(moved)).toBe(circuitSignature(base()));
  });

  it('ignores component order, wire order and wire ids', () => {
    const shuffled = base();
    shuffled.components.reverse();
    shuffled.wires.reverse();
    shuffled.wires = shuffled.wires.map((w, i) => ({ ...w, id: `other${i}` }));
    expect(circuitSignature(shuffled)).toBe(circuitSignature(base()));
  });

  it('ignores which end of a wire is from and to', () => {
    const flipped = base();
    flipped.wires = flipped.wires.map((w) => ({ ...w, from: w.to, to: w.from }));
    expect(circuitSignature(flipped)).toBe(circuitSignature(base()));
  });

  it('changes when a resistor value changes', () => {
    const changed = base();
    changed.components = changed.components.map((c) => (c.type === 'resistor' ? { ...c, ohms: 20 } : c));
    expect(circuitSignature(changed)).not.toBe(circuitSignature(base()));
  });

  it('changes when the supply voltage changes', () => {
    const changed = base();
    changed.components = changed.components.map((c) => (c.type === 'supply' ? { ...c, voltage: 9 } : c));
    expect(circuitSignature(changed)).not.toBe(circuitSignature(base()));
  });

  it('changes when a switch opens or closes', () => {
    const closed: Circuit = { components: [{ id: 'SW', type: 'switch', closed: true, x: 0, y: 0 }], wires: [] };
    const open: Circuit = { components: [{ id: 'SW', type: 'switch', closed: false, x: 0, y: 0 }], wires: [] };
    expect(circuitSignature(closed)).not.toBe(circuitSignature(open));
  });

  it('changes when a wire is moved to another terminal', () => {
    const changed = base();
    changed.wires = changed.wires.map((w) => (w.id === 'w2' ? { ...w, to: 'R.b' } : w));
    expect(circuitSignature(changed)).not.toBe(circuitSignature(base()));
  });

  it('changes when a wire is added or removed', () => {
    const fewer = base();
    fewer.wires = fewer.wires.slice(0, 2);
    expect(circuitSignature(fewer)).not.toBe(circuitSignature(base()));
  });

  it('changes when a component is added', () => {
    const more = base();
    more.components.push({ id: 'V', type: 'voltmeter', x: 0, y: 0 });
    expect(circuitSignature(more)).not.toBe(circuitSignature(base()));
  });

  it('handles an empty circuit', () => {
    expect(circuitSignature({ components: [], wires: [] })).toBe('wires:|components:');
  });
});

describe('actionSignature', () => {
  it('uses the §F format', () => {
    expect(actionSignature(2, 1, 30.6)).toBe('readings:2|answers:1|typed:30.6');
  });

  it('leaves typed empty when nothing was typed', () => {
    expect(actionSignature(0, 0)).toBe('readings:0|answers:0|typed:');
  });

  it('changes with each of its three parts', () => {
    const start = actionSignature(1, 1, 5);
    expect(actionSignature(2, 1, 5)).not.toBe(start);
    expect(actionSignature(1, 2, 5)).not.toBe(start);
    expect(actionSignature(1, 1, 6)).not.toBe(start);
  });

  it('is stable for the same inputs', () => {
    expect(actionSignature(3, 0, 12)).toBe(actionSignature(3, 0, 12));
  });
});
