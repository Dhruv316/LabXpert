import type { LabXpertDB } from './database';
import { byTimestampThenId } from './ordered';
import type { Reading } from '../model/types';

export async function appendReading(db: LabXpertDB, record: Reading): Promise<void> {
  await db.readings.add(record);
}

/** One attempt's records, oldest first. */
export async function listReadings(db: LabXpertDB, attemptId: string): Promise<Reading[]> {
  const rows = await db.readings.where('attemptId').equals(attemptId).toArray();
  return rows.sort(byTimestampThenId);
}
