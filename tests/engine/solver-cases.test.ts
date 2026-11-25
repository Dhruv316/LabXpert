import { describe, expect, it } from 'vitest';
import { roundReadings, simulate } from '../../src/engine/solver';
import { loadCases } from './load-cases';

const cases = loadCases().filter(
  (testCase) => testCase.expect.overload !== undefined || testCase.expect.readings !== undefined,
);

describe('spec test cases: solver (overload and readings)', () => {
  it('finds the cases that carry overload or readings', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const testCase of cases) {
    it(`${testCase.id}: ${testCase.description}`, () => {
      const { circuit, expect: expected, input } = testCase;
      const result = simulate(circuit);
      if (expected.overload !== undefined) expect(result.overload).toBe(expected.overload);
      if (expected.readings !== undefined) {
        const shown = roundReadings(result, input.experiment.meterRanges.decimals);
        expect(shown.ammeter).toBeCloseTo(expected.readings.ammeter, 2);
        expect(shown.voltmeter).toBeCloseTo(expected.readings.voltmeter, 2);
      }
    });
  }
});
