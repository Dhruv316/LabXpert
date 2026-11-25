import practiceFile from '../../src/spec/practice-tasks.json';
import type { PracticeEvidence } from '../../src/engine/practice';
import type { ActionEvent, AnswerSubmission, PracticeTask, Reading } from '../../src/model/types';

export const practiceTasks = practiceFile.tasks as unknown as PracticeTask[];

export function practiceTask(id: string): PracticeTask {
  const found = practiceTasks.find((task) => task.id === id);
  if (found === undefined) throw new Error(`missing practice task ${id}`);
  return found;
}

export function reading(id: string, taskId: string, supplyVoltage: number, timestamp: number): Reading {
  return { id, attemptId: 'a1', taskId, supplyVoltage, voltmeter: 1, ammeter: 0.1, timestamp };
}

export function answer(id: string, correct: boolean, timestamp: number): AnswerSubmission {
  return { id, attemptId: 'a1', taskId: 'practice-equivalent-resistance', typed: 1, expected: 1, correct, timestamp };
}

export function evidence(parts: Partial<PracticeEvidence> = {}): PracticeEvidence {
  return { readings: [], topologyOkReadingIds: [], answers: [], ...parts };
}

const base = { userId: 'asha', attemptId: 'a1', experimentId: 'series-parallel' } as const;

/** A `CHECKPOINT` event as the tutor store logs it. */
export function checkpointAt(
  id: string,
  timestamp: number,
  taskId: string,
  confirmations: string[],
  errors: string[] = [],
  checkpoint = 'RECORD_READING',
): ActionEvent {
  return { ...base, id, timestamp, taskId, actionType: 'CHECKPOINT', targetId: checkpoint, after: { errors, confirmations } };
}

/** A `RECORD_READING` event as the readings store logs it. */
export function readingEventAt(id: string, timestamp: number, taskId: string, readingId: string): ActionEvent {
  return { ...base, id, timestamp, taskId, actionType: 'RECORD_READING', targetId: readingId };
}

export function answerEventAt(id: string, timestamp: number, correct: boolean, pairIndex?: number): ActionEvent {
  return {
    ...base,
    id,
    timestamp,
    actionType: 'SUBMIT_ANSWER',
    targetId: `ans-${id}`,
    after: { typed: 1, expected: 1, correct, ...(pairIndex === undefined ? {} : { pairIndex }) },
  };
}
