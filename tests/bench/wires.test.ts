import { describe, expect, it } from 'vitest';
import { moveComponent, removeComponent } from '../../src/bench/ops';
import { popSnapshot, pushSnapshot, EMPTY_HISTORY } from '../../src/bench/history';
import {
  addWire,
  allTerminals,
  deleteWire,
  nearestTerminal,
  nextWireId,
  parseTerminalRef,
  SNAP_RADIUS,
  terminalPosition,
  wireGeometry,
  wirePath,
} from '../../src/bench/wires';
import type { Circuit } from '../../src/model/types';
import { EMPTY_CIRCUIT, ohmsLaw, withPart } from './helpers';

// Supply at (100,100): pos (250,214), neg (150,214). Resistor at (400,100): a (412,138), b (588,138).
function twoParts(): Circuit {
  return withPart(withPart(EMPTY_CIRCUIT, ohmsLaw, 'supply', 100, 100), ohmsLaw, 'resistor', 400, 100);
}

function wired(): Circuit {
  const first = addWire(twoParts(), 'S.pos', 'R.a');
  if (first === undefined || !first.ok) throw new Error('wire refused');
  return first.circuit;
}

describe('terminal positions', () => {
  it('are the part corner plus the offsets in components.json', () => {
    const c = twoParts();
    expect(terminalPosition(c, 'S.pos')).toEqual({ x: 250, y: 214 });
    expect(terminalPosition(c, 'S.neg')).toEqual({ x: 150, y: 214 });
    expect(terminalPosition(c, 'R.a')).toEqual({ x: 412, y: 138 });
    expect(terminalPosition(c, 'R.b')).toEqual({ x: 588, y: 138 });
  });

  it('follow a part when it moves', () => {
    const moved = moveComponent(twoParts(), 'R', 500, 300);
    expect(terminalPosition(moved, 'R.a')).toEqual({ x: 512, y: 338 });
    expect(terminalPosition(moved, 'R.b')).toEqual({ x: 688, y: 338 });
    expect(terminalPosition(moved, 'S.pos')).toEqual({ x: 250, y: 214 });
  });

  it('are undefined for a part or terminal that is not there', () => {
    const c = twoParts();
    expect(terminalPosition(c, 'X.pos')).toBeUndefined();
    expect(terminalPosition(c, 'R.pos')).toBeUndefined();
  });

  it('lists every terminal of every part in part order', () => {
    expect(allTerminals(twoParts()).map((t) => t.ref)).toEqual(['S.pos', 'S.neg', 'R.a', 'R.b']);
  });

  it('splits a reference into part id and terminal', () => {
    expect(parseTerminalRef('R1.a')).toEqual({ componentId: 'R1', name: 'a' });
  });
});

describe('nearest terminal', () => {
  const c = twoParts();
  it('snaps to a terminal inside the radius', () => {
    expect(nearestTerminal(c, { x: 250 + 10, y: 214 - 10 })?.ref).toBe('S.pos');
  });
  it('includes a point exactly on the radius and excludes one just beyond it', () => {
    expect(nearestTerminal(c, { x: 250 + SNAP_RADIUS, y: 214 })?.ref).toBe('S.pos');
    expect(nearestTerminal(c, { x: 250 + SNAP_RADIUS + 0.5, y: 214 })).toBeUndefined();
  });
  it('uses the 24 unit snapRadius from the spec', () => {
    expect(SNAP_RADIUS).toBe(24);
  });
  it('finds nothing in empty space', () => {
    expect(nearestTerminal(c, { x: 800, y: 500 })).toBeUndefined();
  });
  it('picks the closer of two terminals in range', () => {
    // S.neg is 100 left of S.pos; widen the radius so both are in range of a point between them.
    expect(nearestTerminal(c, { x: 210, y: 214 }, 100)?.ref).toBe('S.pos');
    expect(nearestTerminal(c, { x: 190, y: 214 }, 100)?.ref).toBe('S.neg');
    expect(nearestTerminal(c, { x: 230, y: 214 }, 100)?.ref).toBe('S.pos');
  });
  it('can skip one terminal', () => {
    expect(nearestTerminal(c, { x: 250, y: 214 }, SNAP_RADIUS, 'S.pos')).toBeUndefined();
  });
  it('snaps to a terminal at its new place after a move', () => {
    const moved = moveComponent(c, 'R', 500, 300);
    expect(nearestTerminal(moved, { x: 412, y: 138 })).toBeUndefined();
    expect(nearestTerminal(moved, { x: 515, y: 340 })?.ref).toBe('R.a');
  });
});

describe('adding a wire', () => {
  it('adds w1 and keeps the direction it was drawn in', () => {
    const result = addWire(twoParts(), 'S.pos', 'R.a');
    expect(result).toMatchObject({ ok: true, wire: { id: 'w1', from: 'S.pos', to: 'R.a' } });
    if (result?.ok) expect(result.circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]);
  });
  it('does not change the circuit it was given', () => {
    const c = twoParts();
    addWire(c, 'S.pos', 'R.a');
    expect(c.wires).toEqual([]);
  });
  it('rejects a wire from a terminal to itself', () => {
    expect(addWire(twoParts(), 'S.pos', 'S.pos')).toEqual({ ok: false, reason: 'same-terminal' });
  });
  it('rejects a duplicate in the same direction', () => {
    expect(addWire(wired(), 'S.pos', 'R.a')).toEqual({ ok: false, reason: 'duplicate' });
  });
  it('rejects a duplicate in the other direction', () => {
    expect(addWire(wired(), 'R.a', 'S.pos')).toEqual({ ok: false, reason: 'duplicate' });
  });
  it('allows several wires on one terminal (a junction)', () => {
    const second = addWire(wired(), 'S.pos', 'R.b');
    expect(second).toMatchObject({ ok: true, wire: { id: 'w2' } });
  });
  it('allows a wire between two parts’ other terminals', () => {
    expect(addWire(wired(), 'S.neg', 'R.b')?.ok).toBe(true);
  });
  it('returns undefined for a terminal that is not on the bench', () => {
    expect(addWire(twoParts(), 'S.pos', 'V.pos')).toBeUndefined();
    expect(addWire(twoParts(), 'Q.a', 'S.pos')).toBeUndefined();
  });
  it('numbers wires one past the highest in use', () => {
    const c = wired();
    expect(nextWireId(c)).toBe('w2');
    expect(nextWireId({ ...c, wires: [{ id: 'w7', from: 'S.pos', to: 'R.a' }, { id: 'odd', from: 'S.neg', to: 'R.b' }] })).toBe('w8');
    expect(nextWireId(EMPTY_CIRCUIT)).toBe('w1');
  });
});

describe('deleting a wire', () => {
  it('removes just that wire and reports it', () => {
    const two = addWire(wired(), 'S.neg', 'R.b');
    if (two === undefined || !two.ok) throw new Error('wire refused');
    const deleted = deleteWire(two.circuit, 'w1');
    expect(deleted?.removed).toEqual({ id: 'w1', from: 'S.pos', to: 'R.a' });
    expect(deleted?.circuit.wires.map((w) => w.id)).toEqual(['w2']);
    expect(deleted?.circuit.components).toEqual(two.circuit.components);
  });
  it('is undefined for an unknown id', () => {
    expect(deleteWire(wired(), 'w9')).toBeUndefined();
  });
  it('allows the same pair again after the wire is gone', () => {
    const deleted = deleteWire(wired(), 'w1');
    expect(deleted && addWire(deleted.circuit, 'R.a', 'S.pos')?.ok).toBe(true);
  });
});

describe('wires and parts', () => {
  it('stay attached when a part moves: same wires, new ends', () => {
    const moved = moveComponent(wired(), 'R', 600, 400);
    expect(moved.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]);
    const wire = moved.wires[0];
    const path = wire && wirePath(moved, wire);
    expect(path?.d.startsWith('M 250 214 C')).toBe(true);
    expect(path?.d.endsWith('612 438')).toBe(true);
  });
  it('go with a part that is removed', () => {
    const removed = removeComponent(wired(), 'R');
    expect(removed?.circuit.wires).toEqual([]);
    expect(removed?.removedWires.map((w) => w.id)).toEqual(['w1']);
  });
});

describe('undo through history', () => {
  it('undoes a wire add and a wire delete', () => {
    const base = twoParts();
    const added = addWire(base, 'S.pos', 'R.a');
    if (added === undefined || !added.ok) throw new Error('wire refused');
    let history = pushSnapshot(EMPTY_HISTORY, base);
    const deleted = deleteWire(added.circuit, 'w1');
    if (deleted === undefined) throw new Error('no wire');
    history = pushSnapshot(history, added.circuit);

    const undoDelete = popSnapshot(history);
    expect(undoDelete?.snapshot).toBe(added.circuit);
    const undoAdd = undoDelete && popSnapshot(undoDelete.history);
    expect(undoAdd?.snapshot).toBe(base);
    expect(undoAdd?.snapshot.wires).toEqual([]);
  });
});

describe('wire geometry', () => {
  it('is one cubic that starts and ends on the terminals', () => {
    const g = wireGeometry({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(g.d).toBe('M 0 0 C 33.33 18, 66.67 18, 100 0');
    expect(g.length).toBe(100);
  });
  it('sags 0.18 of the distance downward (positive y)', () => {
    const g = wireGeometry({ x: 0, y: 0 }, { x: 100, y: 0 });
    // Control points sit 18 below; the curve itself reaches 0.75 of that at its middle.
    expect(g.mid).toEqual({ x: 50, y: 13.5 });
  });
  it('sags by the distance, not by the horizontal gap', () => {
    const g = wireGeometry({ x: 0, y: 0 }, { x: 30, y: 40 });
    expect(g.length).toBe(50);
    expect(g.d).toBe('M 0 0 C 10 22.33, 20 35.67, 30 40');
    expect(g.mid).toEqual({ x: 15, y: 26.75 });
  });
  it('is symmetric when drawn the other way round (same midpoint)', () => {
    const a = wireGeometry({ x: 10, y: 20 }, { x: 210, y: 120 });
    const b = wireGeometry({ x: 210, y: 120 }, { x: 10, y: 20 });
    expect(a.mid).toEqual(b.mid);
  });
  it('has no sag for a zero-length wire', () => {
    expect(wireGeometry({ x: 5, y: 5 }, { x: 5, y: 5 }).d).toBe('M 5 5 C 5 5, 5 5, 5 5');
  });
  it('is undefined for a wire whose part is gone', () => {
    expect(wirePath(twoParts(), { id: 'w1', from: 'S.pos', to: 'Z.a' })).toBeUndefined();
  });
});
