import practiceFile from '../../src/spec/practice-tasks.json';
import type { LabXpertDB } from '../../src/db/database';
import { startAttempt } from '../../src/db/attempts';
import { saveEvaluation } from '../../src/db/evaluations';
import { checkpointEvent } from '../../src/bench/events';
import type {
  ActionEvent,
  Checkpoint,
  ErrorCode,
  ExperimentId,
  PracticeTask,
  Reading,
  RuleResult,
} from '../../src/model/types';

export const tasks = practiceFile.tasks as unknown as PracticeTask[];

export function taskById(id: string): PracticeTask {
  const found = tasks.find((t) => t.id === id);
  if (found === undefined) throw new Error(`missing task ${id}`);
  return found;
}

export function err(code: ErrorCode, feedbackKey = `${code}.x`, checkpoint: Checkpoint = 'RECORD_READING'): RuleResult {
  return {
    code,
    severity: 'error',
    stage: 'state',
    checkpoint,
    feedbackKey,
    affected: { componentIds: [], wireIds: [], terminals: [] },
  };
}

/** Ids a, b, c... in call order, so a test can predict them. */
export function idMaker(prefix: string): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}${n}`;
  };
}

export interface EvalOptions {
  attemptId: string;
  results: RuleResult[];
  signature: string;
  timestamp: number;
  checkpoint?: Checkpoint;
  makeId?: () => string;
}

export function evaluate(db: LabXpertDB, o: EvalOptions) {
  return saveEvaluation(db, {
    results: o.results,
    checkpoint: o.checkpoint ?? 'RECORD_READING',
    attemptId: o.attemptId,
    circuitSignature: o.signature,
    actionSignature: '',
    makeId: o.makeId ?? idMaker(`${o.attemptId}-occ-${o.timestamp}-`),
    timestamp: o.timestamp,
  });
}

export function startExperiment(db: LabXpertDB, id: string, experimentId: ExperimentId = 'ohms-law', userId = 'asha') {
  return startAttempt(db, { id, userId, experimentId, kind: 'experiment', startedAt: 1 });
}

export function reading(id: string, attemptId: string, timestamp: number, over: Partial<Reading> = {}): Reading {
  return { id, attemptId, taskId: 't1', supplyVoltage: 6, voltmeter: 6, ammeter: 0.1, timestamp, ...over };
}

/** A `CHECKPOINT` event exactly as the bench writes it (rule codes only), for the Result screen's "What went well". */
export function checkpointRecord(
  attemptId: string,
  id: string,
  timestamp: number,
  taskId: string,
  confirmations: string[],
  errors: string[] = [],
  experimentId: ExperimentId = 'ohms-law',
  userId = 'asha',
): ActionEvent {
  return checkpointEvent({ id, timestamp, userId, attemptId, experimentId }, taskId, 'RECORD_READING', { errors, confirmations });
}
