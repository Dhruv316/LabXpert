import { describe, expect, it } from 'vitest';
import { BENCH, PART_SIZE } from '../../src/bench/catalog';
import { clientToBench, isInside } from '../../src/bench/coords';
import { clampPosition, nextFreeSpot, topLeftFromCenter } from '../../src/bench/geometry';
import {
  canPlace,
  clearCircuit,
  moveComponent,
  moveComponentBy,
  placeComponent,
  removeComponent,
  shelfStatus,
} from '../../src/bench/ops';
import type { Circuit, ComponentType } from '../../src/model/types';
import { EMPTY_CIRCUIT, ohmsLaw, seriesParallel, withPart } from './helpers';

const TYPES: ComponentType[] = ['supply', 'switch', 'resistor', 'ammeter', 'voltmeter'];

describe('clamping', () => {
  it.each(TYPES)('keeps a %s fully inside the 1100 × 620 mat from every side', (type) => {
    const { width, height } = PART_SIZE[type];
    const corners = [
      [-500, -500],
      [5000, -500],
      [-500, 5000],
      [5000, 5000],
    ] as const;
    for (const [x, y] of corners) {
      const spot = clampPosition(type, x, y);
      expect(spot.x).toBeGreaterThanOrEqual(0);
      expect(spot.y).toBeGreaterThanOrEqual(0);
      expect(spot.x + width).toBeLessThanOrEqual(BENCH.width);
      expect(spot.y + height).toBeLessThanOrEqual(BENCH.height);
    }
  });

  it('leaves a position that is already inside alone', () => {
    expect(clampPosition('supply', 300, 200)).toEqual({ x: 300, y: 200 });
  });

  it('puts the far corner exactly on the mat edge', () => {
    expect(clampPosition('supply', 9999, 9999)).toEqual({
      x: BENCH.width - PART_SIZE.supply.width,
      y: BENCH.height - PART_SIZE.supply.height,
    });
  });

  it('centres a dropped part on the pointer', () => {
    expect(topLeftFromCenter('supply', 500, 300)).toEqual({ x: 400, y: 234 });
  });

  it('clamps a part when it is placed and when it is moved', () => {
    const placed = placeComponent(EMPTY_CIRCUIT, ohmsLaw, 'supply', { x: -50, y: 9000 });
    expect(placed?.component.x).toBe(0);
    expect(placed?.component.y).toBe(BENCH.height - PART_SIZE.supply.height);
    const moved = moveComponent(placed?.circuit ?? EMPTY_CIRCUIT, 'S', 9000, -9000);
    expect(moved.components[0]?.x).toBe(BENCH.width - PART_SIZE.supply.width);
    expect(moved.components[0]?.y).toBe(0);
  });
});

describe('shelf counts and max', () => {
  it('refuses a part beyond its max and reports the tile as full', () => {
    let circuit = withPart(EMPTY_CIRCUIT, ohmsLaw, 'supply');
    expect(canPlace(circuit, ohmsLaw, 'supply')).toBe(false);
    expect(placeComponent(circuit, ohmsLaw, 'supply', { x: 400, y: 400 })).toBeUndefined();
    expect(shelfStatus(circuit, ohmsLaw).find((s) => s.type === 'supply')).toEqual({
      type: 'supply',
      max: 1,
      placed: 1,
      full: true,
    });
    circuit = removeComponent(circuit, 'S')?.circuit ?? circuit;
    expect(canPlace(circuit, ohmsLaw, 'supply')).toBe(true);
  });

  it('allows two resistors in series and parallel, and no third', () => {
    let circuit = withPart(EMPTY_CIRCUIT, seriesParallel, 'resistor', 100, 100);
    expect(shelfStatus(circuit, seriesParallel).find((s) => s.type === 'resistor')?.full).toBe(false);
    circuit = withPart(circuit, seriesParallel, 'resistor', 400, 100);
    expect(shelfStatus(circuit, seriesParallel).find((s) => s.type === 'resistor')?.full).toBe(true);
    expect(placeComponent(circuit, seriesParallel, 'resistor', { x: 700, y: 100 })).toBeUndefined();
  });

  it('allows only one resistor in Ohm’s Law', () => {
    const circuit = withPart(EMPTY_CIRCUIT, ohmsLaw, 'resistor');
    expect(canPlace(circuit, ohmsLaw, 'resistor')).toBe(false);
  });

  it('refuses a part that is not on the experiment’s shelf', () => {
    const noMeters = { ...ohmsLaw, shelf: ohmsLaw.shelf.filter((i) => i.type !== 'ammeter') };
    expect(canPlace(EMPTY_CIRCUIT, noMeters, 'ammeter')).toBe(false);
    expect(placeComponent(EMPTY_CIRCUIT, noMeters, 'ammeter', { x: 0, y: 0 })).toBeUndefined();
  });
});

describe('roles and starting values', () => {
  it('names the single Ohm’s Law resistor R with the default 10 Ω', () => {
    const placed = placeComponent(EMPTY_CIRCUIT, ohmsLaw, 'resistor', { x: 100, y: 100 });
    expect(placed?.component).toMatchObject({ id: 'R', type: 'resistor', role: 'R', ohms: 10 });
  });

  it('names resistors R1 then R2 in order of placement, with their own default values', () => {
    const one = withPart(EMPTY_CIRCUIT, seriesParallel, 'resistor', 100, 100);
    const two = withPart(one, seriesParallel, 'resistor', 400, 100);
    expect(two.components.map((c) => (c.type === 'resistor' ? [c.id, c.role, c.ohms] : null))).toEqual([
      ['R1', 'R1', 10],
      ['R2', 'R2', 20],
    ]);
  });

  it('gives a freed role to the next resistor and keeps the other one’s name', () => {
    const two = withPart(withPart(EMPTY_CIRCUIT, seriesParallel, 'resistor', 100, 100), seriesParallel, 'resistor', 400, 100);
    const afterRemove = removeComponent(two, 'R1')?.circuit ?? two;
    const again = withPart(afterRemove, seriesParallel, 'resistor', 100, 300);
    expect(again.components.map((c) => c.id).sort()).toEqual(['R1', 'R2']);
  });

  it('starts the supply at the experiment’s default voltage and the switch open', () => {
    const circuit = withPart(withPart(EMPTY_CIRCUIT, ohmsLaw, 'supply', 50, 50), ohmsLaw, 'switch', 400, 50);
    expect(circuit.components[0]).toMatchObject({ id: 'S', type: 'supply', voltage: ohmsLaw.supply.default });
    expect(circuit.components[1]).toMatchObject({ id: 'SW', type: 'switch', closed: false });
  });

  it('uses the ids the spec test cases use: S, SW, A, V', () => {
    let circuit: Circuit = EMPTY_CIRCUIT;
    circuit = withPart(circuit, ohmsLaw, 'ammeter', 50, 300);
    circuit = withPart(circuit, ohmsLaw, 'voltmeter', 300, 300);
    expect(circuit.components.map((c) => c.id)).toEqual(['A', 'V']);
  });
});

describe('remove', () => {
  const wired: Circuit = {
    components: [
      { id: 'S', type: 'supply', x: 0, y: 0, voltage: 0 },
      { id: 'R', type: 'resistor', x: 300, y: 0, role: 'R', ohms: 10 },
      { id: 'A', type: 'ammeter', x: 600, y: 0 },
    ],
    wires: [
      { id: 'w1', from: 'S.pos', to: 'R.a' },
      { id: 'w2', from: 'R.b', to: 'A.pos' },
      { id: 'w3', from: 'A.neg', to: 'S.neg' },
    ],
  };

  it('removes a part together with every wire on it, and no other wire', () => {
    const result = removeComponent(wired, 'R');
    expect(result?.circuit.components.map((c) => c.id)).toEqual(['S', 'A']);
    expect(result?.circuit.wires.map((w) => w.id)).toEqual(['w3']);
    expect(result?.removedWires.map((w) => w.id)).toEqual(['w1', 'w2']);
  });

  it('does not mistake R1 for a wire end on R10 or R', () => {
    const circuit: Circuit = {
      components: [
        { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 5 },
        { id: 'R1', type: 'resistor', x: 300, y: 0, role: 'R1', ohms: 5 },
      ],
      wires: [{ id: 'w1', from: 'R.b', to: 'R1.a' }],
    };
    expect(removeComponent(circuit, 'R1')?.circuit.wires).toEqual([]);
    expect(removeComponent({ ...circuit, wires: [{ id: 'w9', from: 'R1.b', to: 'R1.a' }] }, 'R')?.circuit.wires).toHaveLength(1);
  });

  it('cannot remove a locked part, and an unknown id does nothing', () => {
    const locked: Circuit = {
      components: [{ id: 'A', type: 'ammeter', x: 0, y: 0, locked: true }],
      wires: [],
    };
    expect(removeComponent(locked, 'A')).toBeUndefined();
    expect(removeComponent(wired, 'nope')).toBeUndefined();
  });
});

describe('move', () => {
  const locked: Circuit = {
    components: [
      { id: 'A', type: 'ammeter', x: 50, y: 50, locked: true },
      { id: 'V', type: 'voltmeter', x: 300, y: 50 },
    ],
    wires: [],
  };

  it('cannot move a locked part: the very same circuit comes back', () => {
    expect(moveComponent(locked, 'A', 400, 400)).toBe(locked);
    expect(moveComponentBy(locked, 'A', 10, 10)).toBe(locked);
  });

  it('moves a free part and leaves the rest and the input untouched', () => {
    const before = structuredClone(locked);
    const next = moveComponent(locked, 'V', 500, 200);
    expect(next.components[1]).toMatchObject({ x: 500, y: 200 });
    expect(next.components[0]).toBe(locked.components[0]);
    expect(locked).toEqual(before);
  });

  it('returns the same circuit when the part would not move', () => {
    expect(moveComponent(locked, 'V', 300, 50)).toBe(locked);
    expect(moveComponent(locked, 'unknown', 1, 1)).toBe(locked);
  });
});

describe('clear', () => {
  it('empties the mat, locked parts included, and says nothing to do when already empty', () => {
    const circuit: Circuit = {
      components: [{ id: 'A', type: 'ammeter', x: 0, y: 0, locked: true }],
      wires: [{ id: 'w1', from: 'A.pos', to: 'A.neg' }],
    };
    const cleared = clearCircuit(circuit);
    expect(cleared?.circuit).toEqual({ components: [], wires: [] });
    expect(cleared?.removedComponents).toHaveLength(1);
    expect(clearCircuit(EMPTY_CIRCUIT)).toBeUndefined();
  });
});

describe('next free spot (Enter on a tile)', () => {
  it('lands on the mat and never on top of a placed part', () => {
    let circuit: Circuit = EMPTY_CIRCUIT;
    for (const type of ['supply', 'switch', 'ammeter', 'voltmeter'] as const) {
      const spot = nextFreeSpot(circuit, type);
      const placed = placeComponent(circuit, ohmsLaw, type, spot);
      expect(placed).toBeDefined();
      circuit = placed?.circuit ?? circuit;
    }
    const boxes = circuit.components.map((c) => ({ ...c, ...PART_SIZE[c.type] }));
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue;
        const apart =
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('is the same every time for the same bench', () => {
    expect(nextFreeSpot(EMPTY_CIRCUIT, 'supply')).toEqual(nextFreeSpot(EMPTY_CIRCUIT, 'supply'));
  });
});

describe('screen to mat coordinates', () => {
  it('maps a point when the scene exactly fills the element', () => {
    const rect = { left: 10, top: 20, width: 1100, height: 648 };
    expect(clientToBench(rect, 110, 120)).toEqual({ x: 100, y: 100 });
  });

  it('allows for the empty bands when the element is wider than the scene', () => {
    // Height-limited: scale 0.5, so the 1100-wide scene is 550 px wide, centred in 1000 px.
    const rect = { left: 0, top: 0, width: 1000, height: 324 };
    expect(clientToBench(rect, 225 + 275, 162)).toEqual({ x: 550, y: 324 });
  });

  it('gives nothing before the element has a size', () => {
    expect(clientToBench({ left: 0, top: 0, width: 0, height: 0 }, 5, 5)).toBeUndefined();
  });

  it('tells inside from outside', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(isInside(rect, 50, 50)).toBe(true);
    expect(isInside(rect, 150, 50)).toBe(false);
  });
});
