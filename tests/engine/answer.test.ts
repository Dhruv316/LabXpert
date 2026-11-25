import { describe, expect, it } from 'vitest';
import { checkEquivalentResistance, expectedEquivalentResistance } from '../../src/engine/answer';
import {
  answer, errorKeys, okKeys, r1, r2, resistor, runSp, seriesParallel, supply, type Part,
} from './helpers';

describe('checkEquivalentResistance: formula', () => {
  it('series adds, parallel multiplies over the sum', () => {
    expect(expectedEquivalentResistance('series', 10, 20)).toBe(30);
    expect(expectedEquivalentResistance('parallel', 20, 20)).toBe(10);
    expect(expectedEquivalentResistance('parallel', 10, 20)).toBeCloseTo(6.6667, 4);
  });

  it('returns the expected value for the AnswerSubmission the caller stores', () => {
    expect(checkEquivalentResistance('series', 10, 20, 30)).toEqual({ correct: true, expected: 30 });
    expect(checkEquivalentResistance('parallel', 20, 20, 99).expected).toBe(10);
  });
});

describe('checkEquivalentResistance: the 2% boundary', () => {
  it('series 10 + 20 = 30: exactly 2% off is accepted on both sides', () => {
    expect(checkEquivalentResistance('series', 10, 20, 30.6).correct).toBe(true);
    expect(checkEquivalentResistance('series', 10, 20, 29.4).correct).toBe(true);
  });

  it('series: just over 2% is rejected on both sides', () => {
    expect(checkEquivalentResistance('series', 10, 20, 30.61).correct).toBe(false);
    expect(checkEquivalentResistance('series', 10, 20, 29.39).correct).toBe(false);
  });

  it('parallel 20 || 20 = 10: exactly 2% off is accepted, just over is rejected', () => {
    expect(checkEquivalentResistance('parallel', 20, 20, 10.2).correct).toBe(true);
    expect(checkEquivalentResistance('parallel', 20, 20, 9.8).correct).toBe(true);
    expect(checkEquivalentResistance('parallel', 20, 20, 10.21).correct).toBe(false);
    expect(checkEquivalentResistance('parallel', 20, 20, 9.79).correct).toBe(false);
  });

  it('matches the spec examples: 30.5 and 6.75 in, 6.5 out', () => {
    expect(checkEquivalentResistance('series', 10, 20, 30.5).correct).toBe(true);
    expect(checkEquivalentResistance('parallel', 10, 20, 6.75).correct).toBe(true);
    expect(checkEquivalentResistance('parallel', 10, 20, 6.5).correct).toBe(false);
  });

  it('the series answer is wrong for a parallel pair and the other way round', () => {
    expect(checkEquivalentResistance('parallel', 10, 20, 30).correct).toBe(false);
    expect(checkEquivalentResistance('series', 10, 20, 6.67).correct).toBe(false);
  });

  it('rejects numbers that are not a plausible answer', () => {
    for (const typed of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(checkEquivalentResistance('series', 10, 20, typed).correct).toBe(false);
    }
  });
});

describe('evaluate: ANSWER_SUBMIT', () => {
  const bench: Part[] = [supply, r1, r2];
  const submit = (typed: number, task: 'series' | 'parallel' = 'series', parts: Part[] = bench) =>
    runSp(parts, [], task, { checkpoint: 'ANSWER_SUBMIT', submittedAnswer: typed });

  it('correct answer: OK_ANSWER, an action-level confirmation', () => {
    const results = submit(30);
    expect(okKeys(results)).toEqual(['OK_ANSWER']);
    expect(errorKeys(results)).toEqual([]);
    expect(results[0]).toEqual({
      code: 'OK_ANSWER',
      severity: 'ok',
      stage: 'action',
      checkpoint: 'ANSWER_SUBMIT',
      feedbackKey: 'OK_ANSWER',
      affected: { componentIds: [], wireIds: [], terminals: [] },
    });
  });

  it('wrong answer: EQUIVALENT_R_WRONG.<topology> for each task', () => {
    expect(errorKeys(submit(25))).toEqual(['EQUIVALENT_R_WRONG.series']);
    expect(errorKeys(submit(6.5, 'parallel'))).toEqual(['EQUIVALENT_R_WRONG.parallel']);
    expect(submit(25)[0]).toMatchObject({ code: 'EQUIVALENT_R_WRONG', severity: 'error', stage: 'action' });
  });

  it('uses the resistor values on the bench now, not defaults', () => {
    const changed: Part[] = [supply, r1, { id: 'R2', type: 'resistor', role: 'R2', ohms: 30 }];
    expect(errorKeys(submit(30, 'series', changed))).toEqual(['EQUIVALENT_R_WRONG.series']);
    expect(okKeys(submit(40, 'series', changed))).toEqual(['OK_ANSWER']);
  });

  it('the 2% boundary holds through evaluate as well', () => {
    expect(okKeys(submit(30.6))).toEqual(['OK_ANSWER']);
    expect(errorKeys(submit(30.61))).toEqual(['EQUIVALENT_R_WRONG.series']);
  });

  it('agrees with checkEquivalentResistance for a spread of typed values', () => {
    for (const typed of [5, 29, 29.4, 29.5, 30, 30.5, 30.6, 30.7, 31, 60]) {
      const expected = checkEquivalentResistance('series', 10, 20, typed).correct;
      expect(okKeys(submit(typed)).length === 1).toBe(expected);
    }
  });

  it('runs after Stage 0 only: R2 missing is MISSING_COMPONENT, no state check on a bare bench', () => {
    expect(submit(30, 'series', [supply, r1])[0]?.params).toEqual({ types: ['resistor'] });
    expect(submit(30, 'series', [r1, r2])).toHaveLength(1); // no supply needed, no wires needed
    expect(submit(30, 'series', [resistor])[0]?.code).toBe('MISSING_COMPONENT');
  });

  it('returns nothing when no number was submitted', () => {
    expect(runSp(bench, [], 'series', { checkpoint: 'ANSWER_SUBMIT' })).toEqual([]);
  });

  it('EQUIVALENT_R_WRONG is dropped by activeRules, OK_ANSWER is not', () => {
    const noWrong = { ...seriesParallel, activeRules: [] };
    expect(errorKeys(runSp(bench, [], 'series', { experiment: noWrong, checkpoint: 'ANSWER_SUBMIT', submittedAnswer: 25 }))).toEqual([]);
    expect(okKeys(runSp(bench, [], 'series', { experiment: noWrong, checkpoint: 'ANSWER_SUBMIT', submittedAnswer: 30 }))).toEqual(['OK_ANSWER']);
  });

  it('does not read the answer history (the caller stores the AnswerSubmission)', () => {
    const results = runSp(bench, [], 'series', { checkpoint: 'ANSWER_SUBMIT', submittedAnswer: 25, answers: [answer('series', true)] });
    expect(errorKeys(results)).toEqual(['EQUIVALENT_R_WRONG.series']);
  });
});
