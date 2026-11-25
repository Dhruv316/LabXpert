import { practiceProgress, type PracticeProgress } from '../bench/practice-progress';
import type { PracticeEvidence } from '../engine/practice';
import type { CompletionCondition } from '../model/types';
import type { PracticeCurrent, PracticeState } from './practice';

/** The practice attempt on the bench, or undefined when none is open. */
export function selectCurrentPractice(state: Pick<PracticeState, 'current'>): PracticeCurrent | undefined {
  return state.current;
}

// One slot, like the readings selectors: a component that reads the selector gets the same object until the
// task or the evidence changes, so React does not re-render on every store update.
let cached: { condition: CompletionCondition; evidence: PracticeEvidence; result: PracticeProgress } | undefined;

/** "have of need" for the current practice attempt's completion condition; undefined when none is open. */
export function selectPracticeProgress(state: Pick<PracticeState, 'current' | 'evidence'>): PracticeProgress | undefined {
  const condition = state.current?.task.completion;
  if (condition === undefined) return undefined;
  if (cached?.condition === condition && cached.evidence === state.evidence) return cached.result;
  const result = practiceProgress(condition, state.evidence);
  cached = { condition, evidence: state.evidence, result };
  return result;
}
