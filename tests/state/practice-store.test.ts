// Import order matters: tests/db/setup loads fake-indexeddb before Dexie is first imported.
import { disposeTestDbs, makeTestDb } from '../db/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PracticeUnavailableError, type PracticeHint } from '../../src/bench/practice-start';
import { listEvents } from '../../src/db/events';
import { listReadings } from '../../src/db/readings';
import type { LabXpertDB } from '../../src/db/database';
import type { Circuit, ErrorCode, ExperimentId, TerminalRef } from '../../src/model/types';
import { flushBenchWrites, useBenchStore } from '../../src/state/bench';
import { usePracticeStore } from '../../src/state/practice';
import { selectPracticeProgress } from '../../src/state/practice-selector';
import { useReadingsStore } from '../../src/state/readings';
import { useTaskStore } from '../../src/state/task';
import { useTutorStore } from '../../src/state/tutor';
import { fixedClock, ohmsLaw, seriesParallel } from '../bench/helpers';
import { practiceTasks } from '../bench/practice-helpers';

const USER = 'asha';
const bench = () => useBenchStore.getState();
const practice = () => usePracticeStore.getState();
const readings = () => useReadingsStore.getState();
const tutor = () => useTutorStore.getState();

function resetStores() {
  useBenchStore.setState(useBenchStore.getInitialState(), true);
  useTutorStore.setState(useTutorStore.getInitialState(), true);
  useReadingsStore.setState(useReadingsStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  usePracticeStore.setState(usePracticeStore.getInitialState(), true);
}

beforeEach(resetStores);
afterEach(async () => {
  await flushBenchWrites();
  resetStores();
  await disposeTestDbs();
});

async function seedProfile(db: LabXpertDB, experimentId: ExperimentId, code: ErrorCode, count: number) {
  await db.errorProfile.put({ userId: USER, experimentId, code, count, lastSeenAt: 500 });
}

async function open(db: LabXpertDB, taskId: string, hint?: PracticeHint, clock = fixedClock()) {
  await practice().open({ db, userId: USER, taskId, tasks: practiceTasks, experiments: [ohmsLaw, seriesParallel], hint, clock });
  await flushBenchWrites();
}

const ids = () => bench().circuit.components.map((c) => c.id);
const attemptIdOf = () => {
  const id = bench().session?.attemptId;
  if (id === undefined) throw new Error('no bench open');
  return id;
};

/** The open-circuit task's fix: the missing wire from R.b to S.neg. */
async function fixOpenCircuit() {
  expect(bench().startWire('R.b', 'click')).toBe(true);
  expect(await bench().finishWire('S.neg')).toBe('connected');
}

/** Switch closed, supply at `volts`. */
async function powerOn(volts: number) {
  expect(await bench().toggleSwitch('SW')).toBe(true);
  expect(await bench().setSupplyVoltage('S', volts)).toBe('changed');
}

const OPEN_HINT: PracticeHint = { experimentId: 'ohms-law', code: 'OPEN_CIRCUIT' };

describe('starting and resuming', () => {
  it('the first open creates a practice attempt and loads the prebuilt circuit with its locked parts', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 2);
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);

    const attempts = await db.attempts.toArray();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      kind: 'practice',
      practiceTaskId: 'practice-fix-open-circuit',
      userId: USER,
      experimentId: 'ohms-law',
      status: 'in_progress',
    });
    const records = await db.practiceRecords.toArray();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ practiceTaskId: 'practice-fix-open-circuit', forCode: 'OPEN_CIRCUIT', attemptId: attempts[0]?.id });

    expect(ids()).toEqual(['S', 'SW', 'R', 'A', 'V']);
    expect(bench().circuit.components.every((c) => c.locked === true)).toBe(true);
    expect(bench().circuit.components.find((c) => c.id === 'R')).toMatchObject({ ohms: 10, valueLocked: true });
    expect(bench().circuit.wires.map((w) => w.id)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5']);
    expect(bench().session?.kind).toBe('practice');
    expect(practice().current).toMatchObject({ attemptId: attempts[0]?.id, forCode: 'OPEN_CIRCUIT', experimentId: 'ohms-law' });
    expect(practice().completion).toBeUndefined();
  });

  it('a second open reuses the attempt, also after a reload, and needs no hint then', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 2);
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    const first = attemptIdOf();
    await open(db, 'practice-fix-open-circuit');
    expect(attemptIdOf()).toBe(first);

    resetStores(); // a reload: nothing in memory
    await open(db, 'practice-fix-open-circuit');
    expect(attemptIdOf()).toBe(first);
    expect(await db.attempts.count()).toBe(1);
    expect(await db.practiceRecords.count()).toBe(1);
    expect(practice().current?.forCode).toBe('OPEN_CIRCUIT');
  });

  it('without a hint the experiment and code come from the profile', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'series-parallel', 'OPEN_CIRCUIT', 3);
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 1);
    await open(db, 'practice-fix-open-circuit');
    expect(practice().current).toMatchObject({ experimentId: 'series-parallel', forCode: 'OPEN_CIRCUIT' });
    // The bench still runs the task's own experiment.
    expect(bench().session?.experiment.id).toBe('ohms-law');
  });

  it('an unknown task id is an error and creates nothing', async () => {
    const db = await makeTestDb();
    await expect(open(db, 'no-such-task', OPEN_HINT)).rejects.toBeInstanceOf(PracticeUnavailableError);
    await expect(open(db, 'no-such-task', OPEN_HINT)).rejects.toMatchObject({ reason: 'unknown-task' });
    expect(await db.attempts.count()).toBe(0);
    expect(bench().session).toBeUndefined();
  });

  it('a task that does not apply is an error and creates nothing', async () => {
    const db = await makeTestDb();
    await expect(open(db, 'practice-fix-open-circuit')).rejects.toMatchObject({ reason: 'not-applicable' });
    expect(await db.attempts.count()).toBe(0);
    expect(await db.practiceRecords.count()).toBe(0);
  });

  it('a reload restores the saved circuit, the readings and the progress', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'MISSING_READING', 1);
    await open(db, 'practice-three-readings', { experimentId: 'ohms-law', code: 'MISSING_READING' });
    await powerOn(2);
    const result = await readings().recordReading();
    expect(result.status).toBe('recorded');
    await flushBenchWrites();
    expect(selectPracticeProgress(practice())).toEqual({ have: 1, need: 3 });
    const attemptId = attemptIdOf();

    resetStores();
    await open(db, 'practice-three-readings');
    expect(attemptIdOf()).toBe(attemptId);
    expect(bench().circuit.components.find((c) => c.id === 'SW')).toMatchObject({ closed: true });
    expect(bench().circuit.components.find((c) => c.id === 'S')).toMatchObject({ voltage: 2 });
    expect(readings().readings).toHaveLength(1);
    expect(practice().evidence.readings).toHaveLength(1);
    expect(selectPracticeProgress(practice())).toEqual({ have: 1, need: 3 });
    expect(practice().completion).toBeUndefined();
    expect(await listReadings(db, attemptId)).toHaveLength(1);
  });
});

describe('the practice bench', () => {
  it('the shelf is the task’s own, with its max values', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'AMMETER_PARALLEL', 2);
    await open(db, 'practice-place-ammeter', { experimentId: 'ohms-law', code: 'AMMETER_PARALLEL' });
    expect(bench().session?.experiment.shelf).toEqual([{ type: 'ammeter', max: 1 }]);
    expect(bench().session?.experiment.activeRules).toEqual(ohmsLaw.activeRules);
    expect(await bench().place('supply')).toBeUndefined(); // not on this shelf
    expect(await bench().place('ammeter', { x: 330, y: 90 })).toBe('A');
    expect(await bench().place('ammeter')).toBeUndefined(); // max 1
    expect(ids()).toEqual(['S', 'SW', 'R', 'V', 'A']);
  });

  it('a fix-it task has an empty shelf', async () => {
    const db = await makeTestDb();
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    expect(bench().session?.experiment.shelf).toEqual([]);
    expect(await bench().place('ammeter')).toBeUndefined();
  });

  it('gather-parts starts empty and places the five parts, a resistor as R at 10 Ω', async () => {
    const db = await makeTestDb();
    await open(db, 'practice-gather-parts', { experimentId: 'ohms-law', code: 'MISSING_COMPONENT' }).catch(() => undefined);
    await seedProfile(db, 'ohms-law', 'MISSING_COMPONENT', 1);
    await open(db, 'practice-gather-parts');
    expect(ids()).toEqual([]);
    for (const type of ['supply', 'switch', 'resistor', 'ammeter', 'voltmeter'] as const) {
      expect(await bench().place(type)).toBeDefined();
    }
    expect(bench().circuit.components.find((c) => c.type === 'resistor')).toMatchObject({ id: 'R', role: 'R', ohms: 10 });
  });

  it('locked parts cannot be moved or removed, but wires can be edited and a locked switch works', async () => {
    const db = await makeTestDb();
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    const before = bench().circuit;

    bench().startDrag('S');
    expect(bench().gesture).toBeUndefined();
    bench().dragTo('S', 500, 500);
    await bench().nudge('S', 10, 10);
    await bench().remove('S');
    await bench().remove('SW');
    expect(bench().circuit).toBe(before);
    expect(await bench().setResistorValue('R', 20)).toBe('locked');

    expect(await bench().removeWire('w1')).toBe(true);
    expect(bench().circuit.wires.map((w) => w.id)).toEqual(['w2', 'w3', 'w4', 'w5']);
    await bench().undo();
    expect(bench().circuit.wires).toHaveLength(5);
    await fixOpenCircuit();
    expect(bench().circuit.wires.map((w) => w.id)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w6']);
    expect(ids()).toEqual(['S', 'SW', 'R', 'A', 'V']);

    expect(await bench().toggleSwitch('SW')).toBe(true);
    expect(await bench().setSupplyVoltage('S', 4)).toBe('changed');

    const types = (await listEvents(db, attemptIdOf())).map((e) => e.actionType);
    expect(types).toEqual(['REMOVE_WIRE', 'UNDO', 'CONNECT_WIRE', 'TOGGLE_SWITCH', 'SET_VALUE']);
  });

  it('Clear bench keeps the locked parts and goes back to the task’s starting circuit', async () => {
    const db = await makeTestDb();
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    const start = bench().circuit;
    await fixOpenCircuit();
    await bench().removeWire('w2');
    await bench().clear();
    expect(bench().circuit).toBe(start);
    const events = await listEvents(db, attemptIdOf());
    const reset = events[events.length - 1];
    expect(reset).toMatchObject({ actionType: 'RESET_BENCH', before: { componentIds: [], wireIds: ['w6'] } });
    await bench().clear(); // already at the start: nothing more
    expect((await listEvents(db, attemptIdOf())).length).toBe(events.length);
  });

  it('a calculation task opens an empty bench with an empty shelf', async () => {
    const db = await makeTestDb();
    await open(db, 'practice-equivalent-resistance', { experimentId: 'series-parallel', code: 'EQUIVALENT_R_WRONG' });
    expect(ids()).toEqual([]);
    expect(bench().session?.experiment.id).toBe('series-parallel');
    expect(bench().session?.experiment.shelf).toEqual([]);
  });
});

describe('completion', () => {
  it('a clean run completes once and resets the triggering code to 0', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 3);
    await seedProfile(db, 'ohms-law', 'WRONG_POLARITY', 2);
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    const attemptId = attemptIdOf();
    expect(selectPracticeProgress(practice())).toEqual({ have: 0, need: 1 });

    await fixOpenCircuit();
    await powerOn(6);
    expect((await readings().recordReading()).status).toBe('recorded');
    await flushBenchWrites();

    expect(practice().completion).toEqual({ clean: true, resetCode: 'OPEN_CIRCUIT' });
    expect(practice().error).toBeUndefined();
    expect(selectPracticeProgress(practice())).toEqual({ have: 1, need: 1 });
    expect(await db.errorProfile.get([USER, 'ohms-law', 'OPEN_CIRCUIT'])).toMatchObject({ count: 0 });
    expect(await db.errorProfile.get([USER, 'ohms-law', 'WRONG_POLARITY'])).toMatchObject({ count: 2 });
    expect(await db.attempts.get(attemptId)).toMatchObject({ status: 'completed' });
    expect((await db.practiceRecords.toArray())[0]).toMatchObject({ clean: true });
    expect((await db.practiceRecords.toArray())[0]?.completedAt).toBeGreaterThan(0);
  });

  it('a run where the triggering error came up again completes without resetting, and the profile never changes', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 3);
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    await powerOn(6);

    expect((await readings().recordReading()).status).toBe('blocked'); // still open
    expect(tutor().errors[0]?.code).toBe('OPEN_CIRCUIT');
    expect(practice().completion).toBeUndefined();
    expect(await db.errorProfile.get([USER, 'ohms-law', 'OPEN_CIRCUIT'])).toMatchObject({ count: 3 }); // not 4

    await fixOpenCircuit();
    expect((await readings().recordReading()).status).toBe('recorded');
    await flushBenchWrites();

    expect(practice().completion).toEqual({ clean: false, resetCode: null });
    expect(await db.errorProfile.get([USER, 'ohms-law', 'OPEN_CIRCUIT'])).toMatchObject({ count: 3 });
    expect(await db.errorProfile.count()).toBe(1);
    expect((await db.practiceRecords.toArray())[0]).toMatchObject({ clean: false });
  });

  it('an extension task resets nothing', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 2);
    await open(db, 'extension-ohms-law');
    expect(practice().current?.forCode).toBeUndefined();
    expect(await bench().toggleSwitch('SW')).toBe(true);
    for (const volts of [3, 6, 9, 12]) {
      expect(await bench().setSupplyVoltage('S', volts)).toBe('changed');
      expect((await readings().recordReading()).status).toBe('recorded');
      await flushBenchWrites();
      expect(practice().completion === undefined).toBe(volts !== 12);
    }
    expect(practice().completion).toEqual({ clean: true, resetCode: null });
    expect(await db.errorProfile.get([USER, 'ohms-law', 'OPEN_CIRCUIT'])).toMatchObject({ count: 2 });
    expect((await db.practiceRecords.toArray())[0]?.forCode).toBeUndefined();
  });

  it('happens once: more readings afterwards change nothing', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 3);
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    const attemptId = attemptIdOf();
    await fixOpenCircuit();
    await powerOn(6);
    await readings().recordReading();
    await flushBenchWrites();
    const done = practice().completion;
    const finishedAt = (await db.attempts.get(attemptId))?.finishedAt;
    const record = (await db.practiceRecords.toArray())[0];
    expect(done).toBeDefined();

    expect((await readings().recordReading()).status).toBe('recorded');
    await flushBenchWrites();
    expect(practice().completion).toBe(done);
    expect(practice().error).toBeUndefined();
    expect((await db.attempts.get(attemptId))?.finishedAt).toBe(finishedAt);
    expect((await db.practiceRecords.toArray())[0]).toEqual(record);
  });

  it('a series-then-parallel task checks "series", then "parallel", and needs both in order', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'series-parallel', 'WRONG_TOPOLOGY', 2);
    const clock = fixedClock(); // one clock across the reload, so later readings have later timestamps
    await open(db, 'practice-series-then-parallel', { experimentId: 'series-parallel', code: 'WRONG_TOPOLOGY' }, clock);
    const taskId = () => useTaskStore.getState().taskId;
    expect(taskId()).toBe('series');
    expect(selectPracticeProgress(practice())).toEqual({ have: 0, need: 2 });

    const wire = (pairs: [TerminalRef, TerminalRef][]): Circuit => ({
      components: bench().circuit.components.map((c) => (c.id === 'SW' && c.type === 'switch' ? { ...c, closed: true } : c.id === 'S' && c.type === 'supply' ? { ...c, voltage: 4 } : c)),
      wires: pairs.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })),
    });
    useBenchStore.setState({
      circuit: wire([['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['R1.b', 'R2.a'], ['R2.b', 'S.neg'], ['V.pos', 'R1.a'], ['V.neg', 'R2.b']]),
    });
    expect((await readings().recordReading()).status).toBe('recorded');
    await flushBenchWrites();
    expect(practice().completion).toBeUndefined();
    expect(selectPracticeProgress(practice())).toEqual({ have: 1, need: 2 });
    expect(taskId()).toBe('parallel');
    expect(practice().evidence.readings[0]?.taskId).toBe('series');
    expect(practice().evidence.topologyOkReadingIds).toHaveLength(1);

    // A reload in the middle keeps the same place in the sequence.
    resetStores();
    await open(db, 'practice-series-then-parallel', undefined, clock);
    expect(taskId()).toBe('parallel');
    expect(selectPracticeProgress(practice())).toEqual({ have: 1, need: 2 });

    useBenchStore.setState({
      circuit: wire([['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['A.neg', 'R2.a'], ['R1.b', 'S.neg'], ['R2.b', 'S.neg'], ['V.pos', 'R1.a'], ['V.neg', 'R1.b']]),
    });
    expect((await readings().recordReading()).status).toBe('recorded');
    await flushBenchWrites();
    expect(practice().completion).toEqual({ clean: true, resetCode: 'WRONG_TOPOLOGY' });
    expect(await db.errorProfile.get([USER, 'series-parallel', 'WRONG_TOPOLOGY'])).toMatchObject({ count: 0 });
  });
});

describe('calculation tasks', () => {
  const HINT: PracticeHint = { experimentId: 'series-parallel', code: 'EQUIVALENT_R_WRONG' };

  it('judges each card, never counts a pair twice, and completes at three correct', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'series-parallel', 'EQUIVALENT_R_WRONG', 2);
    await open(db, 'practice-equivalent-resistance', HINT);
    const submit = (pair: number, value: number) => practice().submitCalcAnswer(pair, value);

    expect(await submit(0, Number.NaN)).toEqual({ status: 'invalid' });
    expect(await submit(7, 1)).toEqual({ status: 'unknown-pair' });
    expect((await submit(0, 40)).status).toBe('wrong');
    expect(selectPracticeProgress(practice())).toEqual({ have: 0, need: 3 });
    expect((await submit(0, 45)).status).toBe('correct');
    expect(await submit(0, 45)).toEqual({ status: 'already-correct' });
    expect(selectPracticeProgress(practice())).toEqual({ have: 1, need: 3 });
    expect((await submit(1, 12.1)).status).toBe('correct'); // inside the 2% tolerance
    expect(practice().completion).toBeUndefined();
    expect((await submit(2, 6)).status).toBe('correct');

    expect(practice().completion).toEqual({ clean: true, resetCode: 'EQUIVALENT_R_WRONG' });
    expect(practice().calcDone).toEqual([0, 1, 2]);
    expect(await db.errorProfile.get([USER, 'series-parallel', 'EQUIVALENT_R_WRONG'])).toMatchObject({ count: 0 });
    const saved = await db.answers.toArray();
    expect(saved).toHaveLength(4); // the repeated correct one was not saved
    expect(saved.every((a) => a.taskId === 'practice-equivalent-resistance')).toBe(true);
    expect(saved[0]).toMatchObject({ typed: 40, expected: 45, correct: false });
    const events = (await listEvents(db, attemptIdOf())).filter((e) => e.actionType === 'SUBMIT_ANSWER');
    expect(events.map((e) => e.after?.pairIndex)).toEqual([0, 0, 1, 2]);
  });

  it('remembers the answered pairs after a reload', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'series-parallel', 'EQUIVALENT_R_WRONG', 1);
    await open(db, 'practice-equivalent-resistance', HINT);
    await practice().submitCalcAnswer(1, 12);
    resetStores();
    await open(db, 'practice-equivalent-resistance');
    expect(practice().calcDone).toEqual([1]);
    expect(await practice().submitCalcAnswer(1, 12)).toEqual({ status: 'already-correct' });
  });

  it('an extension calculation task resets nothing', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'series-parallel', 'EQUIVALENT_R_WRONG', 2);
    await open(db, 'extension-series-parallel');
    for (const [pair, value] of [[0, 25], [1, 10], [2, 15]] as const) await practice().submitCalcAnswer(pair, value);
    expect(practice().completion).toEqual({ clean: true, resetCode: null });
    expect(await db.errorProfile.get([USER, 'series-parallel', 'EQUIVALENT_R_WRONG'])).toMatchObject({ count: 2 });
  });

  it('refuses a calculation answer on a bench task, or when nothing is open', async () => {
    const db = await makeTestDb();
    expect(await practice().submitCalcAnswer(0, 1)).toEqual({ status: 'no-practice' });
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 1);
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    expect(await practice().submitCalcAnswer(0, 1)).toEqual({ status: 'not-a-calculation' });
    expect(await db.answers.count()).toBe(0);
  });
});

describe('leaving and finishing', () => {
  it('leavePractice marks the attempt abandoned and clears the practice state and the bench', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 2);
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    const attemptId = attemptIdOf();
    await practice().leavePractice();

    expect(await db.attempts.get(attemptId)).toMatchObject({ status: 'abandoned' });
    expect((await db.attempts.get(attemptId))?.finishedAt).toBeGreaterThan(0);
    expect(practice().current).toBeUndefined();
    expect(practice().completion).toBeUndefined();
    expect(bench().session).toBeUndefined();
    expect((await db.practiceRecords.toArray())[0]?.completedAt).toBeUndefined();
    expect(await db.errorProfile.get([USER, 'ohms-law', 'OPEN_CIRCUIT'])).toMatchObject({ count: 2 });
    await practice().leavePractice(); // nothing open: nothing happens

    // Coming back starts a new attempt, since the old one is closed.
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    expect(attemptIdOf() === attemptId).toBe(false);
    expect(await db.attempts.count()).toBe(2);
  });

  it('leaving after completion keeps the attempt completed', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 2);
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    const attemptId = attemptIdOf();
    await fixOpenCircuit();
    await powerOn(6);
    await readings().recordReading();
    await flushBenchWrites();
    await practice().leavePractice();
    expect(await db.attempts.get(attemptId)).toMatchObject({ status: 'completed' });
    expect(practice().error).toBeUndefined();
    expect(practice().current).toBeUndefined();
  });

  it('opening an experiment drops the practice state but leaves the attempt in progress to resume', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 2);
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    const attemptId = attemptIdOf();
    await bench().open({ db, userId: USER, experiment: ohmsLaw, clock: fixedClock() });
    expect(practice().current).toBeUndefined();
    expect(await db.attempts.get(attemptId)).toMatchObject({ status: 'in_progress' });
    await open(db, 'practice-fix-open-circuit');
    expect(attemptIdOf()).toBe(attemptId);
  });

  it('never finishes through finish(): the attempt stays as it is', async () => {
    const db = await makeTestDb();
    await seedProfile(db, 'ohms-law', 'OPEN_CIRCUIT', 2);
    await open(db, 'practice-fix-open-circuit', OPEN_HINT);
    expect(await readings().finish()).toEqual({ status: 'not-available' });
    expect(await db.attempts.get(attemptIdOf())).toMatchObject({ status: 'in_progress' });
    const types = (await listEvents(db, attemptIdOf())).map((e) => e.actionType);
    expect(types.includes('FINISH_TASK') || types.includes('FINISH_ATTEMPT')).toBe(false);
  });
});
