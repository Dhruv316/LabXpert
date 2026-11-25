import { describe, expect, it } from 'vitest';
import { trackErrors } from '../../src/engine/tracking';
import type { TrackingInput } from '../../src/engine/tracking';
import type { Checkpoint, ErrorCode, ErrorOccurrence, RuleResult } from '../../src/model/types';

function result(code: ErrorCode, checkpoint: Checkpoint, stage: 'state' | 'action' = 'state'): RuleResult {
  return {
    code,
    severity: 'error',
    stage,
    checkpoint,
    feedbackKey: code,
    affected: { componentIds: [], wireIds: [], terminals: [] },
  };
}

function okResult(): RuleResult {
  return {
    code: 'OK_POLARITY',
    severity: 'ok',
    stage: 'state',
    checkpoint: 'RECORD_READING',
    feedbackKey: 'OK_POLARITY',
    affected: { componentIds: [], wireIds: [], terminals: [] },
  };
}

function occurrence(over: Partial<ErrorOccurrence> & Pick<ErrorOccurrence, 'id' | 'code'>): ErrorOccurrence {
  return {
    attemptId: 'att1',
    userId: 'u1',
    experimentId: 'ohms-law',
    feedbackKey: over.code,
    checkpoint: 'RECORD_READING',
    circuitSignature: 'sigA',
    timestamp: 100,
    ...over,
  };
}

function counter(): () => string {
  let n = 0;
  return () => `new${++n}`;
}

function input(over: Partial<TrackingInput> = {}): TrackingInput {
  return {
    results: [],
    checkpoint: 'RECORD_READING',
    existing: [],
    attemptKind: 'experiment',
    attemptId: 'att1',
    userId: 'u1',
    experimentId: 'ohms-law',
    circuitSignature: 'sigA',
    actionSignature: 'readings:0|answers:0|typed:',
    makeId: counter(),
    timestamp: 200,
    ...over,
  };
}

describe('trackErrors: saving', () => {
  it('saves a new error with the check details and counts it in the profile', () => {
    const out = trackErrors(input({ results: [result('OPEN_CIRCUIT', 'RECORD_READING')] }));
    expect(out.occurrences.length).toBe(1);
    expect(out.occurrences[0]?.code).toBe('OPEN_CIRCUIT');
    expect(out.occurrences[0]?.circuitSignature).toBe('sigA');
    expect(out.occurrences[0]?.timestamp).toBe(200);
    expect(out.occurrences[0]?.id).toBe('new1');
    expect(out.profileIncrements.length).toBe(1);
    expect(out.profileIncrements[0]?.by).toBe(1);
    expect(out.profileIncrements[0]?.lastSeenAt).toBe(200);
  });

  it('ignores ok results', () => {
    const out = trackErrors(input({ results: [okResult()] }));
    expect(out.occurrences.length).toBe(0);
    expect(out.profileIncrements.length).toBe(0);
  });

  it('does not count the same code twice on an unchanged circuit', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT' })];
    const out = trackErrors(input({ existing, results: [result('OPEN_CIRCUIT', 'RECORD_READING')] }));
    expect(out.occurrences.length).toBe(0);
    expect(out.profileIncrements.length).toBe(0);
  });

  it('counts again when the circuit changed', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT' })];
    const out = trackErrors(input({ existing, circuitSignature: 'sigB', results: [result('OPEN_CIRCUIT', 'RECORD_READING')] }));
    expect(out.occurrences.length).toBe(1);
    expect(out.profileIncrements[0]?.by).toBe(1);
  });

  it('compares with the latest occurrence of that code, not an older one', () => {
    const existing = [
      occurrence({ id: 'o1', code: 'OPEN_CIRCUIT', circuitSignature: 'sigA', timestamp: 100 }),
      occurrence({ id: 'o2', code: 'OPEN_CIRCUIT', circuitSignature: 'sigB', timestamp: 150 }),
    ];
    const out = trackErrors(input({ existing, circuitSignature: 'sigA', results: [result('OPEN_CIRCUIT', 'RECORD_READING')] }));
    expect(out.occurrences.length).toBe(1);
  });

  it('counts an error again when it was fixed and then returns on an identical circuit', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT', resolvedAt: 150 })];
    const out = trackErrors(input({ existing, results: [result('OPEN_CIRCUIT', 'RECORD_READING')] }));
    expect(out.occurrences.length).toBe(1);
    expect(out.profileIncrements[0]?.by).toBe(1);
    expect(out.resolutions.length).toBe(0);
  });

  it('does not count a repeat while the earlier occurrence is still unresolved', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT' })];
    const out = trackErrors(input({ existing, results: [result('OPEN_CIRCUIT', 'RECORD_READING')] }));
    expect(out.occurrences.length).toBe(0);
    expect(out.profileIncrements.length).toBe(0);
    expect(out.resolutions.length).toBe(0);
  });

  it('counts a different code on the same circuit', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT' })];
    const out = trackErrors(input({ existing, results: [result('WRONG_POLARITY', 'RECORD_READING')] }));
    expect(out.occurrences.length).toBe(1);
    expect(out.occurrences[0]?.code).toBe('WRONG_POLARITY');
  });

  it('ignores occurrences of other attempts', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT', attemptId: 'other' })];
    const out = trackErrors(input({ existing, results: [result('OPEN_CIRCUIT', 'RECORD_READING')] }));
    expect(out.occurrences.length).toBe(1);
  });

  it('saves one occurrence when the same code appears twice in one check', () => {
    const out = trackErrors(input({ results: [result('WRONG_POLARITY', 'RECORD_READING'), result('WRONG_POLARITY', 'RECORD_READING')] }));
    expect(out.occurrences.length).toBe(1);
    expect(out.profileIncrements[0]?.by).toBe(1);
  });
});

describe('trackErrors: resolved', () => {
  it('marks resolvedAt when the error is absent at a later check of the same kind', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT' })];
    const out = trackErrors(input({ existing, results: [] }));
    expect(out.resolutions.length).toBe(1);
    expect(out.resolutions[0]?.occurrenceId).toBe('o1');
    expect(out.resolutions[0]?.resolvedAt).toBe(200);
  });

  it('does not resolve while the error is still reported (even when skipped as a duplicate)', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT' })];
    const out = trackErrors(input({ existing, results: [result('OPEN_CIRCUIT', 'RECORD_READING')] }));
    expect(out.resolutions.length).toBe(0);
  });

  it('does not resolve at a different kind of check', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT', checkpoint: 'SWITCH_CLOSE' })];
    const out = trackErrors(input({ existing, checkpoint: 'RECORD_READING', results: [] }));
    expect(out.resolutions.length).toBe(0);
  });

  it('does not resolve again an occurrence that already has resolvedAt', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT', resolvedAt: 150 })];
    const out = trackErrors(input({ existing, results: [] }));
    expect(out.resolutions.length).toBe(0);
  });

  it('resolves only the latest occurrence of the code at that check', () => {
    const existing = [
      occurrence({ id: 'o1', code: 'OPEN_CIRCUIT', circuitSignature: 'sigA', timestamp: 100 }),
      occurrence({ id: 'o2', code: 'OPEN_CIRCUIT', circuitSignature: 'sigB', timestamp: 150 }),
    ];
    const out = trackErrors(input({ existing, results: [] }));
    expect(out.resolutions.length).toBe(1);
    expect(out.resolutions[0]?.occurrenceId).toBe('o2');
  });

  it('resolves one code and keeps another that is still reported', () => {
    const existing = [
      occurrence({ id: 'o1', code: 'OPEN_CIRCUIT' }),
      occurrence({ id: 'o2', code: 'WRONG_POLARITY' }),
    ];
    const out = trackErrors(input({ existing, results: [result('WRONG_POLARITY', 'RECORD_READING')] }));
    expect(out.resolutions.length).toBe(1);
    expect(out.resolutions[0]?.occurrenceId).toBe('o1');
  });

  it('works in a practice attempt too', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT' })];
    const out = trackErrors(input({ existing, attemptKind: 'practice', results: [] }));
    expect(out.resolutions.length).toBe(1);
  });
});

describe('trackErrors: practice attempts', () => {
  it('saves occurrences but never changes the profile', () => {
    const out = trackErrors(input({ attemptKind: 'practice', results: [result('OPEN_CIRCUIT', 'RECORD_READING')] }));
    expect(out.occurrences.length).toBe(1);
    expect(out.profileIncrements.length).toBe(0);
  });
});

describe('trackErrors: action-level and state-level signatures', () => {
  it('uses the action signature for action-level errors', () => {
    const out = trackErrors(input({
      checkpoint: 'FINISH',
      actionSignature: 'readings:1|answers:0|typed:',
      results: [result('MISSING_READING', 'FINISH', 'action')],
    }));
    expect(out.occurrences[0]?.circuitSignature).toBe('readings:1|answers:0|typed:');
  });

  it('uses the circuit signature for state-level errors in the same check', () => {
    const out = trackErrors(input({
      circuitSignature: 'sigA',
      actionSignature: 'readings:1|answers:0|typed:',
      results: [result('OPEN_CIRCUIT', 'RECORD_READING', 'state')],
    }));
    expect(out.occurrences[0]?.circuitSignature).toBe('sigA');
  });

  it('does not count a repeated finish with the same readings and answers', () => {
    const existing = [occurrence({ id: 'o1', code: 'MISSING_READING', checkpoint: 'FINISH', circuitSignature: 'readings:1|answers:0|typed:' })];
    const out = trackErrors(input({
      existing,
      checkpoint: 'FINISH',
      actionSignature: 'readings:1|answers:0|typed:',
      circuitSignature: 'somethingElse',
      results: [result('MISSING_READING', 'FINISH', 'action')],
    }));
    expect(out.occurrences.length).toBe(0);
  });

  it('counts again after another reading is recorded', () => {
    const existing = [occurrence({ id: 'o1', code: 'MISSING_READING', checkpoint: 'FINISH', circuitSignature: 'readings:1|answers:0|typed:' })];
    const out = trackErrors(input({
      existing,
      checkpoint: 'FINISH',
      actionSignature: 'readings:2|answers:0|typed:',
      results: [result('MISSING_READING', 'FINISH', 'action')],
    }));
    expect(out.occurrences.length).toBe(1);
  });

  it('counts a wrong answer again only when the typed value changes', () => {
    const first = occurrence({ id: 'o1', code: 'EQUIVALENT_R_WRONG', checkpoint: 'ANSWER_SUBMIT', circuitSignature: 'readings:0|answers:1|typed:25' });
    const same = trackErrors(input({
      existing: [first], checkpoint: 'ANSWER_SUBMIT', actionSignature: 'readings:0|answers:1|typed:25',
      results: [result('EQUIVALENT_R_WRONG', 'ANSWER_SUBMIT', 'action')],
    }));
    const other = trackErrors(input({
      existing: [first], checkpoint: 'ANSWER_SUBMIT', actionSignature: 'readings:0|answers:2|typed:26',
      results: [result('EQUIVALENT_R_WRONG', 'ANSWER_SUBMIT', 'action')],
    }));
    expect(same.occurrences.length).toBe(0);
    expect(other.occurrences.length).toBe(1);
  });

  it('a finish check does not resolve state-level errors', () => {
    const existing = [occurrence({ id: 'o1', code: 'OPEN_CIRCUIT', checkpoint: 'RECORD_READING' })];
    const out = trackErrors(input({ existing, checkpoint: 'FINISH', results: [] }));
    expect(out.resolutions.length).toBe(0);
  });

  it('resolves an action-level error when it is absent at the next finish', () => {
    const existing = [occurrence({ id: 'o1', code: 'MISSING_READING', checkpoint: 'FINISH', circuitSignature: 'readings:1|answers:0|typed:' })];
    const out = trackErrors(input({ existing, checkpoint: 'FINISH', results: [] }));
    expect(out.resolutions[0]?.occurrenceId).toBe('o1');
  });
});
