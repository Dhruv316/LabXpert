import { describe, expect, it } from 'vitest';
import {
  buildEvaluateInput,
  currentTaskId,
  highlightTargets,
  moodOf,
  splitResults,
} from '../../src/bench/checkpoint';
import { UnknownTextKeyError } from '../../src/i18n';
import type { Circuit, RuleCode, RuleResult, TerminalRef } from '../../src/model/types';
import { ohmsLaw, seriesParallel } from './helpers';

function result(code: RuleCode, feedbackKey: string, affected: Partial<RuleResult['affected']> = {}): RuleResult {
  return {
    code,
    severity: code.startsWith('OK_') ? 'ok' : 'error',
    stage: 'state',
    checkpoint: 'RECORD_READING',
    feedbackKey,
    affected: { componentIds: [], wireIds: [], terminals: [], ...affected },
  };
}

/** S -> SW -> A -> R -> S with a voltmeter across R. Wires w1..w6 in that order. */
function loop(): Circuit {
  const pairs: [TerminalRef, TerminalRef][] = [
    ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
  ];
  return {
    components: [
      { id: 'S', type: 'supply', x: 0, y: 0, voltage: 6 },
      { id: 'SW', type: 'switch', x: 0, y: 0, closed: true },
      { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 10 },
      { id: 'A', type: 'ammeter', x: 0, y: 0 },
      { id: 'V', type: 'voltmeter', x: 0, y: 0 },
    ],
    wires: pairs.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })),
  };
}

describe('buildEvaluateInput', () => {
  const base = { circuit: loop(), experiment: ohmsLaw, taskId: 'main', checkpoint: 'RECORD_READING' as const, readings: [], answers: [] };

  it('carries every part through', () => {
    const input = buildEvaluateInput(base);
    expect(input).toEqual(base);
    expect(input.circuit).toBe(base.circuit);
  });

  it('adds the submitted answer only when there is one', () => {
    expect('submittedAnswer' in buildEvaluateInput(base)).toBe(false);
    expect(buildEvaluateInput({ ...base, checkpoint: 'ANSWER_SUBMIT', submittedAnswer: 30 }).submittedAnswer).toBe(30);
  });
});

describe('splitResults', () => {
  it('separates OK_ confirmations from errors and keeps the order evaluate returned', () => {
    const results = [
      result('OK_CIRCUIT_COMPLETE', 'OK_CIRCUIT_COMPLETE'),
      result('AMMETER_PARALLEL', 'AMMETER_PARALLEL'),
      result('OK_POLARITY', 'OK_POLARITY'),
      result('WRONG_POLARITY', 'WRONG_POLARITY'),
    ];
    const split = splitResults(results);
    expect(split.errors.map((r) => r.code)).toEqual(['AMMETER_PARALLEL', 'WRONG_POLARITY']);
    expect(split.confirmations.map((r) => r.code)).toEqual(['OK_CIRCUIT_COMPLETE', 'OK_POLARITY']);
  });

  it('gives two empty lists for no results', () => {
    expect(splitResults([])).toEqual({ errors: [], confirmations: [] });
  });
});

describe('moodOf', () => {
  it('is happy with no error', () => {
    expect(moodOf(undefined)).toBe('happy');
  });

  it('reads the owl of the error’s feedback entry', () => {
    expect(moodOf(result('OPEN_CIRCUIT', 'OPEN_CIRCUIT.gap'))).toBe('thinking');
  });

  it('refuses a feedback key the file does not have, as t() does', () => {
    expect(() => moodOf(result('OPEN_CIRCUIT', 'OPEN_CIRCUIT.nope'))).toThrow(UnknownTextKeyError);
  });
});

describe('highlightTargets', () => {
  it('lights the affected parts and every wire that touches one', () => {
    const found = highlightTargets(result('OPEN_CIRCUIT', 'OPEN_CIRCUIT.switch_open', { componentIds: ['SW'] }), loop());
    expect(found).toEqual({ componentIds: ['SW'], wireIds: ['w1', 'w2'] });
  });

  it('lights wires at a listed terminal, and keeps affected wires, without repeats', () => {
    const found = highlightTargets(
      result('WRONG_POLARITY', 'WRONG_POLARITY', { componentIds: ['A'], wireIds: ['w4', 'w2'], terminals: ['R.a'] }),
      loop(),
    );
    // Affected wires first (w4, w2), then the wires at A or at R.a in circuit order (w3, w5).
    expect(found.componentIds).toEqual(['A']);
    expect(found.wireIds).toEqual(['w4', 'w2', 'w3', 'w5']);
  });

  it('lights nothing when nothing is affected', () => {
    expect(highlightTargets(result('OPEN_CIRCUIT', 'OPEN_CIRCUIT.gap'), loop())).toEqual({ componentIds: [], wireIds: [] });
  });
});

describe('currentTaskId', () => {
  it('is the first task of the experiment', () => {
    expect(currentTaskId(ohmsLaw)).toBe('main');
    expect(currentTaskId(seriesParallel)).toBe('series');
  });
});
