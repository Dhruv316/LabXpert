import { currentTaskId } from '../bench/checkpoint';
import { canRecordReading, readingsForTask } from '../bench/readings';
import { finishLabel, isLastTask, taskNeedsAnswer, type FinishLabel } from '../bench/task-flow';
import type { AnswerSubmission, Circuit, ExperimentConfig, Reading } from '../model/types';
import type { TaskState } from './task';

/** The task id to use: the stored one when it is a task of this experiment, otherwise the first task. */
export function selectCurrentTaskId(task: Pick<TaskState, 'taskId'>, experiment: ExperimentConfig): string {
  const id = task.taskId;
  if (id !== undefined && experiment.tasks.some((candidate) => candidate.id === id)) return id;
  return currentTaskId(experiment);
}

// One slot, like live-selector: a component that reads the selector gets the same array until the
// readings or the task change, so React does not re-render on every store update.
let cachedReadings: { source: readonly Reading[]; taskId: string; result: Reading[] } | undefined;

/** The current task's readings, oldest first (the order they were loaded and added in). */
export function selectTaskReadings(readings: readonly Reading[], taskId: string): Reading[] {
  if (cachedReadings?.source === readings && cachedReadings.taskId === taskId) return cachedReadings.result;
  const result = readingsForTask(readings, taskId);
  cachedReadings = { source: readings, taskId, result };
  return result;
}

/** Whether Record reading is allowed: the supply is above 0 V (or missing, so the check can say so). */
export function selectRecordingAllowed(state: { circuit: Circuit }): boolean {
  return canRecordReading(state.circuit);
}

export interface TaskProgress {
  /** 1-based position of the current task. */
  current: number;
  total: number;
}

let cachedProgress: { experiment: ExperimentConfig; taskId: string; result: TaskProgress } | undefined;

export function selectTaskProgress(experiment: ExperimentConfig, taskId: string): TaskProgress {
  if (cachedProgress?.experiment === experiment && cachedProgress.taskId === taskId) return cachedProgress.result;
  const index = experiment.tasks.findIndex((task) => task.id === taskId);
  const result = { current: index < 0 ? 1 : index + 1, total: experiment.tasks.length };
  cachedProgress = { experiment, taskId, result };
  return result;
}

/** Whether the current task has an equivalent-resistance box (and cannot finish without a right answer). */
export function selectTaskNeedsAnswer(experiment: ExperimentConfig, taskId: string): boolean {
  return taskNeedsAnswer(experiment, taskId);
}

export function selectIsLastTask(experiment: ExperimentConfig, taskId: string): boolean {
  return isLastTask(experiment, taskId);
}

/** `finish` on the last task (Finish experiment), `next` before it (Next task). */
export function selectFinishLabel(experiment: ExperimentConfig, taskId: string): FinishLabel {
  return finishLabel(experiment, taskId);
}

/** The task's latest saved answer, right or wrong (the list is oldest first); undefined before the first Check. */
export function selectLastAnswer(answers: readonly AnswerSubmission[], taskId: string): AnswerSubmission | undefined {
  for (let i = answers.length - 1; i >= 0; i -= 1) {
    const answer = answers[i];
    if (answer?.taskId === taskId) return answer;
  }
  return undefined;
}

/** What the dock shows under the box: `correct`, `wrong`, or nothing before the first Check. */
export function selectLastAnswerResult(answers: readonly AnswerSubmission[], taskId: string): 'correct' | 'wrong' | undefined {
  const last = selectLastAnswer(answers, taskId);
  if (last === undefined) return undefined;
  return last.correct ? 'correct' : 'wrong';
}
