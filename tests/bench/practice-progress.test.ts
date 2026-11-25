import { describe, expect, it } from 'vitest';
import { calcPairsAnswered, topologyOkReadingIds } from '../../src/bench/practice-evidence';
import { practiceEvalTaskId, practiceProgress } from '../../src/bench/practice-progress';
import { isPracticeComplete } from '../../src/engine/practice';
import type { CompletionCondition } from '../../src/model/types';
import {
  answer,
  answerEventAt,
  checkpointAt,
  evidence,
  practiceTask,
  readingEventAt,
  reading,
} from './practice-helpers';
import { ohmsLaw, seriesParallel } from './helpers';

describe('practiceProgress', () => {
  it('reading_recorded: readings so far out of min, never more than min', () => {
    const condition: CompletionCondition = { type: 'reading_recorded', min: 3 };
    expect(practiceProgress(condition, evidence())).toEqual({ have: 0, need: 3 });
    expect(practiceProgress(condition, evidence({ readings: [reading('r1', 'main', 2, 1), reading('r2', 'main', 3, 2)] }))).toEqual({ have: 2, need: 3 });
    const five = [1, 2, 3, 4, 5].map((n) => reading(`r${n}`, 'main', n, n));
    expect(practiceProgress(condition, evidence({ readings: five }))).toEqual({ have: 3, need: 3 });
  });

  it('readings_at_voltages: listed voltages that have a reading, out of the list', () => {
    const condition: CompletionCondition = { type: 'readings_at_voltages', voltages: [2, 4, 6] };
    expect(practiceProgress(condition, evidence())).toEqual({ have: 0, need: 3 });
    const two = [reading('r1', 'main', 2, 1), reading('r2', 'main', 6, 2)];
    expect(practiceProgress(condition, evidence({ readings: two }))).toEqual({ have: 2, need: 3 });
    // The same voltage twice, and a voltage that is not listed, add nothing.
    const noise = [...two, reading('r3', 'main', 2, 3), reading('r4', 'main', 5, 4)];
    expect(practiceProgress(condition, evidence({ readings: noise }))).toEqual({ have: 2, need: 3 });
    const all = [...noise, reading('r5', 'main', 4, 5)];
    expect(practiceProgress(condition, evidence({ readings: all }))).toEqual({ have: 3, need: 3 });
  });

  it('clean_reading_with_topology: 1 only for a reading of that task recorded with OK_TOPOLOGY', () => {
    const condition: CompletionCondition = { type: 'clean_reading_with_topology', taskId: 'series' };
    const r = reading('r1', 'series', 2, 1);
    expect(practiceProgress(condition, evidence())).toEqual({ have: 0, need: 1 });
    expect(practiceProgress(condition, evidence({ readings: [r] }))).toEqual({ have: 0, need: 1 });
    expect(practiceProgress(condition, evidence({ readings: [reading('r1', 'parallel', 2, 1)], topologyOkReadingIds: ['r1'] }))).toEqual({ have: 0, need: 1 });
    expect(practiceProgress(condition, evidence({ readings: [r], topologyOkReadingIds: ['r1'] }))).toEqual({ have: 1, need: 1 });
  });

  it('answers_correct: correct answers out of count; wrong ones do not count', () => {
    const condition: CompletionCondition = { type: 'answers_correct', count: 3 };
    const mixed = [answer('x1', true, 1), answer('x2', false, 2), answer('x3', true, 3)];
    expect(practiceProgress(condition, evidence({ answers: mixed }))).toEqual({ have: 2, need: 3 });
    const many = [1, 2, 3, 4].map((n) => answer(`y${n}`, true, n));
    expect(practiceProgress(condition, evidence({ answers: many }))).toEqual({ have: 3, need: 3 });
  });

  describe('sequence', () => {
    const condition = practiceTask('practice-series-then-parallel').completion;
    const series = reading('s1', 'series', 2, 10);
    const parallel = reading('p1', 'parallel', 2, 20);

    it('has the two steps of the task as `need`', () => {
      expect(practiceProgress(condition, evidence())).toEqual({ have: 0, need: 2 });
    });

    it('counts the steps done in order', () => {
      expect(practiceProgress(condition, evidence({ readings: [series], topologyOkReadingIds: ['s1'] }))).toEqual({ have: 1, need: 2 });
      expect(practiceProgress(condition, evidence({ readings: [series, parallel], topologyOkReadingIds: ['s1', 'p1'] }))).toEqual({ have: 2, need: 2 });
    });

    it('does not count a later step that happened first', () => {
      const early = reading('p0', 'parallel', 2, 5);
      const ev = evidence({ readings: [early, series], topologyOkReadingIds: ['p0', 's1'] });
      expect(practiceProgress(condition, ev)).toEqual({ have: 1, need: 2 });
      expect(isPracticeComplete(condition, ev)).toBe(false);
    });

    it('does not count a later step alone', () => {
      expect(practiceProgress(condition, evidence({ readings: [parallel], topologyOkReadingIds: ['p1'] }))).toEqual({ have: 0, need: 2 });
    });

    it('does not count a step whose reading had no OK_TOPOLOGY', () => {
      expect(practiceProgress(condition, evidence({ readings: [series, parallel], topologyOkReadingIds: ['p1'] }))).toEqual({ have: 0, need: 2 });
      expect(practiceProgress(condition, evidence({ readings: [series, parallel], topologyOkReadingIds: ['s1'] }))).toEqual({ have: 1, need: 2 });
    });

    it('agrees with isPracticeComplete', () => {
      const done = evidence({ readings: [series, parallel], topologyOkReadingIds: ['s1', 'p1'] });
      expect(isPracticeComplete(condition, done)).toBe(true);
      expect(practiceProgress(condition, done).have).toBe(practiceProgress(condition, done).need);
    });

    it('an empty sequence is 0 of 0', () => {
      expect(practiceProgress({ type: 'sequence', steps: [] }, evidence())).toEqual({ have: 0, need: 0 });
    });
  });

  it('works for every condition type the tasks use', () => {
    for (const task of [practiceTask('practice-fix-open-circuit'), practiceTask('practice-three-readings'), practiceTask('practice-equivalent-resistance'), practiceTask('practice-series-then-parallel')]) {
      const progress = practiceProgress(task.completion, evidence());
      expect(progress.have).toBe(0);
      expect(progress.need).toBeGreaterThan(0);
    }
  });
});

describe('practiceEvalTaskId', () => {
  it('uses the experiment’s first task when the condition names no task', () => {
    expect(practiceEvalTaskId(practiceTask('practice-fix-open-circuit'), ohmsLaw, evidence())).toBe('main');
    expect(practiceEvalTaskId(practiceTask('practice-three-readings'), ohmsLaw, evidence())).toBe('main');
    expect(practiceEvalTaskId(practiceTask('extension-ohms-law'), ohmsLaw, evidence())).toBe('main');
  });

  it('follows a series-then-parallel sequence: series first, then parallel, and parallel once both are met', () => {
    const task = practiceTask('practice-series-then-parallel');
    const s = reading('s1', 'series', 2, 10);
    const p = reading('p1', 'parallel', 2, 20);
    expect(practiceEvalTaskId(task, seriesParallel, evidence())).toBe('series');
    expect(practiceEvalTaskId(task, seriesParallel, evidence({ readings: [s], topologyOkReadingIds: ['s1'] }))).toBe('parallel');
    expect(practiceEvalTaskId(task, seriesParallel, evidence({ readings: [s], topologyOkReadingIds: [] }))).toBe('series');
    expect(practiceEvalTaskId(task, seriesParallel, evidence({ readings: [s, p], topologyOkReadingIds: ['s1', 'p1'] }))).toBe('parallel');
  });

  it('fails loudly when the experiment lacks the task the condition names', () => {
    expect(() => practiceEvalTaskId(practiceTask('practice-series-then-parallel'), ohmsLaw, evidence())).toThrow('does not have');
  });
});

describe('topologyOkReadingIds', () => {
  it('counts a reading that follows a clean RECORD_READING check confirming OK_TOPOLOGY', () => {
    const events = [checkpointAt('c1', 10, 'series', ['OK_TOPOLOGY']), readingEventAt('e1', 11, 'series', 'r1')];
    expect(topologyOkReadingIds(events)).toEqual(['r1']);
  });

  it('does not count a reading whose check had no OK_TOPOLOGY', () => {
    const events = [checkpointAt('c1', 10, 'main', ['OK_POLARITY']), readingEventAt('e1', 11, 'main', 'r1')];
    expect(topologyOkReadingIds(events)).toEqual([]);
  });

  it('ignores a blocked check that saved no reading, and uses the clean check that came after it', () => {
    const events = [
      checkpointAt('c1', 10, 'series', [], ['WRONG_TOPOLOGY']),
      checkpointAt('c2', 20, 'series', ['OK_TOPOLOGY']),
      readingEventAt('e1', 21, 'series', 'r1'),
    ];
    expect(topologyOkReadingIds(events)).toEqual(['r1']);
  });

  it('matches each reading with its own check, in order', () => {
    const events = [
      checkpointAt('c1', 10, 'series', ['OK_TOPOLOGY']),
      readingEventAt('e1', 11, 'series', 'r1'),
      checkpointAt('c2', 20, 'series', ['OK_POLARITY']),
      readingEventAt('e2', 21, 'series', 'r2'),
      checkpointAt('c3', 30, 'parallel', ['OK_TOPOLOGY']),
      readingEventAt('e3', 31, 'parallel', 'r3'),
    ];
    expect(topologyOkReadingIds(events)).toEqual(['r1', 'r3']);
  });

  it('does not let one check cover two readings', () => {
    const events = [
      checkpointAt('c1', 10, 'series', ['OK_TOPOLOGY']),
      readingEventAt('e1', 11, 'series', 'r1'),
      readingEventAt('e2', 12, 'series', 'r2'),
    ];
    expect(topologyOkReadingIds(events)).toEqual(['r1']);
  });

  it('does not use a check for another task or another checkpoint', () => {
    const events = [
      checkpointAt('c0', 5, 'series', ['OK_TOPOLOGY'], [], 'SWITCH_CLOSE'),
      checkpointAt('c1', 10, 'parallel', ['OK_TOPOLOGY']),
      readingEventAt('e1', 11, 'series', 'r1'),
    ];
    expect(topologyOkReadingIds(events)).toEqual([]);
  });

  it('puts a check before its reading when the clock gives both the same millisecond', () => {
    // The reading's event id sorts first, as a random id can.
    const events = [readingEventAt('a-reading', 10, 'series', 'r1'), checkpointAt('z-check', 10, 'series', ['OK_TOPOLOGY'])];
    expect(topologyOkReadingIds(events)).toEqual(['r1']);
  });

  it('copes with an event that has no confirmations list', () => {
    const odd = { ...checkpointAt('c1', 10, 'series', []), after: undefined };
    expect(topologyOkReadingIds([odd, readingEventAt('e1', 11, 'series', 'r1')])).toEqual([]);
  });
});

describe('calcPairsAnswered', () => {
  it('lists the pairs answered correctly once each, smallest first', () => {
    const events = [
      answerEventAt('1', 1, true, 2),
      answerEventAt('2', 2, false, 0),
      answerEventAt('3', 3, true, 2),
      answerEventAt('4', 4, true, 0),
      answerEventAt('5', 5, true),
    ];
    expect(calcPairsAnswered(events)).toEqual([0, 2]);
  });
});
