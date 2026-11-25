// Wiring state that is not part of the saved circuit: the wire being drawn, which terminal is lit,
// and which wire is selected. Pure helpers so the store stays thin.
import { nearestTerminal, terminalPosition, type WireRejection } from './wires';
import type { Point } from './geometry';
import type { ConnectionMethod } from './events';
import type { Circuit, TerminalRef } from '../model/types';

/** A wire in progress. `pointer` is where its loose end is, in workspace coordinates. */
export interface Drawing {
  from: TerminalRef;
  method: ConnectionMethod;
  pointer: Point;
}

export interface WiringState {
  drawing: Drawing | undefined;
  /** The terminal a release or click would connect to right now (the snap target), if any. */
  highlightedTerminal: TerminalRef | undefined;
  selectedWireId: string | undefined;
  /** Why the last wire was refused; cleared by the next wiring action. */
  wireRejection: WireRejection | undefined;
}

export const NO_WIRING: WiringState = {
  drawing: undefined,
  highlightedTerminal: undefined,
  selectedWireId: undefined,
  wireRejection: undefined,
};

export function beginDrawing(circuit: Circuit, from: TerminalRef, method: ConnectionMethod): Drawing | undefined {
  const pointer = terminalPosition(circuit, from);
  return pointer === undefined ? undefined : { from, method, pointer };
}

/** Moves the loose end and finds the snap target. The start terminal is never its own target. */
export function dragDrawing(circuit: Circuit, drawing: Drawing, pointer: Point): Pick<WiringState, 'drawing' | 'highlightedTerminal'> {
  return {
    drawing: { ...drawing, pointer },
    highlightedTerminal: nearestTerminal(circuit, pointer, undefined, drawing.from)?.ref,
  };
}

/**
 * Drops wiring state that points at something a change removed (a part, a wire) so the screen
 * never shows a half-drawn wire from a terminal that is gone. Returns the same object when
 * nothing needed dropping.
 */
export function pruneWiring(circuit: Circuit, wiring: WiringState): WiringState {
  const drawingGone = wiring.drawing !== undefined && terminalPosition(circuit, wiring.drawing.from) === undefined;
  const litGone = wiring.highlightedTerminal !== undefined && terminalPosition(circuit, wiring.highlightedTerminal) === undefined;
  const wireGone = wiring.selectedWireId !== undefined && !circuit.wires.some((w) => w.id === wiring.selectedWireId);
  if (!drawingGone && !litGone && !wireGone) return wiring;
  return {
    ...wiring,
    drawing: drawingGone ? undefined : wiring.drawing,
    highlightedTerminal: drawingGone || litGone ? undefined : wiring.highlightedTerminal,
    selectedWireId: wireGone ? undefined : wiring.selectedWireId,
  };
}
