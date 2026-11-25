import type {
  AnswerSubmission,
  CompletionCondition,
  ErrorCode,
  ErrorOccurrence,
  ErrorProfileEntry,
  ExperimentId,
  PracticeTask,
  Reading,
} from '../model/types';

export interface PracticeChoice {
  task: PracticeTask;
  /** The code that triggered the pick; undefined for an extension task. Store it as `PracticeRecord.forCode`. */
  forCode?: ErrorCode;
}

/** The learner's entry to fix first: highest count, ties to the most recently seen, then by code so the pick never depends on input order. */
function topEntry(profile: ErrorProfileEntry[], experimentId: ExperimentId): ErrorProfileEntry | undefined {
  let best: ErrorProfileEntry | undefined;
  for (const entry of profile) {
    if (entry.experimentId !== experimentId || entry.count <= 0) continue;
    if (best === undefined) {
      best = entry;
    } else if (entry.count !== best.count) {
      if (entry.count > best.count) best = entry;
    } else if (entry.lastSeenAt !== best.lastSeenAt) {
      if (entry.lastSeenAt > best.lastSeenAt) best = entry;
    } else if (entry.code < best.code) {
      best = entry;
    }
  }
  return best;
}

/** rules-spec §G steps 1 to 4. Returns undefined only if the task list has no extension task for the experiment. */
export function selectPracticeChoice(
  profile: ErrorProfileEntry[],
  experimentId: ExperimentId,
  tasks: PracticeTask[],
): PracticeChoice | undefined {
  const top = topEntry(profile, experimentId);
  if (top !== undefined) {
    const match = tasks.find(
      (t) => t.role === 'practice' && t.forCodes.includes(top.code) && t.appliesToExperiments.includes(experimentId),
    );
    if (match !== undefined) return { task: match, forCode: top.code };
  }
  const extension = tasks.find((t) => t.role === 'extension' && t.forExperiment === experimentId);
  return extension === undefined ? undefined : { task: extension };
}

export function selectPractice(
  profile: ErrorProfileEntry[],
  experimentId: ExperimentId,
  tasks: PracticeTask[],
): PracticeTask | undefined {
  return selectPracticeChoice(profile, experimentId, tasks)?.task;
}

export interface ResetInput {
  task: PracticeTask;
  /** The code that triggered the selection (`PracticeRecord.forCode`). */
  forCode: ErrorCode | undefined;
  /** True once the task's completion condition is met. */
  completed: boolean;
  practiceAttemptId: string;
  /** Occurrences saved for the practice attempt; other attempts are ignored. */
  occurrences: ErrorOccurrence[];
}

/** rules-spec §G Reset: the code whose count goes back to 0, or null when nothing resets. */
export function codeToReset(input: ResetInput): ErrorCode | null {
  if (input.task.role === 'extension' || input.forCode === undefined || !input.completed) return null;
  const forCode = input.forCode;
  const recurred = input.occurrences.some((o) => o.attemptId === input.practiceAttemptId && o.code === forCode);
  return recurred ? null : forCode;
}

/** What a practice attempt has produced so far. The caller loads it from the attempt's saved data. */
export interface PracticeEvidence {
  /** Readings recorded in this attempt (a blocked reading is never recorded). */
  readings: Reading[];
  /** Ids of readings that were recorded while the evaluation returned `OK_TOPOLOGY`. */
  topologyOkReadingIds: string[];
  /** Answers submitted in this attempt (calculation tasks). */
  answers: AnswerSubmission[];
}

const VOLTAGE_EPSILON = 1e-9;

/**
 * Timestamp at which the condition became true using only evidence strictly after `after`, or null if it is not met.
 * Timestamps are what make `sequence` order checkable: each step may only use evidence later than the previous step's finish.
 */
function satisfiedAt(condition: CompletionCondition, evidence: PracticeEvidence, after: number): number | null {
  switch (condition.type) {
    case 'reading_recorded': {
      const times = evidence.readings.filter((r) => r.timestamp > after).map((r) => r.timestamp).sort((a, b) => a - b);
      if (condition.min <= 0) return after;
      return times[condition.min - 1] ?? null;
    }
    case 'readings_at_voltages': {
      let finish = after;
      for (const voltage of condition.voltages) {
        const times = evidence.readings
          .filter((r) => r.timestamp > after && Math.abs(r.supplyVoltage - voltage) < VOLTAGE_EPSILON)
          .map((r) => r.timestamp);
        if (times.length === 0) return null;
        finish = Math.max(finish, Math.min(...times));
      }
      return finish;
    }
    case 'clean_reading_with_topology': {
      const ok = new Set(evidence.topologyOkReadingIds);
      const times = evidence.readings
        .filter((r) => r.timestamp > after && r.taskId === condition.taskId && ok.has(r.id))
        .map((r) => r.timestamp);
      return times.length === 0 ? null : Math.min(...times);
    }
    case 'answers_correct': {
      const times = evidence.answers
        .filter((a) => a.timestamp > after && a.correct)
        .map((a) => a.timestamp)
        .sort((x, y) => x - y);
      if (condition.count <= 0) return after;
      return times[condition.count - 1] ?? null;
    }
    case 'sequence': {
      let cursor = after;
      for (const step of condition.steps) {
        const done = satisfiedAt(step, evidence, cursor);
        if (done === null) return null;
        cursor = done;
      }
      return cursor;
    }
  }
}

/** rules-spec §H: is the practice task's completion condition met by this evidence? */
export function isPracticeComplete(condition: CompletionCondition, evidence: PracticeEvidence): boolean {
  return satisfiedAt(condition, evidence, Number.NEGATIVE_INFINITY) !== null;
}
