// Pure helpers for a practice attempt's progress and for the task id the bench checks it with.
// No React, no clock, no student-facing text. They only read evidence; completion itself stays in
// src/engine/practice.ts (`isPracticeComplete`).
import { isPracticeComplete, type PracticeEvidence } from '../engine/practice';
import type { CompletionCondition, ExperimentConfig, PracticeTask } from '../model/types';

/** How far a condition is: `have` of `need`, never more than `need`. A screen shows it as "1 of 3". */
export interface PracticeProgress {
  have: number;
  need: number;
}

const VOLTAGE_EPSILON = 1e-9;

/**
 * Progress towards one completion condition (rules-spec §H).
 * - `reading_recorded`: readings recorded, out of `min`.
 * - `readings_at_voltages`: listed voltages that have a reading, out of the list's length.
 * - `clean_reading_with_topology`: 0 or 1.
 * - `answers_correct`: correct answers, out of `count`.
 * - `sequence`: steps done in order, out of the number of steps. A later step that is already met
 *   does not count until every step before it is met by evidence that came before it.
 */
export function practiceProgress(condition: CompletionCondition, evidence: PracticeEvidence): PracticeProgress {
  switch (condition.type) {
    case 'reading_recorded': {
      const need = Math.max(condition.min, 0);
      return { have: Math.min(evidence.readings.length, need), need };
    }
    case 'readings_at_voltages': {
      const have = condition.voltages.filter((voltage) =>
        evidence.readings.some((r) => Math.abs(r.supplyVoltage - voltage) < VOLTAGE_EPSILON),
      ).length;
      return { have, need: condition.voltages.length };
    }
    case 'clean_reading_with_topology': {
      const ok = new Set(evidence.topologyOkReadingIds);
      const met = evidence.readings.some((r) => r.taskId === condition.taskId && ok.has(r.id));
      return { have: met ? 1 : 0, need: 1 };
    }
    case 'answers_correct': {
      const need = Math.max(condition.count, 0);
      return { have: Math.min(evidence.answers.filter((a) => a.correct).length, need), need };
    }
    case 'sequence':
      return { have: stepsDoneInOrder(condition.steps, evidence), need: condition.steps.length };
  }
}

/** The longest run of steps, from the first, that `isPracticeComplete` accepts as a sequence. */
function stepsDoneInOrder(steps: readonly CompletionCondition[], evidence: PracticeEvidence): number {
  let done = 0;
  while (done < steps.length && isPracticeComplete({ type: 'sequence', steps: steps.slice(0, done + 1) }, evidence)) {
    done += 1;
  }
  return done;
}

/** The `clean_reading_with_topology` task ids in a condition, in the order a learner has to meet them. */
function topologyTaskIds(condition: CompletionCondition): string[] {
  switch (condition.type) {
    case 'clean_reading_with_topology':
      return [condition.taskId];
    case 'sequence':
      return condition.steps.flatMap(topologyTaskIds);
    default:
      return [];
  }
}

/** The first step the learner has not yet met, looking inside nested sequences; undefined when all are met. */
function firstUnmetTopologyTask(condition: CompletionCondition, evidence: PracticeEvidence): string | undefined {
  if (condition.type === 'clean_reading_with_topology') {
    return isPracticeComplete(condition, evidence) ? undefined : condition.taskId;
  }
  if (condition.type !== 'sequence') return undefined;
  const done = stepsDoneInOrder(condition.steps, evidence);
  const next = condition.steps[done];
  return next === undefined ? undefined : firstUnmetTopologyTask(next, evidence);
}

/**
 * The experiment task id a practice bench checks and saves readings with. The engine looks tasks up in
 * the bench experiment's `tasks`, so a practice task's own id cannot be used.
 * - A condition with `clean_reading_with_topology` steps uses the first step not yet met (so a
 *   series-then-parallel task checks "series" first and "parallel" after), or the last step once all are met.
 * - Any other condition uses the experiment's first task.
 */
export function practiceEvalTaskId(task: PracticeTask, experiment: ExperimentConfig, evidence: PracticeEvidence): string {
  const ids = topologyTaskIds(task.completion);
  const id = firstUnmetTopologyTask(task.completion, evidence) ?? ids[ids.length - 1] ?? experiment.tasks[0]?.id;
  // A task id the experiment lacks is a data bug; failing here beats checking the wrong task silently.
  if (id === undefined || !experiment.tasks.some((candidate) => candidate.id === id)) {
    throw new Error(`Practice task ${task.id} names a task that experiment ${experiment.id} does not have: ${id ?? 'none'}`);
  }
  return id;
}
