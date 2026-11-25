import type { Circuit } from '../model/types';

/** Undo depth from UI_SCREENS (top-of-bench toolbar). */
export const HISTORY_LIMIT = 50;

/**
 * Snapshots of the circuit, oldest first. Circuits are never mutated (every op returns a new
 * object), so a snapshot is just a reference and undo restores it exactly.
 */
export type History = readonly Circuit[];

export const EMPTY_HISTORY: History = [];

/** Adds the circuit as it was before an action. The oldest snapshot drops off past the limit. */
export function pushSnapshot(history: History, snapshot: Circuit): History {
  const next = [...history, snapshot];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

export interface Popped {
  snapshot: Circuit;
  history: History;
}

/** Takes the newest snapshot, or undefined when there is nothing to undo. */
export function popSnapshot(history: History): Popped | undefined {
  const snapshot = history[history.length - 1];
  if (snapshot === undefined) return undefined;
  return { snapshot, history: history.slice(0, -1) };
}
