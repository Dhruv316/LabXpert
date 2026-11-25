import type { LabXpertDB } from './database';
import { listEvents } from './events';
import type { ErrorCode, ErrorProfileEntry, ExperimentId, PracticeRecord } from '../model/types';

/** A learner's profile entries, by experiment then code. Entries at count 0 are kept (they mean "resolved"). */
export async function getErrorProfile(
  db: LabXpertDB,
  userId: string,
  experimentId?: ExperimentId,
): Promise<ErrorProfileEntry[]> {
  const rows = await db.errorProfile.where('userId').equals(userId).toArray();
  return rows
    .filter((e) => experimentId === undefined || e.experimentId === experimentId)
    .sort((a, b) =>
      a.experimentId !== b.experimentId
        ? a.experimentId < b.experimentId ? -1 : 1
        : a.code < b.code ? -1 : a.code > b.code ? 1 : 0,
    );
}

export interface AttemptError {
  code: ErrorCode;
  /** From the most recent occurrence of the code in the attempt. */
  feedbackKey: string;
  /** How many times the code was saved in the attempt. */
  count: number;
  firstSeenAt: number;
}

/** Result screen: each distinct error code of one attempt with its count, in the order first seen. */
export async function listAttemptErrors(db: LabXpertDB, attemptId: string): Promise<AttemptError[]> {
  const rows = await db.errorOccurrences.where('attemptId').equals(attemptId).toArray();
  rows.sort((a, b) => a.timestamp - b.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byCode = new Map<ErrorCode, AttemptError>();
  for (const o of rows) {
    const seen = byCode.get(o.code);
    if (seen === undefined) {
      byCode.set(o.code, { code: o.code, feedbackKey: o.feedbackKey, count: 1, firstSeenAt: o.timestamp });
    } else {
      seen.count += 1;
      seen.feedbackKey = o.feedbackKey;
    }
  }
  return [...byCode.values()];
}

export interface AttemptConfirmation {
  /** The rule code as the `CHECKPOINT` event logged it (for example `OK_TOPOLOGY`). Never shown to the student. */
  code: string;
  /**
   * The tasks whose checkpoints saw this code, in order of first appearance. One code can have a different
   * wording per task (`OK_TOPOLOGY` is "series" in one task and "parallel" in another), and the event holds
   * only the code, so the task is what tells the screen which wording to use.
   */
  taskIds: string[];
}

/** The confirmation codes of a `CHECKPOINT` event's `after`, or none if it has no list (a malformed record is skipped, not fatal). */
function confirmationCodes(after: Record<string, unknown> | undefined): string[] {
  const value: unknown = after?.confirmations;
  if (!Array.isArray(value)) return [];
  const list: readonly unknown[] = value;
  return list.filter((code): code is string => typeof code === 'string');
}

/**
 * Result screen, "What went well": each distinct confirmation code seen at any checkpoint of one attempt,
 * in the order it first appeared (DECISIONS.md: confirmations are stored only in `CHECKPOINT` events).
 */
export async function listAttemptConfirmations(db: LabXpertDB, attemptId: string): Promise<AttemptConfirmation[]> {
  const events = await listEvents(db, attemptId);
  const byCode = new Map<string, AttemptConfirmation>();
  for (const event of events) {
    if (event.actionType !== 'CHECKPOINT') continue;
    for (const code of confirmationCodes(event.after)) {
      let entry = byCode.get(code);
      if (entry === undefined) {
        entry = { code, taskIds: [] };
        byCode.set(code, entry);
      }
      if (event.taskId !== undefined && !entry.taskIds.includes(event.taskId)) entry.taskIds.push(event.taskId);
    }
  }
  return [...byCode.values()];
}

/** My progress: completed practice, newest first. Unfinished and abandoned practice is not listed. */
export async function listPracticeHistory(db: LabXpertDB, userId: string): Promise<PracticeRecord[]> {
  const rows = await db.practiceRecords.where('userId').equals(userId).toArray();
  return rows
    .filter((r) => r.completedAt !== undefined)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
