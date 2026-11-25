// Builds the ActionEvent records for bench actions. Pure: the caller supplies ids and timestamps
// (from the one allowed helper in src/db), so these are easy to test with fixed values.
import type { ClearResult, PlaceResult, RemoveResult } from './ops';
import type { ActionEvent, AnswerSubmission, Checkpoint, Circuit, ExperimentId, Reading, Wire } from '../model/types';

/** The two ways types.ts allows a wire to be made. Keyboard wiring is click-style (pick a terminal, then another). */
export type ConnectionMethod = NonNullable<ActionEvent['connectionMethod']>;

export interface EventContext {
  id: string;
  timestamp: number;
  userId: string;
  attemptId: string;
  experimentId: ExperimentId;
}

function base(context: EventContext): Omit<ActionEvent, 'actionType'> {
  return {
    id: context.id,
    userId: context.userId,
    attemptId: context.attemptId,
    experimentId: context.experimentId,
    timestamp: context.timestamp,
  };
}

export function placeEvent(context: EventContext, placed: PlaceResult): ActionEvent {
  return {
    ...base(context),
    actionType: 'PLACE_COMPONENT',
    targetId: placed.component.id,
    after: { ...placed.component },
  };
}

export function removeEvent(context: EventContext, removed: RemoveResult): ActionEvent {
  return {
    ...base(context),
    actionType: 'REMOVE_COMPONENT',
    targetId: removed.removed.id,
    before: { ...removed.removed, removedWireIds: removed.removedWires.map((w) => w.id) },
  };
}

export function resetEvent(context: EventContext, cleared: ClearResult): ActionEvent {
  return {
    ...base(context),
    actionType: 'RESET_BENCH',
    before: {
      componentIds: cleared.removedComponents.map((c) => c.id),
      wireIds: cleared.removedWires.map((w) => w.id),
    },
  };
}

export function connectWireEvent(context: EventContext, wire: Wire, method: ConnectionMethod): ActionEvent {
  return {
    ...base(context),
    actionType: 'CONNECT_WIRE',
    targetId: wire.id,
    after: { ...wire },
    connectionMethod: method,
  };
}

export function removeWireEvent(context: EventContext, wire: Wire): ActionEvent {
  return { ...base(context), actionType: 'REMOVE_WIRE', targetId: wire.id, before: { ...wire } };
}

function outline(circuit: Circuit): Record<string, unknown> {
  return { componentIds: circuit.components.map((c) => c.id), wireIds: circuit.wires.map((w) => w.id) };
}

export function undoEvent(context: EventContext, before: Circuit, after: Circuit): ActionEvent {
  return { ...base(context), actionType: 'UNDO', before: outline(before), after: outline(after) };
}

export function toggleSwitchEvent(context: EventContext, id: string, wasClosed: boolean, isClosed: boolean): ActionEvent {
  return {
    ...base(context),
    actionType: 'TOGGLE_SWITCH',
    targetId: id,
    before: { closed: wasClosed },
    after: { closed: isClosed },
  };
}

/** The field that changed names the value: `voltage` for a supply, `ohms` for a resistor. */
export function setValueEvent(
  context: EventContext,
  id: string,
  field: 'voltage' | 'ohms',
  before: number,
  after: number,
): ActionEvent {
  return {
    ...base(context),
    actionType: 'SET_VALUE',
    targetId: id,
    before: { [field]: before },
    after: { [field]: after },
  };
}

/** Rule codes only (DECISIONS.md, Part 11A): the Result screen's "What went well" reads `confirmations` from here. */
export interface CheckpointCodes {
  errors: readonly string[];
  confirmations: readonly string[];
}

/** One record per checkpoint run, clean or not. `targetId` is the checkpoint name. */
export function checkpointEvent(
  context: EventContext,
  taskId: string,
  checkpoint: Checkpoint,
  codes: CheckpointCodes,
): ActionEvent {
  return {
    ...base(context),
    taskId,
    actionType: 'CHECKPOINT',
    targetId: checkpoint,
    after: { errors: [...codes.errors], confirmations: [...codes.confirmations] },
  };
}

/** One record per saved reading; `targetId` is the reading's id and `after` holds the three numbers. */
export function recordReadingEvent(context: EventContext, reading: Reading): ActionEvent {
  return {
    ...base(context),
    taskId: reading.taskId,
    actionType: 'RECORD_READING',
    targetId: reading.id,
    after: { supplyVoltage: reading.supplyVoltage, voltmeter: reading.voltmeter, ammeter: reading.ammeter },
  };
}

/** One record per saved answer, right or wrong; `targetId` is the answer's id and `after` holds what was judged. */
export function submitAnswerEvent(context: EventContext, answer: AnswerSubmission): ActionEvent {
  return {
    ...base(context),
    taskId: answer.taskId,
    actionType: 'SUBMIT_ANSWER',
    targetId: answer.id,
    after: { typed: answer.typed, expected: answer.expected, correct: answer.correct },
  };
}

/** The task passed its Finish check. `targetId` and `taskId` are that task. */
export function finishTaskEvent(context: EventContext, taskId: string): ActionEvent {
  return { ...base(context), taskId, actionType: 'FINISH_TASK', targetId: taskId };
}

/**
 * The bench moves on to `toTaskId`. `targetId` is the new task: `currentTaskFromEvents` reads it, so a
 * reload lands on the same task (DECISIONS.md, Part 12A-1).
 */
export function nextTaskEvent(context: EventContext, fromTaskId: string, toTaskId: string): ActionEvent {
  return {
    ...base(context),
    taskId: toTaskId,
    actionType: 'NEXT_TASK',
    targetId: toTaskId,
    before: { taskId: fromTaskId },
    after: { taskId: toTaskId },
  };
}

/** The last task passed: the whole attempt is done. `targetId` is the attempt. */
export function finishAttemptEvent(context: EventContext, lastTaskId: string): ActionEvent {
  return {
    ...base(context),
    taskId: lastTaskId,
    actionType: 'FINISH_ATTEMPT',
    targetId: context.attemptId,
    after: { status: 'completed' },
  };
}
