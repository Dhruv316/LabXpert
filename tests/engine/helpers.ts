import { evaluate } from '../../src/engine/evaluate';
import type {
  AnswerSubmission,
  Checkpoint,
  ExperimentConfig,
  Reading,
  RuleResult,
  TerminalRef,
} from '../../src/model/types';
import { buildCircuit, loadExperiment } from './load-cases';

// Hand-built circuits for the Part 4 tests. Compact parts and wire pairs, as in the spec case files.
export type Part = Parameters<typeof buildCircuit>[0]['components'][number];
export type Wires = [TerminalRef, TerminalRef][];

export const ohms = loadExperiment('ohms-law');
export const seriesParallel = loadExperiment('series-parallel');

export const supply: Part = { id: 'S', type: 'supply', voltage: 6 };
export const closedSwitch: Part = { id: 'SW', type: 'switch', closed: true };
export const resistor: Part = { id: 'R', type: 'resistor', role: 'R', ohms: 10 };
export const r1: Part = { id: 'R1', type: 'resistor', role: 'R1', ohms: 10 };
export const r2: Part = { id: 'R2', type: 'resistor', role: 'R2', ohms: 20 };
export const ammeter: Part = { id: 'A', type: 'ammeter' };
export const voltmeter: Part = { id: 'V', type: 'voltmeter' };

export interface RunOptions {
  checkpoint?: Checkpoint;
  experiment?: ExperimentConfig;
  taskId?: string;
  readings?: Reading[];
  answers?: AnswerSubmission[];
  submittedAnswer?: number;
}

export function run(parts: Part[], wires: Wires, options: RunOptions = {}): RuleResult[] {
  return evaluate({
    experiment: options.experiment ?? ohms,
    taskId: options.taskId ?? 'main',
    circuit: buildCircuit({ components: parts, wires }),
    checkpoint: options.checkpoint ?? 'RECORD_READING',
    readings: options.readings ?? [],
    answers: options.answers ?? [],
    ...(options.submittedAnswer === undefined ? {} : { submittedAnswer: options.submittedAnswer }),
  });
}

/** series-parallel at RECORD_READING for the named task. */
export function runSp(parts: Part[], wires: Wires, taskId: 'series' | 'parallel', more: RunOptions = {}): RuleResult[] {
  return run(parts, wires, { experiment: seriesParallel, taskId, ...more });
}

export const errorKeys = (results: RuleResult[]): string[] =>
  results.filter((result) => result.severity === 'error').map((result) => result.feedbackKey).sort();
export const okKeys = (results: RuleResult[]): string[] =>
  results.filter((result) => result.severity === 'ok').map((result) => result.feedbackKey).sort();

export function reading(taskId: string, supplyVoltage: number, index = 0): Reading {
  return { id: `r-${taskId}-${supplyVoltage}-${index}`, attemptId: 'a', taskId, supplyVoltage, voltmeter: 0, ammeter: 0, timestamp: 0 };
}

export function answer(taskId: string, correct: boolean, index = 0): AnswerSubmission {
  return { id: `a-${taskId}-${index}`, attemptId: 'a', taskId, typed: 0, expected: 0, correct, timestamp: 0 };
}

// Wiring used again and again. Ohm's law: S -> SW -> A -> R -> S, voltmeter across R.
export const ohmsLoop: Wires = [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg']];
export const ohmsParts: Part[] = [supply, closedSwitch, resistor, ammeter, voltmeter];
export const acrossR: Wires = [['V.pos', 'R.a'], ['V.neg', 'R.b']];

// Series task: S -> SW -> R1 -> A -> R2 -> S. J is the junction (R1.b, A.pos); the end nodes are S.pos side and S.neg.
export const seriesParts: Part[] = [supply, closedSwitch, r1, r2, ammeter, voltmeter];
export const seriesLoop: Wires = [['S.pos', 'SW.a'], ['SW.b', 'R1.a'], ['R1.b', 'A.pos'], ['A.neg', 'R2.a'], ['R2.b', 'S.neg']];
export const acrossBoth: Wires = [['V.pos', 'R1.a'], ['V.neg', 'R2.b']];

// Parallel task: both resistors between the same two points, ammeter in the main path.
export const parallelLoop: Wires = [
  ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['R1.a', 'R2.a'], ['R1.b', 'S.neg'], ['R2.b', 'S.neg'],
];
export const acrossPair: Wires = [['V.pos', 'R1.a'], ['V.neg', 'R1.b']];
