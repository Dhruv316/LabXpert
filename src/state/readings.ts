import { create } from 'zustand';
import { currentTaskFromEvents, supplyVoltage, canRecordReading, calculatedEquivalent } from '../bench/readings';
import {
  finishAttemptEvent,
  finishTaskEvent,
  nextTaskEvent,
  recordReadingEvent,
  submitAnswerEvent,
  type EventContext,
} from '../bench/events';
import { liveState } from '../bench/live';
import { answerOutcome, findTask, nextTaskId } from '../bench/task-flow';
import {
  commitAnswer,
  commitAttemptFinish,
  commitEvents,
  commitReading,
  getAttempt,
  listAnswers,
  listEvents,
  listReadings,
} from '../db';
import type { AnswerSubmission, Reading } from '../model/types';
import { enqueue, flushBenchWrites, useBenchStore, type BenchState } from './bench';
import { selectCurrentTaskId } from './readings-selector';
import { useTaskStore } from './task';
import { useTutorStore } from './tutor';

/** How Record reading ended. The screen picks its message from this; nothing here is student text. */
export type RecordReadingResult =
  | { status: 'needs-voltage' }
  | { status: 'no-bench' }
  /** The check found an error: nothing was saved and the results are in the tutor store. */
  | { status: 'blocked' }
  | { status: 'recorded'; reading: Reading };

/** How Check on the equivalent-resistance box ended. The dock picks its message from this. */
export type SubmitAnswerResult =
  /** Not a finite number: nothing was run or saved. */
  | { status: 'invalid' }
  | { status: 'no-bench' }
  /** The current task has no equivalent-resistance answer: nothing was run or saved. */
  | { status: 'not-needed' }
  /** The check found an error before judging (a resistor is missing): nothing was saved and the results are in the tutor store. */
  | { status: 'blocked' }
  | { status: 'correct'; answer: AnswerSubmission }
  | { status: 'wrong'; answer: AnswerSubmission };

/** How Finish experiment or Next task ended. */
export type FinishResult =
  | { status: 'no-bench' }
  /** A practice attempt (no Finish button there) or an attempt that is no longer in progress: nothing ran. */
  | { status: 'not-available' }
  /** The check found `MISSING_READING` and/or `MISSING_ANSWER`: the results are in the tutor store, nothing else changed. */
  | { status: 'blocked' }
  /** The bench moved on to `taskId`; the circuit is as it was. */
  | { status: 'next-task'; taskId: string }
  /** The last task is done and the attempt is marked finished. */
  | { status: 'finished'; attemptId: string };

export interface ReadingsState {
  /** All the attempt's readings (every task), oldest first. Use `selectTaskReadings` for the current task. */
  readings: Reading[];
  answers: AnswerSubmission[];
  /** Set when loading the attempt's records failed; the screen sends it to the error boundary. */
  loadError: Error | undefined;
  recordReading: () => Promise<RecordReadingResult>;
  /**
   * Check on the equivalent-resistance box: runs `ANSWER_SUBMIT`, saves the answer (right or wrong) with its
   * event and updates `answers`. A wrong answer can be tried again any number of times.
   */
  submitAnswer: (value: number) => Promise<SubmitAnswerResult>;
  /** Finish experiment (last task) or Next task: runs the `FINISH` checkpoint and, when it is clean, moves on or ends the attempt. */
  finish: () => Promise<FinishResult>;
}

const EMPTY: Pick<ReadingsState, 'readings' | 'answers' | 'loadError'> = { readings: [], answers: [], loadError: undefined };

function contextOf(session: NonNullable<BenchState['session']>, timestamp: number): EventContext {
  return {
    id: session.clock.newId(),
    timestamp,
    userId: session.userId,
    attemptId: session.attemptId,
    experimentId: session.experiment.id,
  };
}

// One Finish at a time: a second press while the first is still working gets the first one's answer.
let finishing: Promise<FinishResult> | undefined;

async function runFinish(): Promise<FinishResult> {
  await flushBenchWrites();
  const { session } = useBenchStore.getState();
  if (session === undefined) return { status: 'no-bench' };

  const attempt = await getAttempt(session.db, session.attemptId);
  if (attempt === undefined) throw new Error(`Attempt not found: ${session.attemptId}`);
  // The practice flow has no Finish button, and an attempt that already ended cannot end again.
  if (attempt.kind !== 'experiment' || attempt.status !== 'in_progress') return { status: 'not-available' };
  if (useBenchStore.getState().session?.attemptId !== session.attemptId) return { status: 'no-bench' };

  const { experiment } = session;
  const taskId = selectCurrentTaskId(useTaskStore.getState(), experiment);
  if (findTask(experiment, taskId) === undefined) throw new Error(`Unknown task: ${taskId}`);
  const next = nextTaskId(experiment, taskId);

  const split = await useTutorStore.getState().runCheckpoint('FINISH', { taskId });
  if (split === undefined) return { status: 'no-bench' };
  if (split.errors.length > 0) return { status: 'blocked' };

  return enqueue(async (): Promise<FinishResult> => {
    // Each event gets its own time, taken in the order they are logged.
    const finished = finishTaskEvent(contextOf(session, session.clock.now()), taskId);
    const stillOpen = () => useBenchStore.getState().session?.attemptId === session.attemptId;

    if (next !== undefined) {
      await commitEvents(session.db, [finished, nextTaskEvent(contextOf(session, session.clock.now()), taskId, next)]);
      // The bench and the circuit are left exactly as they are; only the task and the panel change.
      if (stillOpen()) {
        useTaskStore.getState().setTaskId(next);
        useTutorStore.getState().resetTutor();
      }
      return { status: 'next-task', taskId: next };
    }

    const ended = finishAttemptEvent(contextOf(session, session.clock.now()), taskId);
    await commitAttemptFinish(session.db, session.attemptId, [finished, ended], ended.timestamp);
    return { status: 'finished', attemptId: session.attemptId };
  });
}

export const useReadingsStore = create<ReadingsState>()(() => ({
  ...EMPTY,

  recordReading: async () => {
    // Waits for the attempt's records to finish loading, so the current task is known.
    await flushBenchWrites();
    const { session, circuit } = useBenchStore.getState();
    if (session === undefined) return { status: 'no-bench' };
    if (!canRecordReading(circuit)) return { status: 'needs-voltage' };

    const taskId = selectCurrentTaskId(useTaskStore.getState(), session.experiment);
    // The check runs on the bench as it is now and before the new reading exists.
    const split = await useTutorStore.getState().runCheckpoint('RECORD_READING', { taskId });
    if (split === undefined) return { status: 'no-bench' };
    if (split.errors.length > 0) return { status: 'blocked' };

    const shown = liveState(circuit, session.experiment).rounded;
    const supply = supplyVoltage(circuit);
    // A clean check needs a supply and both meters (Stage 0), so this cannot happen on a checked bench.
    if (supply === undefined || shown.ammeter === null || shown.voltmeter === null) {
      throw new Error('A clean check left no supply or meter to read');
    }
    const { ammeter, voltmeter } = shown;

    return enqueue(async () => {
      const timestamp = session.clock.now();
      const reading: Reading = {
        id: session.clock.newId(),
        attemptId: session.attemptId,
        taskId,
        supplyVoltage: supply,
        voltmeter,
        ammeter,
        timestamp,
      };
      const event = recordReadingEvent(
        {
          id: session.clock.newId(),
          timestamp,
          userId: session.userId,
          attemptId: session.attemptId,
          experimentId: session.experiment.id,
        },
        reading,
      );
      // Saved before the table changes (Global behaviour); a failure rejects and leaves the table as it was.
      await commitReading(session.db, reading, event);
      if (useBenchStore.getState().session?.attemptId === session.attemptId) {
        useReadingsStore.setState((state) => ({ readings: [...state.readings, reading] }));
      }
      return { status: 'recorded', reading };
    });
  },

  submitAnswer: async (value) => {
    // Nothing runs for a value that is not a number (the field's own message is the screen's job).
    if (!Number.isFinite(value)) return { status: 'invalid' };
    await flushBenchWrites();
    const { session, circuit } = useBenchStore.getState();
    if (session === undefined) return { status: 'no-bench' };

    const taskId = selectCurrentTaskId(useTaskStore.getState(), session.experiment);
    const task = findTask(session.experiment, taskId);
    if (task === undefined || !task.requiresEquivalentAnswer) return { status: 'not-needed' };

    // The check runs on the circuit read above (it takes the bench's circuit in the same tick).
    const split = await useTutorStore.getState().runCheckpoint('ANSWER_SUBMIT', { taskId, submittedAnswer: value });
    if (split === undefined) return { status: 'no-bench' };
    const outcome = answerOutcome(split.errors, split.confirmations);
    if (outcome === 'blocked') return { status: 'blocked' };

    // Stage 0 for an answer needs R1 and R2, so a judged answer always has a formula value.
    const expected = calculatedEquivalent(circuit, task);
    if (expected === undefined) throw new Error('A judged answer left no resistors to calculate from');
    const correct = outcome === 'correct';

    return enqueue(async (): Promise<SubmitAnswerResult> => {
      const timestamp = session.clock.now();
      const answer: AnswerSubmission = {
        id: session.clock.newId(),
        attemptId: session.attemptId,
        taskId,
        typed: value,
        expected,
        correct,
        timestamp,
      };
      // Saved before the table changes; a failure rejects and leaves the table as it was.
      await commitAnswer(session.db, answer, submitAnswerEvent(contextOf(session, timestamp), answer));
      if (useBenchStore.getState().session?.attemptId === session.attemptId) {
        useReadingsStore.setState((state) => ({ answers: [...state.answers, answer] }));
      }
      return correct ? { status: 'correct', answer } : { status: 'wrong', answer };
    });
  },

  finish: () => {
    if (finishing !== undefined) return finishing;
    const run = runFinish();
    finishing = run;
    const clear = () => {
      if (finishing === run) finishing = undefined;
    };
    run.then(clear, clear);
    return run;
  },
}));

// The bench says which attempt is open, so the records follow it here and no screen has to remember.
// Loading is queued with the bench's writes, so anything asked for after the bench opens sees it done.
useBenchStore.subscribe((state, previous) => {
  const session = state.session;
  if (session?.attemptId === previous.session?.attemptId) return;
  useTaskStore.getState().setTaskId(undefined);
  useReadingsStore.setState({ ...EMPTY });
  if (session === undefined) return;
  enqueue(async () => {
    const [readings, answers, events] = await Promise.all([
      listReadings(session.db, session.attemptId),
      listAnswers(session.db, session.attemptId),
      listEvents(session.db, session.attemptId),
    ]);
    // Another attempt was opened while this ran: its own load owns the stores now.
    if (useBenchStore.getState().session?.attemptId !== session.attemptId) return;
    useTaskStore.getState().setTaskId(currentTaskFromEvents(session.experiment, events));
    useReadingsStore.setState({ readings, answers, loadError: undefined });
  }).catch((error: unknown) => {
    useReadingsStore.setState({ loadError: error instanceof Error ? error : new Error(String(error)) });
  });
});
