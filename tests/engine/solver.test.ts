import { describe, expect, it } from 'vitest';
import type { Circuit } from '../../src/model/types';
import { PROBE_VOLTAGE, probeSolve, readingSign, roundReadings, simulate } from '../../src/engine/solver';
import { buildCircuit } from './load-cases';

type Wires = Parameters<typeof buildCircuit>[0]['wires'];
type Components = Parameters<typeof buildCircuit>[0]['components'];

const supply = (voltage: number): Components[number] => ({ id: 'S', type: 'supply', voltage });
const resistor = (id: string, ohms: number, role: 'R' | 'R1' | 'R2' = 'R'): Components[number] => ({
  id,
  type: 'resistor',
  role,
  ohms,
});
const sw = (closed: boolean): Components[number] => ({ id: 'SW', type: 'switch', closed });
const ammeter: Components[number] = { id: 'A', type: 'ammeter' };
const voltmeter: Components[number] = { id: 'V', type: 'voltmeter' };

function make(components: Components, wires: Wires): Circuit {
  return buildCircuit({ components, wires });
}

// 6 V, switch, ammeter, 10 ohm: current = 6 / 10 = 0.6 A, voltmeter across R reads 6 V.
// The 1e-6 ohm contact resistance of the switch and ammeter (rules-spec B.2) moves a 6 V reading by about
// 1e-6 V, so numbers are checked to 4 decimals here. The spec cases check the displayed (rounded) values.
const seriesWires: Wires = [
  ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
];
const seriesLoop = (voltage = 6, closed = true) =>
  make([supply(voltage), sw(closed), resistor('R', 10), ammeter, voltmeter], seriesWires);

describe('simulate: a simple series loop', () => {
  it('gives 0.6 A and 6 V for 6 V across 10 ohm', () => {
    const result = simulate(seriesLoop());
    expect(result.overload).toBe(false);
    expect(result.complete).toBe(true);
    expect(result.ammeter).toBeCloseTo(0.6, 4);
    expect(result.voltmeter).toBeCloseTo(6, 4);
    expect(result.supplyCurrent).toBeCloseTo(0.6, 4);
  });

  it('scales with the supply: 12 V across 10 ohm is 1.2 A and 12 V', () => {
    const result = simulate(seriesLoop(12));
    expect(result.ammeter).toBeCloseTo(1.2, 4);
    expect(result.voltmeter).toBeCloseTo(12, 4);
  });

  it('reads zero current and zero voltage at 0 V but is still a complete loop', () => {
    const result = simulate(seriesLoop(0));
    expect(result.complete).toBe(true);
    expect(roundReadings(result, 2)).toMatchObject({ ammeter: 0, voltmeter: 0 });
  });

  it('uses the supply voltage argument instead of the component setting', () => {
    const result = simulate(seriesLoop(12), PROBE_VOLTAGE);
    expect(result.ammeter).toBeCloseTo(0.1, 4);
    expect(result.voltmeter).toBeCloseTo(1, 4);
  });

  it('series 10 + 20 ohm at 6 V: 0.2 A, 2 V across R1, 6 V across both', () => {
    const wires: Wires = [
      ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['R1.b', 'R2.a'], ['R2.b', 'S.neg'],
      ['V.pos', 'R1.a'], ['V.neg', 'R1.b'],
    ];
    const circuit = make(
      [supply(6), sw(true), resistor('R1', 10, 'R1'), resistor('R2', 20, 'R2'), ammeter, voltmeter],
      wires,
    );
    const result = simulate(circuit);
    expect(result.ammeter).toBeCloseTo(0.2, 4);
    expect(result.voltmeter).toBeCloseTo(2, 4);
  });

  it('parallel 10 || 20 ohm at 6 V: 0.6 A + 0.3 A = 0.9 A', () => {
    const wires: Wires = [
      ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['R1.a', 'R2.a'], ['R1.b', 'R2.b'],
      ['R2.b', 'S.neg'], ['V.pos', 'R1.a'], ['V.neg', 'R1.b'],
    ];
    const circuit = make(
      [supply(6), sw(true), resistor('R1', 10, 'R1'), resistor('R2', 20, 'R2'), ammeter, voltmeter],
      wires,
    );
    const result = simulate(circuit);
    expect(result.ammeter).toBeCloseTo(0.9, 4);
    expect(result.voltmeter).toBeCloseTo(6, 4);
    expect(result.supplyCurrent).toBeCloseTo(0.9, 4);
  });

  it('gives the same readings with the ammeter after the resistor', () => {
    const wires: Wires = [
      ['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'A.pos'], ['A.neg', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
    ];
    const result = simulate(make([supply(6), sw(true), resistor('R', 10), ammeter, voltmeter], wires));
    expect(result.ammeter).toBeCloseTo(0.6, 4);
    expect(result.voltmeter).toBeCloseTo(6, 4);
  });
});

describe('simulate: overload', () => {
  it('a wire straight across the supply is an overload with every reading 0', () => {
    const circuit = make(
      [supply(6), sw(true), resistor('R', 10), ammeter, voltmeter],
      [...seriesWires, ['S.pos', 'S.neg']],
    );
    expect(simulate(circuit)).toEqual({
      overload: true,
      complete: false,
      supplyCurrent: 0,
      ammeter: 0,
      voltmeter: 0,
    });
  });

  it('a closed switch and an ammeter alone across the supply also overload', () => {
    const circuit = make(
      [supply(6), sw(true), resistor('R', 10), ammeter, voltmeter],
      [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'S.neg']],
    );
    const result = simulate(circuit);
    expect(result.overload).toBe(true);
    expect(result.ammeter).toBe(0);
    expect(result.voltmeter).toBe(0);
  });

  it('is not an overload when the same path has an open switch', () => {
    const circuit = make(
      [supply(6), sw(false), resistor('R', 10), ammeter, voltmeter],
      [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'S.neg']],
    );
    expect(simulate(circuit).overload).toBe(false);
  });
});

describe('simulate: completeness', () => {
  it('an open switch gives complete: false and every reading 0', () => {
    expect(simulate(seriesLoop(6, false))).toEqual({
      overload: false,
      complete: false,
      supplyCurrent: 0,
      ammeter: 0,
      voltmeter: 0,
    });
  });

  it('a loop that is wired only halfway is incomplete', () => {
    const circuit = make(
      [supply(6), sw(true), resistor('R', 10), ammeter, voltmeter],
      [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a']],
    );
    expect(simulate(circuit).complete).toBe(false);
  });

  it('a voltmeter in series breaks the loop', () => {
    const circuit = make(
      [supply(6), sw(true), resistor('R', 10), ammeter, voltmeter],
      [['S.pos', 'SW.a'], ['SW.b', 'V.pos'], ['V.neg', 'R.a'], ['R.b', 'S.neg']],
    );
    const result = simulate(circuit);
    expect(result.complete).toBe(false);
    expect(result.voltmeter).toBe(0);
  });

  it('reports null for a meter that is not on the bench', () => {
    const circuit = make(
      [supply(6), sw(true), resistor('R', 10)],
      [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg']],
    );
    const result = simulate(circuit);
    expect(result.complete).toBe(true);
    expect(result.ammeter).toBeNull();
    expect(result.voltmeter).toBeNull();
    expect(result.supplyCurrent).toBeCloseTo(0.6, 4);
  });

  it('with no supply on the bench nothing flows and it is not an overload', () => {
    const result = simulate(make([sw(true), resistor('R', 10), ammeter], []));
    expect(result).toEqual({ overload: false, complete: false, supplyCurrent: 0, ammeter: 0, voltmeter: null });
  });
});

describe('simulate: meters', () => {
  it('reversed ammeter terminals give a negative current', () => {
    const wires: Wires = [
      ['S.pos', 'SW.a'], ['SW.b', 'A.neg'], ['A.pos', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
    ];
    const result = simulate(make([supply(6), sw(true), resistor('R', 10), ammeter, voltmeter], wires));
    expect(result.ammeter).toBeCloseTo(-0.6, 4);
    expect(result.voltmeter).toBeCloseTo(6, 4);
  });

  it('reversed voltmeter terminals give a negative voltage', () => {
    const wires: Wires = [
      ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.b'], ['V.neg', 'R.a'],
    ];
    const result = simulate(make([supply(6), sw(true), resistor('R', 10), ammeter, voltmeter], wires));
    expect(result.voltmeter).toBeCloseTo(-6, 4);
    expect(result.ammeter).toBeCloseTo(0.6, 4);
  });

  it('a supply wired backwards makes both meters negative', () => {
    const wires: Wires = [
      ['S.neg', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.pos'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
    ];
    const result = simulate(make([supply(6), sw(true), resistor('R', 10), ammeter, voltmeter], wires));
    expect(result.ammeter).toBeCloseTo(-0.6, 4);
    expect(result.voltmeter).toBeCloseTo(-6, 4);
  });

  it('a voltmeter across the ammeter reads about 0 V', () => {
    const wires: Wires = [...seriesWires.slice(0, 4), ['V.pos', 'A.pos'], ['V.neg', 'A.neg']];
    const result = simulate(make([supply(6), sw(true), resistor('R', 10), ammeter, voltmeter], wires));
    expect(Math.abs(result.voltmeter ?? 1)).toBeLessThan(1e-4);
    expect(readingSign(result.voltmeter ?? 1)).toBe(0);
  });

  it('a voltmeter with a terminal on a floating node reads 0', () => {
    const wires: Wires = seriesWires.slice(0, 4);
    const result = simulate(make([supply(6), sw(true), resistor('R', 10), ammeter, voltmeter], wires));
    expect(result.complete).toBe(true);
    expect(result.voltmeter).toBe(0);
  });

  it('an ammeter hanging off one node with its other terminal unwired reads 0', () => {
    const wires: Wires = [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg'], ['A.pos', 'R.a']];
    const result = simulate(make([supply(6), sw(true), resistor('R', 10), ammeter], wires));
    expect(result.complete).toBe(true);
    expect(Math.abs(result.ammeter ?? 1)).toBeLessThan(1e-4);
  });
});

describe('simulate: a resistor with both terminals on one raw node', () => {
  it('is skipped, so the other resistor sets the current: 6 V / 20 ohm = 0.3 A', () => {
    const wires: Wires = [
      ['S.pos', 'SW.a'], ['SW.b', 'R1.a'], ['R1.a', 'R1.b'], ['R1.b', 'R2.a'], ['R2.b', 'S.neg'],
    ];
    const circuit = make([supply(6), sw(true), resistor('R1', 10, 'R1'), resistor('R2', 20, 'R2')], wires);
    const result = simulate(circuit);
    expect(result.complete).toBe(true);
    expect(result.overload).toBe(false);
    expect(result.supplyCurrent).toBeCloseTo(0.3, 4);
  });

  it('when it is the only resistor, the loop is just wires and a closed switch, so it overloads', () => {
    const wires: Wires = [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.a', 'R.b'], ['R.b', 'S.neg']];
    const result = simulate(make([supply(6), sw(true), resistor('R', 10)], wires));
    expect(result.overload).toBe(true);
  });
});

describe('roundReadings (rules-spec B.7)', () => {
  it('rounds the meters to the given decimals and leaves the solve untouched', () => {
    const raw = { overload: false, complete: true, supplyCurrent: 0.123456, ammeter: 0.6000004, voltmeter: 5.99999 };
    expect(roundReadings(raw, 2)).toEqual({ ...raw, ammeter: 0.6, voltmeter: 6 });
    expect(raw.ammeter).toBe(0.6000004);
  });

  it('keeps the sign, never shows -0, and passes null through', () => {
    const raw = { overload: false, complete: true, supplyCurrent: 0, ammeter: -0.6000004, voltmeter: -0.0000006 };
    const rounded = roundReadings(raw, 2);
    expect(rounded.ammeter).toBe(-0.6);
    expect(Object.is(rounded.voltmeter, 0)).toBe(true);
    expect(roundReadings({ ...raw, ammeter: null, voltmeter: null }, 2)).toMatchObject({ ammeter: null, voltmeter: null });
  });

  it('simulate itself does not round: 1 V across 15 ohm is 0.0667 A unrounded, 0.07 displayed', () => {
    const circuit = make(
      [supply(1), sw(true), resistor('R', 15), ammeter],
      [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg']],
    );
    const result = simulate(circuit);
    expect(result.ammeter).toBeCloseTo(1 / 15, 4);
    expect(result.ammeter).not.toBe(0.07);
    expect(roundReadings(result, 2).ammeter).toBe(0.07);
  });
});

describe('readingSign (rules-spec A sign threshold)', () => {
  it('counts only values beyond 1e-4 as positive or negative', () => {
    expect(readingSign(0.0002)).toBe(1);
    expect(readingSign(-0.0002)).toBe(-1);
    expect(readingSign(0.0001)).toBe(0);
    expect(readingSign(-0.0001)).toBe(0);
    expect(readingSign(1e-6)).toBe(0);
    expect(readingSign(0)).toBe(0);
  });
});

describe('probeSolve (rules-spec §A)', () => {
  const loop = (voltage: number): Circuit =>
    buildCircuit({
      components: [supply(voltage), resistor('R', 10), { id: 'A', type: 'ammeter' }, { id: 'V', type: 'voltmeter' }],
      wires: [['S.pos', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b']],
    });

  it('always solves at the probe voltage, whatever the supply is set to', () => {
    for (const voltage of [0, 3, 12]) {
      const probe = probeSolve(loop(voltage));
      expect(probe.voltmeter).toBeCloseTo(PROBE_VOLTAGE, 6);
      expect(probe.ammeter).toBeCloseTo(0.1, 6);
      expect(probe.supplyCurrent).toBeCloseTo(0.1, 6);
    }
  });

  it('returns unrounded values, equal to simulate at the probe voltage', () => {
    const circuit = loop(6);
    expect(probeSolve(circuit)).toEqual(simulate(circuit, PROBE_VOLTAGE));
    expect(Number.isInteger((probeSolve(circuit).ammeter ?? 0) * 100)).toBe(false);
  });

  it('keeps the real switch states: an open switch is still incomplete at the probe', () => {
    const open = buildCircuit({
      components: [supply(6), { id: 'SW', type: 'switch', closed: false }, resistor('R', 10)],
      wires: [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg']],
    });
    expect(probeSolve(open).complete).toBe(false);
  });
});
