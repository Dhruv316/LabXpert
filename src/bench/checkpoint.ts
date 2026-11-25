// Pure helpers for running a checkpoint and preparing what the tutor panel and the bench show.
// No React and no student-facing text: they return codes, ids and moods only.
import { BUNDLES, DEFAULT_LANGUAGE } from '../i18n/bundles';
import { UnknownTextKeyError } from '../i18n/errors';
import { parseTerminalRef } from './wires';
import type {
  AnswerSubmission,
  Checkpoint,
  Circuit,
  EvaluateInput,
  ExperimentConfig,
  FeedbackEntry,
  Reading,
  RuleResult,
  TerminalRef,
} from '../model/types';

/** Ollie's mood, as named in the feedback file's `owl` field. */
export type Mood = FeedbackEntry['owl'];

export interface EvaluateParts {
  circuit: Circuit;
  experiment: ExperimentConfig;
  taskId: string;
  checkpoint: Checkpoint;
  /** All readings of the attempt (the engine filters by task id itself). */
  readings: Reading[];
  /** All answers of the attempt. */
  answers: AnswerSubmission[];
  /** Only for `ANSWER_SUBMIT`. */
  submittedAnswer?: number;
}

export function buildEvaluateInput(parts: EvaluateParts): EvaluateInput {
  const input: EvaluateInput = {
    experiment: parts.experiment,
    taskId: parts.taskId,
    circuit: parts.circuit,
    checkpoint: parts.checkpoint,
    readings: parts.readings,
    answers: parts.answers,
  };
  return parts.submittedAnswer === undefined ? input : { ...input, submittedAnswer: parts.submittedAnswer };
}

export interface SplitResults {
  /** Everything that is not a confirmation, in the order `evaluate` returned it. */
  errors: RuleResult[];
  /** The `OK_*` results, in the order `evaluate` returned them. */
  confirmations: RuleResult[];
}

function isConfirmation(result: RuleResult): boolean {
  return result.code.startsWith('OK_');
}

/**
 * The primary error is `errors[0]`. That is the engine's priority order (rules-spec §D): stages run
 * in order and stop at the first one that reports errors, so the first result is the one the engine
 * put first. This function never reorders.
 */
export function splitResults(results: readonly RuleResult[]): SplitResults {
  return {
    errors: results.filter((result) => !isConfirmation(result)),
    confirmations: results.filter(isConfirmation),
  };
}

/** The mood for a primary error (or `happy` when there is none), read from the feedback file's `owl`. */
export function moodOf(primary: RuleResult | undefined): Mood {
  if (primary === undefined) return 'happy';
  const feedback = BUNDLES[DEFAULT_LANGUAGE].feedback;
  // A rule that names a key the feedback file lacks is a data bug; fail like `t()` does.
  if (!Object.hasOwn(feedback, primary.feedbackKey)) throw new UnknownTextKeyError(primary.feedbackKey);
  return feedback[primary.feedbackKey].owl;
}

export interface Highlight {
  componentIds: string[];
  wireIds: string[];
}

export const NO_HIGHLIGHT: Highlight = { componentIds: [], wireIds: [] };

function unique<T>(list: readonly T[]): T[] {
  return [...new Set(list)];
}

/**
 * What to light on the bench for one result: its affected parts, its affected wires, and every wire
 * that touches an affected part or one of its listed terminals (wire ends are terminal refs like `S.pos`).
 */
export function highlightTargets(result: RuleResult, circuit: Circuit): Highlight {
  const componentIds = unique(result.affected.componentIds);
  const parts = new Set<string>(componentIds);
  const terminals = new Set<TerminalRef>(result.affected.terminals);
  const touching = circuit.wires
    .filter((wire) =>
      [wire.from, wire.to].some((end) => terminals.has(end) || parts.has(parseTerminalRef(end).componentId)),
    )
    .map((wire) => wire.id);
  return { componentIds, wireIds: unique([...result.affected.wireIds, ...touching]) };
}

/**
 * The experiment's first task: the fallback when the current task is not known yet. The current task
 * itself comes from the attempt's events (`currentTaskFromEvents`, held in `useTaskStore`).
 */
export function currentTaskId(experiment: ExperimentConfig): string {
  const first = experiment.tasks[0];
  if (first === undefined) throw new Error(`Experiment has no tasks: ${experiment.id}`);
  return first.id;
}
