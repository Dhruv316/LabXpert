// Pure helpers for the equivalent-resistance box: reading what was typed, which feedback key a saved
// answer maps to, and the observed V ÷ I to show. No React, no clock, no student-facing text (keys only).
import type { AnswerSubmission, Reading, TaskConfig } from '../model/types';
import { observedResistance } from './readings';

/**
 * The typed text as a number, or undefined when it is empty or not a number. The number input hands
 * over a clean "12.5" (or "" for anything it cannot read), so a comma decimal is the only extra case.
 */
export function parseAnswer(text: string): number | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * The feedback key for a saved answer: `OK_ANSWER` when right, the series or parallel wording of
 * `EQUIVALENT_R_WRONG` when wrong. Undefined for a task whose topology has no such wording.
 */
export function answerFeedbackKey(task: Pick<TaskConfig, 'requiredTopology'>, correct: boolean): string | undefined {
  if (correct) return 'OK_ANSWER';
  return task.requiredTopology === 'single' ? undefined : `EQUIVALENT_R_WRONG.${task.requiredTopology}`;
}

/**
 * What the line under the box shows: the last reading's V ÷ I to 2 decimals, and only once there is a
 * reading and a submitted answer. Never the expected value, which would give the answer away.
 */
export function observedForLine(readings: readonly Reading[], lastAnswer: AnswerSubmission | undefined): string | undefined {
  if (lastAnswer === undefined) return undefined;
  const observed = observedResistance(readings[readings.length - 1]);
  return observed === undefined ? undefined : observed.toFixed(2);
}
