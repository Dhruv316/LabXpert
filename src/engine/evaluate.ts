import type { EvaluateInput, RuleCode, RuleResult } from '../model/types';
import { checkMissingComponents, checkMissingForAnswer } from './stage0-missing';
import { checkAnswer } from './answer';
import { checkFinish } from './finish';
import { checkHazards } from './stage1-hazards';
import { checkCompleteness } from './stage2-complete';
import { checkMeasurements } from './stage3-measurement';
import { findSupply } from './stage-support';

/** Stages 1 and 2 in order; the first one that reports errors ends the run, otherwise Stage 3 runs (rules-spec §D). */
function runStateStages(input: EvaluateInput, withStage0: boolean): RuleResult[] {
  if (withStage0) {
    const missing = checkMissingComponents(input);
    if (missing.length > 0) return missing;
  }
  // No supply: nothing to evaluate. At RECORD_READING Stage 0 has already reported it.
  if (findSupply(input.circuit) === undefined) return [];
  for (const stage of [checkHazards, checkCompleteness]) {
    const found = stage(input);
    if (found.length > 0) return found;
  }
  return checkMeasurements(input);
}

function runCheckpoint(input: EvaluateInput): RuleResult[] {
  switch (input.checkpoint) {
    case 'SWITCH_CLOSE':
      return runStateStages(input, false);
    case 'RECORD_READING':
      return runStateStages(input, true);
    case 'ANSWER_SUBMIT': {
      const missing = checkMissingForAnswer(input);
      return missing.length > 0 ? missing : checkAnswer(input);
    }
    case 'FINISH':
      return checkFinish(input);
  }
}

/**
 * rules-spec §C and §D. Stops at the first stage that reports errors, then keeps only error results whose
 * code the experiment lists in `activeRules`. Confirmations are never filtered (DECISIONS.md).
 */
export function evaluate(input: EvaluateInput): RuleResult[] {
  const active = new Set<RuleCode>(input.experiment.activeRules);
  return runCheckpoint(input).filter((result) => result.severity !== 'error' || active.has(result.code));
}
