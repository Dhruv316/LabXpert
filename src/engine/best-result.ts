/** One finished experiment attempt, reduced to what "best result" compares. */
export interface FinishedRun {
  attemptId: string;
  /** Distinct error codes seen in the attempt. */
  kinds: number;
  finishedAt: number;
}

/**
 * DECISIONS.md "Best result": fewest distinct error codes wins; ties go to the most recent
 * finish, then to the smaller attempt id so the pick never depends on input order.
 */
export function pickBestRun(runs: readonly FinishedRun[]): FinishedRun | undefined {
  let best: FinishedRun | undefined;
  for (const run of runs) {
    if (best === undefined) {
      best = run;
    } else if (run.kinds !== best.kinds) {
      if (run.kinds < best.kinds) best = run;
    } else if (run.finishedAt !== best.finishedAt) {
      if (run.finishedAt > best.finishedAt) best = run;
    } else if (run.attemptId < best.attemptId) {
      best = run;
    }
  }
  return best;
}
