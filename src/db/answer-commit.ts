import type { LabXpertDB } from './database';
import { appendAnswer } from './answers';
import { appendEvent } from './events';
import type { ActionEvent, AnswerSubmission } from '../model/types';

/** The answer and its `SUBMIT_ANSWER` event are saved together, so the log and the table cannot disagree. */
export async function commitAnswer(db: LabXpertDB, answer: AnswerSubmission, event: ActionEvent): Promise<void> {
  await db.transaction('rw', db.answers, db.events, async () => {
    await appendEvent(db, event);
    await appendAnswer(db, answer);
  });
}
