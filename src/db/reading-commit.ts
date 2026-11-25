import type { LabXpertDB } from './database';
import { appendEvent } from './events';
import { appendReading } from './readings';
import type { ActionEvent, Reading } from '../model/types';

/** The reading and its `RECORD_READING` event are saved together, so the log and the table cannot disagree. */
export async function commitReading(db: LabXpertDB, reading: Reading, event: ActionEvent): Promise<void> {
  await db.transaction('rw', db.readings, db.events, async () => {
    await appendEvent(db, event);
    await appendReading(db, reading);
  });
}
