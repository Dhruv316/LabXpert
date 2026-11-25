// Development-only console helper so wires can be seen before wire drawing exists (9B-2).
// In the browser console on the bench:
//   labxpertDev.wireAll()                  joins the placed parts in a ring
//   labxpertDev.wire('S.pos', 'SW.a')      one wire between two terminals (ids as in the spec cases)
// It uses the same store actions as real wiring, so each wire is saved, logged as CONNECT_WIRE
// and undoable. It is absent from a production build and is removed again when the bench closes.
import { allTerminals } from '../../bench/wires';
import { useBenchStore, type FinishWireResult } from '../../state';
import type { TerminalRef } from '../../model/types';

interface LabxpertDev {
  wire: (from: TerminalRef, to: TerminalRef) => Promise<FinishWireResult | undefined>;
  wireAll: () => Promise<number>;
}

declare global {
  interface Window {
    labxpertDev?: LabxpertDev;
  }
}

async function wire(from: TerminalRef, to: TerminalRef): Promise<FinishWireResult | undefined> {
  const store = useBenchStore.getState();
  if (!store.startWire(from, 'click')) return undefined;
  const result = await useBenchStore.getState().finishWire(to);
  // A refused same-terminal wire stays in progress; never leave one dangling.
  useBenchStore.getState().cancelWire();
  return result;
}

/** Last terminal of each part to the first of the next, round in a ring. Returns how many wires were made. */
async function wireAll(): Promise<number> {
  const parts = new Map<string, TerminalRef[]>();
  for (const terminal of allTerminals(useBenchStore.getState().circuit)) {
    parts.set(terminal.componentId, [...(parts.get(terminal.componentId) ?? []), terminal.ref]);
  }
  const groups = [...parts.values()];
  let made = 0;
  for (const [index, group] of groups.entries()) {
    const next = groups[(index + 1) % groups.length];
    const from = group[group.length - 1];
    const to = next?.[0];
    if (from !== undefined && to !== undefined && (await wire(from, to)) === 'connected') made += 1;
  }
  return made;
}

/** Installs the helper in development and returns the cleanup for useEffect. */
export function installDevWiring(): () => void {
  if (!import.meta.env.DEV) return () => undefined;
  window.labxpertDev = { wire, wireAll };
  return () => {
    delete window.labxpertDev;
  };
}
