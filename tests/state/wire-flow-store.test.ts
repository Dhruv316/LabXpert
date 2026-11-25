// Import order matters: tests/db/setup loads fake-indexeddb before Dexie is first imported.
import { disposeTestDbs, makeTestDb } from '../db/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LabXpertDB } from '../../src/db/database';
import type { Circuit, ExperimentConfig, TerminalRef } from '../../src/model/types';
import { flushBenchWrites, selectWireFlow, useBenchStore } from '../../src/state';
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

/** S -> SW -> A -> R -> S, voltmeter across R, placed by hand so the wiring is exact. */
function wired(closed: boolean, voltage: number, extra: [TerminalRef, TerminalRef][] = []): Circuit {
  const pairs: [TerminalRef, TerminalRef][] = [
    ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'], ...extra,
  ];
  return {
    components: [
      { id: 'S', type: 'supply', x: 0, y: 0, voltage },
      { id: 'SW', type: 'switch', x: 0, y: 0, closed },
      { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 10 },
      { id: 'A', type: 'ammeter', x: 0, y: 0 },
      { id: 'V', type: 'voltmeter', x: 0, y: 0 },
    ],
    wires: pairs.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })),
  };
}

/** "S.pos>SW.a" for a flowing wire, "still" otherwise, in wire order. */
function arrows(): string[] {
  const flow = selectWireFlow(get());
  if (flow === undefined) throw new Error('no flow: bench is not open');
  return [...flow.values()].map((c) => (c.flowing ? `${c.from}>${c.to}` : 'still'));
}

const LOOP_FLOWING = ['S.pos>SW.a', 'SW.b>A.pos', 'A.neg>R.a', 'R.b>S.neg', 'still', 'still'];

describe('selectWireFlow', () => {
  it('is undefined until the bench is open', () => {
    expect(selectWireFlow(get())).toBeUndefined();
  });

  it('shows the four loop wires flowing from + round to −, and the voltmeter wires still', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({ circuit: wired(true, 6) });
    expect(arrows()).toEqual(LOOP_FLOWING);
  });

  it('shows nothing flowing with the switch open', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({ circuit: wired(false, 6) });
    expect(arrows()).toEqual(Array(6).fill('still'));
  });

  it('shows nothing flowing with the supply at 0 V', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({ circuit: wired(true, 0) });
    expect(arrows()).toEqual(Array(6).fill('still'));
  });

  it('shows nothing flowing for an incomplete circuit', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const full = wired(true, 6);
    useBenchStore.setState({ circuit: { ...full, wires: full.wires.filter((wire) => wire.id !== 'w3') } });
    expect(arrows()).toEqual(Array(5).fill('still'));
  });

  it('shows nothing flowing for an overload', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({ circuit: wired(true, 6, [['S.pos', 'S.neg']]) });
    expect(arrows()).toEqual(Array(7).fill('still'));
  });

  it('gives a wire between two terminals on the same node no current', async () => {
    const db = await makeTestDb();
    await openBench(db);
    // V.neg already shares a node with S.neg through R.b.
    useBenchStore.setState({ circuit: wired(true, 6, [['V.neg', 'S.neg']]) });
    expect(arrows()).toEqual([...LOOP_FLOWING, 'still']);
  });

  it('does not turn the current round for a reversed ammeter', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const base = wired(true, 6);
    useBenchStore.setState({
      circuit: {
        ...base,
        wires: [
          { id: 'w1', from: 'S.pos', to: 'SW.a' },
          { id: 'w2', from: 'SW.b', to: 'A.neg' },
          { id: 'w3', from: 'A.pos', to: 'R.a' },
          { id: 'w4', from: 'R.b', to: 'S.neg' },
        ],
      },
    });
    expect(arrows()).toEqual(['S.pos>SW.a', 'SW.b>A.neg', 'A.pos>R.a', 'R.b>S.neg']);
  });

  it('splits the current for two resistors in parallel', async () => {
    const db = await makeTestDb();
    await openBench(db, seriesParallel);
    const pairs: [TerminalRef, TerminalRef][] = [
      ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['R1.a', 'R2.a'], ['R1.b', 'S.neg'], ['R2.b', 'S.neg'],
    ];
    useBenchStore.setState({
      circuit: {
        components: [
          { id: 'S', type: 'supply', x: 0, y: 0, voltage: 6 },
          { id: 'SW', type: 'switch', x: 0, y: 0, closed: true },
          { id: 'R1', type: 'resistor', x: 0, y: 0, role: 'R1', ohms: 10 },
          { id: 'R2', type: 'resistor', x: 0, y: 0, role: 'R2', ohms: 20 },
          { id: 'A', type: 'ammeter', x: 0, y: 0 },
        ],
        wires: pairs.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })),
      },
    });
    expect(arrows()).toEqual(['S.pos>SW.a', 'SW.b>A.pos', 'A.neg>R1.a', 'R1.a>R2.a', 'R1.b>S.neg', 'R2.b>S.neg']);
  });

  it('follows the switch and the supply through the store', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({ circuit: wired(false, 6) });
    expect(arrows().every((a) => a === 'still')).toBe(true);
    await get().toggleSwitch('SW');
    expect(arrows()).toEqual(LOOP_FLOWING);
    await get().setSupplyVoltage('S', 0);
    expect(arrows().every((a) => a === 'still')).toBe(true);
  });

  it('returns the same result for the same circuit, and recalculates only when the circuit changes', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({ circuit: wired(true, 6) });
    const first = selectWireFlow(get());
    expect(selectWireFlow(get())).toBe(first);
    // Selecting a part or highlighting a terminal does not touch the circuit.
    get().select('R');
    expect(selectWireFlow(get())).toBe(first);
    // A different circuit object is recalculated, even when it says the same thing.
    useBenchStore.setState({ circuit: { ...get().circuit } });
    const second = selectWireFlow(get());
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
    expect(selectWireFlow(get())).toBe(second);
  });
});
