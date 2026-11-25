// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disposeTestDbs, makeTestDb } from './setup';
import type { LabXpertDB } from '../../src/db/database';
import { getAttempt } from '../../src/db/attempts';
import { appendReading } from '../../src/db/readings';
import { completePractice, startPractice } from '../../src/db/practice-records';
import { getErrorProfile } from '../../src/db/history';
import { err, evaluate, reading, startExperiment, taskById } from './helpers';
import type { ErrorCode, ExperimentId } from '../../src/model/types';

let db: LabXpertDB;

async function seedProfile(
  code: ErrorCode,
  experimentId: ExperimentId = 'ohms-law',
  times = 2,
): Promise<void> {
  const id = `seed-${experimentId}-${code}`;
  await startExperiment(db, id, experimentId);
  for (let i = 0; i < times; i += 1) {
    await evaluate(db, { attemptId: id, results: [err(code)], signature: `s${i}`, timestamp: 10 + i });
  }
}

async function beginPractice(
  attemptId: string,
  taskId: string,
  experimentId: ExperimentId,
  forCode?: ErrorCode,
) {
  return startPractice(db, {
    recordId: `rec-${attemptId}`,
    attemptId,
    userId: 'asha',
    experimentId,
    practiceTaskId: taskId,
    forCode,
    startedAt: 1000,
  });
}

async function countFor(code: ErrorCode, experimentId: ExperimentId = 'ohms-law'): Promise<number | undefined> {
  return (await getErrorProfile(db, 'asha', experimentId)).find((e) => e.code === code)?.count;
}

beforeEach(async () => {
  db = await makeTestDb();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await disposeTestDbs();
});

describe('startPractice', () => {
  it('opens an in-progress practice attempt and a record with the triggering code', async () => {
    const rec = await beginPractice('p1', 'practice-fix-open-circuit', 'ohms-law', 'OPEN_CIRCUIT');
    expect(rec).toEqual({
      id: 'rec-p1', userId: 'asha', practiceTaskId: 'practice-fix-open-circuit', attemptId: 'p1', forCode: 'OPEN_CIRCUIT',
    });
    const attempt = await getAttempt(db, 'p1');
    expect(attempt?.kind).toBe('practice');
    expect(attempt?.status).toBe('in_progress');
    expect(attempt?.practiceTaskId).toBe('practice-fix-open-circuit');
    expect(await db.practiceRecords.get('rec-p1')).toEqual(rec);
  });

  it('an extension task has no forCode', async () => {
    const rec = await beginPractice('p2', 'extension-ohms-law', 'ohms-law');
    expect('forCode' in rec).toBe(false);
  });

  it('writes neither row when the attempt id is already taken', async () => {
    await beginPractice('p1', 'practice-fix-open-circuit', 'ohms-law', 'OPEN_CIRCUIT');
    await expect(beginPractice('p1', 'practice-fix-open-circuit', 'ohms-law', 'OPEN_CIRCUIT')).rejects.toThrow();
    expect(await db.practiceRecords.count()).toBe(1);
  });
});

describe('completePractice', () => {
  const open = taskById('practice-fix-open-circuit');

  it('changes nothing while the completion condition is not met', async () => {
    await seedProfile('OPEN_CIRCUIT');
    await beginPractice('p1', open.id, 'ohms-law', 'OPEN_CIRCUIT');
    const result = await completePractice(db, { attemptId: 'p1', task: open, topologyOkReadingIds: [], completedAt: 2000 });
    expect(result).toEqual({ completed: false });
    expect((await getAttempt(db, 'p1'))?.status).toBe('in_progress');
    expect((await db.practiceRecords.get('rec-p1'))?.completedAt).toBeUndefined();
    expect(await countFor('OPEN_CIRCUIT')).toBe(2);
  });

  it('clean run: completes, marks clean and resets the triggering code to 0', async () => {
    await seedProfile('OPEN_CIRCUIT');
    await beginPractice('p1', open.id, 'ohms-law', 'OPEN_CIRCUIT');
    await appendReading(db, reading('r1', 'p1', 1500));
    const result = await completePractice(db, { attemptId: 'p1', task: open, topologyOkReadingIds: [], completedAt: 2000 });
    expect(result).toMatchObject({ completed: true, clean: true, resetCode: 'OPEN_CIRCUIT' });
    const attempt = await getAttempt(db, 'p1');
    expect(attempt?.status).toBe('completed');
    expect(attempt?.finishedAt).toBe(2000);
    const rec = await db.practiceRecords.get('rec-p1');
    expect(rec?.completedAt).toBe(2000);
    expect(rec?.clean).toBe(true);
    expect(await countFor('OPEN_CIRCUIT')).toBe(0);
  });

  it('recurrence: the triggering code appeared in the practice, so no reset and not clean', async () => {
    await seedProfile('OPEN_CIRCUIT');
    await beginPractice('p1', open.id, 'ohms-law', 'OPEN_CIRCUIT');
    await evaluate(db, { attemptId: 'p1', results: [err('OPEN_CIRCUIT')], signature: 'x', timestamp: 1200 });
    await appendReading(db, reading('r1', 'p1', 1500));
    const result = await completePractice(db, { attemptId: 'p1', task: open, topologyOkReadingIds: [], completedAt: 2000 });
    expect(result).toMatchObject({ completed: true, clean: false, resetCode: null });
    expect((await db.practiceRecords.get('rec-p1'))?.clean).toBe(false);
    expect(await countFor('OPEN_CIRCUIT')).toBe(2);
  });

  it('a different error during practice does not block the reset', async () => {
    await seedProfile('OPEN_CIRCUIT');
    await beginPractice('p1', open.id, 'ohms-law', 'OPEN_CIRCUIT');
    await evaluate(db, { attemptId: 'p1', results: [err('WRONG_POLARITY')], signature: 'x', timestamp: 1200 });
    await appendReading(db, reading('r1', 'p1', 1500));
    const result = await completePractice(db, { attemptId: 'p1', task: open, topologyOkReadingIds: [], completedAt: 2000 });
    expect(result).toMatchObject({ clean: true, resetCode: 'OPEN_CIRCUIT' });
    expect(await countFor('OPEN_CIRCUIT')).toBe(0);
    expect(await countFor('WRONG_POLARITY')).toBeUndefined();
  });

  it('practice attempts never change the profile, before or after completion', async () => {
    await seedProfile('OPEN_CIRCUIT');
    await seedProfile('WRONG_POLARITY', 'ohms-law', 1);
    const before = await getErrorProfile(db, 'asha');
    await beginPractice('p1', open.id, 'ohms-law', 'OPEN_CIRCUIT');
    await evaluate(db, { attemptId: 'p1', results: [err('WRONG_POLARITY'), err('OPEN_CIRCUIT')], signature: 'x', timestamp: 1200 });
    expect(await getErrorProfile(db, 'asha')).toEqual(before);
    await appendReading(db, reading('r1', 'p1', 1500));
    await completePractice(db, { attemptId: 'p1', task: open, topologyOkReadingIds: [], completedAt: 2000 });
    expect(await getErrorProfile(db, 'asha')).toEqual(before);
  });

  it('resets only the experiment the practice was suggested for', async () => {
    await seedProfile('OPEN_CIRCUIT', 'ohms-law');
    await seedProfile('OPEN_CIRCUIT', 'series-parallel', 1);
    await beginPractice('p1', open.id, 'series-parallel', 'OPEN_CIRCUIT');
    await appendReading(db, reading('r1', 'p1', 1500));
    await completePractice(db, { attemptId: 'p1', task: open, topologyOkReadingIds: [], completedAt: 2000 });
    expect(await countFor('OPEN_CIRCUIT', 'series-parallel')).toBe(0);
    expect(await countFor('OPEN_CIRCUIT', 'ohms-law')).toBe(2);
  });

  it('does not create a profile entry when there was nothing to reset', async () => {
    await beginPractice('p1', open.id, 'ohms-law', 'OPEN_CIRCUIT');
    await appendReading(db, reading('r1', 'p1', 1500));
    const result = await completePractice(db, { attemptId: 'p1', task: open, topologyOkReadingIds: [], completedAt: 2000 });
    expect(result).toMatchObject({ completed: true, resetCode: 'OPEN_CIRCUIT' });
    expect(await db.errorProfile.count()).toBe(0);
  });

  it('extension task: completes, resets nothing, clean when no errors at all', async () => {
    await seedProfile('OPEN_CIRCUIT');
    const ext = taskById('extension-ohms-law');
    await beginPractice('p1', ext.id, 'ohms-law');
    for (const [i, v] of [3, 6, 9, 12].entries()) {
      await appendReading(db, reading(`r${i}`, 'p1', 1100 + i, { supplyVoltage: v }));
    }
    const result = await completePractice(db, { attemptId: 'p1', task: ext, topologyOkReadingIds: [], completedAt: 2000 });
    expect(result).toMatchObject({ completed: true, clean: true, resetCode: null });
    expect(await countFor('OPEN_CIRCUIT')).toBe(2);
  });

  it('uses the topology-OK reading ids the caller passes', async () => {
    const seq = taskById('practice-series-then-parallel');
    await seedProfile('WRONG_TOPOLOGY', 'series-parallel', 1);
    await beginPractice('p1', seq.id, 'series-parallel', 'WRONG_TOPOLOGY');
    await appendReading(db, reading('r1', 'p1', 1100, { taskId: 'series' }));
    await appendReading(db, reading('r2', 'p1', 1200, { taskId: 'parallel' }));
    const without = await completePractice(db, { attemptId: 'p1', task: seq, topologyOkReadingIds: ['r1'], completedAt: 2000 });
    expect(without).toEqual({ completed: false });
    const withBoth = await completePractice(db, { attemptId: 'p1', task: seq, topologyOkReadingIds: ['r1', 'r2'], completedAt: 2000 });
    expect(withBoth).toMatchObject({ completed: true, resetCode: 'WRONG_TOPOLOGY' });
    expect(await countFor('WRONG_TOPOLOGY', 'series-parallel')).toBe(0);
  });

  it('throws for an unknown attempt, an experiment attempt, and a second completion', async () => {
    await expect(completePractice(db, { attemptId: 'nope', task: open, topologyOkReadingIds: [], completedAt: 1 })).rejects.toThrow('not found');
    await startExperiment(db, 'e1');
    await expect(completePractice(db, { attemptId: 'e1', task: open, topologyOkReadingIds: [], completedAt: 1 })).rejects.toThrow('not a practice');
    await beginPractice('p1', open.id, 'ohms-law', 'OPEN_CIRCUIT');
    await appendReading(db, reading('r1', 'p1', 1500));
    await completePractice(db, { attemptId: 'p1', task: open, topologyOkReadingIds: [], completedAt: 2000 });
    await expect(completePractice(db, { attemptId: 'p1', task: open, topologyOkReadingIds: [], completedAt: 3000 })).rejects.toThrow('already completed');
    expect((await getAttempt(db, 'p1'))?.finishedAt).toBe(2000);
  });

  it('is all or nothing: a failing profile write leaves the attempt and record open', async () => {
    await seedProfile('OPEN_CIRCUIT');
    await beginPractice('p1', open.id, 'ohms-law', 'OPEN_CIRCUIT');
    await appendReading(db, reading('r1', 'p1', 1500));
    vi.spyOn(db.errorProfile, 'put').mockRejectedValue(new Error('disk full'));
    await expect(completePractice(db, { attemptId: 'p1', task: open, topologyOkReadingIds: [], completedAt: 2000 })).rejects.toThrow('disk full');
    vi.restoreAllMocks();
    expect((await getAttempt(db, 'p1'))?.status).toBe('in_progress');
    expect((await db.practiceRecords.get('rec-p1'))?.completedAt).toBeUndefined();
    expect(await countFor('OPEN_CIRCUIT')).toBe(2);
  });
});
