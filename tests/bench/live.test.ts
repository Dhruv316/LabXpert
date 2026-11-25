import { describe, expect, it } from 'vitest';
import componentsSpec from '../../src/spec/components.json';
import { bladeAngle, knobAngle, liveState, needleAngle, resistorBands } from '../../src/bench/live';
import type { Circuit, CircuitComponent, ResistorComponent, TerminalRef } from '../../src/model/types';
import { ohmsLaw, seriesParallel } from './helpers';

function build(parts: CircuitComponent[], wires: [TerminalRef, TerminalRef][]): Circuit {
  return { components: parts, wires: wires.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })) };
}
const supply = (voltage: number): CircuitComponent => ({ id: 'S', type: 'supply', x: 0, y: 0, voltage });
const sw = (closed: boolean): CircuitComponent => ({ id: 'SW', type: 'switch', x: 0, y: 0, closed });
const resistor: ResistorComponent = { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 10 };
const ammeter: CircuitComponent = { id: 'A', type: 'ammeter', x: 0, y: 0 };
const voltmeter: CircuitComponent = { id: 'V', type: 'voltmeter', x: 0, y: 0 };

// S -> SW -> A -> R -> S with the voltmeter across R. By hand: 6 V / 10 ohm = 0.6 A, and R drops all 6 V.
const loop: [TerminalRef, TerminalRef][] = [
  ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
];
const series = (volts = 6, closed = true) => build([supply(volts), sw(closed), resistor, ammeter, voltmeter], loop);

describe('liveState', () => {
  it('reads 0.6 A and 6 V for 6 V across 10 ohm, shown as 0.60 and 6.00', () => {
    const live = liveState(series(), ohmsLaw);
    expect(live).toMatchObject({ overload: false, complete: true, flowing: true });
    expect(live.readings.ammeter).toBeCloseTo(0.6, 4);
    expect(live.readings.voltmeter).toBeCloseTo(6, 4);
    expect(live.supplyCurrent).toBeCloseTo(0.6, 4);
    expect(live.rounded).toEqual({ ammeter: 0.6, voltmeter: 6 });
  });

  it('keeps the unrounded numbers apart from the displayed ones', () => {
    // 5 V across 15 ohm is 0.3333... A: the display shows 0.33, the raw reading does not.
    const third = build([supply(5), sw(true), { ...resistor, ohms: 15 }, ammeter, voltmeter], loop);
    const live = liveState(third, ohmsLaw);
    expect(live.rounded.ammeter).toBe(0.33);
    expect(live.readings.ammeter).not.toBe(0.33);
    expect(live.readings.ammeter).toBeCloseTo(1 / 3, 4);
  });

  it('uses the supply’s real voltage, not the 1 V the rules probe with', () => {
    expect(liveState(series(12), ohmsLaw).rounded).toEqual({ ammeter: 1.2, voltmeter: 12 });
  });

  it('rounds to the experiment’s decimals', () => {
    const coarse = { meterRanges: { ammeter: 3, voltmeter: 15, decimals: 1 } };
    const third = build([supply(5), sw(true), { ...resistor, ohms: 15 }, ammeter, voltmeter], loop);
    expect(liveState(third, coarse).rounded.ammeter).toBe(0.3);
  });

  it('reports overload and zero readings for a short across the supply', () => {
    const short = build([supply(6), sw(true), resistor, ammeter, voltmeter], [['S.pos', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b']]);
    const live = liveState(short, ohmsLaw);
    expect(live).toMatchObject({ overload: true, complete: false, flowing: false, supplyCurrent: 0 });
    expect(live.readings).toEqual({ ammeter: 0, voltmeter: 0 });
    expect(live.rounded).toEqual({ ammeter: 0, voltmeter: 0 });
  });

  it('is not complete, and nothing flows, with the switch open', () => {
    const live = liveState(series(6, false), ohmsLaw);
    expect(live).toMatchObject({ overload: false, complete: false, flowing: false, supplyCurrent: 0 });
    expect(live.rounded).toEqual({ ammeter: 0, voltmeter: 0 });
  });

  it('is complete but not flowing at 0 V', () => {
    const live = liveState(series(0), ohmsLaw);
    expect(live).toMatchObject({ overload: false, complete: true, flowing: false });
    expect(live.rounded).toEqual({ ammeter: 0, voltmeter: 0 });
  });

  it('flows again as soon as the supply is above 0 V', () => {
    expect(liveState(series(1), ohmsLaw).flowing).toBe(true);
  });

  it('gives negative readings for reversed meters', () => {
    const reversed = build(
      [supply(6), sw(true), resistor, ammeter, voltmeter],
      [['S.pos', 'SW.a'], ['SW.b', 'A.neg'], ['A.pos', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.b'], ['V.neg', 'R.a']],
    );
    const live = liveState(reversed, ohmsLaw);
    expect(live.rounded).toEqual({ ammeter: -0.6, voltmeter: -6 });
    expect(live.flowing).toBe(true);
  });

  it('reads null for a meter that is not on the bench', () => {
    const bare = build([supply(6), sw(true), resistor], [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg']]);
    const live = liveState(bare, ohmsLaw);
    expect(live.readings).toEqual({ ammeter: null, voltmeter: null });
    expect(live.rounded).toEqual({ ammeter: null, voltmeter: null });
    expect(live.flowing).toBe(true);
  });

  it('is quiet for an empty bench', () => {
    expect(liveState({ components: [], wires: [] }, ohmsLaw)).toMatchObject({ overload: false, complete: false, flowing: false });
  });

  it('follows the resistor value: 20 ohm halves the current', () => {
    const twenty = build([supply(6), sw(true), { ...resistor, ohms: 20 }, ammeter, voltmeter], loop);
    expect(liveState(twenty, ohmsLaw).rounded.ammeter).toBe(0.3);
  });
});

describe('needleAngle', () => {
  it('is -60 at zero, 0 at mid scale and +60 at full scale', () => {
    expect(needleAngle(0, 3)).toBe(-60);
    expect(needleAngle(1.5, 3)).toBe(0);
    expect(needleAngle(3, 3)).toBe(60);
    expect(needleAngle(7.5, 15)).toBe(0);
  });

  it('follows -60 + 120 × reading ÷ range in between', () => {
    expect(needleAngle(0.6, 3)).toBeCloseTo(-36, 10);
    expect(needleAngle(6, 15)).toBeCloseTo(-12, 10);
  });

  it('stops at +60 above full scale', () => {
    expect(needleAngle(3.5, 3)).toBe(60);
    expect(needleAngle(1000, 15)).toBe(60);
  });

  it('swings below zero for a negative reading and stops at -75', () => {
    expect(needleAngle(-0.1, 3)).toBeCloseTo(-64, 10);
    expect(needleAngle(-0.375, 3)).toBeCloseTo(-75, 10);
    expect(needleAngle(-1, 3)).toBe(-75);
    expect(needleAngle(-100, 15)).toBe(-75);
  });
});

describe('knobAngle', () => {
  it('runs from -135° at min to +135° at max', () => {
    expect(knobAngle(0, 0, 12)).toBe(-135);
    expect(knobAngle(12, 0, 12)).toBe(135);
    expect(knobAngle(6, 0, 12)).toBe(0);
    expect(knobAngle(3, 0, 12)).toBeCloseTo(-67.5, 10);
  });

  it('works for a range that does not start at 0 and holds at the ends', () => {
    expect(knobAngle(5, 2, 8)).toBe(0);
    expect(knobAngle(-4, 0, 12)).toBe(-135);
    expect(knobAngle(40, 0, 12)).toBe(135);
  });

  it('does not divide by zero when min equals max', () => {
    expect(knobAngle(3, 3, 3)).toBe(-135);
  });
});

describe('resistorBands', () => {
  const table = componentsSpec.components.resistor.colourCode as Record<string, string[] | string>;

  it.each([...new Set([...ohmsLaw.resistorValues, ...seriesParallel.resistorValues])])(
    'gives three colours from the code table for %s ohm',
    (ohms) => {
      const bands = resistorBands(ohms);
      expect(bands).toHaveLength(3);
      expect(bands).toEqual(table[String(ohms)]);
      for (const colour of bands ?? []) expect(colour).toMatch(/^#[0-9A-F]{6}$/i);
    },
  );

  it('reads 5 ohm as green, black, gold and 10 ohm as brown, black, black', () => {
    expect(resistorBands(5)).toEqual(['#2E9E5B', '#222222', '#D4A017']);
    expect(resistorBands(10)).toEqual(['#7B4A22', '#222222', '#222222']);
  });

  it('has nothing for a value that is not in the table', () => {
    expect(resistorBands(7)).toBeUndefined();
  });
});

describe('bladeAngle', () => {
  it('is 0 closed and -25 open', () => {
    expect(bladeAngle(true)).toBe(0);
    expect(bladeAngle(false)).toBe(-25);
  });
});
