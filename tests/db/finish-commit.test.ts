// Import order matters: ./setup loads fake-indexeddb before Dexie is first imported.
import { disposeTestDbs, makeTestDb } from './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { commitAnswer } from '../../src/db/answer-commit';
import { listAnswers } from '../../src/db/answers';
import { abandonAttempt, getAttempt, startAttempt } from '../../src/db/attempts';
import { listEvents } from '../../src/db/events';
import { commitAttemptFinish, commitEvents } from '../../src/db/finish-commit';
import type { LabXpertDB } from '../../src/db/database';
import type { ActionEvent, ActionType, AnswerSubmission } from '../../src/model/types';

afterEach(disposeTestDbs);

const event = (id: string, actionType: ActionType, timestamp: number): ActionEvent => ({
  id, userId: 'asha', attemptId: 'a1', experimentId: 'series-parallel', actionType, timestamp,
});

async function withAttempt(): Promise<LabXpertDB> {
  const db = await makeTestDb();
  await startAttempt(db, { id: 'a1', userId: 'asha', experimentId: 'series-parallel', kind: 'experiment', startedAt: 1 });
  return db;
}

describe('commitEvents', () => {
  it('saves all the events', async () => {
    const db = await withAttempt();
    await commitEvents(db, [event('e1', 'FINISH_TASK', 10), event('e2', 'NEXT_TASK', 11)]);
    expect((await listEvents(db, 'a1')).map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('keeps none of them when one fails', async () => {
    const db = await withAttempt();
    await commitEvents(db, [event('e2', 'CHECKPOINT', 5)]);
    let failed = false;
    try {
      await commitEvents(db, [event('e1', 'FINISH_TASK', 10), event('e2', 'NEXT_TASK', 11)]);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect((await listEvents(db, 'a1')).map((e) => e.id)).toEqual(['e2']);
  });
});

describe('commitAttemptFinish', () => {
  it('saves the events and marks the attempt completed together', async () => {
    const db = await withAttempt();
    const done = await commitAttemptFinish(db, 'a1', [event('e1', 'FINISH_TASK', 10), event('e2', 'FINISH_ATTEMPT', 11)], 11);
    expect(done).toMatchObject({ id: 'a1', status: 'completed', finishedAt: 11 });
    expect((await getAttempt(db, 'a1'))?.status).toBe('completed');
    expect((await listEvents(db, 'a1')).map((e) => e.actionType)).toEqual(['FINISH_TASK', 'FINISH_ATTEMPT']);
  });

  it('keeps no event when the attempt cannot be finished', async () => {
    const db = await withAttempt();
    await abandonAttempt(db, 'a1', 5);
    let failed = false;
    try {
      await commitAttemptFinish(db, 'a1', [event('e1', 'FINISH_ATTEMPT', 10)], 10);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(await listEvents(db, 'a1')).toEqual([]);
    expect((await getAttempt(db, 'a1'))?.status).toBe('abandoned');
  });
});

describe('commitAnswer', () => {
  const answer: AnswerSubmission = { id: 'ans1', attemptId: 'a1', taskId: 'series', typed: 30, expected: 30, correct: true, timestamp: 10 };

  it('saves the answer and its event together', async () => {
    const db = await withAttempt();
    await commitAnswer(db, answer, event('e1', 'SUBMIT_ANSWER', 10));
    expect(await listAnswers(db, 'a1')).toEqual([answer]);
    expect((await listEvents(db, 'a1')).map((e) => e.actionType)).toEqual(['SUBMIT_ANSWER']);
  });

  it('keeps neither when the answer cannot be saved', async () => {
    const db = await withAttempt();
    await commitAnswer(db, answer, event('e1', 'SUBMIT_ANSWER', 10));
    let failed = false;
    try {
      // Same answer id again: the table refuses it, so the new event must not stay either.
      await commitAnswer(db, answer, event('e2', 'SUBMIT_ANSWER', 11));
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect((await listEvents(db, 'a1')).map((e) => e.id)).toEqual(['e1']);
    expect(await listAnswers(db, 'a1')).toHaveLength(1);
  });
});
