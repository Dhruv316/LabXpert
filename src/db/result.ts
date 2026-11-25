import type { LabXpertDB } from './database';
import { getAttempt } from './attempts';
import { listAttemptConfirmations, listAttemptErrors } from './history';
import type { AttemptConfirmation, AttemptError } from './history';
import type { Attempt, ExperimentId } from '../model/types';

/** What the Result screen should do for one `/result/:attemptId`. */
export type ResultLookup =
  | { status: 'not-found' }
  /** Still being worked on: the student goes back to the bench of this experiment. */
  | { status: 'in-progress'; experimentId: ExperimentId }
  | { status: 'ready'; attempt: Attempt; errors: AttemptError[]; confirmations: AttemptConfirmation[] };

/**
 * Who may see which result. Only the signed-in learner's own finished experiment attempt is shown; an
 * unknown id, someone else's attempt, a practice attempt and an abandoned attempt (it was never finished)
 * are all "not found", so the screen never says whether such an id exists.
 */
export async function loadResult(db: LabXpertDB, userId: string, attemptId: string): Promise<ResultLookup> {
  const attempt = await getAttempt(db, attemptId);
  if (attempt === undefined || attempt.userId !== userId || attempt.kind === 'practice') return { status: 'not-found' };
  if (attempt.status === 'in_progress') return { status: 'in-progress', experimentId: attempt.experimentId };
  if (attempt.status !== 'completed') return { status: 'not-found' };
  const [errors, confirmations] = await Promise.all([
    listAttemptErrors(db, attemptId),
    listAttemptConfirmations(db, attemptId),
  ]);
  return { status: 'ready', attempt, errors, confirmations };
}
