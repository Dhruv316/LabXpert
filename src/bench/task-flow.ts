// Pure helpers for answering and finishing: which task is next, what the Finish button is called, and
// what an answer check decided. No React, no clock, no student-facing text.
import type { ExperimentConfig, RuleResult, TaskConfig } from '../model/types';

export function findTask(experiment: Pick<ExperimentConfig, 'tasks'>, taskId: string): TaskConfig | undefined {
  return experiment.tasks.find((task) => task.id === taskId);
}

/** Whether the task asks for an equivalent resistance (the series and parallel tasks). False for an unknown task. */
export function taskNeedsAnswer(experiment: Pick<ExperimentConfig, 'tasks'>, taskId: string): boolean {
  return findTask(experiment, taskId)?.requiresEquivalentAnswer ?? false;
}

/** The task after `taskId`; undefined for the last task and for an id that is not a task of the experiment. */
export function nextTaskId(experiment: Pick<ExperimentConfig, 'tasks'>, taskId: string): string | undefined {
  const index = experiment.tasks.findIndex((task) => task.id === taskId);
  return index < 0 ? undefined : experiment.tasks[index + 1]?.id;
}

export function isLastTask(experiment: Pick<ExperimentConfig, 'tasks'>, taskId: string): boolean {
  const index = experiment.tasks.findIndex((task) => task.id === taskId);
  return index >= 0 && index === experiment.tasks.length - 1;
}

/** Which button the dock shows: Finish experiment on the last task, Next task before it. */
export type FinishLabel = 'finish' | 'next';

export function finishLabel(experiment: Pick<ExperimentConfig, 'tasks'>, taskId: string): FinishLabel {
  return isLastTask(experiment, taskId) ? 'finish' : 'next';
}

/**
 * What an `ANSWER_SUBMIT` check decided. `wrong` is `EQUIVALENT_R_WRONG`; `blocked` is any other error (the
 * resistors are missing, so there was nothing to judge); `correct` is `OK_ANSWER`. A check on a task that
 * needs an answer always gives one of the three, so anything else is a bug and fails loudly.
 */
export type AnswerOutcome = 'correct' | 'wrong' | 'blocked';

export function answerOutcome(errors: readonly RuleResult[], confirmations: readonly RuleResult[]): AnswerOutcome {
  if (errors.some((result) => result.code === 'EQUIVALENT_R_WRONG')) return 'wrong';
  if (errors.length > 0) return 'blocked';
  if (confirmations.some((result) => result.code === 'OK_ANSWER')) return 'correct';
  throw new Error('The answer check gave neither a verdict nor an error');
}
