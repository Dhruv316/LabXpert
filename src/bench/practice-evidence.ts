// Which readings of a practice attempt were recorded while the topology check was clean. Pure: it only
// reads the attempt's saved events.
import type { ActionEvent } from '../model/types';

/** The confirmation codes a `CHECKPOINT` event logged (a malformed record counts as none). */
function confirmationsOf(event: ActionEvent): string[] {
  const value: unknown = event.after?.confirmations;
  if (!Array.isArray(value)) return [];
  const list: readonly unknown[] = value;
  return list.filter((code): code is string => typeof code === 'string');
}

/**
 * Ids of the readings recorded while `OK_TOPOLOGY` held (rules-spec §H, `clean_reading_with_topology`).
 *
 * Record reading runs a `RECORD_READING` checkpoint first and saves the reading only when that check found
 * no error, so each saved reading follows one clean checkpoint of the same task. A reading counts when the
 * latest `RECORD_READING` checkpoint before it, for the reading's own task, confirmed `OK_TOPOLOGY`. A
 * checkpoint is used by one reading only. At the same timestamp a checkpoint is taken to come first, since
 * its reading is always saved after it and the clock can give both the same millisecond.
 */
export function topologyOkReadingIds(events: readonly ActionEvent[]): string[] {
  const relevant = events.filter(
    (e) => e.actionType === 'RECORD_READING' || (e.actionType === 'CHECKPOINT' && e.targetId === 'RECORD_READING'),
  );
  const ordered = [...relevant].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    const aFirst = a.actionType === 'CHECKPOINT';
    const bFirst = b.actionType === 'CHECKPOINT';
    if (aFirst !== bFirst) return aFirst ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const ok: string[] = [];
  let pending: ActionEvent | undefined;
  for (const event of ordered) {
    if (event.actionType === 'CHECKPOINT') {
      pending = event;
      continue;
    }
    if (pending !== undefined && pending.taskId === event.taskId && event.targetId !== undefined) {
      if (confirmationsOf(pending).includes('OK_TOPOLOGY')) ok.push(event.targetId);
    }
    pending = undefined;
  }
  return ok;
}

/**
 * Indexes (in the task's `calcPairs`) of the calculation pairs a learner has answered correctly, smallest first.
 * `answers_correct` counts correct answers, so the same pair answered right twice must not count twice; the
 * pair an answer was for is kept in its `SUBMIT_ANSWER` event (`after.pairIndex`), because an `AnswerSubmission`
 * has no field for it.
 */
export function calcPairsAnswered(events: readonly ActionEvent[]): number[] {
  const done = new Set<number>();
  for (const event of events) {
    if (event.actionType !== 'SUBMIT_ANSWER' || event.after?.correct !== true) continue;
    const index: unknown = event.after.pairIndex;
    if (typeof index === 'number' && Number.isInteger(index)) done.add(index);
  }
  return [...done].sort((a, b) => a - b);
}
