import type { EvaluateInput, ResistorComponent, RuleResult } from '../model/types';
import { actionError, actionOk } from './stage-support';

/** rules-spec §D Answer check: accepted within ±2% of the formula value. */
const ANSWER_TOLERANCE = 0.02;
/** Absorbs binary rounding so a typed value exactly 2% off (30.6 against 30) is accepted, as the spec's `<=` means. */
const ROUNDING_SLACK = 1e-9;

export interface EquivalentResistanceCheck {
  correct: boolean;
  /** The formula value, for the AnswerSubmission the caller stores. */
  expected: number;
}

export function expectedEquivalentResistance(topology: 'series' | 'parallel', r1: number, r2: number): number {
  return topology === 'series' ? r1 + r2 : (r1 * r2) / (r1 + r2);
}

/** Shared by the bench answer check and the calculation practice tasks (no bench). */
export function checkEquivalentResistance(
  topology: 'series' | 'parallel',
  r1: number,
  r2: number,
  typed: number,
): EquivalentResistanceCheck {
  const expected = expectedEquivalentResistance(topology, r1, r2);
  const correct = Math.abs(typed - expected) <= ANSWER_TOLERANCE * expected + ROUNDING_SLACK * expected;
  return { correct, expected };
}

function resistorValue(input: EvaluateInput, role: 'R1' | 'R2'): number | undefined {
  const found = input.circuit.components.find((c): c is ResistorComponent => c.type === 'resistor' && c.role === role);
  return found?.ohms;
}

/**
 * ANSWER_SUBMIT after Stage 0: uses the current resistor values on the bench. Nothing is returned when
 * there is nothing to judge: no typed number, or a task that has no series/parallel answer.
 */
export function checkAnswer(input: EvaluateInput): RuleResult[] {
  const task = input.experiment.tasks.find((candidate) => candidate.id === input.taskId);
  const topology = task?.requiredTopology;
  const r1 = resistorValue(input, 'R1');
  const r2 = resistorValue(input, 'R2');
  if (topology === undefined || topology === 'single' || input.submittedAnswer === undefined) return [];
  if (r1 === undefined || r2 === undefined) return [];
  const { correct } = checkEquivalentResistance(topology, r1, r2, input.submittedAnswer);
  return correct
    ? [actionOk(input, 'OK_ANSWER')]
    : [actionError(input, 'EQUIVALENT_R_WRONG', `EQUIVALENT_R_WRONG.${topology}`)];
}
