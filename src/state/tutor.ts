import { create } from 'zustand';
import {
  buildEvaluateInput,
  highlightTargets,
  moodOf,
  NO_HIGHLIGHT,
  splitResults,
  type Highlight,
  type Mood,
  type SplitResults,
} from '../bench/checkpoint';
import { checkpointEvent } from '../bench/events';
import { appendEvent, listAnswers, listReadings, saveEvaluation } from '../db';
import { evaluate } from '../engine/evaluate';
import { actionSignature, circuitSignature } from '../engine/signature';
import type { Checkpoint, Circuit, RuleResult } from '../model/types';
import { enqueue, useBenchStore } from './bench';
import { selectCurrentTaskId } from './readings-selector';
import { useTaskStore } from './task';

export interface CheckpointOptions {
  /** Only for `ANSWER_SUBMIT`. */
  submittedAnswer?: number;
  /** The task to check; without it the bench's current task is used (see `selectCurrentTaskId`). */
  taskId?: string;
}

export interface TutorState {
  /** `instructions` until the first checkpoint, `results` after it. */
  status: 'instructions' | 'results';
  /** In the engine's priority order; `errors[primaryIndex]` is the big card, the rest are "Also check" chips. */
  errors: RuleResult[];
  confirmations: RuleResult[];
  primaryIndex: number;
  /** What the bench lights up. Cleared when the circuit changes or by Esc; the results stay. */
  highlight: Highlight;
  /** The circuit the results were computed for. Used to tell whether a highlight is still true. */
  checkedCircuit: Circuit | undefined;
  /** Ollie's mood: the primary error's feedback `owl`, or `happy` when there are no errors. */
  mood: Mood;
  /** Set by the screen; the panel itself is not a store concern. */
  panelCollapsed: boolean;
  /** True when there are errors and the panel is collapsed, so the screen can reopen it. */
  mistakeWaiting: boolean;
  /**
   * Runs the rule engine at a checkpoint, saves the outcome (occurrences, resolved updates and, for
   * experiment attempts only, profile counts), logs a `CHECKPOINT` event and updates the panel state.
   * Resolves with the split results, or undefined when no bench is open. The circuit checked is the
   * one on the bench at the moment of the call.
   */
  runCheckpoint: (checkpoint: Checkpoint, options?: CheckpointOptions) => Promise<SplitResults | undefined>;
  /** Moves the big card and the highlight to another error (the "Also check" chips). */
  selectError: (index: number) => void;
  /** Esc: lights nothing; the results stay. */
  clearHighlight: () => void;
  setPanelCollapsed: (collapsed: boolean) => void;
  /** Back to the instructions, for another attempt or experiment. The panel's collapsed state is the screen's and stays. */
  resetTutor: () => void;
}

const INITIAL: Pick<
  TutorState,
  'status' | 'errors' | 'confirmations' | 'primaryIndex' | 'highlight' | 'checkedCircuit' | 'mood' | 'mistakeWaiting'
> = {
  status: 'instructions',
  errors: [],
  confirmations: [],
  primaryIndex: 0,
  highlight: NO_HIGHLIGHT,
  checkedCircuit: undefined,
  mood: 'happy',
  mistakeWaiting: false,
};

export const useTutorStore = create<TutorState>()((set) => ({
  ...INITIAL,
  panelCollapsed: false,

  runCheckpoint: (checkpoint, options = {}) => {
    // Taken now, not when the queued work starts: a later bench change must not be what gets checked.
    const { session, circuit } = useBenchStore.getState();
    if (session === undefined) return Promise.resolve(undefined);
    // Queued with the bench's own writes, so a check always follows the commit that caused it.
    return enqueue(async () => {
      const taskId = options.taskId ?? selectCurrentTaskId(useTaskStore.getState(), session.experiment);
      const [readings, answers] = await Promise.all([
        listReadings(session.db, session.attemptId),
        listAnswers(session.db, session.attemptId),
      ]);
      const results = evaluate(
        buildEvaluateInput({
          circuit,
          experiment: session.experiment,
          taskId,
          checkpoint,
          readings,
          answers,
          submittedAnswer: options.submittedAnswer,
        }),
      );
      const split = splitResults(results);
      const primary: RuleResult | undefined = split.errors[0];
      // Before anything is saved, so a rule with no feedback entry fails without a half-written check.
      const mood = moodOf(primary);

      const timestamp = session.clock.now();
      await saveEvaluation(session.db, {
        results,
        checkpoint,
        attemptId: session.attemptId,
        circuitSignature: circuitSignature(circuit),
        actionSignature: actionSignature(readings.length, answers.length, options.submittedAnswer),
        makeId: session.clock.newId,
        timestamp,
      });
      await appendEvent(
        session.db,
        checkpointEvent(
          {
            id: session.clock.newId(),
            timestamp,
            userId: session.userId,
            attemptId: session.attemptId,
            experimentId: session.experiment.id,
          },
          taskId,
          checkpoint,
          {
            errors: split.errors.map((r) => r.code),
            confirmations: split.confirmations.map((r) => r.code),
          },
        ),
      );

      const bench = useBenchStore.getState();
      // Another attempt was opened while this ran: the check is saved, but this panel is not its place.
      if (bench.session?.attemptId !== session.attemptId) return split;
      // A bench change while saving means the highlight would point at a circuit that is gone.
      const highlight =
        primary !== undefined && bench.circuit === circuit ? highlightTargets(primary, circuit) : NO_HIGHLIGHT;
      set((state) => ({
        status: 'results',
        errors: split.errors,
        confirmations: split.confirmations,
        primaryIndex: 0,
        highlight,
        checkedCircuit: circuit,
        mood,
        mistakeWaiting: split.errors.length > 0 && state.panelCollapsed,
      }));
      return split;
    });
  },

  selectError: (index) =>
    set((state) => {
      const error: RuleResult | undefined = state.errors[index];
      const checked = state.checkedCircuit;
      if (state.status !== 'results' || error === undefined || checked === undefined) return state;
      const current = useBenchStore.getState().circuit === checked;
      return {
        primaryIndex: index,
        mood: moodOf(error),
        highlight: current ? highlightTargets(error, checked) : NO_HIGHLIGHT,
      };
    }),

  clearHighlight: () => set((state) => (state.highlight === NO_HIGHLIGHT ? state : { highlight: NO_HIGHLIGHT })),

  setPanelCollapsed: (collapsed) =>
    set((state) => ({ panelCollapsed: collapsed, mistakeWaiting: state.errors.length > 0 && collapsed })),

  resetTutor: () => set({ ...INITIAL }),
}));

/**
 * What to do after a switch was toggled: closing it runs `SWITCH_CLOSE`, opening it runs nothing
 * (rules-spec §C). `closed` is what `toggleSwitch` resolved with; undefined means no switch changed.
 */
export async function checkAfterSwitchToggle(closed: boolean | undefined): Promise<void> {
  if (closed === true) await useTutorStore.getState().runCheckpoint('SWITCH_CLOSE');
}

// The bench is the source of truth for which attempt and circuit are on screen, so the tutor follows
// it here and no screen has to remember: another attempt starts from the instructions, and any
// change to the circuit puts the highlight out (the results stay until the next checkpoint).
useBenchStore.subscribe((state, previous) => {
  if (state.session?.attemptId !== previous.session?.attemptId) useTutorStore.getState().resetTutor();
  else if (state.circuit !== previous.circuit) useTutorStore.getState().clearHighlight();
});
