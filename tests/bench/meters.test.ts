import { describe, expect, it } from 'vitest';
import { liveState } from '../../src/bench/live';
import { formatMeterNumber, isMeterType, meterView } from '../../src/bench/meters';
import type { Circuit, CircuitComponent, TerminalRef } from '../../src/model/types';
import { ohmsLaw } from './helpers';

function build(parts: CircuitComponent[], wires: [TerminalRef, TerminalRef][]): Circuit {
  return { components: parts, wires: wires.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })) };
}
const parts = (volts: number): CircuitComponent[] => [
  { id: 'S', type: 'supply', x: 0, y: 0, voltage: volts },
  { id: 'SW', type: 'switch', x: 0, y: 0, closed: true },
  { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 10 },
  { id: 'A', type: 'ammeter', x: 0, y: 0 },
  { id: 'V', type: 'voltmeter', x: 0, y: 0 },
];
// By hand: 6 V / 10 ohm = 0.6 A, and the resistor drops all 6 V.
const loop: [TerminalRef, TerminalRef][] = [
  ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
];
const MINUS = '\u2212';

describe('formatMeterNumber', () => {
  it('always shows the experiment’s decimals', () => {
    expect(formatMeterNumber(0.6, 2)).toBe('0.60');
    expect(formatMeterNumber(6, 2)).toBe('6.00');
    expect(formatMeterNumber(12, 2)).toBe('12.00');
    expect(formatMeterNumber(0.6, 1)).toBe('0.6');
  });

  it('shows a minus sign for a negative reading', () => {
    expect(formatMeterNumber(-0.6, 2)).toBe(`${MINUS}0.60`);
    expect(formatMeterNumber(-12, 2)).toBe(`${MINUS}12.00`);
  });

  it('never shows a sign on zero: not for -0, and not for a tiny negative that rounds to zero', () => {
    expect(formatMeterNumber(0, 2)).toBe('0.00');
    expect(formatMeterNumber(-0, 2)).toBe('0.00');
    expect(formatMeterNumber(-0.004, 2)).toBe('0.00');
    expect(formatMeterNumber(-1e-9, 2)).toBe('0.00');
    expect(formatMeterNumber(-0.004, 2)).not.toMatch(/[-\u2212]/);
  });
});

describe('meterView', () => {
  it('reads 0.60 A and 6.00 V for the closed series loop, with the needles where the formula puts them', () => {
    const live = liveState(build(parts(6), loop), ohmsLaw);
    const a = meterView(live, ohmsLaw, 'ammeter');
    const v = meterView(live, ohmsLaw, 'voltmeter');
    expect([a.number, v.number]).toEqual(['0.60', '6.00']);
    // -60 + 120 * 0.6 / 3 and -60 + 120 * 6 / 15
    expect(a.angle).toBeCloseTo(-36, 10);
    expect(v.angle).toBeCloseTo(-12, 10);
  });

  it('follows the supply: 12 V gives 1.20 A and 12.00 V', () => {
    const live = liveState(build(parts(12), loop), ohmsLaw);
    expect(meterView(live, ohmsLaw, 'ammeter').number).toBe('1.20');
    expect(meterView(live, ohmsLaw, 'voltmeter').number).toBe('12.00');
  });

  it('rests at the zero mark when nothing flows', () => {
    const open = build(parts(6).map((p) => (p.type === 'switch' ? { ...p, closed: false } : p)), loop);
    const live = liveState(open, ohmsLaw);
    expect(meterView(live, ohmsLaw, 'ammeter')).toEqual({ value: 0, number: '0.00', angle: -60 });
    expect(meterView(live, ohmsLaw, 'voltmeter')).toEqual({ value: 0, number: '0.00', angle: -60 });
  });

  it('swings a reversed meter backwards and stops it at -75', () => {
    const reversed = build(parts(6), [
      ['S.pos', 'SW.a'], ['SW.b', 'A.neg'], ['A.pos', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.b'], ['V.neg', 'R.a'],
    ]);
    const live = liveState(reversed, ohmsLaw);
    const a = meterView(live, ohmsLaw, 'ammeter');
    const v = meterView(live, ohmsLaw, 'voltmeter');
    expect([a.number, v.number]).toEqual([`${MINUS}0.60`, `${MINUS}6.00`]);
    expect([a.angle, v.angle]).toEqual([-75, -75]);
  });

  it('shows zero, not an error, for a meter the solver has no reading for', () => {
    const bare = liveState(build([{ id: 'S', type: 'supply', x: 0, y: 0, voltage: 6 }], []), ohmsLaw);
    expect(meterView(bare, ohmsLaw, 'ammeter').number).toBe('0.00');
  });
});

describe('isMeterType', () => {
  it('is true for the two meters only', () => {
    expect(isMeterType('ammeter')).toBe(true);
    expect(isMeterType('voltmeter')).toBe(true);
    expect(isMeterType('supply')).toBe(false);
    expect(isMeterType('resistor')).toBe(false);
  });
});
