import type { LabXpertDB } from './database';
import { getExperimentStatus, type ExperimentStatus } from './attempts';
import { getErrorProfile, listAttemptErrors, listPracticeHistory } from './history';
import { pickBestRun, type FinishedRun } from '../engine/best-result';
import type { ErrorProfileEntry, ExperimentId, PracticeRecord } from '../model/types';

/**
 * The student's best finished experiment attempt for one experiment, or undefined if none is finished.
 * Practice and abandoned attempts never count.
 */
export async function getBestResult(
  db: LabXpertDB,
  userId: string,
  experimentId: ExperimentId,
): Promise<FinishedRun | undefined> {
  const rows = await db.attempts.where('[userId+experimentId]').equals([userId, experimentId]).toArray();
  const finished = rows.filter((a) => a.kind === 'experiment' && a.status === 'completed');
  const runs = await Promise.all(
    finished.map(
      async (a): Promise<FinishedRun> => ({
        attemptId: a.id,
        kinds: (await listAttemptErrors(db, a.id)).length,
        finishedAt: a.finishedAt ?? a.startedAt,
      }),
    ),
  );
  return pickBestRun(runs);
}

export interface ExperimentProgress {
  experimentId: ExperimentId;
  status: ExperimentStatus;
  /** Distinct error codes of the best finished attempt; undefined when none is finished. */
  bestKinds?: number;
}

export interface ProgressData {
  experiments: ExperimentProgress[];
  profile: ErrorProfileEntry[];
  practice: PracticeRecord[];
}

/** Everything the My progress screen reads, for one learner, in one place. */
export async function loadProgress(
  db: LabXpertDB,
  userId: string,
  experimentIds: readonly ExperimentId[],
): Promise<ProgressData> {
  const [experiments, profile, practice] = await Promise.all([
    Promise.all(
      experimentIds.map(async (experimentId): Promise<ExperimentProgress> => {
        const [status, best] = await Promise.all([
          getExperimentStatus(db, userId, experimentId),
          getBestResult(db, userId, experimentId),
        ]);
        return best === undefined ? { experimentId, status } : { experimentId, status, bestKinds: best.kinds };
      }),
    ),
    getErrorProfile(db, userId),
    listPracticeHistory(db, userId),
  ]);
  return { experiments, profile, practice };
}
