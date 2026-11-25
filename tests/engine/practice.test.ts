import { describe, expect, it } from 'vitest';
import practiceFile from '../../src/spec/practice-tasks.json';
import errorCodes from '../../src/spec/error-codes.json';
import ohmsLaw from '../../src/spec/experiments/ohms-law.json';
import seriesParallel from '../../src/spec/experiments/series-parallel.json';
import { codeToReset, isPracticeComplete, selectPractice } from '../../src/engine/practice';
import type { PracticeEvidence } from '../../src/engine/practice';
import type {
  AnswerSubmission,
  CompletionCondition,
  ErrorCode,
  ErrorOccurrence,
  ErrorProfileEntry,
  ExperimentId,
  PracticeTask,
  Reading,
} from '../../src/model/types';

// The JSON is inferred with plain string types; the integrity tests below check it against the real id lists.
const tasks = practiceFile.tasks as unknown as PracticeTask[];

function entry(code: ErrorCode, count: number, lastSeenAt: number, experimentId: ExperimentId = 'ohms-law'): ErrorProfileEntry {
  return { userId: 'u1', experimentId, code, count, lastSeenAt };
}

function taskById(id: string): PracticeTask {
  const found = tasks.find((t) => t.id === id);
  if (found === undefined) throw new Error(`missing task ${id}`);
  return found;
}

describe('selectPractice', () => {
  it('picks the code with the highest count', () => {
    const profile = [entry('OPEN_CIRCUIT', 1, 900), entry('WRONG_POLARITY', 3, 100)];
    expect(selectPractice(profile, 'ohms-law', tasks)?.id).toBe('practice-meter-polarity');
  });

  it('breaks a count tie by the larger lastSeenAt', () => {
    const profile = [entry('OPEN_CIRCUIT', 2, 100), entry('WRONG_POLARITY', 2, 500)];
    expect(selectPractice(profile, 'ohms-law', tasks)?.id).toBe('practice-meter-polarity');
    const swapped = [entry('OPEN_CIRCUIT', 2, 500), entry('WRONG_POLARITY', 2, 100)];
    expect(selectPractice(swapped, 'ohms-law', tasks)?.id).toBe('practice-fix-open-circuit');
  });

  it('gives the extension task when there are no entries', () => {
    expect(selectPractice([], 'ohms-law', tasks)?.id).toBe('extension-ohms-law');
    expect(selectPractice([], 'series-parallel', tasks)?.id).toBe('extension-series-parallel');
  });

  it('ignores entries with count 0 and entries of another experiment', () => {
    const profile = [entry('OPEN_CIRCUIT', 0, 900), entry('WRONG_POLARITY', 5, 900, 'series-parallel')];
    expect(selectPractice(profile, 'ohms-law', tasks)?.id).toBe('extension-ohms-law');
  });

  it('gives the extension task when the top code has no matching task', () => {
    // WRONG_TOPOLOGY only has a practice task for series-parallel.
    const profile = [entry('WRONG_TOPOLOGY', 4, 100), entry('OPEN_CIRCUIT', 1, 200)];
    expect(selectPractice(profile, 'ohms-law', tasks)?.id).toBe('extension-ohms-law');
  });

  it('finds the practice task for a code that has one in this experiment', () => {
    const profile = [entry('WRONG_TOPOLOGY', 2, 100, 'series-parallel')];
    expect(selectPractice(profile, 'series-parallel', tasks)?.id).toBe('practice-series-then-parallel');
  });

  it('returns the first matching practice task when several list the code', () => {
    const copy: PracticeTask = { ...taskById('practice-fix-open-circuit'), id: 'later-open-circuit' };
    const profile = [entry('OPEN_CIRCUIT', 1, 1)];
    expect(selectPractice(profile, 'ohms-law', [...tasks, copy])?.id).toBe('practice-fix-open-circuit');
  });

  it('gives the same task for the same profile, whatever the entry order', () => {
    const profile = [entry('OPEN_CIRCUIT', 2, 300), entry('SHORT_CIRCUIT', 2, 300), entry('WRONG_POLARITY', 1, 900)];
    const first = selectPractice(profile, 'ohms-law', tasks)?.id;
    expect(selectPractice(profile, 'ohms-law', tasks)?.id).toBe(first);
    expect(selectPractice([...profile].reverse(), 'ohms-law', tasks)?.id).toBe(first);
  });
});

function occ(code: ErrorCode, attemptId: string): ErrorOccurrence {
  return {
    id: `${code}-${attemptId}`, attemptId, userId: 'u1', experimentId: 'ohms-law', code,
    feedbackKey: code, checkpoint: 'RECORD_READING', circuitSignature: 's', timestamp: 1,
  };
}

describe('codeToReset', () => {
  const task = taskById('practice-fix-open-circuit');

  it('resets the triggering code after a clean completed run', () => {
    expect(codeToReset({ task, forCode: 'OPEN_CIRCUIT', completed: true, practiceAttemptId: 'p1', occurrences: [] })).toBe('OPEN_CIRCUIT');
  });

  it('keeps the count when the code recurred in the practice attempt', () => {
    const occurrences = [occ('OPEN_CIRCUIT', 'p1')];
    expect(codeToReset({ task, forCode: 'OPEN_CIRCUIT', completed: true, practiceAttemptId: 'p1', occurrences })).toBeNull();
  });

  it('is not affected by other codes in the practice attempt or by the code in other attempts', () => {
    const occurrences = [occ('WRONG_POLARITY', 'p1'), occ('OPEN_CIRCUIT', 'exp1')];
    expect(codeToReset({ task, forCode: 'OPEN_CIRCUIT', completed: true, practiceAttemptId: 'p1', occurrences })).toBe('OPEN_CIRCUIT');
  });

  it('resets nothing before the run is completed', () => {
    expect(codeToReset({ task, forCode: 'OPEN_CIRCUIT', completed: false, practiceAttemptId: 'p1', occurrences: [] })).toBeNull();
  });

  it('resets nothing for extension tasks', () => {
    const extension = taskById('extension-ohms-law');
    expect(codeToReset({ task: extension, forCode: undefined, completed: true, practiceAttemptId: 'p1', occurrences: [] })).toBeNull();
    expect(codeToReset({ task: extension, forCode: 'OPEN_CIRCUIT', completed: true, practiceAttemptId: 'p1', occurrences: [] })).toBeNull();
  });
});

function reading(id: string, supplyVoltage: number, timestamp: number, taskId = 'main'): Reading {
  return { id, attemptId: 'p1', taskId, supplyVoltage, voltmeter: 0, ammeter: 0, timestamp };
}

function answer(id: string, correct: boolean, timestamp: number): AnswerSubmission {
  return { id, attemptId: 'p1', taskId: 'main', typed: 0, expected: 0, correct, timestamp };
}

function evidence(over: Partial<PracticeEvidence> = {}): PracticeEvidence {
  return { readings: [], topologyOkReadingIds: [], answers: [], ...over };
}

describe('isPracticeComplete', () => {
  it('reading_recorded: enough readings passes, too few fails', () => {
    const condition: CompletionCondition = { type: 'reading_recorded', min: 2 };
    expect(isPracticeComplete(condition, evidence({ readings: [reading('r1', 2, 1), reading('r2', 4, 2)] }))).toBe(true);
    expect(isPracticeComplete(condition, evidence({ readings: [reading('r1', 2, 1)] }))).toBe(false);
  });

  it('readings_at_voltages: every voltage needs a reading', () => {
    const condition: CompletionCondition = { type: 'readings_at_voltages', voltages: [2, 4, 6] };
    const all = [reading('r1', 6, 1), reading('r2', 2, 2), reading('r3', 4, 3)];
    expect(isPracticeComplete(condition, evidence({ readings: all }))).toBe(true);
    expect(isPracticeComplete(condition, evidence({ readings: [reading('r1', 2, 1), reading('r2', 2, 2), reading('r3', 4, 3)] }))).toBe(false);
  });

  it('clean_reading_with_topology: needs a reading of that task with OK_TOPOLOGY', () => {
    const condition: CompletionCondition = { type: 'clean_reading_with_topology', taskId: 'series' };
    const readings = [reading('r1', 2, 1, 'series')];
    expect(isPracticeComplete(condition, evidence({ readings, topologyOkReadingIds: ['r1'] }))).toBe(true);
    expect(isPracticeComplete(condition, evidence({ readings, topologyOkReadingIds: [] }))).toBe(false);
    expect(isPracticeComplete(condition, evidence({ readings: [reading('r2', 2, 1, 'parallel')], topologyOkReadingIds: ['r2'] }))).toBe(false);
  });

  it('answers_correct: counts only correct answers', () => {
    const condition: CompletionCondition = { type: 'answers_correct', count: 3 };
    const good = [answer('a1', true, 1), answer('a2', false, 2), answer('a3', true, 3), answer('a4', true, 4)];
    expect(isPracticeComplete(condition, evidence({ answers: good }))).toBe(true);
    expect(isPracticeComplete(condition, evidence({ answers: good.slice(0, 3) }))).toBe(false);
  });

  describe('sequence', () => {
    const condition: CompletionCondition = {
      type: 'sequence',
      steps: [
        { type: 'clean_reading_with_topology', taskId: 'series' },
        { type: 'clean_reading_with_topology', taskId: 'parallel' },
      ],
    };

    it('passes when the steps happen in order', () => {
      const readings = [reading('r1', 2, 10, 'series'), reading('r2', 2, 20, 'parallel')];
      expect(isPracticeComplete(condition, evidence({ readings, topologyOkReadingIds: ['r1', 'r2'] }))).toBe(true);
    });

    it('fails when the steps happen in the wrong order', () => {
      const readings = [reading('r1', 2, 10, 'parallel'), reading('r2', 2, 20, 'series')];
      expect(isPracticeComplete(condition, evidence({ readings, topologyOkReadingIds: ['r1', 'r2'] }))).toBe(false);
    });

    it('fails when a step is missing', () => {
      const readings = [reading('r1', 2, 10, 'series')];
      expect(isPracticeComplete(condition, evidence({ readings, topologyOkReadingIds: ['r1'] }))).toBe(false);
    });

    it('does not let one reading satisfy two steps', () => {
      const same: CompletionCondition = { type: 'sequence', steps: [{ type: 'reading_recorded', min: 1 }, { type: 'reading_recorded', min: 1 }] };
      expect(isPracticeComplete(same, evidence({ readings: [reading('r1', 2, 10)] }))).toBe(false);
      expect(isPracticeComplete(same, evidence({ readings: [reading('r1', 2, 10), reading('r2', 2, 20)] }))).toBe(true);
    });

    it('passes the real practice-series-then-parallel condition', () => {
      const real = taskById('practice-series-then-parallel').completion;
      const readings = [reading('r1', 2, 10, 'series'), reading('r2', 2, 20, 'parallel')];
      expect(isPracticeComplete(real, evidence({ readings, topologyOkReadingIds: ['r1', 'r2'] }))).toBe(true);
    });
  });
});

describe('practice task integrity', () => {
  const experimentIds: string[] = [ohmsLaw.id, seriesParallel.id];

  it('every ErrorCode appears in some task forCodes', () => {
    const codes = errorCodes.errors.map((e) => e.code);
    expect(codes.length).toBe(12);
    const covered = new Set(tasks.flatMap((t) => t.forCodes));
    expect(codes.filter((code) => !covered.has(code as ErrorCode))).toEqual([]);
  });

  it('every benchExperimentId, appliesToExperiments and forExperiment is a valid experiment id', () => {
    for (const task of tasks) {
      expect(experimentIds).toContain(task.benchExperimentId);
      for (const id of task.appliesToExperiments) expect(experimentIds).toContain(id);
      if (task.forExperiment !== undefined) expect(experimentIds).toContain(task.forExperiment);
    }
  });

  it('every experiment has exactly one extension task', () => {
    for (const id of experimentIds) {
      expect(tasks.filter((t) => t.role === 'extension' && t.forExperiment === id).length).toBe(1);
    }
  });
});
