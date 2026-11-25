import { create } from 'zustand';
import { nextFreeSpot, type Point } from '../bench/geometry';
import { EMPTY_HISTORY, popSnapshot, pushSnapshot, type History } from '../bench/history';
import {
  clearCircuit,
  EMPTY_CIRCUIT,
  findComponent,
  moveComponent,
  moveComponentBy,
  placeComponent,
  removeComponent,
  resetToStart,
} from '../bench/ops';
import { practiceExperiment } from '../bench/practice-start';
import {
  connectWireEvent,
  placeEvent,
  removeEvent,
  removeWireEvent,
  resetEvent,
  setValueEvent,
  toggleSwitchEvent,
  undoEvent,
  type ConnectionMethod,
  type EventContext,
} from '../bench/events';
import {
  setResistorValueOp,
  setSupplyVoltageOp,
  toggleSwitchOp,
  type ValueRejection,
  type ValueResult,
} from '../bench/values';
import { addWire, deleteWire, findWire, terminalPosition, type WireRejection } from '../bench/wires';
import { beginDrawing, dragDrawing, NO_WIRING, pruneWiring, type WiringState } from '../bench/wiring';
import { appNow, commitBenchChange, findInProgressAttempt, newRecordId, startAttempt } from '../db';
import type { LabXpertDB } from '../db/database';
import type {
  ActionEvent,
  Attempt,
  Circuit,
  ComponentType,
  ExperimentConfig,
  PracticeTask,
  TerminalRef,
} from '../model/types';
import { checkPracticeAttempt } from './practice-attempt';

/** Ids and timestamps come from the one allowed helper in src/db; tests pass fixed ones. */
export interface BenchClock {
  now: () => number;
  newId: () => string;
}

const DEFAULT_CLOCK: BenchClock = { now: appNow, newId: newRecordId };

// The same attempt-or-create rule the picker uses. One in-flight lookup per learner and
// experiment, so React's double effect in development cannot start two attempts.
const lookups = new Map<string, Promise<Attempt>>();

export function loadBenchAttempt(
  db: LabXpertDB,
  userId: string,
  experiment: ExperimentConfig,
  clock: BenchClock = DEFAULT_CLOCK,
): Promise<Attempt> {
  const key = `${userId}:${experiment.id}`;
  const pending = lookups.get(key);
  if (pending !== undefined) return pending;
  const run = (async () => {
    const existing = await findInProgressAttempt(db, userId, experiment.id);
    if (existing !== undefined) return existing;
    return startAttempt(db, {
      id: clock.newId(),
      userId,
      experimentId: experiment.id,
      kind: 'experiment',
      startedAt: clock.now(),
    });
  })();
  lookups.set(key, run);
  const forget = () => lookups.delete(key);
  run.then(forget, forget);
  return run;
}

interface Session {
  db: LabXpertDB;
  clock: BenchClock;
  experiment: ExperimentConfig;
  userId: string;
  attemptId: string;
  /** Which kind of attempt is open. Left out, it means an experiment attempt. */
  kind?: Attempt['kind'];
  /**
   * Set only for a practice attempt. `experiment` is then the task's bench experiment with the task's own shelf.
   * `start` is the circuit the attempt began with (the task's prebuilt circuit, or an empty mat): Clear bench goes back to it.
   */
  practice?: { task: PracticeTask; start: Circuit };
}

/** What the last move was, so one drag (or a run of arrow presses on one part) is one Undo step. */
type Gesture =
  | { kind: 'drag'; id: string; base: Circuit; pushed: boolean }
  | { kind: 'nudge'; id: string }
  | undefined;

export interface OpenInput {
  db: LabXpertDB;
  userId: string;
  /** For a practice attempt: the task's bench experiment (`task.benchExperimentId`). */
  experiment: ExperimentConfig;
  clock?: BenchClock;
  /**
   * Opens this practice attempt (already made by `loadPracticeAttempt`) instead of finding or starting an
   * experiment attempt. The saved circuit wins; without one the task's prebuilt circuit is loaded.
   */
  practice?: { attemptId: string; task: PracticeTask };
}

/** How a wire ended: made, dropped, or refused (the reason says which message to show). */
export type FinishWireResult = 'connected' | 'cancelled' | WireRejection;

/** How a value change ended: saved, or already that value (nothing logged), or refused. */
export type SetValueResult = 'changed' | 'unchanged' | ValueRejection;

export interface BenchState extends WiringState {
  session: Session | undefined;
  circuit: Circuit;
  history: History;
  selectedId: string | undefined;
  gesture: Gesture;
  open: (input: OpenInput) => Promise<void>;
  /** Drops the open attempt and its bench from memory. Saved data is untouched. */
  close: () => void;
  select: (id: string | undefined) => void;
  /** Places a part and selects it. `at` is the top-left corner; without it the next free spot is used. */
  place: (type: ComponentType, at?: Point) => Promise<string | undefined>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  undo: () => Promise<void>;
  startDrag: (id: string) => void;
  dragTo: (id: string, x: number, y: number) => void;
  /** Ends a drag. A drag that moved the part saves the circuit once, here and not per pointer move. */
  endDrag: () => Promise<void>;
  /** Moves a part with the keyboard; a burst of presses is saved once. */
  nudge: (id: string, dx: number, dy: number) => Promise<void>;
  /** Starts a wire at a terminal. False when that terminal is not on the bench. */
  startWire: (from: TerminalRef, method: ConnectionMethod) => boolean;
  /** Moves the loose end of the wire being drawn and finds the terminal it would snap to. */
  moveWire: (x: number, y: number) => void;
  /**
   * Ends the wire being drawn at `target` (undefined = released over nothing, which cancels).
   * Undefined when no wire was being drawn. A refused wire logs nothing and sets `wireRejection`;
   * a wire from a terminal to itself stays in progress so the learner can pick another end.
   */
  finishWire: (target: TerminalRef | undefined) => Promise<FinishWireResult | undefined>;
  /** Drops the wire being drawn. False when there was none. */
  cancelWire: () => boolean;
  selectWire: (id: string | undefined) => void;
  removeWire: (id: string) => Promise<boolean>;
  /**
   * Flips a switch and returns whether it is now closed (Part 11 hooks SWITCH_CLOSE on `true`; no
   * checkpoint runs here). Undefined when there is no such switch.
   */
  toggleSwitch: (id: string) => Promise<boolean | undefined>;
  /** Sets the supply voltage (clamped to the range, rounded to the step). Logs `SET_VALUE`; runs no check. */
  setSupplyVoltage: (id: string, volts: number) => Promise<SetValueResult | undefined>;
  /** Sets a resistor to an allowed value. Logs `SET_VALUE`. A locked part or a value not on the list is refused. */
  setResistorValue: (id: string, ohms: number) => Promise<SetValueResult | undefined>;
  /** Hover or focus light on a terminal. Ignored while a wire is being drawn (the snap target owns it). */
  highlightTerminal: (ref: TerminalRef | undefined) => void;
}

// Actions that write to the db run one at a time, in the order they were asked for, so two quick
// presses cannot read the same circuit and overwrite each other.
let queue: Promise<unknown> = Promise.resolve();

/** Also used by the checkpoint runner, so `flushBenchWrites` waits for a checkpoint's saves too. */
export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Resolves when every write asked for so far has finished (tests use it before closing the db). */
export function flushBenchWrites(): Promise<void> {
  return queue.then(
    () => undefined,
    () => undefined,
  );
}

/**
 * The one commit path. Every committed circuit change (place, move end, remove, clear, undo, and
 * the wiring and part edits that come later) saves the new circuit here, with its event when it
 * has one, and only then shows it. A failed save throws and leaves the screen as it was.
 */
async function commit(session: Session, circuit: Circuit, event?: ActionEvent): Promise<boolean> {
  await commitBenchChange(session.db, { attemptId: session.attemptId, circuit, event });
  return useBenchStore.getState().session === session;
}

// Moves are saved after the fact, so several can share one queued save of the latest circuit.
let savePending = false;

function scheduleSave(session: Session): Promise<void> {
  if (savePending) return flushBenchWrites();
  savePending = true;
  return enqueue(async () => {
    savePending = false;
    const state = useBenchStore.getState();
    if (state.session !== session) return;
    await commit(session, state.circuit);
  });
}

function eventContext(session: Session): EventContext {
  return {
    id: session.clock.newId(),
    timestamp: session.clock.now(),
    userId: session.userId,
    attemptId: session.attemptId,
    experimentId: session.experiment.id,
  };
}

/**
 * Saves a value change through the one commit path, then shows it. A refused change and a change to
 * the value the part already has save nothing, log nothing and add no undo step.
 */
async function commitValue(
  field: 'voltage' | 'ohms',
  id: string,
  change: (circuit: Circuit, session: Session) => ValueResult | undefined,
): Promise<SetValueResult | undefined> {
  const { session, circuit } = useBenchStore.getState();
  if (session === undefined) return undefined;
  const result = change(circuit, session);
  if (result === undefined) return undefined;
  if (!result.ok) return result.reason;
  if (result.circuit === circuit) return 'unchanged';
  const event = setValueEvent(eventContext(session), id, field, result.before, result.after);
  if (!(await commit(session, result.circuit, event))) return undefined;
  useBenchStore.setState((s) => ({
    circuit: result.circuit,
    history: pushSnapshot(s.history, circuit),
    gesture: undefined,
  }));
  return 'changed';
}

const FRESH = {
  circuit: EMPTY_CIRCUIT,
  history: EMPTY_HISTORY,
  selectedId: undefined,
  gesture: undefined,
  ...NO_WIRING,
} as const;

const wiringOf = (s: WiringState): WiringState => ({
  drawing: s.drawing,
  highlightedTerminal: s.highlightedTerminal,
  selectedWireId: s.selectedWireId,
  wireRejection: s.wireRejection,
});

export const useBenchStore = create<BenchState>()((set, get) => ({
  session: undefined,
  ...FRESH,

  open: async ({ db, userId, experiment, clock = DEFAULT_CLOCK, practice }) => {
    if (practice !== undefined) {
      if (experiment.id !== practice.task.benchExperimentId) {
        throw new Error(`Practice task ${practice.task.id} runs on ${practice.task.benchExperimentId}, not ${experiment.id}`);
      }
      const saved = await checkPracticeAttempt(db, userId, practice.task, practice.attemptId);
      const start = practice.task.prebuilt ?? EMPTY_CIRCUIT;
      const opened: Session = {
        db,
        clock,
        experiment: practiceExperiment(experiment, practice.task),
        userId,
        attemptId: saved.id,
        kind: 'practice',
        practice: { task: practice.task, start },
      };
      // Same rule as an experiment: the bench in memory stays, a reload restores the saved circuit, and an
      // attempt with nothing saved yet starts from the task's own circuit.
      if (get().session?.attemptId === saved.id) set({ session: opened });
      else set({ session: opened, ...FRESH, circuit: saved.circuit ?? start });
      return;
    }
    const attempt = await loadBenchAttempt(db, userId, experiment, clock);
    const session: Session = { db, clock, experiment, userId, attemptId: attempt.id, kind: attempt.kind };
    // The circuit is saved on the attempt. Coming back to the same attempt keeps the one in memory.
    // A reload starts with no bench in memory, so the saved circuit is restored; undo history is not saved.
    if (get().session?.attemptId === attempt.id) set({ session });
    else set({ session, ...FRESH, circuit: attempt.circuit ?? EMPTY_CIRCUIT });
  },

  close: () => set({ session: undefined, ...FRESH }),

  // A part and a wire are never selected together.
  select: (id) =>
    set((s) => ({ selectedId: id, selectedWireId: undefined, gesture: s.gesture?.kind === 'drag' ? s.gesture : undefined })),

  place: (type, at) =>
    enqueue(async () => {
      const { session, circuit } = get();
      if (session === undefined) return undefined;
      const placed = placeComponent(circuit, session.experiment, type, at ?? nextFreeSpot(circuit, type));
      if (placed === undefined) return undefined;
      // Saved first; the screen only changes once it is.
      if (!(await commit(session, placed.circuit, placeEvent(eventContext(session), placed)))) return undefined;
      set((s) => ({
        circuit: placed.circuit,
        history: pushSnapshot(s.history, circuit),
        selectedId: placed.component.id,
        selectedWireId: undefined,
        gesture: undefined,
      }));
      return placed.component.id;
    }),

  remove: (id) =>
    enqueue(async () => {
      const { session, circuit } = get();
      if (session === undefined) return;
      const removed = removeComponent(circuit, id);
      if (removed === undefined) return;
      if (!(await commit(session, removed.circuit, removeEvent(eventContext(session), removed)))) return;
      set((s) => ({
        circuit: removed.circuit,
        history: pushSnapshot(s.history, circuit),
        selectedId: s.selectedId === id ? undefined : s.selectedId,
        gesture: undefined,
        ...pruneWiring(removed.circuit, wiringOf(s)),
      }));
    }),

  clear: () =>
    enqueue(async () => {
      const { session, circuit } = get();
      if (session === undefined) return;
      // A practice bench keeps its locked parts: Clear goes back to the task's starting circuit instead.
      const cleared = session.practice === undefined ? clearCircuit(circuit) : resetToStart(circuit, session.practice.start);
      if (cleared === undefined) return;
      if (!(await commit(session, cleared.circuit, resetEvent(eventContext(session), cleared)))) return;
      set((s) => ({
        circuit: cleared.circuit,
        history: pushSnapshot(s.history, circuit),
        selectedId: undefined,
        gesture: undefined,
        ...NO_WIRING,
      }));
    }),

  undo: () =>
    enqueue(async () => {
      const { session, circuit, history } = get();
      if (session === undefined) return;
      const popped = popSnapshot(history);
      if (popped === undefined) return;
      if (!(await commit(session, popped.snapshot, undoEvent(eventContext(session), circuit, popped.snapshot)))) return;
      set((s) => ({
        circuit: popped.snapshot,
        history: popped.history,
        selectedId:
          s.selectedId !== undefined && findComponent(popped.snapshot, s.selectedId) !== undefined
            ? s.selectedId
            : undefined,
        gesture: undefined,
        ...pruneWiring(popped.snapshot, wiringOf(s)),
      }));
    }),

  // Moving is not logged (UI_SCREENS): the screen updates at once and the circuit is saved when the move ends.
  startDrag: (id) =>
    set((s) => {
      const part = findComponent(s.circuit, id);
      // Pressing a part selects it, so a selected wire is let go (a part and a wire are never selected together).
      if (part === undefined) return s;
      if (part.locked === true) return { selectedId: id, selectedWireId: undefined };
      return { selectedId: id, selectedWireId: undefined, gesture: { kind: 'drag', id, base: s.circuit, pushed: false } };
    }),

  dragTo: (id, x, y) =>
    set((s) => {
      const g = s.gesture;
      if (g?.kind !== 'drag' || g.id !== id) return s;
      const next = moveComponent(s.circuit, id, x, y);
      if (next === s.circuit) return s;
      return {
        circuit: next,
        history: g.pushed ? s.history : pushSnapshot(s.history, g.base),
        gesture: { ...g, pushed: true },
      };
    }),

  endDrag: () => {
    const { gesture, session } = get();
    set({ gesture: undefined });
    // A click that never moved the part changed nothing, so there is nothing to save.
    if (gesture?.kind !== 'drag' || !gesture.pushed || session === undefined) return Promise.resolve();
    return scheduleSave(session);
  },

  nudge: (id, dx, dy) => {
    const before = get().circuit;
    set((s) => {
      const next = moveComponentBy(s.circuit, id, dx, dy);
      if (next === s.circuit) return s;
      const sameRun = s.gesture?.kind === 'nudge' && s.gesture.id === id;
      return {
        circuit: next,
        history: sameRun ? s.history : pushSnapshot(s.history, s.circuit),
        gesture: { kind: 'nudge', id },
      };
    });
    const { circuit, session } = get();
    if (circuit === before || session === undefined) return Promise.resolve();
    return scheduleSave(session);
  },

  startWire: (from, method) => {
    const drawing = beginDrawing(get().circuit, from, method);
    if (drawing === undefined) return false;
    // The start terminal stays lit so the learner can see where the wire began.
    set({ drawing, highlightedTerminal: from, wireRejection: undefined });
    return true;
  },

  moveWire: (x, y) =>
    set((s) => (s.drawing === undefined ? s : dragDrawing(s.circuit, s.drawing, { x, y }))),

  finishWire: (target) =>
    enqueue(async () => {
      const { session, circuit, drawing } = get();
      if (drawing === undefined) return undefined;
      if (target === undefined) {
        set({ drawing: undefined, highlightedTerminal: undefined });
        return 'cancelled';
      }
      const added = addWire(circuit, drawing.from, target);
      if (added === undefined) {
        set({ drawing: undefined, highlightedTerminal: undefined });
        return 'cancelled';
      }
      if (!added.ok) {
        // Same terminal: keep going so the next click can pick the other end. Duplicate: the wire is over.
        set(added.reason === 'same-terminal' ? { wireRejection: added.reason } : { wireRejection: added.reason, drawing: undefined, highlightedTerminal: undefined });
        return added.reason;
      }
      if (session === undefined) return undefined;
      const event = connectWireEvent(eventContext(session), added.wire, drawing.method);
      if (!(await commit(session, added.circuit, event))) return undefined;
      set((s) => ({
        circuit: added.circuit,
        history: pushSnapshot(s.history, circuit),
        gesture: undefined,
        drawing: undefined,
        highlightedTerminal: undefined,
        wireRejection: undefined,
      }));
      return 'connected';
    }),

  cancelWire: () => {
    if (get().drawing === undefined) return false;
    set({ drawing: undefined, highlightedTerminal: undefined });
    return true;
  },

  selectWire: (id) =>
    set((s) => ({
      selectedWireId: id !== undefined && findWire(s.circuit, id) === undefined ? undefined : id,
      selectedId: undefined,
      gesture: s.gesture?.kind === 'drag' ? s.gesture : undefined,
    })),

  removeWire: (id) =>
    enqueue(async () => {
      const { session, circuit } = get();
      if (session === undefined) return false;
      const deleted = deleteWire(circuit, id);
      if (deleted === undefined) return false;
      if (!(await commit(session, deleted.circuit, removeWireEvent(eventContext(session), deleted.removed)))) return false;
      set((s) => ({
        circuit: deleted.circuit,
        history: pushSnapshot(s.history, circuit),
        gesture: undefined,
        ...pruneWiring(deleted.circuit, wiringOf(s)),
      }));
      return true;
    }),

  toggleSwitch: (id) =>
    enqueue(async () => {
      const { session, circuit } = get();
      if (session === undefined) return undefined;
      const toggled = toggleSwitchOp(circuit, id);
      if (toggled === undefined) return undefined;
      const event = toggleSwitchEvent(eventContext(session), id, !toggled.closed, toggled.closed);
      if (!(await commit(session, toggled.circuit, event))) return undefined;
      set((s) => ({ circuit: toggled.circuit, history: pushSnapshot(s.history, circuit), gesture: undefined }));
      return toggled.closed;
    }),

  setSupplyVoltage: (id, volts) =>
    enqueue(() => commitValue('voltage', id, (circuit, session) => setSupplyVoltageOp(circuit, session.experiment, id, volts))),

  setResistorValue: (id, ohms) =>
    enqueue(() => commitValue('ohms', id, (circuit, session) => setResistorValueOp(circuit, session.experiment, id, ohms))),

  highlightTerminal: (ref) =>
    set((s) => (s.drawing !== undefined || (ref !== undefined && terminalPosition(s.circuit, ref) === undefined) ? s : { highlightedTerminal: ref })),
}));

