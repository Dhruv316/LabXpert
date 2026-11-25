import type { LabXpertDB } from './database';
import { trackErrors } from '../engine/tracking';
import type { TrackingInput, TrackingOutput } from '../engine/tracking';

/**
 * What the caller supplies. The attempt's kind, user and experiment come from
 * the saved attempt, not from the caller, so a practice attempt can never be
 * counted into the profile by a wrong argument.
 */
export type SaveEvaluationInput = Omit<
  TrackingInput,
  'existing' | 'attemptKind' | 'userId' | 'experimentId'
>;

/**
 * Saves one evaluation's outcome (rules-spec §F) in a single transaction:
 * new occurrences, `resolvedAt` updates and profile increments are all written
 * or none are. Returns what `trackErrors` decided.
 */
export function saveEvaluation(db: LabXpertDB, input: SaveEvaluationInput): Promise<TrackingOutput> {
  return db.transaction('rw', [db.attempts, db.errorOccurrences, db.errorProfile], async () => {
    const attempt = await db.attempts.get(input.attemptId);
    if (attempt === undefined) throw new Error(`Attempt not found: ${input.attemptId}`);
    const existing = await db.errorOccurrences.where('attemptId').equals(input.attemptId).toArray();
    const output = trackErrors({
      ...input,
      existing,
      attemptKind: attempt.kind,
      userId: attempt.userId,
      experimentId: attempt.experimentId,
    });

    for (const occurrence of output.occurrences) await db.errorOccurrences.add(occurrence);
    for (const { occurrenceId, resolvedAt } of output.resolutions) {
      await db.errorOccurrences.update(occurrenceId, { resolvedAt });
    }
    for (const inc of output.profileIncrements) {
      const key: [string, string, string] = [inc.userId, inc.experimentId, inc.code];
      const old = await db.errorProfile.get(key);
      await db.errorProfile.put({
        userId: inc.userId,
        experimentId: inc.experimentId,
        code: inc.code,
        count: (old?.count ?? 0) + inc.by,
        lastSeenAt: inc.lastSeenAt,
      });
    }
    return output;
  });
}
