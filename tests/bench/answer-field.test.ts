import { describe, expect, it } from 'vitest';
import { answerFeedbackKey, observedForLine, parseAnswer } from '../../src/bench/answer-field';
import type { AnswerSubmission, Reading } from '../../src/model/types';

const reading = (voltmeter: number, ammeter: number): Reading => ({
  id: 'r',
  attemptId: 'a',
  taskId: 'series',
  supplyVoltage: voltmeter,
  voltmeter,
  ammeter,
  timestamp: 1,
});

const answer = (typed: number): AnswerSubmission => ({
  id: 'x',
  attemptId: 'a',
  taskId: 'series',
  typed,
  expected: 30,
  correct: false,
  timestamp: 2,
});

describe('parseAnswer', () => {
  it('reads whole numbers, decimals and a comma decimal', () => {
    expect(parseAnswer('30')).toBe(30);
    expect(parseAnswer(' 12.5 ')).toBe(12.5);
    expect(parseAnswer('12,5')).toBe(12.5);
    expect(parseAnswer('0')).toBe(0);
  });

  it('gives nothing for an empty or non-numeric entry', () => {
    expect(parseAnswer('')).toBeUndefined();
    expect(parseAnswer('   ')).toBeUndefined();
    expect(parseAnswer('abc')).toBeUndefined();
    expect(parseAnswer('1e999')).toBeUndefined();
  });
});

describe('answerFeedbackKey', () => {
  it('maps a right answer to OK_ANSWER and a wrong one to the topology wording', () => {
    expect(answerFeedbackKey({ requiredTopology: 'series' }, true)).toBe('OK_ANSWER');
    expect(answerFeedbackKey({ requiredTopology: 'series' }, false)).toBe('EQUIVALENT_R_WRONG.series');
    expect(answerFeedbackKey({ requiredTopology: 'parallel' }, false)).toBe('EQUIVALENT_R_WRONG.parallel');
  });

  it('has no wrong-answer wording for a single-resistor task', () => {
    expect(answerFeedbackKey({ requiredTopology: 'single' }, false)).toBeUndefined();
  });
});

describe('observedForLine', () => {
  it('shows nothing before there is an answer or a reading', () => {
    expect(observedForLine([reading(5, 0.2)], undefined)).toBeUndefined();
    expect(observedForLine([], answer(31))).toBeUndefined();
  });

  it('uses the last reading V ÷ I to 2 decimals', () => {
    expect(observedForLine([reading(1, 0.5), reading(5, 0.2)], answer(31))).toBe('25.00');
    expect(observedForLine([reading(10, 0.3)], answer(31))).toBe('33.33');
  });

  it('shows nothing when the last current is 0', () => {
    expect(observedForLine([reading(5, 0)], answer(31))).toBeUndefined();
  });
});
