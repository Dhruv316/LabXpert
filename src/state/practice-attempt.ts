import { appNow, findInProgressPracticeAttempt, getAttempt, getErrorProfile, getPracticeRecord, newRecordId, startPractice } from '../db';
import type { LabXpertDB } from '../db/database';
import { derivePracticeStart, PracticeUnavailableError, type PracticeHint } from '../bench/practice-start';
import type { Attempt, PracticeRecord, PracticeTask } from '../model/types';
import type { BenchClock } from './bench';

const DEFAULT_CLOCK: BenchClock = { now: appNow, newId: newRecordId };

export interface LoadPracticeInput {
  userId: string;
  task: PracticeTask;
  /** Every practice task: the hint and the profile are matched against them (see `derivePracticeStart`). */
  tasks: readonly PracticeTask[];
  hint?: PracticeHint;
  clock?: BenchClock;
}

export interface LoadedPractice {
  attempt: Attempt;
  record: PracticeRecord;
}

// One in-flight lookup per learner and task, so React's double effect in development cannot start two attempts
// (the same guard `loadBenchAttempt` has for experiments).
const lookups = new Map<string, Promise<LoadedPractice>>();

/**
 * The attempt for `/practice/:taskId`: this learner's in-progress attempt for the task, or a new one made with
 * `startPractice`. A reload finds the old attempt, so the hint only matters the first time. Throws
 * `PracticeUnavailableError('not-applicable')` when a new attempt would have no experiment to belong to.
 */
export function loadPracticeAttempt(db: LabXpertDB, input: LoadPracticeInput): Promise<LoadedPractice> {
  const { userId, task, clock = DEFAULT_CLOCK } = input;
  const key = `${userId}:${task.id}`;
  const pending = lookups.get(key);
  if (pending !== undefined) return pending;
  const run = (async (): Promise<LoadedPractice> => {
    const existing = await findInProgressPracticeAttempt(db, userId, task.id);
    if (existing !== undefined) {
      const record = await getPracticeRecord(db, userId, existing.id);
      if (record === undefined) throw new Error(`No practice record for attempt ${existing.id}`);
      return { attempt: existing, record };
    }
    const start = derivePracticeStart(task, input.tasks, await getErrorProfile(db, userId), input.hint);
    if (start === undefined) throw new PracticeUnavailableError('not-applicable', task.id);
    const attemptId = clock.newId();
    const record = await startPractice(db, {
      recordId: clock.newId(),
      attemptId,
      userId,
      experimentId: start.experimentId,
      practiceTaskId: task.id,
      forCode: start.forCode,
      startedAt: clock.now(),
    });
    const attempt = await getAttempt(db, attemptId);
    if (attempt === undefined) throw new Error(`Attempt not found: ${attemptId}`);
    return { attempt, record };
  })();
  lookups.set(key, run);
  const forget = () => lookups.delete(key);
  run.then(forget, forget);
  return run;
}

/** The attempt the bench is asked to open in practice mode: it must be this learner's, for this task, and still in progress. */
export async function checkPracticeAttempt(db: LabXpertDB, userId: string, task: PracticeTask, attemptId: string): Promise<Attempt> {
  const attempt = await getAttempt(db, attemptId);
  if (attempt === undefined || attempt.kind !== 'practice' || attempt.userId !== userId || attempt.practiceTaskId !== task.id) {
    throw new Error(`Not a practice attempt of this learner for task ${task.id}: ${attemptId}`);
  }
  if (attempt.status !== 'in_progress') throw new Error(`Practice attempt ${attemptId} is already ${attempt.status}`);
  return attempt;
}
