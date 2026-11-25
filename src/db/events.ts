import type { LabXpertDB } from './database';
import { byTimestampThenId } from './ordered';
import type { ActionEvent } from '../model/types';

export async function appendEvent(db: LabXpertDB, record: ActionEvent): Promise<void> {
  await db.events.add(record);
}

/** One attempt's records, oldest first. */
export async function listEvents(db: LabXpertDB, attemptId: string): Promise<ActionEvent[]> {
  const rows = await db.events.where('attemptId').equals(attemptId).toArray();
  return rows.sort(byTimestampThenId);
}
