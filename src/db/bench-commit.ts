import type { LabXpertDB } from './database';
import { saveAttemptCircuit } from './attempts';
import { appendEvent } from './events';
import type { ActionEvent, Circuit } from '../model/types';

export interface BenchCommit {
  attemptId: string;
  circuit: Circuit;
  /** Moves are not logged (UI_SCREENS), so a move commit has no event. */
  event?: ActionEvent;
}

/**
 * One committed bench change: the event (if any) and the new circuit are saved together, so a
 * reload can never show a bench that disagrees with the log, and a failure leaves both unchanged.
 */
export async function commitBenchChange(db: LabXpertDB, commit: BenchCommit): Promise<void> {
  await db.transaction('rw', db.events, db.attempts, async () => {
    if (commit.event !== undefined) await appendEvent(db, commit.event);
    await saveAttemptCircuit(db, commit.attemptId, commit.circuit);
  });
}
