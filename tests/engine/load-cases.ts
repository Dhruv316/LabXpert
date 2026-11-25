import type {
  AnswerSubmission,
  Checkpoint,
  Circuit,
  CircuitComponent,
  EvaluateInput,
  ExperimentConfig,
  Reading,
  TerminalRef,
  Wire,
} from '../../src/model/types';

// Shapes of spec/test-cases/_format.md. The JSON is compact: no x, y, and wires are pairs.
type CompactComponent = CircuitComponent extends infer C
  ? C extends CircuitComponent
    ? Omit<C, 'x' | 'y'>
    : never
  : never;

interface CaseExpectation {
  /** feedbackKeys of error results, exact set. */
  errors: string[];
  /** feedbackKeys of ok results, exact set. */
  ok: string[];
  overload?: boolean;
  readings?: { ammeter: number; voltmeter: number };
}

interface RawCase {
  id: string;
  experiment: ExperimentConfig['id'];
  task: string;
  description: string;
  checkpoint: Checkpoint;
  circuit: { components: CompactComponent[]; wires: [TerminalRef, TerminalRef][] };
  history: {
    readings: { taskId: string; supplyVoltage: number }[];
    answers: { taskId: string; typed: number; expected: number; correct: boolean }[];
  };
  submittedAnswer?: number;
  expect: CaseExpectation;
}

export interface LoadedCase {
  id: string;
  description: string;
  circuit: Circuit;
  expect: CaseExpectation;
  /** Ready for evaluate(). Parts 3 and 4 pass this straight in. */
  input: EvaluateInput;
}

const caseFiles = import.meta.glob<{ cases: RawCase[] }>('../../src/spec/test-cases/*.cases.json', {
  eager: true,
  import: 'default',
});
const experimentFiles = import.meta.glob<ExperimentConfig>('../../src/spec/experiments/*.json', {
  eager: true,
  import: 'default',
});

/** Loads spec/experiments/<id>.json. */
export function loadExperiment(id: ExperimentConfig['id']): ExperimentConfig {
  const found = Object.values(experimentFiles).find((experiment) => experiment.id === id);
  if (!found) throw new Error(`No experiment file for "${id}"`);
  return found;
}

/** Adds x: 0, y: 0 to every component and ids w1, w2, ... to the wires, as _format.md says. */
export function buildCircuit(raw: RawCase['circuit']): Circuit {
  const components = raw.components.map((component): CircuitComponent => ({ ...component, x: 0, y: 0 }));
  const wires = raw.wires.map(([from, to], index): Wire => ({ id: `w${index + 1}`, from, to }));
  return { components, wires };
}

// _format.md only gives taskId and supplyVoltage for a reading, so the other fields are fixed fillers.
function buildReadings(raw: RawCase): Reading[] {
  return raw.history.readings.map((reading, index) => ({
    id: `${raw.id}-reading-${index + 1}`,
    attemptId: 'test-attempt',
    taskId: reading.taskId,
    supplyVoltage: reading.supplyVoltage,
    voltmeter: 0,
    ammeter: 0,
    timestamp: 0,
  }));
}

function buildAnswers(raw: RawCase): AnswerSubmission[] {
  return raw.history.answers.map((answer, index) => ({
    id: `${raw.id}-answer-${index + 1}`,
    attemptId: 'test-attempt',
    timestamp: 0,
    ...answer,
  }));
}

function buildCase(raw: RawCase): LoadedCase {
  const experiment = loadExperiment(raw.experiment);
  if (!experiment.tasks.some((task) => task.id === raw.task)) {
    throw new Error(`Case ${raw.id}: experiment "${raw.experiment}" has no task "${raw.task}"`);
  }
  const circuit = buildCircuit(raw.circuit);
  const input: EvaluateInput = {
    experiment,
    taskId: raw.task,
    circuit,
    checkpoint: raw.checkpoint,
    readings: buildReadings(raw),
    answers: buildAnswers(raw),
    ...(raw.submittedAnswer === undefined ? {} : { submittedAnswer: raw.submittedAnswer }),
  };
  return { id: raw.id, description: raw.description, circuit, expect: raw.expect, input };
}

/** Every case in spec/test-cases/*.cases.json, in file order. */
export function loadCases(): LoadedCase[] {
  return Object.values(caseFiles).flatMap((file) => file.cases.map(buildCase));
}
