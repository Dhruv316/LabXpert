import type { LabXpertDB } from './database';
import { getErrorProfile } from './history';
import { selectPracticeChoice } from '../engine/practice';
import type { PracticeChoice } from '../engine/practice';
import type { ErrorCode, ExperimentId, PracticeTask } from '../model/types';

/** Result screen: the practice task to suggest from the saved profile (rules-spec §G). The same profile always gives the same task. */
export async function suggestPractice(
  db: LabXpertDB,
  userId: string,
  experimentId: ExperimentId,
  tasks: PracticeTask[],
): Promise<PracticeChoice | undefined> {
  return selectPracticeChoice(await getErrorProfile(db, userId, experimentId), experimentId, tasks);
}

/**
 * My progress, "Start practice" on a topic row: the task for that code.
 * Reuses the §G selection by offering it a one-entry profile.
 */
export function choiceForCode(
  tasks: PracticeTask[],
  experimentId: ExperimentId,
  code: ErrorCode,
): PracticeChoice | undefined {
  const choice = selectPracticeChoice([{ userId: '', experimentId, code, count: 1, lastSeenAt: 0 }], experimentId, tasks);
  return choice?.forCode === code ? choice : undefined;
}
