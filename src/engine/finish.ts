import type { EvaluateInput, RuleResult } from '../model/types';
import { actionError } from './stage-support';

/**
 * FINISH (rules-spec §D). Looks only at history for the current task id. Readings are only ever recorded
 * when no state error blocked them, so every stored reading counts as valid. State rules never run here.
 */
export function checkFinish(input: EvaluateInput): RuleResult[] {
  const task = input.experiment.tasks.find((candidate) => candidate.id === input.taskId);
  if (task === undefined) return [];

  const readings = input.readings.filter((reading) => reading.taskId === input.taskId);
  const have = task.distinctSupplyVoltages
    ? new Set(readings.map((reading) => reading.supplyVoltage)).size
    : readings.length;

  const results: RuleResult[] = [];
  if (have < task.minReadings) {
    results.push(actionError(input, 'MISSING_READING', 'MISSING_READING', { have, need: task.minReadings }));
  }
  const answered = input.answers.some((answer) => answer.taskId === input.taskId && answer.correct);
  if (task.requiresEquivalentAnswer && !answered) {
    results.push(actionError(input, 'MISSING_ANSWER', 'MISSING_ANSWER'));
  }
  return results;
}
