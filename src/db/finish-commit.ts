import type { LabXpertDB } from './database';
import { finishAttempt } from './attempts';
import { appendEvent } from './events';
import type { ActionEvent, Attempt } from '../model/types';

/** Events saved together, oldest first: all of them or none (`FINISH_TASK` with `NEXT_TASK`). */
export async function commitEvents(db: LabXpertDB, events: readonly ActionEvent[]): Promise<void> {
  await db.transaction('rw', db.events, async () => {
    for (const event of events) await appendEvent(db, event);
  });
}

/**
 * The last task's events and the attempt's `completed` status in one transaction. An attempt that is not in
 * progress makes `finishAttempt` throw, and then no event is kept.
 */
export async function commitAttemptFinish(
  db: LabXpertDB,
  attemptId: string,
  events: readonly ActionEvent[],
  finishedAt: number,
): Promise<Attempt> {
  return db.transaction('rw', db.events, db.attempts, async () => {
    for (const event of events) await appendEvent(db, event);
    return finishAttempt(db, attemptId, finishedAt);
  });
}
