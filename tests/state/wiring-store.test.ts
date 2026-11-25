// Import order matters: tests/db/setup loads fake-indexeddb before Dexie is first imported.
import { disposeTestDbs, makeTestDb } from '../db/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAttemptCircuit } from '../../src/db/attempts';
import { listEvents } from '../../src/db/events';
import type { LabXpertDB } from '../../src/db/database';
import { terminalPosition } from '../../src/bench/wires';
import { flushBenchWrites, useBenchStore } from '../../src/state';
import { fixedClock, ohmsLaw } from '../bench/helpers';

const USER = 'asha';
const get = () => useBenchStore.getState();

function resetStore() {
  useBenchStore.setState(useBenchStore.getInitialState(), true);
}

beforeEach(resetStore);
afterEach(async () => {
  await flushBenchWrites();
  resetStore();
  await disposeTestDbs();
});

async function openBench(db: LabXpertDB) {
  await get().open({ db, userId: USER, experiment: ohmsLaw, clock: fixedClock() });
  const attemptId = get().session?.attemptId;
  if (attemptId === undefined) throw new Error('bench did not open');
  return attemptId;
}

/** Supply at (100,100) and resistor at (400,100): S.pos (250,214), R.a (412,138). */
async function twoParts(db: LabXpertDB) {
  const attemptId = await openBench(db);
  await get().place('supply', { x: 100, y: 100 });
  await get().place('resistor', { x: 400, y: 100 });
  return attemptId;
}

async function click(from: 'S.pos' | 'S.neg', to: 'R.a' | 'R.b' | 'S.pos' | 'S.neg') {
  get().startWire(from, 'click');
  return get().finishWire(to);
}

describe('CONNECT_WIRE', () => {
  it('logs a drag wire with connectionMethod drag and the wire as added', async () => {
    const db = await makeTestDb();
    const attemptId = await twoParts(db);
    expect(get().startWire('S.pos', 'drag')).toBe(true);
    get().moveWire(410, 140); // within 24 of R.a (412,138)
    expect(get().highlightedTerminal).toBe('R.a');
    expect(await get().finishWire(get().highlightedTerminal)).toBe('connected');

    const events = await listEvents(db, attemptId);
    const event = events[events.length - 1];
    expect(event).toMatchObject({
      actionType: 'CONNECT_WIRE',
      targetId: 'w1',
      after: { id: 'w1', from: 'S.pos', to: 'R.a' },
      connectionMethod: 'drag',
      userId: USER,
      attemptId,
      experimentId: 'ohms-law',
    });
    expect(event?.before).toBeUndefined();
    expect(get().circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]);
    expect(get().drawing).toBeUndefined();
    expect(get().highlightedTerminal).toBeUndefined();
  });

  it('logs a click-click wire with connectionMethod click', async () => {
    const db = await makeTestDb();
    const attemptId = await twoParts(db);
    expect(await click('S.neg', 'R.b')).toBe('connected');
    const events = await listEvents(db, attemptId);
    expect(events[events.length - 1]).toMatchObject({ actionType: 'CONNECT_WIRE', connectionMethod: 'click' });
  });

  it('keeps a click-started wire lit at its start terminal until it ends', async () => {
    const db = await makeTestDb();
    await twoParts(db);
    get().startWire('S.pos', 'click');
    expect(get().drawing).toMatchObject({ from: 'S.pos', method: 'click', pointer: { x: 250, y: 214 } });
    expect(get().highlightedTerminal).toBe('S.pos');
  });

  it('does not snap back to the terminal the wire started on', async () => {
    const db = await makeTestDb();
    await twoParts(db);
    get().startWire('S.pos', 'drag');
    get().moveWire(250, 214);
    expect(get().highlightedTerminal).toBeUndefined();
    get().moveWire(700, 500);
    expect(get().highlightedTerminal).toBeUndefined();
    expect(get().drawing?.pointer).toEqual({ x: 700, y: 500 });
  });

  it('cancels with no event when released away from every terminal', async () => {
    const db = await makeTestDb();
    const attemptId = await twoParts(db);
    get().startWire('S.pos', 'drag');
    get().moveWire(800, 500);
    expect(await get().finishWire(get().highlightedTerminal)).toBe('cancelled');
    expect(get().circuit.wires).toEqual([]);
    expect(get().drawing).toBeUndefined();
    expect((await listEvents(db, attemptId)).map((e) => e.actionType)).toEqual(['PLACE_COMPONENT', 'PLACE_COMPONENT']);
  });

  it('cancelWire drops the wire being drawn and says whether there was one', async () => {
    const db = await makeTestDb();
    await twoParts(db);
    expect(get().cancelWire()).toBe(false);
    get().startWire('S.pos', 'click');
    expect(get().cancelWire()).toBe(true);
    expect(get().drawing).toBeUndefined();
    expect(get().highlightedTerminal).toBeUndefined();
  });

  it('refuses to start at a terminal that is not on the bench', async () => {
    const db = await makeTestDb();
    await twoParts(db);
    expect(get().startWire('V.pos', 'click')).toBe(false);
    expect(get().drawing).toBeUndefined();
  });

  it('does nothing when finishing with no wire being drawn', async () => {
    const db = await makeTestDb();
    await twoParts(db);
    expect(await get().finishWire('R.a')).toBeUndefined();
    expect(get().circuit.wires).toEqual([]);
  });
});

describe('refused wires', () => {
  it('a click on the start terminal is refused as same-terminal, logs nothing and keeps the wire going', async () => {
    const db = await makeTestDb();
    const attemptId = await twoParts(db);
    get().startWire('S.pos', 'click');
    expect(await get().finishWire('S.pos')).toBe('same-terminal');
    expect(get().wireRejection).toBe('same-terminal');
    expect(get().drawing).toBeDefined();
    expect(await listEvents(db, attemptId)).toHaveLength(2);
    expect(await get().finishWire('R.a')).toBe('connected');
    expect(get().wireRejection).toBeUndefined();
  });

  it('a duplicate, in either direction, is refused with the duplicate reason and logs nothing', async () => {
    const db = await makeTestDb();
    const attemptId = await twoParts(db);
    await click('S.pos', 'R.a');
    expect(await click('S.pos', 'R.a')).toBe('duplicate');
    expect(get().wireRejection).toBe('duplicate');
    expect(get().drawing).toBeUndefined();
    get().startWire('S.neg', 'click'); // a new start clears the old rejection
    expect(get().wireRejection).toBeUndefined();
    get().cancelWire();

    // the other direction: R.a -> S.pos
    get().startWire('R.a', 'click');
    expect(await get().finishWire('S.pos')).toBe('duplicate');
    expect(get().circuit.wires).toHaveLength(1);
    const kinds = (await listEvents(db, attemptId)).map((e) => e.actionType);
    expect(kinds.filter((k) => k === 'CONNECT_WIRE')).toHaveLength(1);
  });
});

describe('REMOVE_WIRE and undo', () => {
  it('deleting a wire logs REMOVE_WIRE with the wire as it was, and saves', async () => {
    const db = await makeTestDb();
    const attemptId = await twoParts(db);
    await click('S.pos', 'R.a');
    get().selectWire('w1');
    expect(get().selectedWireId).toBe('w1');
    expect(await get().removeWire('w1')).toBe(true);
    expect(get().circuit.wires).toEqual([]);
    expect(get().selectedWireId).toBeUndefined();
    const events = await listEvents(db, attemptId);
    expect(events[events.length - 1]).toMatchObject({
      actionType: 'REMOVE_WIRE',
      targetId: 'w1',
      before: { id: 'w1', from: 'S.pos', to: 'R.a' },
    });
    expect(events[events.length - 1]?.after).toBeUndefined();
    expect((await getAttemptCircuit(db, attemptId))?.wires).toEqual([]);
  });

  it('returns false and logs nothing for an unknown wire', async () => {
    const db = await makeTestDb();
    const attemptId = await twoParts(db);
    expect(await get().removeWire('w9')).toBe(false);
    expect(await listEvents(db, attemptId)).toHaveLength(2);
  });

  it('undoes a wire add and a wire delete, one step each, and logs UNDO', async () => {
    const db = await makeTestDb();
    const attemptId = await twoParts(db);
    await click('S.pos', 'R.a');
    await get().removeWire('w1');
    await get().undo();
    expect(get().circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]);
    await get().undo();
    expect(get().circuit.wires).toEqual([]);
    expect(get().circuit.components).toHaveLength(2);
    const kinds = (await listEvents(db, attemptId)).map((e) => e.actionType);
    expect(kinds.slice(-2)).toEqual(['UNDO', 'UNDO']);
    expect((await getAttemptCircuit(db, attemptId))?.wires).toEqual([]);
  });

  it('drops a wire selection when undo removes that wire', async () => {
    const db = await makeTestDb();
    await twoParts(db);
    await click('S.pos', 'R.a');
    get().selectWire('w1');
    await get().undo();
    expect(get().selectedWireId).toBeUndefined();
  });
});

describe('wires and parts', () => {
  it('keep their wires when a part moves, and the wire ends follow the part', async () => {
    const db = await makeTestDb();
    const attemptId = await twoParts(db);
    await click('S.pos', 'R.a');
    get().startDrag('R');
    get().dragTo('R', 600, 300);
    await get().endDrag();
    expect(get().circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]);
    expect(terminalPosition(get().circuit, 'R.a')).toEqual({ x: 612, y: 338 });
    expect((await getAttemptCircuit(db, attemptId))?.wires).toEqual(get().circuit.wires);
    const kinds = (await listEvents(db, attemptId)).map((e) => e.actionType);
    expect(kinds).not.toContain('REMOVE_WIRE');
  });

  it('a part removed takes its wires, which are listed on REMOVE_COMPONENT and not logged twice', async () => {
    const db = await makeTestDb();
    const attemptId = await twoParts(db);
    await click('S.pos', 'R.a');
    await click('S.neg', 'R.b');
    get().selectWire('w2');
    await get().remove('R');
    expect(get().circuit.wires).toEqual([]);
    expect(get().selectedWireId).toBeUndefined();
    const events = await listEvents(db, attemptId);
    expect(events[events.length - 1]).toMatchObject({
      actionType: 'REMOVE_COMPONENT',
      before: { id: 'R', removedWireIds: ['w1', 'w2'] },
    });
    expect(events.map((e) => e.actionType)).not.toContain('REMOVE_WIRE');
  });

  it('removing the part a wire is being drawn from cancels the drawing', async () => {
    const db = await makeTestDb();
    await twoParts(db);
    get().startWire('R.a', 'click');
    await get().remove('R');
    expect(get().drawing).toBeUndefined();
    expect(get().highlightedTerminal).toBeUndefined();
  });

  it('Clear bench removes the wires and the wiring state', async () => {
    const db = await makeTestDb();
    await twoParts(db);
    await click('S.pos', 'R.a');
    get().selectWire('w1');
    await get().clear();
    expect(get().circuit).toEqual({ components: [], wires: [] });
    expect(get().selectedWireId).toBeUndefined();
  });

  it('selecting a wire deselects the part and the other way round', async () => {
    const db = await makeTestDb();
    await twoParts(db);
    await click('S.pos', 'R.a');
    get().select('S');
    get().selectWire('w1');
    expect(get().selectedId).toBeUndefined();
    expect(get().selectedWireId).toBe('w1');
    get().select('R');
    expect(get().selectedWireId).toBeUndefined();
    expect(get().selectedId).toBe('R');
  });

  it('hover highlight works when idle and is left to the snap target while drawing', async () => {
    const db = await makeTestDb();
    await twoParts(db);
    get().highlightTerminal('R.b');
    expect(get().highlightedTerminal).toBe('R.b');
    get().startWire('S.pos', 'drag');
    get().highlightTerminal('R.b');
    expect(get().highlightedTerminal).toBe('S.pos');
  });
});

describe('saving and reload', () => {
  it('restores wires after a reload, with the next wire id carrying on', async () => {
    const db = await makeTestDb();
    const attemptId = await twoParts(db);
    await click('S.pos', 'R.a');
    await click('S.neg', 'R.b');
    const saved = get().circuit;
    expect(await getAttemptCircuit(db, attemptId)).toEqual(saved);

    resetStore(); // a reload: nothing in memory
    await openBench(db);
    expect(get().circuit).toEqual(saved);
    expect(get().circuit.wires.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(get().drawing).toBeUndefined();
    expect(get().selectedWireId).toBeUndefined();
    get().startWire('S.pos', 'click');
    expect(await get().finishWire('R.b')).toBe('connected');
    expect(get().circuit.wires.map((w) => w.id)).toEqual(['w1', 'w2', 'w3']);
  });

  it('writes nothing to localStorage or sessionStorage', async () => {
    const db = await makeTestDb();
    await twoParts(db);
    await click('S.pos', 'R.a');
    expect(window.localStorage?.length ?? 0).toBe(0);
    expect(window.sessionStorage?.length ?? 0).toBe(0);
  });
});
