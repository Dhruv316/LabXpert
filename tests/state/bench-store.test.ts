// Import order matters: tests/db/setup loads fake-indexeddb before Dexie is first imported.
import { disposeTestDbs, makeTestDb } from '../db/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_LIMIT } from '../../src/bench/history';
import { getAttemptCircuit, startAttempt } from '../../src/db/attempts';
import { listEvents } from '../../src/db/events';
import type { LabXpertDB } from '../../src/db/database';
import type { ActionType, Circuit } from '../../src/model/types';
import { flushBenchWrites, useBenchStore } from '../../src/state';
import { fixedClock, ohmsLaw, seriesParallel } from '../bench/helpers';

const USER = 'asha';

function resetStore() {
  useBenchStore.setState(useBenchStore.getInitialState(), true);
}

beforeEach(resetStore);
afterEach(async () => {
  await flushBenchWrites();
  resetStore();
  await disposeTestDbs();
});

async function openBench(db: LabXpertDB, experiment = ohmsLaw) {
  await useBenchStore.getState().open({ db, userId: USER, experiment, clock: fixedClock() });
  const attemptId = useBenchStore.getState().session?.attemptId;
  if (attemptId === undefined) throw new Error('bench did not open');
  return attemptId;
}

async function types(db: LabXpertDB, attemptId: string): Promise<ActionType[]> {
  return (await listEvents(db, attemptId)).map((e) => e.actionType);
}

const get = () => useBenchStore.getState();
const ids = () => get().circuit.components.map((c) => c.id);

describe('opening the bench', () => {
  it('starts an experiment attempt when there is none', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    const stored = await db.attempts.get(attemptId);
    expect(stored).toMatchObject({ userId: USER, experimentId: 'ohms-law', kind: 'experiment', status: 'in_progress' });
    expect(get().circuit).toEqual({ components: [], wires: [] });
  });

  it('resumes the in-progress attempt instead of starting another', async () => {
    const db = await makeTestDb();
    await startAttempt(db, { id: 'existing', userId: USER, experimentId: 'ohms-law', kind: 'experiment', startedAt: 5 });
    expect(await openBench(db)).toBe('existing');
    expect(await db.attempts.count()).toBe(1);
  });

  it('two opens at once (React’s double effect) still make one attempt', async () => {
    const db = await makeTestDb();
    const clock = fixedClock();
    const input = { db, userId: USER, experiment: ohmsLaw, clock };
    await Promise.all([get().open(input), get().open(input)]);
    expect(await db.attempts.count()).toBe(1);
  });

  it('keeps the bench when you come back to the same attempt, and starts empty for another', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply');
    await openBench(db);
    expect(ids()).toEqual(['S']);
    await get().open({ db, userId: USER, experiment: seriesParallel, clock: fixedClock() });
    expect(get().circuit.components).toEqual([]);
  });
});

describe('events', () => {
  it('logs PLACE_COMPONENT with the part and the learner’s ids', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    const id = await get().place('supply', { x: 40, y: 60 });
    expect(id).toBe('S');
    const [event] = await listEvents(db, attemptId);
    expect(event).toMatchObject({
      actionType: 'PLACE_COMPONENT',
      targetId: 'S',
      userId: USER,
      attemptId,
      experimentId: 'ohms-law',
      after: { type: 'supply', x: 40, y: 60, voltage: 0 },
    });
    expect(typeof event?.id).toBe('string');
    expect(typeof event?.timestamp).toBe('number');
    expect(get().selectedId).toBe('S');
  });

  it('logs nothing when a part is refused at max', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await get().place('supply');
    expect(await get().place('supply')).toBeUndefined();
    expect(await types(db, attemptId)).toEqual(['PLACE_COMPONENT']);
  });

  it('places at the next free spot when no position is given', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply');
    await get().place('switch');
    const [a, b] = get().circuit.components;
    expect(a && b && (a.x !== b.x || a.y !== b.y)).toBe(true);
  });

  it('logs REMOVE_COMPONENT with the part as it was', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await get().place('ammeter', { x: 10, y: 10 });
    await get().remove('A');
    const events = await listEvents(db, attemptId);
    expect(events.map((e) => e.actionType)).toEqual(['PLACE_COMPONENT', 'REMOVE_COMPONENT']);
    expect(events[1]).toMatchObject({ targetId: 'A', before: { type: 'ammeter', x: 10, y: 10 } });
    expect(ids()).toEqual([]);
  });

  it('removes a part’s wires with it', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply');
    await get().place('ammeter');
    useBenchStore.setState((s) => ({
      circuit: { ...s.circuit, wires: [{ id: 'w1', from: 'S.pos', to: 'A.pos' }] },
    }));
    await get().remove('A');
    expect(get().circuit.wires).toEqual([]);
  });

  it('does not log or remove a locked part', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    useBenchStore.setState({ circuit: { components: [{ id: 'A', type: 'ammeter', x: 0, y: 0, locked: true }], wires: [] } });
    await get().remove('A');
    expect(ids()).toEqual(['A']);
    expect(await types(db, attemptId)).toEqual([]);
  });

  it('logs RESET_BENCH for Clear and nothing when the bench is already empty', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await get().clear();
    expect(await types(db, attemptId)).toEqual([]);
    await get().place('supply');
    await get().place('switch');
    await get().clear();
    const events = await listEvents(db, attemptId);
    expect(events[events.length - 1]).toMatchObject({ actionType: 'RESET_BENCH', before: { componentIds: ['S', 'SW'] } });
    expect(ids()).toEqual([]);
    expect(get().selectedId).toBeUndefined();
  });

  it('logs UNDO and restores the bench exactly', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await get().place('supply', { x: 10, y: 10 });
    const before: Circuit = get().circuit;
    await get().place('switch', { x: 400, y: 10 });
    await get().undo();
    expect(get().circuit).toBe(before);
    expect(await types(db, attemptId)).toEqual(['PLACE_COMPONENT', 'PLACE_COMPONENT', 'UNDO']);
  });

  it('undoes Remove and Clear', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply', { x: 10, y: 10 });
    await get().place('switch', { x: 400, y: 10 });
    const full = get().circuit;
    await get().remove('S');
    await get().undo();
    expect(get().circuit).toBe(full);
    await get().clear();
    await get().undo();
    expect(get().circuit).toBe(full);
  });

  it('logs nothing for Undo with nothing to undo', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await get().undo();
    expect(await types(db, attemptId)).toEqual([]);
  });

  it('keeps events in the order the actions were asked for, even when asked back to back', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await Promise.all([get().place('supply'), get().place('switch'), get().remove('S'), get().undo()]);
    expect(await types(db, attemptId)).toEqual(['PLACE_COMPONENT', 'PLACE_COMPONENT', 'REMOVE_COMPONENT', 'UNDO']);
    expect(ids().sort()).toEqual(['S', 'SW']);
  });

  it('leaves the bench as it was when the event cannot be saved', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply');
    db.close();
    await expect(get().place('switch')).rejects.toThrow();
    expect(ids()).toEqual(['S']);
  });
});

describe('moving', () => {
  it('is not logged, whether by drag or by keyboard', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await get().place('supply', { x: 100, y: 100 });
    get().startDrag('S');
    get().dragTo('S', 150, 160);
    get().dragTo('S', 200, 220);
    get().endDrag();
    get().nudge('S', 12, 0);
    expect(get().circuit.components[0]).toMatchObject({ x: 212, y: 220 });
    expect(await types(db, attemptId)).toEqual(['PLACE_COMPONENT']);
  });

  it('makes one drag one undo step, and undo puts the part back exactly', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply', { x: 100, y: 100 });
    const before = get().circuit;
    const steps = get().history.length;
    get().startDrag('S');
    get().dragTo('S', 130, 130);
    get().dragTo('S', 300, 250);
    get().endDrag();
    expect(get().history).toHaveLength(steps + 1);
    await get().undo();
    expect(get().circuit).toBe(before);
  });

  it('does not add an undo step for a click that never moved the part', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply', { x: 100, y: 100 });
    const steps = get().history.length;
    get().startDrag('S');
    get().endDrag();
    expect(get().history).toHaveLength(steps);
  });

  it('counts a run of arrow presses on one part as one step', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply', { x: 100, y: 100 });
    const steps = get().history.length;
    get().nudge('S', 12, 0);
    get().nudge('S', 12, 0);
    get().nudge('S', 0, 12);
    expect(get().history).toHaveLength(steps + 1);
    await get().undo();
    expect(get().circuit.components[0]).toMatchObject({ x: 100, y: 100 });
  });

  it('never moves a locked part', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({ circuit: { components: [{ id: 'A', type: 'ammeter', x: 0, y: 0, locked: true }], wires: [] } });
    get().startDrag('A');
    get().dragTo('A', 300, 300);
    get().nudge('A', 12, 12);
    expect(get().circuit.components[0]).toMatchObject({ x: 0, y: 0 });
    expect(get().selectedId).toBe('A');
    expect(get().history).toHaveLength(0);
  });

  it('keeps the part on the mat while dragging', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply', { x: 100, y: 100 });
    get().startDrag('S');
    get().dragTo('S', 99999, 99999);
    get().endDrag();
    expect(get().circuit.components[0]).toMatchObject({ x: 900, y: 488 });
  });
});

describe('undo depth', () => {
  it('keeps only the last 50 steps', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('ammeter', { x: 0, y: 0 });
    await get().place('voltmeter', { x: 300, y: 0 });
    // Alternating parts: each switch of part is a new step.
    for (let i = 0; i < 70; i += 1) get().nudge(i % 2 === 0 ? 'A' : 'V', 12, 0);
    expect(HISTORY_LIMIT).toBe(50);
    expect(get().history).toHaveLength(50);
  });
});

describe('selection', () => {
  it('selects, deselects, and drops the selection when the part is removed', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply');
    get().select(undefined);
    expect(get().selectedId).toBeUndefined();
    get().select('S');
    await get().remove('S');
    expect(get().selectedId).toBeUndefined();
  });
});

describe('two clocks on one database (regression: ConstraintError on a repeated attempt id)', () => {
  it('opening a second experiment with a new clock makes a second attempt, not a duplicate key', async () => {
    const db = await makeTestDb();
    const first = await openBench(db);
    await get().open({ db, userId: USER, experiment: seriesParallel, clock: fixedClock() });
    const second = get().session?.attemptId;
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(await db.attempts.count()).toBe(2);
  });
});

/** A page reload: nothing in memory, then the bench opens again from the db. */
async function reload(db: LabXpertDB, experiment = ohmsLaw) {
  await flushBenchWrites();
  resetStore();
  return openBench(db, experiment);
}

describe('saving and restoring the circuit', () => {
  it('saves the circuit with every committed change, and a reload restores it', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await get().place('supply', { x: 40, y: 60 });
    expect(await getAttemptCircuit(db, attemptId)).toEqual(get().circuit);
    await get().place('switch', { x: 400, y: 60 });
    await get().remove('SW');
    await get().clear();
    await get().place('ammeter', { x: 10, y: 10 });
    await get().undo();
    const saved = get().circuit;
    expect(await getAttemptCircuit(db, attemptId)).toEqual(saved);
    await get().place('voltmeter', { x: 300, y: 100 });
    const before = get().circuit;
    expect(await reload(db)).toBe(attemptId);
    expect(get().circuit).toEqual(before);
  });

  it('restores roles, positions and shelf counts, so R1 and R2 stay correct', async () => {
    const db = await makeTestDb();
    await openBench(db, seriesParallel);
    await get().place('resistor', { x: 100, y: 100 });
    await get().place('resistor', { x: 300, y: 100 });
    const placed = get().circuit.components;
    expect(placed.map((c) => c.id)).toEqual(['R1', 'R2']);
    await reload(db, seriesParallel);
    expect(get().circuit.components).toEqual(placed);
    expect(get().circuit.components.map((c) => (c.type === 'resistor' ? c.role : undefined))).toEqual(['R1', 'R2']);
    // Both resistors are on the bench, so the shelf is full: a third is refused.
    expect(await get().place('resistor', { x: 500, y: 100 })).toBeUndefined();
    await get().remove('R1');
    await reload(db, seriesParallel);
    expect(get().circuit.components.map((c) => c.id)).toEqual(['R2']);
    expect(await get().place('resistor', { x: 100, y: 300 })).toBe('R1');
  });

  it('saves a drag once, at the end, and not on every pointer move', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await get().place('supply', { x: 100, y: 100 });
    const saves = vi.spyOn(db.attempts, 'update');
    get().startDrag('S');
    for (let i = 1; i <= 20; i += 1) get().dragTo('S', 100 + i * 10, 100 + i * 5);
    await flushBenchWrites();
    expect(saves).not.toHaveBeenCalled();
    await get().endDrag();
    expect(saves).toHaveBeenCalledTimes(1);
    expect(await getAttemptCircuit(db, attemptId)).toEqual(get().circuit);
    expect(get().circuit.components[0]).toMatchObject({ x: 300, y: 200 });
    expect(await types(db, attemptId)).toEqual(['PLACE_COMPONENT']);
  });

  it('does not save for a press that never moved the part', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply', { x: 100, y: 100 });
    const saves = vi.spyOn(db.attempts, 'update');
    get().startDrag('S');
    await get().endDrag();
    expect(saves).not.toHaveBeenCalled();
  });

  it('saves a run of arrow presses once, with the final position', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await get().place('supply', { x: 100, y: 100 });
    const saves = vi.spyOn(db.attempts, 'update');
    await Promise.all([get().nudge('S', 12, 0), get().nudge('S', 12, 0), get().nudge('S', 0, 12)]);
    expect(saves).toHaveBeenCalledTimes(1);
    expect((await getAttemptCircuit(db, attemptId))?.components[0]).toMatchObject({ x: 124, y: 112 });
  });

  it('starts with an empty undo history after a reload', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply', { x: 10, y: 10 });
    await get().place('switch', { x: 400, y: 10 });
    expect(get().history).toHaveLength(2);
    await reload(db);
    expect(get().history).toHaveLength(0);
    expect(get().circuit.components).toHaveLength(2);
    await get().undo();
    expect(get().circuit.components).toHaveLength(2);
  });

  it('keeps two experiments’ circuits separate', async () => {
    const db = await makeTestDb();
    const ohms = await openBench(db);
    await get().place('supply', { x: 10, y: 10 });
    const other = await openBench(db, seriesParallel);
    expect(other).not.toBe(ohms);
    expect(get().circuit.components).toEqual([]);
    await get().place('resistor', { x: 50, y: 50 });
    await reload(db);
    expect(get().circuit.components.map((c) => c.id)).toEqual(['S']);
    await reload(db, seriesParallel);
    expect(get().circuit.components.map((c) => c.id)).toEqual(['R1']);
  });

  it('does not restore a bench into a new attempt after the old one is finished', async () => {
    const db = await makeTestDb();
    const first = await openBench(db);
    await get().place('supply', { x: 10, y: 10 });
    const { finishAttempt } = await import('../../src/db/attempts');
    await finishAttempt(db, first, 5000);
    const second = await reload(db);
    expect(second).not.toBe(first);
    expect(get().circuit.components).toEqual([]);
  });

  it('leaves the saved circuit and the screen as they were when a save fails', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await get().place('supply', { x: 10, y: 10 });
    const saved = get().circuit;
    vi.spyOn(db.attempts, 'update').mockRejectedValueOnce(new Error('disk full'));
    await expect(get().place('switch', { x: 400, y: 10 })).rejects.toThrow('disk full');
    expect(get().circuit).toBe(saved);
    expect(await getAttemptCircuit(db, attemptId)).toEqual(saved);
    expect(await types(db, attemptId)).toEqual(['PLACE_COMPONENT']);
  });

  it('hands a failed move save to the caller to report', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await get().place('supply', { x: 100, y: 100 });
    vi.spyOn(db.attempts, 'update').mockRejectedValueOnce(new Error('disk full'));
    get().startDrag('S');
    get().dragTo('S', 200, 200);
    await expect(get().endDrag()).rejects.toThrow('disk full');
  });
});
