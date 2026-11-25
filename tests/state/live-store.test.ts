// Import order matters: tests/db/setup loads fake-indexeddb before Dexie is first imported.
import { disposeTestDbs, makeTestDb } from '../db/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAttemptCircuit } from '../../src/db/attempts';
import { listEvents } from '../../src/db/events';
import type { LabXpertDB } from '../../src/db/database';
import type { ActionType, Circuit, ExperimentConfig } from '../../src/model/types';
import { flushBenchWrites, selectLive, useBenchStore } from '../../src/state';
import { fixedClock, ohmsLaw, seriesParallel } from '../bench/helpers';

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

async function openBench(db: LabXpertDB, experiment: ExperimentConfig = ohmsLaw) {
  await get().open({ db, userId: USER, experiment, clock: fixedClock() });
  const attemptId = get().session?.attemptId;
  if (attemptId === undefined) throw new Error('bench did not open');
  return attemptId;
}

/** A page reload: nothing in memory, then the bench opens again from the db. */
async function reload(db: LabXpertDB, experiment: ExperimentConfig = ohmsLaw) {
  await flushBenchWrites();
  resetStore();
  return openBench(db, experiment);
}

async function types(db: LabXpertDB, attemptId: string): Promise<ActionType[]> {
  return (await listEvents(db, attemptId)).map((e) => e.actionType);
}

/** Supply, switch and one resistor placed through the store, so defaults come from the real placement code. */
async function benchWithParts(db: LabXpertDB, experiment: ExperimentConfig = ohmsLaw) {
  const attemptId = await openBench(db, experiment);
  await get().place('supply', { x: 10, y: 10 });
  await get().place('switch', { x: 300, y: 10 });
  await get().place('resistor', { x: 500, y: 10 });
  return attemptId;
}

const resistorId = () => get().circuit.components.find((c) => c.type === 'resistor')?.id ?? 'missing';
const part = (id: string) => get().circuit.components.find((c) => c.id === id);

describe('defaults for a new circuit state', () => {
  it('places the switch open and the supply at the experiment’s default voltage', async () => {
    const db = await makeTestDb();
    await benchWithParts(db);
    expect(part('SW')).toMatchObject({ closed: false });
    expect(part('S')).toMatchObject({ voltage: ohmsLaw.supply.default });
    expect(ohmsLaw.supply.default).toBe(0);
  });
});

describe('toggleSwitch', () => {
  it('closes and opens, returning whether the switch is now closed', async () => {
    const db = await makeTestDb();
    await benchWithParts(db);
    expect(await get().toggleSwitch('SW')).toBe(true);
    expect(part('SW')).toMatchObject({ closed: true });
    expect(await get().toggleSwitch('SW')).toBe(false);
    expect(part('SW')).toMatchObject({ closed: false });
  });

  it('logs TOGGLE_SWITCH with the switch and its before and after', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    await get().toggleSwitch('SW');
    await get().toggleSwitch('SW');
    const events = (await listEvents(db, attemptId)).filter((e) => e.actionType === 'TOGGLE_SWITCH');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      actionType: 'TOGGLE_SWITCH',
      targetId: 'SW',
      userId: USER,
      attemptId,
      experimentId: 'ohms-law',
      before: { closed: false },
      after: { closed: true },
    });
    expect(events[1]).toMatchObject({ before: { closed: true }, after: { closed: false } });
  });

  it('runs no check and records nothing but the event (the store action only toggles; the switch hook runs SWITCH_CLOSE)', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    await get().toggleSwitch('SW');
    expect(await db.errorOccurrences.count()).toBe(0);
    expect(await types(db, attemptId)).toEqual(['PLACE_COMPONENT', 'PLACE_COMPONENT', 'PLACE_COMPONENT', 'TOGGLE_SWITCH']);
  });

  it('does nothing for an unknown id or a part that is not a switch', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    const before = get().circuit;
    expect(await get().toggleSwitch('nope')).toBeUndefined();
    expect(await get().toggleSwitch('S')).toBeUndefined();
    expect(get().circuit).toBe(before);
    expect(await types(db, attemptId)).not.toContain('TOGGLE_SWITCH');
  });

  it('does nothing when the bench is not open', async () => {
    expect(await get().toggleSwitch('SW')).toBeUndefined();
  });

  it('is undoable, and undo is logged', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    const before = get().circuit;
    await get().toggleSwitch('SW');
    await get().undo();
    expect(get().circuit).toBe(before);
    expect(part('SW')).toMatchObject({ closed: false });
    expect((await types(db, attemptId)).slice(-2)).toEqual(['TOGGLE_SWITCH', 'UNDO']);
    expect(await getAttemptCircuit(db, attemptId)).toEqual(before);
  });

  it('is saved with the circuit and restored after a reload', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    await get().toggleSwitch('SW');
    expect(await getAttemptCircuit(db, attemptId)).toEqual(get().circuit);
    const closed = get().circuit;
    await reload(db);
    expect(get().circuit).toEqual(closed);
    expect(part('SW')).toMatchObject({ closed: true });
  });
});

describe('setSupplyVoltage', () => {
  it('sets the voltage and logs SET_VALUE with before and after', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    expect(await get().setSupplyVoltage('S', 5)).toBe('changed');
    expect(part('S')).toMatchObject({ voltage: 5 });
    const events = (await listEvents(db, attemptId)).filter((e) => e.actionType === 'SET_VALUE');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actionType: 'SET_VALUE',
      targetId: 'S',
      userId: USER,
      attemptId,
      experimentId: 'ohms-law',
      before: { voltage: 0 },
      after: { voltage: 5 },
    });
  });

  it('clamps to min and max and rounds to the step', async () => {
    const db = await makeTestDb();
    await benchWithParts(db);
    await get().setSupplyVoltage('S', 99);
    expect(part('S')).toMatchObject({ voltage: 12 });
    await get().setSupplyVoltage('S', -4);
    expect(part('S')).toMatchObject({ voltage: 0 });
    await get().setSupplyVoltage('S', 6.6);
    expect(part('S')).toMatchObject({ voltage: 7 });
  });

  it('logs the clamped value, not the asked-for one', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    await get().setSupplyVoltage('S', 99);
    const event = (await listEvents(db, attemptId)).find((e) => e.actionType === 'SET_VALUE');
    expect(event?.after).toEqual({ voltage: 12 });
  });

  it('is a no-op for the value it already has: no event, no undo step, no save', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    await get().setSupplyVoltage('S', 4);
    const circuit = get().circuit;
    const depth = get().history.length;
    const update = vi.spyOn(db.attempts, 'update');
    expect(await get().setSupplyVoltage('S', 4)).toBe('unchanged');
    expect(await get().setSupplyVoltage('S', 4.2)).toBe('unchanged');
    expect(get().circuit).toBe(circuit);
    expect(get().history).toHaveLength(depth);
    expect(update).not.toHaveBeenCalled();
    expect((await types(db, attemptId)).filter((t) => t === 'SET_VALUE')).toHaveLength(1);
  });

  it('refuses a value that is not a number, and a locked part, and logs nothing', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    const before = get().circuit;
    expect(await get().setSupplyVoltage('S', Number.NaN)).toBe('out-of-range');
    useBenchStore.setState({
      circuit: { ...before, components: before.components.map((c) => (c.id === 'S' ? { ...c, valueLocked: true } : c)) },
    });
    const locked = get().circuit;
    expect(await get().setSupplyVoltage('S', 6)).toBe('locked');
    expect(get().circuit).toBe(locked);
    expect(await types(db, attemptId)).not.toContain('SET_VALUE');
  });

  it('does nothing for an unknown id or a part that is not a supply', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    expect(await get().setSupplyVoltage('nope', 5)).toBeUndefined();
    expect(await get().setSupplyVoltage('SW', 5)).toBeUndefined();
    expect(await types(db, attemptId)).not.toContain('SET_VALUE');
  });

  it('is undoable one step at a time', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    await get().setSupplyVoltage('S', 3);
    const three = get().circuit;
    await get().setSupplyVoltage('S', 4);
    await get().undo();
    expect(get().circuit).toBe(three);
    expect(part('S')).toMatchObject({ voltage: 3 });
    await get().undo();
    expect(part('S')).toMatchObject({ voltage: 0 });
    expect(await getAttemptCircuit(db, attemptId)).toEqual(get().circuit);
  });

  it('is saved and restored after a reload', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    await get().setSupplyVoltage('S', 9);
    expect(await getAttemptCircuit(db, attemptId)).toEqual(get().circuit);
    await reload(db);
    expect(part('S')).toMatchObject({ voltage: 9 });
  });

  it('leaves the bench and the log as they were when the save fails', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    const before = get().circuit;
    vi.spyOn(db.attempts, 'update').mockRejectedValueOnce(new Error('disk full'));
    await expect(get().setSupplyVoltage('S', 5)).rejects.toThrow('disk full');
    expect(get().circuit).toBe(before);
    expect(await types(db, attemptId)).not.toContain('SET_VALUE');
  });
});

describe('setResistorValue', () => {
  it('sets an allowed value and logs SET_VALUE with before and after', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    const id = resistorId();
    expect(await get().setResistorValue(id, 30)).toBe('changed');
    expect(part(id)).toMatchObject({ ohms: 30, role: 'R', x: 500, y: 10 });
    const event = (await listEvents(db, attemptId)).find((e) => e.actionType === 'SET_VALUE');
    expect(event).toMatchObject({ targetId: id, before: { ohms: 10 }, after: { ohms: 30 } });
  });

  it('refuses a value that is not allowed and logs nothing', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    const before = get().circuit;
    expect(await get().setResistorValue(resistorId(), 7)).toBe('not-allowed');
    expect(get().circuit).toBe(before);
    expect(await types(db, attemptId)).not.toContain('SET_VALUE');
  });

  it('refuses a valueLocked resistor and logs nothing', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    const id = resistorId();
    useBenchStore.setState((s) => ({
      circuit: { ...s.circuit, components: s.circuit.components.map((c) => (c.id === id ? { ...c, valueLocked: true } : c)) },
    }));
    const locked = get().circuit;
    expect(await get().setResistorValue(id, 30)).toBe('locked');
    expect(get().circuit).toBe(locked);
    expect(await types(db, attemptId)).not.toContain('SET_VALUE');
  });

  it('is a no-op for the value it already has: no event, no undo step', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    const circuit = get().circuit;
    const depth = get().history.length;
    expect(await get().setResistorValue(resistorId(), 10)).toBe('unchanged');
    expect(get().circuit).toBe(circuit);
    expect(get().history).toHaveLength(depth);
    expect(await types(db, attemptId)).not.toContain('SET_VALUE');
  });

  it('does nothing for an unknown id or a part that is not a resistor', async () => {
    const db = await makeTestDb();
    await benchWithParts(db);
    expect(await get().setResistorValue('nope', 30)).toBeUndefined();
    expect(await get().setResistorValue('S', 30)).toBeUndefined();
  });

  it('is undoable and survives a reload', async () => {
    const db = await makeTestDb();
    const attemptId = await benchWithParts(db);
    const id = resistorId();
    await get().setResistorValue(id, 20);
    await reload(db);
    expect(part(id)).toMatchObject({ ohms: 20 });
    // Undo history is not saved, so undo is checked on the live bench.
    await get().setResistorValue(id, 5);
    await get().undo();
    expect(part(id)).toMatchObject({ ohms: 20 });
    expect(await getAttemptCircuit(db, attemptId)).toEqual(get().circuit);
  });

  it('keeps R1 and R2 and their values apart in series-parallel', async () => {
    const db = await makeTestDb();
    await openBench(db, seriesParallel);
    await get().place('resistor', { x: 100, y: 100 });
    await get().place('resistor', { x: 100, y: 300 });
    expect(part('R1')).toMatchObject({ ohms: 10 });
    expect(part('R2')).toMatchObject({ ohms: 20 });
    await get().setResistorValue('R2', 5);
    expect(part('R1')).toMatchObject({ ohms: 10 });
    expect(part('R2')).toMatchObject({ ohms: 5, role: 'R2' });
  });
});

describe('selectLive', () => {
  /** S -> SW -> A -> R -> S, voltmeter across R, placed by hand so the wiring is exact. */
  function wired(closed: boolean, voltage: number): Circuit {
    return {
      components: [
        { id: 'S', type: 'supply', x: 0, y: 0, voltage },
        { id: 'SW', type: 'switch', x: 0, y: 0, closed },
        { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 10 },
        { id: 'A', type: 'ammeter', x: 0, y: 0 },
        { id: 'V', type: 'voltmeter', x: 0, y: 0 },
      ],
      wires: [
        ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
      ].map(([from, to], i) => ({ id: `w${i}`, from, to })) as Circuit['wires'],
    };
  }

  it('is undefined until the bench is open', () => {
    expect(selectLive(get())).toBeUndefined();
  });

  it('gives 0.6 A and 6 V for 6 V across 10 ohm, checked by hand', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({ circuit: wired(true, 6) });
    const live = selectLive(get());
    expect(live).toMatchObject({ overload: false, complete: true, flowing: true, rounded: { ammeter: 0.6, voltmeter: 6 } });
  });

  it('is not complete and not flowing with the switch open', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({ circuit: wired(false, 6) });
    expect(selectLive(get())).toMatchObject({ complete: false, flowing: false, rounded: { ammeter: 0, voltmeter: 0 } });
  });

  it('reports overload for a short', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const short = wired(true, 6);
    useBenchStore.setState({ circuit: { ...short, wires: [...short.wires, { id: 'w-short', from: 'S.pos', to: 'S.neg' }] } });
    expect(selectLive(get())).toMatchObject({ overload: true, flowing: false, rounded: { ammeter: 0, voltmeter: 0 } });
  });

  it('gives negative readings for reversed meters', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const base = wired(true, 6);
    useBenchStore.setState({
      circuit: {
        ...base,
        wires: [
          { id: 'w0', from: 'S.pos', to: 'SW.a' },
          { id: 'w1', from: 'SW.b', to: 'A.neg' },
          { id: 'w2', from: 'A.pos', to: 'R.a' },
          { id: 'w3', from: 'R.b', to: 'S.neg' },
          { id: 'w4', from: 'V.pos', to: 'R.b' },
          { id: 'w5', from: 'V.neg', to: 'R.a' },
        ],
      },
    });
    expect(selectLive(get())?.rounded).toEqual({ ammeter: -0.6, voltmeter: -6 });
  });

  it('follows the real store actions: closing the switch and raising the supply', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({ circuit: wired(false, 0) });
    await get().toggleSwitch('SW');
    expect(selectLive(get())).toMatchObject({ complete: true, flowing: false });
    await get().setSupplyVoltage('S', 12);
    expect(selectLive(get())).toMatchObject({ flowing: true, rounded: { ammeter: 1.2, voltmeter: 12 } });
    await get().setResistorValue('R', 20);
    expect(selectLive(get())?.rounded.ammeter).toBe(0.6);
  });

  it('recalculates only when the circuit changes', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({ circuit: wired(true, 6) });
    const first = selectLive(get());
    expect(selectLive(get())).toBe(first);
    // Selecting a part or highlighting a terminal does not touch the circuit.
    get().select('R');
    expect(selectLive(get())).toBe(first);
    await get().setSupplyVoltage('S', 7);
    const second = selectLive(get());
    expect(second).not.toBe(first);
    expect(selectLive(get())).toBe(second);
  });
});
