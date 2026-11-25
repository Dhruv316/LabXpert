import { describe, expect, it } from 'vitest';
import { setResistorValueOp, setSupplyVoltageOp, snapSupplyVoltage, toggleSwitchOp } from '../../src/bench/values';
import type { Circuit } from '../../src/model/types';
import { ohmsLaw, seriesParallel } from './helpers';

const circuit: Circuit = {
  components: [
    { id: 'S', type: 'supply', x: 10, y: 20, voltage: 4 },
    { id: 'SW', type: 'switch', x: 300, y: 20, closed: false },
    { id: 'R1', type: 'resistor', x: 500, y: 40, role: 'R1', ohms: 10 },
    { id: 'R2', type: 'resistor', x: 500, y: 200, role: 'R2', ohms: 20, valueLocked: true },
    { id: 'A', type: 'ammeter', x: 700, y: 20 },
  ],
  wires: [{ id: 'w1', from: 'S.pos', to: 'SW.a' }],
};
const part = (c: Circuit, id: string) => c.components.find((p) => p.id === id);

describe('toggleSwitchOp', () => {
  it('closes an open switch and opens it again', () => {
    const closed = toggleSwitchOp(circuit, 'SW');
    expect(closed?.closed).toBe(true);
    expect(part(closed?.circuit ?? circuit, 'SW')).toMatchObject({ closed: true });
    const open = toggleSwitchOp(closed?.circuit ?? circuit, 'SW');
    expect(open?.closed).toBe(false);
    expect(part(open?.circuit ?? circuit, 'SW')).toMatchObject({ closed: false });
  });

  it('keeps id, position and everything else, and never changes its input', () => {
    const next = toggleSwitchOp(circuit, 'SW')?.circuit;
    expect(part(next ?? circuit, 'SW')).toEqual({ id: 'SW', type: 'switch', x: 300, y: 20, closed: true });
    expect(next?.wires).toBe(circuit.wires);
    expect(part(circuit, 'SW')).toMatchObject({ closed: false });
  });

  it('is undefined for an unknown id or a part that is not a switch', () => {
    expect(toggleSwitchOp(circuit, 'nope')).toBeUndefined();
    expect(toggleSwitchOp(circuit, 'R1')).toBeUndefined();
  });
});

describe('snapSupplyVoltage (0 to 12 V in 1 V steps)', () => {
  const { supply } = ohmsLaw;
  it.each([
    [-3, 0],
    [0, 0],
    [4, 4],
    [5.4, 5],
    [5.5, 6],
    [11.6, 12],
    [12, 12],
    [20, 12],
  ])('%s V becomes %s V', (asked, expected) => {
    expect(snapSupplyVoltage(asked, supply)).toBe(expected);
  });

  it('follows another step and range, without floating-point dust', () => {
    const custom = { min: 1, max: 2, step: 0.1, default: 1, unit: 'V' } as const;
    expect(snapSupplyVoltage(1.31, custom)).toBe(1.3);
    expect(snapSupplyVoltage(1.349, custom)).toBe(1.3);
    expect(snapSupplyVoltage(9, custom)).toBe(2);
    expect(snapSupplyVoltage(0, custom)).toBe(1);
  });

  it('never lands above max when max is not on the step grid', () => {
    const odd = { min: 0, max: 10, step: 3, default: 0, unit: 'V' } as const;
    expect(snapSupplyVoltage(10, odd)).toBe(9);
  });
});

describe('setSupplyVoltageOp', () => {
  it('sets the voltage, clamped and rounded', () => {
    const set = (volts: number) => {
      const result = setSupplyVoltageOp(circuit, ohmsLaw, 'S', volts);
      return result?.ok === true ? part(result.circuit, 'S') : undefined;
    };
    expect(set(9)).toMatchObject({ voltage: 9, x: 10, y: 20, id: 'S' });
    expect(set(99)).toMatchObject({ voltage: 12 });
    expect(set(-5)).toMatchObject({ voltage: 0 });
    expect(set(6.6)).toMatchObject({ voltage: 7 });
  });

  it('reports before and after', () => {
    expect(setSupplyVoltageOp(circuit, ohmsLaw, 'S', 7)).toMatchObject({ ok: true, before: 4, after: 7 });
    expect(setSupplyVoltageOp(circuit, ohmsLaw, 'S', 99)).toMatchObject({ ok: true, before: 4, after: 12 });
  });

  it('returns the same circuit when the value does not change, even after clamping or rounding', () => {
    for (const volts of [4, 4.2, 3.9]) {
      const result = setSupplyVoltageOp(circuit, ohmsLaw, 'S', volts);
      expect(result?.ok === true && result.circuit === circuit).toBe(true);
    }
    const atMax = { ...circuit, components: [{ id: 'S', type: 'supply' as const, x: 0, y: 0, voltage: 12 }] };
    const result = setSupplyVoltageOp(atMax, ohmsLaw, 'S', 50);
    expect(result?.ok === true && result.circuit === atMax).toBe(true);
  });

  it('rejects a value that is not a number', () => {
    expect(setSupplyVoltageOp(circuit, ohmsLaw, 'S', Number.NaN)).toEqual({ ok: false, reason: 'out-of-range' });
    expect(setSupplyVoltageOp(circuit, ohmsLaw, 'S', Number.POSITIVE_INFINITY)).toEqual({ ok: false, reason: 'out-of-range' });
  });

  it('rejects a locked-value supply', () => {
    const locked: Circuit = { ...circuit, components: [{ id: 'S', type: 'supply', x: 0, y: 0, voltage: 4, valueLocked: true }] };
    expect(setSupplyVoltageOp(locked, ohmsLaw, 'S', 6)).toEqual({ ok: false, reason: 'locked' });
  });

  it('is undefined for an unknown id or a part that is not a supply', () => {
    expect(setSupplyVoltageOp(circuit, ohmsLaw, 'nope', 5)).toBeUndefined();
    expect(setSupplyVoltageOp(circuit, ohmsLaw, 'R1', 5)).toBeUndefined();
  });
});

describe('setResistorValueOp', () => {
  it.each(seriesParallel.resistorValues)('accepts the allowed value %s', (ohms) => {
    const result = setResistorValueOp(circuit, seriesParallel, 'R1', ohms);
    expect(result?.ok).toBe(true);
    expect(result?.ok === true ? part(result.circuit, 'R1') : undefined).toMatchObject({
      ohms,
      role: 'R1',
      id: 'R1',
      x: 500,
      y: 40,
    });
  });

  it.each([0, 7, -10, 10.5, Number.NaN])('rejects %s as not allowed', (ohms) => {
    expect(setResistorValueOp(circuit, seriesParallel, 'R1', ohms)).toEqual({ ok: false, reason: 'not-allowed' });
  });

  it('rejects a valueLocked resistor, even for an allowed value', () => {
    expect(setResistorValueOp(circuit, seriesParallel, 'R2', 30)).toEqual({ ok: false, reason: 'locked' });
  });

  it('reports locked before not-allowed', () => {
    expect(setResistorValueOp(circuit, seriesParallel, 'R2', 7)).toEqual({ ok: false, reason: 'locked' });
  });

  it('returns the same circuit for the value it already has', () => {
    const result = setResistorValueOp(circuit, seriesParallel, 'R1', 10);
    expect(result).toMatchObject({ ok: true, before: 10, after: 10 });
    expect(result?.ok === true && result.circuit === circuit).toBe(true);
  });

  it('is undefined for an unknown id or a part that is not a resistor', () => {
    expect(setResistorValueOp(circuit, seriesParallel, 'nope', 10)).toBeUndefined();
    expect(setResistorValueOp(circuit, seriesParallel, 'S', 10)).toBeUndefined();
  });

  it('leaves its input alone', () => {
    setResistorValueOp(circuit, seriesParallel, 'R1', 30);
    expect(part(circuit, 'R1')).toMatchObject({ ohms: 10 });
  });
});
