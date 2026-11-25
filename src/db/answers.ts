import type { LabXpertDB } from './database';
import { byTimestampThenId } from './ordered';
import type { AnswerSubmission } from '../model/types';

export async function appendAnswer(db: LabXpertDB, record: AnswerSubmission): Promise<void> {
  await db.answers.add(record);
}

/** One attempt's records, oldest first. */
export async function listAnswers(db: LabXpertDB, attemptId: string): Promise<AnswerSubmission[]> {
  const rows = await db.answers.where('attemptId').equals(attemptId).toArray();
  return rows.sort(byTimestampThenId);
}
