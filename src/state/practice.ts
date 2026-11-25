import { create } from 'zustand';
import { submitAnswerEvent } from '../bench/events';
import { calcPairsAnswered, topologyOkReadingIds } from '../bench/practice-evidence';
import { practiceEvalTaskId } from '../bench/practice-progress';
import { findPracticeTask, PracticeUnavailableError, type PracticeHint } from '../bench/practice-start';
import {
  abandonAttempt,
  commitAnswer,
  completePractice,
  listAnswers,
  listEvents,
  listReadings,
} from '../db';
import type { LabXpertDB } from '../db/database';
import { checkEquivalentResistance } from '../engine/answer';
import { isPracticeComplete, type PracticeEvidence } from '../engine/practice';
import type { AnswerSubmission, ErrorCode, ExperimentConfig, ExperimentId, PracticeTask } from '../model/types';
import { enqueue, flushBenchWrites, useBenchStore, type BenchClock } from './bench';
import { loadPracticeAttempt } from './practice-attempt';
import { useReadingsStore } from './readings';
import { useTaskStore } from './task';

/** How a finished practice attempt ended (rules-spec §G). The completion overlay reads it. */
export interface PracticeCompletion {
  /** No error of the triggering code came up during the attempt (for an extension task: no error at all). */
  clean: boolean;
  /** The code whose count went back to 0, or null when nothing was reset. */
  resetCode: ErrorCode | null;
}

/** The practice attempt on the bench. */
export interface PracticeCurrent {
  attemptId: string;
  recordId: string;
  task: PracticeTask;
  /** The experiment the practice was suggested for: its profile entry is what a clean run resets. */
  experimentId: ExperimentId;
  /** The code that triggered the pick; undefined for an extension task. */
  forCode: ErrorCode | undefined;
  /** The bench configuration in use: the task's bench experiment with the task's own shelf. */
  experiment: ExperimentConfig;
}

/** How a calculation answer ended. The card picks its message from this; nothing here is student text. */
export type CalcAnswerResult =
  | { status: 'invalid' }
  | { status: 'no-practice' }
  | { status: 'not-a-calculation' }
  | { status: 'unknown-pair' }
  /** That pair was already answered correctly: nothing was saved, so it cannot count twice. */
  | { status: 'already-correct' }
  | { status: 'correct'; answer: AnswerSubmission }
  | { status: 'wrong'; answer: AnswerSubmission };

export interface OpenPracticeInput {
  db: LabXpertDB;
  userId: string;
  /** From the route. */
  taskId: string;
  tasks: readonly PracticeTask[];
  experiments: readonly ExperimentConfig[];
  /** Router state from the screen that sent the learner here; used only the first time (see `derivePracticeStart`). */
  hint?: PracticeHint;
  clock?: BenchClock;
}

export interface PracticeState {
  current: PracticeCurrent | undefined;
  /** What the attempt has produced so far, read from its saved records (not from the screen's tables). */
  evidence: PracticeEvidence;
  /** Indexes of the `calcPairs` answered correctly. */
  calcDone: number[];
  /** Set once, when the completion condition is met and `completePractice` has saved it. */
  completion: PracticeCompletion | undefined;
  /** A failed background save (the completion write). The screen sends it to the error boundary, like `loadError`. */
  error: Error | undefined;
  /**
   * Opens `/practice/:taskId`: the learner's in-progress attempt for the task or a new one, and the bench in
   * practice mode. Rejects with `PracticeUnavailableError` for an unknown task (the screen shows not-found).
   */
  open: (input: OpenPracticeInput) => Promise<void>;
  /** Check on a calculation card: judges with `checkEquivalentResistance`, saves the answer (right or wrong) and its event. */
  submitCalcAnswer: (pairIndex: number, value: number) => Promise<CalcAnswerResult>;
  /** Leave practice: the attempt becomes `abandoned` (unless it was completed) and the practice state is cleared. */
  leavePractice: () => Promise<void>;
}

const NO_EVIDENCE: PracticeEvidence = { readings: [], topologyOkReadingIds: [], answers: [] };

const CLEARED: Pick<PracticeState, 'current' | 'evidence' | 'calcDone' | 'completion' | 'error'> = {
  current: undefined,
  evidence: NO_EVIDENCE,
  calcDone: [],
  completion: undefined,
  error: undefined,
};

async function loadRecords(db: LabXpertDB, attemptId: string) {
  const [readings, answers, events] = await Promise.all([
    listReadings(db, attemptId),
    listAnswers(db, attemptId),
    listEvents(db, attemptId),
  ]);
  const evidence: PracticeEvidence = { readings, answers, topologyOkReadingIds: topologyOkReadingIds(events) };
  return { evidence, calcDone: calcPairsAnswered(events) };
}

/**
 * Reads the attempt's saved records, updates the progress, points the bench at the task id the next check should
 * use, and completes the practice once when the condition is met. Runs inside the bench's write queue, so it
 * always sees a finished save, and two of them never run at once: the second one finds `completion` set.
 */
async function sync(): Promise<void> {
  const { current } = usePracticeStore.getState();
  const session = useBenchStore.getState().session;
  if (current === undefined || session === undefined || session.attemptId !== current.attemptId) return;
  const { evidence, calcDone } = await loadRecords(session.db, current.attemptId);
  // The learner moved to another attempt while this read: its own sync owns the state now.
  if (useBenchStore.getState().session?.attemptId !== current.attemptId) return;
  usePracticeStore.setState({ evidence, calcDone });
  useTaskStore.getState().setTaskId(practiceEvalTaskId(current.task, current.experiment, evidence));

  if (usePracticeStore.getState().completion !== undefined) return;
  if (!isPracticeComplete(current.task.completion, evidence)) return;
  const result = await completePractice(session.db, {
    attemptId: current.attemptId,
    task: current.task,
    topologyOkReadingIds: evidence.topologyOkReadingIds,
    completedAt: session.clock.now(),
  });
  if (!result.completed) return;
  if (useBenchStore.getState().session?.attemptId !== current.attemptId) return;
  usePracticeStore.setState({ completion: { clean: result.clean, resetCode: result.resetCode } });
}

/** Queued after a change nobody awaits (a reading recorded); a failure waits in `error` for the screen. */
function scheduleSync(): Promise<void> {
  return enqueue(sync).catch((error: unknown) => {
    usePracticeStore.setState({ error: error instanceof Error ? error : new Error(String(error)) });
  });
}

export const usePracticeStore = create<PracticeState>()((set, get) => ({
  ...CLEARED,

  open: async ({ db, userId, taskId, tasks, experiments, hint, clock }) => {
    const task = findPracticeTask(tasks, taskId);
    if (task === undefined) throw new PracticeUnavailableError('unknown-task', taskId);
    const experiment = experiments.find((candidate) => candidate.id === task.benchExperimentId);
    if (experiment === undefined) throw new PracticeUnavailableError('unknown-experiment', taskId);

    const { attempt, record } = await loadPracticeAttempt(db, { userId, task, tasks, hint, clock });
    await useBenchStore.getState().open({ db, userId, experiment, clock, practice: { attemptId: attempt.id, task } });
    const session = useBenchStore.getState().session;
    if (session?.attemptId !== attempt.id) return;
    // The bench queues the loading of the attempt's readings; ours goes after it and has the last word on the task id.
    await flushBenchWrites();
    if (useBenchStore.getState().session?.attemptId !== attempt.id) return;
    set({
      ...CLEARED,
      current: {
        attemptId: attempt.id,
        recordId: record.id,
        task,
        experimentId: attempt.experimentId,
        forCode: record.forCode,
        experiment: session.experiment,
      },
    });
    // Also covers a reload after the last reading was saved but before the completion was.
    await enqueue(sync);
  },

  submitCalcAnswer: async (pairIndex, value) => {
    if (!Number.isFinite(value)) return { status: 'invalid' };
    await flushBenchWrites();
    return enqueue(async (): Promise<CalcAnswerResult> => {
      const { current, calcDone } = get();
      const session = useBenchStore.getState().session;
      if (current === undefined || session === undefined || session.attemptId !== current.attemptId) {
        return { status: 'no-practice' };
      }
      if (current.task.kind !== 'calculation') return { status: 'not-a-calculation' };
      const pair = current.task.calcPairs?.[pairIndex];
      if (pair === undefined) return { status: 'unknown-pair' };
      if (calcDone.includes(pairIndex)) return { status: 'already-correct' };

      const checked = checkEquivalentResistance(pair.topology, pair.r1, pair.r2, value);
      const timestamp = session.clock.now();
      // There is no experiment task for a calculation card, so the answer carries the practice task's id.
      const answer: AnswerSubmission = {
        id: session.clock.newId(),
        attemptId: current.attemptId,
        taskId: current.task.id,
        typed: value,
        expected: checked.expected,
        correct: checked.correct,
        timestamp,
      };
      const logged = submitAnswerEvent(
        {
          id: session.clock.newId(),
          timestamp,
          userId: session.userId,
          attemptId: session.attemptId,
          experimentId: session.experiment.id,
        },
        answer,
      );
      // Saved before anything on screen changes; a failure rejects and leaves the state as it was.
      await commitAnswer(session.db, answer, { ...logged, after: { ...logged.after, pairIndex } });
      if (useBenchStore.getState().session?.attemptId === current.attemptId) {
        useReadingsStore.setState((state) => ({ answers: [...state.answers, answer] }));
        await sync();
      }
      return checked.correct ? { status: 'correct', answer } : { status: 'wrong', answer };
    });
  },

  leavePractice: () =>
    enqueue(async () => {
      const { current, completion } = get();
      if (current === undefined) return;
      const session = useBenchStore.getState().session;
      // A finished attempt stays finished; only an unfinished one is abandoned.
      if (completion === undefined && session?.attemptId === current.attemptId) {
        await abandonAttempt(session.db, current.attemptId, session.clock.now());
      }
      useBenchStore.getState().close();
      set({ ...CLEARED });
    }),
}));

// The readings store follows the bench; this follows the readings store. Any change to the attempt's readings or
// answers (a reading recorded, an answer submitted, or the first load) re-reads the evidence and, when the condition
// is met, completes the practice. Loading and completing are queued with the bench's writes.
useReadingsStore.subscribe((state, previous) => {
  if (state.readings === previous.readings && state.answers === previous.answers) return;
  void scheduleSync();
});

// Opening another attempt (an experiment) or closing the bench drops the practice state. The attempt itself stays
// in progress, so coming back to it resumes it.
useBenchStore.subscribe((state, previous) => {
  const attemptId = state.session?.attemptId;
  if (attemptId === previous.session?.attemptId) return;
  if (usePracticeStore.getState().current?.attemptId !== attemptId) usePracticeStore.setState({ ...CLEARED });
});
