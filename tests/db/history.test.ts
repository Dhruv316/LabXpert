// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDbs, makeTestDb } from './setup';
import type { LabXpertDB } from '../../src/db/database';
import { appendEvent } from '../../src/db/events';
import { getErrorProfile, listAttemptConfirmations, listAttemptErrors, listPracticeHistory } from '../../src/db/history';
import { choiceForCode, suggestPractice } from '../../src/db/suggest';
import { checkpointRecord, err, evaluate, startExperiment, tasks } from './helpers';
import type { PracticeRecord } from '../../src/model/types';

let db: LabXpertDB;
beforeEach(async () => {
  db = await makeTestDb();
});
afterEach(disposeTestDbs);

describe('getErrorProfile', () => {
  it('is empty for a new learner', async () => {
    expect(await getErrorProfile(db, 'asha')).toEqual([]);
  });

  it('returns one learner, optionally one experiment, ordered, keeping count-0 entries', async () => {
    await db.errorProfile.bulkPut([
      { userId: 'asha', experimentId: 'series-parallel', code: 'WRONG_TOPOLOGY', count: 0, lastSeenAt: 5 },
      { userId: 'asha', experimentId: 'ohms-law', code: 'WRONG_POLARITY', count: 2, lastSeenAt: 4 },
      { userId: 'asha', experimentId: 'ohms-law', code: 'OPEN_CIRCUIT', count: 1, lastSeenAt: 3 },
      { userId: 'ravi', experimentId: 'ohms-law', code: 'OPEN_CIRCUIT', count: 9, lastSeenAt: 3 },
    ]);
    const all = await getErrorProfile(db, 'asha');
    expect(all.map((e) => `${e.experimentId}:${e.code}:${e.count}`)).toEqual([
      'ohms-law:OPEN_CIRCUIT:1',
      'ohms-law:WRONG_POLARITY:2',
      'series-parallel:WRONG_TOPOLOGY:0',
    ]);
    expect((await getErrorProfile(db, 'asha', 'series-parallel')).map((e) => e.code)).toEqual(['WRONG_TOPOLOGY']);
  });
});

describe('listAttemptErrors', () => {
  it('is empty for an attempt with no errors', async () => {
    await startExperiment(db, 'e1');
    expect(await listAttemptErrors(db, 'e1')).toEqual([]);
  });

  it('lists each code once with its count, in the order first seen, using the latest feedback key', async () => {
    await startExperiment(db, 'e1');
    await startExperiment(db, 'e2');
    await evaluate(db, { attemptId: 'e1', results: [err('OPEN_CIRCUIT', 'OPEN_CIRCUIT.gap')], signature: 'A', timestamp: 100 });
    await evaluate(db, { attemptId: 'e1', results: [err('OPEN_CIRCUIT', 'OPEN_CIRCUIT.gap'), err('AMMETER_PARALLEL')], signature: 'A', timestamp: 150 });
    await evaluate(db, { attemptId: 'e1', results: [err('OPEN_CIRCUIT', 'OPEN_CIRCUIT.other')], signature: 'B', timestamp: 200 });
    await evaluate(db, { attemptId: 'e2', results: [err('WRONG_POLARITY')], signature: 'A', timestamp: 120 });
    expect(await listAttemptErrors(db, 'e1')).toEqual([
      { code: 'OPEN_CIRCUIT', feedbackKey: 'OPEN_CIRCUIT.other', count: 2, firstSeenAt: 100 },
      { code: 'AMMETER_PARALLEL', feedbackKey: 'AMMETER_PARALLEL.x', count: 1, firstSeenAt: 150 },
    ]);
  });
});

describe('listAttemptConfirmations', () => {
  it('is empty for an attempt with no events', async () => {
    await startExperiment(db, 'e1');
    expect(await listAttemptConfirmations(db, 'e1')).toEqual([]);
  });

  it('lists each distinct code once, in the order it first appeared, over every checkpoint of the attempt', async () => {
    await startExperiment(db, 'e1');
    await appendEvent(db, checkpointRecord('e1', 'c1', 100, 'main', ['OK_CIRCUIT_COMPLETE', 'OK_POLARITY']));
    await appendEvent(db, checkpointRecord('e1', 'c2', 200, 'main', ['OK_AMMETER_SERIES', 'OK_CIRCUIT_COMPLETE'], ['WRONG_POLARITY']));
    await appendEvent(db, checkpointRecord('e1', 'c3', 300, 'main', ['OK_POLARITY', 'OK_VOLTMETER_ACROSS']));
    const list = await listAttemptConfirmations(db, 'e1');
    expect(list.map((entry) => entry.code)).toEqual([
      'OK_CIRCUIT_COMPLETE',
      'OK_POLARITY',
      'OK_AMMETER_SERIES',
      'OK_VOLTMETER_ACROSS',
    ]);
  });

  it('orders by the events\' time, not by the order they were saved', async () => {
    await startExperiment(db, 'e1');
    await appendEvent(db, checkpointRecord('e1', 'late', 500, 'main', ['OK_ANSWER']));
    await appendEvent(db, checkpointRecord('e1', 'early', 100, 'main', ['OK_POLARITY']));
    expect((await listAttemptConfirmations(db, 'e1')).map((entry) => entry.code)).toEqual(['OK_POLARITY', 'OK_ANSWER']);
  });

  it('keeps the tasks that saw a code, without repeats, so a per-task wording can be chosen', async () => {
    await startExperiment(db, 'e1', 'series-parallel');
    await appendEvent(db, checkpointRecord('e1', 'c1', 100, 'series', ['OK_TOPOLOGY'], [], 'series-parallel'));
    await appendEvent(db, checkpointRecord('e1', 'c2', 200, 'series', ['OK_TOPOLOGY'], [], 'series-parallel'));
    await appendEvent(db, checkpointRecord('e1', 'c3', 300, 'parallel', ['OK_TOPOLOGY'], [], 'series-parallel'));
    expect(await listAttemptConfirmations(db, 'e1')).toEqual([{ code: 'OK_TOPOLOGY', taskIds: ['series', 'parallel'] }]);
  });

  it('ignores other attempts, other kinds of event and records with no confirmation list', async () => {
    await startExperiment(db, 'e1');
    await startExperiment(db, 'e2');
    await appendEvent(db, checkpointRecord('e2', 'other', 50, 'main', ['OK_ANSWER']));
    await appendEvent(db, { ...checkpointRecord('e1', 'place', 60, 'main', ['OK_POLARITY']), actionType: 'PLACE_COMPONENT' });
    await appendEvent(db, { ...checkpointRecord('e1', 'bare', 70, 'main', []), after: { errors: [] } });
    await appendEvent(db, checkpointRecord('e1', 'real', 80, 'main', ['OK_CIRCUIT_COMPLETE']));
    expect((await listAttemptConfirmations(db, 'e1')).map((entry) => entry.code)).toEqual(['OK_CIRCUIT_COMPLETE']);
  });
});

describe('listPracticeHistory', () => {
  it('lists completed practice for the learner, newest first', async () => {
    const rec = (id: string, over: Partial<PracticeRecord>): PracticeRecord => ({
      id, userId: 'asha', practiceTaskId: 'practice-fix-open-circuit', attemptId: `a-${id}`, ...over,
    });
    await db.practiceRecords.bulkPut([
      rec('old', { completedAt: 100, clean: true }),
      rec('new', { completedAt: 300, clean: false }),
      rec('open', {}),
      rec('other', { userId: 'ravi', completedAt: 400, clean: true }),
    ]);
    const list = await listPracticeHistory(db, 'asha');
    expect(list.map((r) => r.id)).toEqual(['new', 'old']);
    expect(list.map((r) => r.clean)).toEqual([false, true]);
    expect(await listPracticeHistory(db, 'nobody')).toEqual([]);
  });
});

describe('suggestPractice', () => {
  async function seed(): Promise<void> {
    await startExperiment(db, 'e1');
    await evaluate(db, { attemptId: 'e1', results: [err('OPEN_CIRCUIT')], signature: 'A', timestamp: 100 });
    await evaluate(db, { attemptId: 'e1', results: [err('WRONG_POLARITY')], signature: 'B', timestamp: 200 });
    await evaluate(db, { attemptId: 'e1', results: [err('WRONG_POLARITY')], signature: 'C', timestamp: 300 });
  }

  it('picks the task for the most frequent code and reports the code', async () => {
    await seed();
    const choice = await suggestPractice(db, 'asha', 'ohms-law', tasks);
    expect(choice?.task.id).toBe('practice-meter-polarity');
    expect(choice?.forCode).toBe('WRONG_POLARITY');
  });

  it('gives the same task for the same profile, every time', async () => {
    await seed();
    const ids = [];
    for (let i = 0; i < 3; i += 1) ids.push((await suggestPractice(db, 'asha', 'ohms-law', tasks))?.task.id);
    expect(new Set(ids).size).toBe(1);
  });

  it('gives the extension task with no profile, and ignores other experiments', async () => {
    const fresh = await suggestPractice(db, 'asha', 'ohms-law', tasks);
    expect(fresh?.task.id).toBe('extension-ohms-law');
    expect(fresh?.forCode).toBeUndefined();
    await seed();
    expect((await suggestPractice(db, 'asha', 'series-parallel', tasks))?.task.id).toBe('extension-series-parallel');
  });
});

describe('choiceForCode', () => {
  it('finds the task for a code in an experiment', () => {
    expect(choiceForCode(tasks, 'ohms-law', 'OPEN_CIRCUIT')?.task.id).toBe('practice-fix-open-circuit');
    expect(choiceForCode(tasks, 'series-parallel', 'WRONG_TOPOLOGY')?.task.id).toBe('practice-series-then-parallel');
  });

  it('is undefined when no practice task covers the code in that experiment', () => {
    expect(choiceForCode(tasks, 'ohms-law', 'WRONG_TOPOLOGY')).toBeUndefined();
  });
});
