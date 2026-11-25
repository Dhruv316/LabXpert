import type { LabXpertDB } from './database';
import type { Attempt, Circuit, ExperimentId } from '../model/types';

export type ExperimentStatus = 'not_started' | 'in_progress' | 'done';

export interface NewAttempt {
  id: string;
  userId: string;
  experimentId: ExperimentId;
  kind: Attempt['kind'];
  practiceTaskId?: string;
  startedAt: number;
}

export async function startAttempt(db: LabXpertDB, input: NewAttempt): Promise<Attempt> {
  const attempt: Attempt = { ...input, status: 'in_progress' };
  await db.attempts.add(attempt);
  return attempt;
}

export async function getAttempt(db: LabXpertDB, id: string): Promise<Attempt | undefined> {
  return db.attempts.get(id);
}

/** Stores the bench as it is now on the attempt. Only the circuit changes; `circuit` is not indexed. */
export async function saveAttemptCircuit(
  db: LabXpertDB,
  attemptId: string,
  circuit: Circuit,
): Promise<void> {
  const changed = await db.attempts.update(attemptId, { circuit });
  if (changed === 0) throw new Error(`Attempt not found: ${attemptId}`);
}

/** The circuit last saved for this attempt, or undefined if none was ever saved (or no such attempt). */
export async function getAttemptCircuit(db: LabXpertDB, attemptId: string): Promise<Circuit | undefined> {
  return (await db.attempts.get(attemptId))?.circuit;
}

async function close(
  db: LabXpertDB,
  id: string,
  status: 'completed' | 'abandoned',
  finishedAt: number,
): Promise<Attempt> {
  return db.transaction('rw', db.attempts, async () => {
    const current = await db.attempts.get(id);
    if (current === undefined) throw new Error(`Attempt not found: ${id}`);
    if (current.status !== 'in_progress') {
      throw new Error(`Attempt ${id} is already ${current.status}`);
    }
    const next: Attempt = { ...current, status, finishedAt };
    await db.attempts.put(next);
    return next;
  });
}

export function finishAttempt(db: LabXpertDB, id: string, finishedAt: number): Promise<Attempt> {
  return close(db, id, 'completed', finishedAt);
}

export function abandonAttempt(db: LabXpertDB, id: string, finishedAt: number): Promise<Attempt> {
  return close(db, id, 'abandoned', finishedAt);
}

async function attemptsFor(
  db: LabXpertDB,
  userId: string,
  experimentId: ExperimentId,
  kind: Attempt['kind'],
): Promise<Attempt[]> {
  const rows = await db.attempts
    .where('[userId+experimentId]')
    .equals([userId, experimentId])
    .toArray();
  return rows.filter((a) => a.kind === kind);
}

/**
 * The attempt to resume for this learner and experiment: the most recently
 * started one that is still in progress (ties: later id). Practice attempts
 * are not experiment attempts, so they are ignored unless `kind` says so.
 */
export async function findInProgressAttempt(
  db: LabXpertDB,
  userId: string,
  experimentId: ExperimentId,
  kind: Attempt['kind'] = 'experiment',
): Promise<Attempt | undefined> {
  const open = (await attemptsFor(db, userId, experimentId, kind)).filter(
    (a) => a.status === 'in_progress',
  );
  open.sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return open[open.length - 1];
}

/**
 * The practice attempt to resume for this learner and practice task: the most recently started one that is
 * still in progress (ties: later id). The route only has the task id, so the experiment it was suggested for
 * is not part of the lookup.
 */
export async function findInProgressPracticeAttempt(
  db: LabXpertDB,
  userId: string,
  practiceTaskId: string,
): Promise<Attempt | undefined> {
  const rows = await db.attempts.where('userId').equals(userId).toArray();
  const open = rows.filter((a) => a.kind === 'practice' && a.practiceTaskId === practiceTaskId && a.status === 'in_progress');
  open.sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return open[open.length - 1];
}

/**
 * Picker chip. `in_progress` wins over `done`, so a learner who finished once
 * and started again sees "resume". Abandoned attempts count as nothing.
 */
export async function getExperimentStatus(
  db: LabXpertDB,
  userId: string,
  experimentId: ExperimentId,
): Promise<ExperimentStatus> {
  const rows = await attemptsFor(db, userId, experimentId, 'experiment');
  if (rows.some((a) => a.status === 'in_progress')) return 'in_progress';
  if (rows.some((a) => a.status === 'completed')) return 'done';
  return 'not_started';
}
