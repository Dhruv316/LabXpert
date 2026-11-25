// Turns rule results into the words the tutor panel shows. All text comes from the language files
// through t(); nothing here is written in English.
import { isFeedbackKey, isUiKey, t, UnknownTextKeyError, type Params } from '../../i18n';
import type { ExperimentConfig, FeedbackEntry, RuleResult } from '../../model/types';

/** The name for a part type such as `ammeter`, or undefined when it is not one (a part id like `V` is not a type). */
function componentName(type: string): string | undefined {
  const key = `components.${type}`;
  return isUiKey(key) ? t(key) : undefined;
}

/**
 * Params for `t()`. A list of part types (`MISSING_COMPONENT`'s `types`) is shown by the parts' names
 * joined with ", ", so the student reads "ammeter, voltmeter" and never a code. Some results also carry
 * lists of part ids (`WRONG_POLARITY`'s `componentIds`) that no text uses: those cannot be named, so they
 * are left out. A text that does need one then fails in `t()` with a missing-param error, never with a code on screen.
 */
export function feedbackParams(params: RuleResult['params']): Params {
  const filled: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params ?? {})) {
    if (!Array.isArray(value)) {
      filled[name] = value;
      continue;
    }
    const names = value.map(componentName);
    if (names.every((entry): entry is string => entry !== undefined)) filled[name] = names.join(', ');
  }
  return filled;
}

/** The feedback entry (title, explain, fix, owl) for one rule result, with its params filled in. */
export function feedbackOf(result: RuleResult): FeedbackEntry {
  if (!isFeedbackKey(result.feedbackKey)) throw new UnknownTextKeyError(result.feedbackKey);
  return t(result.feedbackKey, feedbackParams(result.params));
}

/** The task's steps in order, from the keys its configuration lists (so a new experiment needs no code). */
export function instructionSteps(experiment: ExperimentConfig, taskId: string): string[] {
  const task = experiment.tasks.find((candidate) => candidate.id === taskId);
  if (task === undefined) throw new Error(`Experiment ${experiment.id} has no task ${taskId}`);
  return task.instructionKeys.map((key) => {
    if (!isUiKey(key)) throw new UnknownTextKeyError(key);
    return t(key);
  });
}
