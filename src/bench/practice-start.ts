// Pure rules for opening a practice attempt: which task, for which experiment and code, and what the
// practice bench is made of. No React, no clock, no student-facing text.
import { selectPracticeChoice } from '../engine/practice';
import type { ErrorCode, ErrorProfileEntry, ExperimentConfig, ExperimentId, PracticeTask } from '../model/types';

/**
 * Why `/practice/:taskId` cannot open. The screen shows the not-found screen for every reason, so it never
 * says whether a task id exists.
 * - `unknown-task`: no such task id.
 * - `not-applicable`: the task exists but nothing says what it is for (a practice task with no unresolved
 *   mistake of its kind, or an extension task without `forExperiment`).
 * - `unknown-experiment`: the task's bench experiment has no configuration.
 */
export type PracticeUnavailableReason = 'unknown-task' | 'not-applicable' | 'unknown-experiment';

export class PracticeUnavailableError extends Error {
  readonly reason: PracticeUnavailableReason;

  constructor(reason: PracticeUnavailableReason, taskId: string) {
    super(`Practice task ${taskId} cannot be opened: ${reason}`);
    this.name = 'PracticeUnavailableError';
    this.reason = reason;
  }
}

/** What the screen that sent the learner here may pass along (router state). Both parts are needed to be used. */
export interface PracticeHint {
  experimentId?: ExperimentId;
  code?: ErrorCode;
}

/** The experiment whose profile the practice may reset, and the code that triggered it (none for an extension). */
export interface PracticeStart {
  experimentId: ExperimentId;
  forCode?: ErrorCode;
}

export function findPracticeTask(tasks: readonly PracticeTask[], taskId: string): PracticeTask | undefined {
  return tasks.find((task) => task.id === taskId);
}

/** Profile order for the fallback: most seen first, then most recent, then experiment and code so it never depends on input order. */
function strongerFirst(a: ErrorProfileEntry, b: ErrorProfileEntry): number {
  if (a.count !== b.count) return b.count - a.count;
  if (a.lastSeenAt !== b.lastSeenAt) return b.lastSeenAt - a.lastSeenAt;
  if (a.experimentId !== b.experimentId) return a.experimentId < b.experimentId ? -1 : 1;
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

/**
 * The experiment and triggering code for a new practice attempt, or undefined when the task does not apply.
 * 1. An extension task resets nothing: its experiment is `forExperiment`, and it has no code (a hint is ignored).
 * 2. A hint with both an experiment and a code is used when the entry points would have offered this task for
 *    that pair (the pairing My progress uses, `choiceForCode`; the Result screen's pick is one of these pairs).
 * 3. Otherwise the learner's unresolved mistakes decide: among the profile entries (count above 0) that this task
 *    is offered for, the one seen most, ties to the most recent.
 */
export function derivePracticeStart(
  task: PracticeTask,
  tasks: readonly PracticeTask[],
  profile: readonly ErrorProfileEntry[],
  hint: PracticeHint | undefined,
): PracticeStart | undefined {
  if (task.role === 'extension') {
    return task.forExperiment === undefined ? undefined : { experimentId: task.forExperiment };
  }
  // The pairing `choiceForCode` makes for My progress: the code alone, as the learner's one mistake in that experiment.
  const offered = (experimentId: ExperimentId, code: ErrorCode): boolean => {
    const choice = selectPracticeChoice([{ userId: '', experimentId, code, count: 1, lastSeenAt: 0 }], experimentId, [...tasks]);
    return choice?.forCode === code && choice.task.id === task.id;
  };
  if (hint?.experimentId !== undefined && hint.code !== undefined && offered(hint.experimentId, hint.code)) {
    return { experimentId: hint.experimentId, forCode: hint.code };
  }
  const best = profile.filter((e) => e.count > 0 && offered(e.experimentId, e.code)).sort(strongerFirst)[0];
  return best === undefined ? undefined : { experimentId: best.experimentId, forCode: best.code };
}

/**
 * The bench configuration for a practice attempt: the task's bench experiment (rules, supply range, resistor
 * values, `activeRules`, tasks) with the task's own shelf and its `max` values. A shelf entry without `roles`
 * or `defaultOhms` takes them from the experiment's entry of the same type, so a resistor placed on a practice
 * bench gets the same role and starting value as in the experiment.
 */
export function practiceExperiment(experiment: ExperimentConfig, task: PracticeTask): ExperimentConfig {
  const shelf = task.shelf.map((item) => {
    const base = experiment.shelf.find((candidate) => candidate.type === item.type);
    return {
      ...item,
      ...(item.roles === undefined && base?.roles !== undefined ? { roles: base.roles } : {}),
      ...(item.defaultOhms === undefined && base?.defaultOhms !== undefined ? { defaultOhms: base.defaultOhms } : {}),
    };
  });
  return { ...experiment, shelf };
}
