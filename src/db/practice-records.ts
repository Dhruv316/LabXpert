import type { LabXpertDB } from './database';
import { finishAttempt, startAttempt } from './attempts';
import { listAnswers } from './answers';
import { listReadings } from './readings';
import { codeToReset, isPracticeComplete } from '../engine/practice';
import type { ErrorCode, ExperimentId, PracticeRecord, PracticeTask } from '../model/types';

export interface StartPracticeInput {
  recordId: string;
  attemptId: string;
  userId: string;
  /**
   * The experiment the practice was suggested for (the one whose profile it
   * may reset), which can differ from the task's own bench experiment.
   */
  experimentId: ExperimentId;
  practiceTaskId: string;
  /** `PracticeChoice.forCode`; undefined for an extension task. */
  forCode?: ErrorCode;
  startedAt: number;
}

/** Opens a practice attempt and its practice record together. */
export function startPractice(db: LabXpertDB, input: StartPracticeInput): Promise<PracticeRecord> {
  return db.transaction('rw', [db.attempts, db.practiceRecords], async () => {
    await startAttempt(db, {
      id: input.attemptId,
      userId: input.userId,
      experimentId: input.experimentId,
      kind: 'practice',
      practiceTaskId: input.practiceTaskId,
      startedAt: input.startedAt,
    });
    const record: PracticeRecord = {
      id: input.recordId,
      userId: input.userId,
      practiceTaskId: input.practiceTaskId,
      attemptId: input.attemptId,
      ...(input.forCode === undefined ? {} : { forCode: input.forCode }),
    };
    await db.practiceRecords.add(record);
    return record;
  });
}

export interface CompletePracticeInput {
  attemptId: string;
  task: PracticeTask;
  /** Ids of this attempt's readings that were recorded with `OK_TOPOLOGY`. The caller knows them; nothing here stores them. */
  topologyOkReadingIds: string[];
  completedAt: number;
}

export type CompletePracticeResult =
  | { completed: false }
  | { completed: true; clean: boolean; resetCode: ErrorCode | null; record: PracticeRecord };

/**
 * Checks the attempt's saved readings and answers against the task's
 * completion condition. If it is not met, nothing changes. If it is met, in one
 * transaction: the attempt is completed, the record gets `completedAt` and
 * `clean`, and when `codeToReset` names a code its profile count goes to 0.
 *
 * `clean`: no occurrence of the triggering code in this attempt; for an
 * extension task (no triggering code), no occurrence of any code.
 */
export function completePractice(
  db: LabXpertDB,
  input: CompletePracticeInput,
): Promise<CompletePracticeResult> {
  const tables = [db.attempts, db.practiceRecords, db.errorOccurrences, db.errorProfile, db.readings, db.answers];
  return db.transaction('rw', tables, async (): Promise<CompletePracticeResult> => {
    const attempt = await db.attempts.get(input.attemptId);
    if (attempt === undefined) throw new Error(`Attempt not found: ${input.attemptId}`);
    if (attempt.kind !== 'practice') throw new Error(`Attempt ${input.attemptId} is not a practice attempt`);
    const found = await db.practiceRecords.where('userId').equals(attempt.userId).toArray();
    const record = found.find((r) => r.attemptId === input.attemptId);
    if (record === undefined) throw new Error(`No practice record for attempt ${input.attemptId}`);

    const evidence = {
      readings: await listReadings(db, input.attemptId),
      topologyOkReadingIds: input.topologyOkReadingIds,
      answers: await listAnswers(db, input.attemptId),
    };
    if (!isPracticeComplete(input.task.completion, evidence)) return { completed: false };

    await finishAttempt(db, input.attemptId, input.completedAt);
    const occurrences = await db.errorOccurrences.where('attemptId').equals(input.attemptId).toArray();
    const resetCode = codeToReset({
      task: input.task,
      forCode: record.forCode,
      completed: true,
      practiceAttemptId: input.attemptId,
      occurrences,
    });
    const clean =
      record.forCode === undefined ? occurrences.length === 0 : !occurrences.some((o) => o.code === record.forCode);
    const done: PracticeRecord = { ...record, completedAt: input.completedAt, clean };
    await db.practiceRecords.put(done);

    if (resetCode !== null) {
      const key: [string, string, string] = [attempt.userId, attempt.experimentId, resetCode];
      const entry = await db.errorProfile.get(key);
      // A missing entry has nothing to reset; do not create one.
      if (entry !== undefined) await db.errorProfile.put({ ...entry, count: 0 });
    }
    return { completed: true, clean, resetCode, record: done };
  });
}

/** The practice record that goes with a practice attempt (made by `startPractice`), or undefined if there is none. */
export async function getPracticeRecord(
  db: LabXpertDB,
  userId: string,
  attemptId: string,
): Promise<PracticeRecord | undefined> {
  const rows = await db.practiceRecords.where('userId').equals(userId).toArray();
  return rows.find((r) => r.attemptId === attemptId);
}
