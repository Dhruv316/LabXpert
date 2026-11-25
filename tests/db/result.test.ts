// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDbs, makeTestDb } from './setup';
import type { LabXpertDB } from '../../src/db/database';
import { abandonAttempt, finishAttempt, startAttempt } from '../../src/db/attempts';
import { appendEvent } from '../../src/db/events';
import { loadResult } from '../../src/db/result';
import { checkpointRecord, err, evaluate } from './helpers';

let db: LabXpertDB;
beforeEach(async () => {
  db = await makeTestDb();
});
afterEach(disposeTestDbs);

async function attempt(id: string, userId: string, kind: 'experiment' | 'practice', status: 'in_progress' | 'completed' | 'abandoned') {
  await startAttempt(db, { id, userId, experimentId: 'ohms-law', kind, startedAt: 1 });
  if (status === 'completed') await finishAttempt(db, id, 2);
  if (status === 'abandoned') await abandonAttempt(db, id, 2);
}

describe('loadResult', () => {
  it('is not found for an id that does not exist', async () => {
    expect(await loadResult(db, 'asha', 'nope')).toEqual({ status: 'not-found' });
  });

  it('is not found for another learner\'s attempt, finished or not', async () => {
    await attempt('done', 'ravi', 'experiment', 'completed');
    await attempt('open', 'ravi', 'experiment', 'in_progress');
    expect(await loadResult(db, 'asha', 'done')).toEqual({ status: 'not-found' });
    // Not even "in progress": that would tell asha that the id exists and what it is.
    expect(await loadResult(db, 'asha', 'open')).toEqual({ status: 'not-found' });
  });

  it('is not found for a practice attempt, whatever its status', async () => {
    await attempt('p-done', 'asha', 'practice', 'completed');
    await attempt('p-open', 'asha', 'practice', 'in_progress');
    expect(await loadResult(db, 'asha', 'p-done')).toEqual({ status: 'not-found' });
    expect(await loadResult(db, 'asha', 'p-open')).toEqual({ status: 'not-found' });
  });

  it('is not found for an abandoned attempt (it was never finished)', async () => {
    await attempt('gone', 'asha', 'experiment', 'abandoned');
    expect(await loadResult(db, 'asha', 'gone')).toEqual({ status: 'not-found' });
  });

  it('sends an in-progress attempt back to its experiment', async () => {
    await attempt('open', 'asha', 'experiment', 'in_progress');
    expect(await loadResult(db, 'asha', 'open')).toEqual({ status: 'in-progress', experimentId: 'ohms-law' });
  });

  it('returns the attempt with its errors and confirmations when it is finished and the learner\'s own', async () => {
    await startAttempt(db, { id: 'done', userId: 'asha', experimentId: 'ohms-law', kind: 'experiment', startedAt: 1 });
    await evaluate(db, { attemptId: 'done', results: [err('OPEN_CIRCUIT', 'OPEN_CIRCUIT.gap')], signature: 'A', timestamp: 100 });
    await appendEvent(db, checkpointRecord('done', 'c1', 150, 'main', ['OK_POLARITY']));
    await finishAttempt(db, 'done', 200);
    const found = await loadResult(db, 'asha', 'done');
    expect(found.status).toBe('ready');
    if (found.status !== 'ready') return;
    expect(found.attempt.id).toBe('done');
    expect(found.errors.map((e) => `${e.code}:${e.count}`)).toEqual(['OPEN_CIRCUIT:1']);
    expect(found.confirmations.map((c) => c.code)).toEqual(['OK_POLARITY']);
  });
});
