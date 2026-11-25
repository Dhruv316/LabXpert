import { describe, expect, it } from 'vitest';
import {
  answer, closedSwitch, errorKeys, ohms, okKeys, r1, r2, reading, run, runSp, seriesParallel, supply, type Part,
} from './helpers';

const finishSp = (task: 'series' | 'parallel', readings = [reading(task, 2), reading(task, 4), reading(task, 6)], answers = [answer(task, true)]) =>
  runSp([], [], task, { checkpoint: 'FINISH', readings, answers });

describe('FINISH: readings', () => {
  it('enough readings at distinct voltages and a correct answer: nothing to report', () => {
    expect(finishSp('series')).toEqual([]);
  });

  it('too few readings: MISSING_READING with have and need', () => {
    const results = finishSp('series', [reading('series', 2), reading('series', 4)]);
    expect(errorKeys(results)).toEqual(['MISSING_READING']);
    expect(results[0]).toEqual({
      code: 'MISSING_READING',
      severity: 'error',
      stage: 'action',
      checkpoint: 'FINISH',
      feedbackKey: 'MISSING_READING',
      affected: { componentIds: [], wireIds: [], terminals: [] },
      params: { have: 2, need: 3 },
    });
  });

  it('exactly the number needed is enough', () => {
    expect(errorKeys(finishSp('series', [reading('series', 1), reading('series', 2), reading('series', 3)]))).toEqual([]);
  });

  it('counts distinct supply voltages, not readings (Ohm: 5 readings at 3 voltages)', () => {
    const readings = [2, 2, 4, 4, 6].map((volts, index) => reading('main', volts, index));
    const results = run([], [], { checkpoint: 'FINISH', readings });
    expect(results[0]?.params).toEqual({ have: 3, need: 5 });
  });

  it('five readings at five voltages finish Ohm\'s law', () => {
    const readings = [1, 2, 3, 4, 5].map((volts) => reading('main', volts));
    expect(run([], [], { checkpoint: 'FINISH', readings })).toEqual([]);
  });

  it('a task without distinctSupplyVoltages counts every reading', () => {
    const plain = {
      ...seriesParallel,
      tasks: seriesParallel.tasks.map((task) => (task.id === 'series' ? { ...task, distinctSupplyVoltages: false } : task)),
    };
    const readings = [reading('series', 6, 0), reading('series', 6, 1), reading('series', 6, 2)];
    expect(runSp([], [], 'series', { experiment: plain, checkpoint: 'FINISH', readings, answers: [answer('series', true)] })).toEqual([]);
  });

  it('readings of another task do not count', () => {
    const results = finishSp('parallel', [reading('series', 2), reading('series', 4), reading('series', 6)], [answer('parallel', true)]);
    expect(results[0]?.params).toEqual({ have: 0, need: 3 });
  });
});

describe('FINISH: equivalent-resistance answer', () => {
  it('no answer at all: MISSING_ANSWER', () => {
    const results = finishSp('series', undefined, []);
    expect(errorKeys(results)).toEqual(['MISSING_ANSWER']);
    expect(results[0]).toEqual({
      code: 'MISSING_ANSWER',
      severity: 'error',
      stage: 'action',
      checkpoint: 'FINISH',
      feedbackKey: 'MISSING_ANSWER',
      affected: { componentIds: [], wireIds: [], terminals: [] },
    });
  });

  it('a wrong answer does not count, a later correct one does', () => {
    expect(errorKeys(finishSp('series', undefined, [answer('series', false)]))).toEqual(['MISSING_ANSWER']);
    expect(errorKeys(finishSp('series', undefined, [answer('series', false, 0), answer('series', true, 1)]))).toEqual([]);
  });

  it('a correct answer for another task does not count', () => {
    expect(errorKeys(finishSp('parallel', undefined, [answer('series', true)]))).toEqual(['MISSING_ANSWER']);
  });

  it('Ohm\'s law has no answer requirement', () => {
    const readings = [1, 2, 3, 4, 5].map((volts) => reading('main', volts));
    expect(errorKeys(run([], [], { checkpoint: 'FINISH', readings, answers: [] }))).toEqual([]);
  });

  it('both errors together: MISSING_READING and MISSING_ANSWER', () => {
    const results = finishSp('series', [reading('series', 2), reading('series', 4)], []);
    expect(errorKeys(results)).toEqual(['MISSING_ANSWER', 'MISSING_READING']);
    expect(results.map((result) => result.code)).toEqual(['MISSING_READING', 'MISSING_ANSWER']);
  });

  it('parallel: readings and answers from the series task help nothing', () => {
    const results = finishSp('parallel', [reading('series', 2), reading('series', 4), reading('series', 6)], [answer('series', true)]);
    expect(errorKeys(results)).toEqual(['MISSING_ANSWER', 'MISSING_READING']);
  });
});

describe('FINISH: state rules never run', () => {
  const enough = [reading('series', 2), reading('series', 4), reading('series', 6)];

  it('a bench that is shorted does not add SHORT_CIRCUIT', () => {
    const parts: Part[] = [supply, closedSwitch, r1, r2];
    const results = runSp(parts, [['S.pos', 'S.neg']], 'series', { checkpoint: 'FINISH', readings: enough, answers: [answer('series', true)] });
    expect(results).toEqual([]);
  });

  it('an empty bench does not add MISSING_COMPONENT or OPEN_CIRCUIT', () => {
    expect(errorKeys(finishSp('series'))).toEqual([]);
  });

  it('an open, unwired bench with too few readings reports only the finish error', () => {
    const results = runSp([supply, r1, r2], [], 'series', { checkpoint: 'FINISH', readings: [], answers: [answer('series', true)] });
    expect(errorKeys(results)).toEqual(['MISSING_READING']);
    expect(okKeys(results)).toEqual([]);
  });
});

describe('FINISH: edges', () => {
  it('an unknown task id returns nothing rather than guessing', () => {
    expect(run([], [], { checkpoint: 'FINISH', taskId: 'nope', readings: [] })).toEqual([]);
  });

  it('MISSING_READING is dropped when the experiment does not list it', () => {
    const without = { ...ohms, activeRules: ohms.activeRules.filter((code) => code !== 'MISSING_READING') };
    expect(run([], [], { checkpoint: 'FINISH', experiment: without })).toEqual([]);
  });
});
