import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/engine/evaluate';
import { roundReadings, simulate } from '../../src/engine/solver';
import { loadCases } from './load-cases';

const cases = loadCases();
const EXPECTED_CASES = 43;

const keysOf = (severity: 'error' | 'ok', results: ReturnType<typeof evaluate>): string[] =>
  results.filter((result) => result.severity === severity).map((result) => result.feedbackKey).sort();

// Every case in both files runs: no filter, no skip list. A case that fails is an engine bug, never a case bug.
describe('spec test cases: all of them', () => {
  let ran = 0;

  it(`loads ${EXPECTED_CASES} cases with unique ids`, () => {
    expect(cases).toHaveLength(EXPECTED_CASES);
    expect(new Set(cases.map((testCase) => testCase.id)).size).toBe(EXPECTED_CASES);
  });

  for (const testCase of cases) {
    it(`${testCase.id}: ${testCase.description}`, () => {
      const results = evaluate(testCase.input);
      expect(keysOf('error', results)).toEqual([...testCase.expect.errors].sort());
      expect(keysOf('ok', results)).toEqual([...testCase.expect.ok].sort());

      const { overload, readings } = testCase.expect;
      if (overload !== undefined) expect(simulate(testCase.circuit).overload).toBe(overload);
      if (readings !== undefined) {
        const shown = roundReadings(simulate(testCase.circuit), testCase.input.experiment.meterRanges.decimals);
        expect(shown.ammeter).toBeCloseTo(readings.ammeter, 2);
        expect(shown.voltmeter).toBeCloseTo(readings.voltmeter, 2);
      }
      ran += 1;
    });
  }

  it(`ran exactly ${EXPECTED_CASES} cases`, () => {
    expect(ran).toBe(EXPECTED_CASES);
  });
});
