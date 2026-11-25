// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDbs, makeTestDb } from './setup';
import type { LabXpertDB } from '../../src/db/database';
import { appendEvent, listEvents } from '../../src/db/events';
import { appendReading, listReadings } from '../../src/db/readings';
import { appendAnswer, listAnswers } from '../../src/db/answers';
import type { ActionEvent, AnswerSubmission, Reading } from '../../src/model/types';

let db: LabXpertDB;
beforeEach(async () => {
  db = await makeTestDb();
});
afterEach(disposeTestDbs);

function ev(id: string, attemptId: string, timestamp: number): ActionEvent {
  return {
    id,
    userId: 'asha',
    attemptId,
    experimentId: 'ohms-law',
    actionType: 'PLACE_COMPONENT',
    targetId: 'R',
    after: { x: 10, y: 20 },
    connectionMethod: 'drag',
    timestamp,
  };
}
function rd(id: string, attemptId: string, timestamp: number): Reading {
  return { id, attemptId, taskId: 't1', supplyVoltage: 6, voltmeter: 6, ammeter: 0.6, timestamp };
}
function an(id: string, attemptId: string, timestamp: number): AnswerSubmission {
  return { id, attemptId, taskId: 't1', typed: 30, expected: 30, correct: true, timestamp };
}

describe('events', () => {
  it('lists nothing for an attempt with no events', async () => {
    expect(await listEvents(db, 'a1')).toEqual([]);
  });

  it('stores every field and lists only that attempt, oldest first', async () => {
    await appendEvent(db, ev('e2', 'a1', 200));
    await appendEvent(db, ev('e1', 'a1', 100));
    await appendEvent(db, ev('x1', 'a2', 50));
    const list = await listEvents(db, 'a1');
    expect(list.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(list[0]).toEqual(ev('e1', 'a1', 100));
  });

  it('orders equal timestamps by id', async () => {
    await appendEvent(db, ev('b', 'a1', 100));
    await appendEvent(db, ev('a', 'a1', 100));
    expect((await listEvents(db, 'a1')).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('refuses a duplicate id', async () => {
    await appendEvent(db, ev('e1', 'a1', 1));
    await expect(appendEvent(db, ev('e1', 'a1', 2))).rejects.toThrow();
  });
});

describe('readings', () => {
  it('appends and lists per attempt, oldest first', async () => {
    await appendReading(db, rd('r2', 'a1', 20));
    await appendReading(db, rd('r1', 'a1', 10));
    await appendReading(db, rd('r9', 'a2', 5));
    expect(await listReadings(db, 'a1')).toEqual([rd('r1', 'a1', 10), rd('r2', 'a1', 20)]);
    expect(await listReadings(db, 'none')).toEqual([]);
  });
});

describe('answers', () => {
  it('appends and lists per attempt, oldest first', async () => {
    await appendAnswer(db, an('n2', 'a1', 20));
    await appendAnswer(db, { ...an('n1', 'a1', 10), typed: 31, correct: false });
    await appendAnswer(db, an('n9', 'a2', 5));
    const list = await listAnswers(db, 'a1');
    expect(list.map((a) => a.id)).toEqual(['n1', 'n2']);
    expect(list[0]?.correct).toBe(false);
    expect(await listAnswers(db, 'none')).toEqual([]);
  });
});
