import type {
  Attempt,
  Checkpoint,
  ErrorCode,
  ErrorOccurrence,
  ExperimentId,
  RuleResult,
} from '../model/types';

export interface TrackingInput {
  /** All results of ONE evaluation. Only `severity: 'error'` results are counted. */
  results: RuleResult[];
  /** Needed even when `results` is empty: an empty check can still resolve earlier errors. */
  checkpoint: Checkpoint;
  /** Occurrences already saved for this attempt, any order. */
  existing: ErrorOccurrence[];
  attemptKind: Attempt['kind'];
  attemptId: string;
  userId: string;
  experimentId: ExperimentId;
  /** For state-level results (rules-spec §F). */
  circuitSignature: string;
  /** For action-level results (§F): `readings:<n>|answers:<n>|typed:<value>`. */
  actionSignature: string;
  /** Called once per new occurrence; ids are supplied by the caller, never generated here. */
  makeId: () => string;
  /** Epoch ms, passed in. */
  timestamp: number;
}

export interface Resolution {
  occurrenceId: string;
  resolvedAt: number;
}

export interface ProfileIncrement {
  userId: string;
  experimentId: ExperimentId;
  code: ErrorCode;
  /** Number of new occurrences of this code; add it to `ErrorProfileEntry.count`. */
  by: number;
  lastSeenAt: number;
}

export interface TrackingOutput {
  occurrences: ErrorOccurrence[];
  resolutions: Resolution[];
  /** Empty for practice attempts: they save occurrences but never change the profile. */
  profileIncrements: ProfileIncrement[];
}

/** Latest by timestamp; on a tie the one listed last wins. */
function latest(list: ErrorOccurrence[]): ErrorOccurrence | undefined {
  let best: ErrorOccurrence | undefined;
  for (const item of list) {
    if (best === undefined || item.timestamp >= best.timestamp) best = item;
  }
  return best;
}

type ErrorResult = RuleResult & { code: ErrorCode };

function isErrorResult(result: RuleResult): result is ErrorResult {
  return result.severity === 'error';
}

/** rules-spec §F: save new errors (skipping repeats of a still-open error on an unchanged circuit), resolve fixed ones, count for the profile. */
export function trackErrors(input: TrackingInput): TrackingOutput {
  const attemptOccurrences = input.existing.filter((o) => o.attemptId === input.attemptId);
  const occurrences: ErrorOccurrence[] = [];
  const present = new Set<ErrorCode>();

  for (const result of input.results) {
    if (!isErrorResult(result)) continue;
    const code = result.code;
    // Presence, not saving, decides resolution: a repeat that is skipped as a duplicate is still reported.
    present.add(code);
    const signature = result.stage === 'action' ? input.actionSignature : input.circuitSignature;
    const duplicateInThisCheck = occurrences.some((o) => o.code === code && o.circuitSignature === signature);
    if (duplicateInThisCheck) continue;
    // A repeat is a duplicate only while the latest occurrence of this code at this checkpoint is still open.
    // Once that occurrence is resolved, the same circuit coming back is a new mistake and is counted again.
    const previous = latest(attemptOccurrences.filter((o) => o.code === code && o.checkpoint === input.checkpoint));
    if (previous !== undefined && previous.circuitSignature === signature && previous.resolvedAt === undefined) continue;
    occurrences.push({
      id: input.makeId(),
      attemptId: input.attemptId,
      userId: input.userId,
      experimentId: input.experimentId,
      code,
      feedbackKey: result.feedbackKey,
      checkpoint: input.checkpoint,
      circuitSignature: signature,
      timestamp: input.timestamp,
    });
  }

  // Resolved: the code's latest occurrence at THIS checkpoint, still open, and the code is absent now.
  const resolutions: Resolution[] = [];
  const codesSeen = new Set(attemptOccurrences.filter((o) => o.checkpoint === input.checkpoint).map((o) => o.code));
  for (const code of codesSeen) {
    if (present.has(code)) continue;
    const last = latest(attemptOccurrences.filter((o) => o.code === code && o.checkpoint === input.checkpoint));
    if (last !== undefined && last.resolvedAt === undefined) {
      resolutions.push({ occurrenceId: last.id, resolvedAt: input.timestamp });
    }
  }

  const profileIncrements: ProfileIncrement[] = [];
  if (input.attemptKind === 'experiment') {
    const counts = new Map<ErrorCode, number>();
    for (const o of occurrences) counts.set(o.code, (counts.get(o.code) ?? 0) + 1);
    for (const [code, by] of counts) {
      profileIncrements.push({
        userId: input.userId,
        experimentId: input.experimentId,
        code,
        by,
        lastSeenAt: input.timestamp,
      });
    }
  }

  return { occurrences, resolutions, profileIncrements };
}
