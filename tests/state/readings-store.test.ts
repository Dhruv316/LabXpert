// Import order matters: tests/db/setup loads fake-indexeddb before Dexie is first imported.
import { disposeTestDbs, makeTestDb } from '../db/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startAttempt } from '../../src/db/attempts';
import { appendEvent, listEvents } from '../../src/db/events';
import { listReadings } from '../../src/db/readings';
import type { LabXpertDB } from '../../src/db/database';
import type { ActionEvent, Circuit, ExperimentConfig, TerminalRef } from '../../src/model/types';
import {
  flushBenchWrites,
  selectCurrentTaskId,
  selectRecordingAllowed,
  selectTaskProgress,
  selectTaskReadings,
  useBenchStore,
  useReadingsStore,
  useTaskStore,
  useTutorStore,
} from '../../src/state';
import { fixedClock, ohmsLaw, seriesParallel } from '../bench/helpers';

const USER = 'asha';
const bench = () => useBenchStore.getState();
const tutor = () => useTutorStore.getState();
const readings = () => useReadingsStore.getState();

function resetStores() {
  useBenchStore.setState(useBenchStore.getInitialState(), true);
  useTutorStore.setState(useTutorStore.getInitialState(), true);
  useReadingsStore.setState(useReadingsStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
}

beforeEach(resetStores);
afterEach(async () => {
  await flushBenchWrites();
  resetStores();
  await disposeTestDbs();
});

async function openBench(db: LabXpertDB, experiment: ExperimentConfig = ohmsLaw) {
  await bench().open({ db, userId: USER, experiment, clock: fixedClock() });
  const attemptId = bench().session?.attemptId;
  if (attemptId === undefined) throw new Error('bench did not open');
  return attemptId;
}

/** S -> SW -> A -> R -> S, voltmeter across R. `omit` drops wires by id (w1..w6) to break the loop. */
function wired(voltage: number, ohms = 10, omit: string[] = []): Circuit {
  const pairs: [TerminalRef, TerminalRef][] = [
    ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
  ];
  return {
    components: [
      { id: 'S', type: 'supply', x: 0, y: 0, voltage },
      { id: 'SW', type: 'switch', x: 0, y: 0, closed: true },
      { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms },
      { id: 'A', type: 'ammeter', x: 0, y: 0 },
      { id: 'V', type: 'voltmeter', x: 0, y: 0 },
    ],
    wires: pairs.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })).filter((w) => !omit.includes(w.id)),
  };
}

async function openWith(db: LabXpertDB, circuit: Circuit) {
  const attemptId = await openBench(db);
  useBenchStore.setState({ circuit });
  return attemptId;
}

const types = async (db: LabXpertDB, attemptId: string) => (await listEvents(db, attemptId)).map((e) => e.actionType);

describe('Record reading', () => {
  it('needs voltage at 0 V and runs no checkpoint', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(0));
    expect(await readings().recordReading()).toEqual({ status: 'needs-voltage' });
    expect(await types(db, attemptId)).toEqual([]);
    expect(tutor().status).toBe('instructions');
    expect(await listReadings(db, attemptId)).toEqual([]);
    expect(readings().readings).toEqual([]);
  });

  it('is blocked by an error: nothing saved, the error is in the tutor store, one saved check', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(6, 10, ['w4']));
    expect(await readings().recordReading()).toEqual({ status: 'blocked' });
    expect(await listReadings(db, attemptId)).toEqual([]);
    expect(readings().readings).toEqual([]);
    expect(tutor().status).toBe('results');
    expect(tutor().errors.map((r) => r.code)).toEqual(['OPEN_CIRCUIT']);
    expect(await types(db, attemptId)).toEqual(['CHECKPOINT']);
    // The check went through saveEvaluation once: one occurrence and one profile count.
    expect(await db.errorOccurrences.count()).toBe(1);
    expect((await db.errorProfile.toArray())[0]).toMatchObject({ code: 'OPEN_CIRCUIT', count: 1 });
  });

  it('records the real values when clean, logs CHECKPOINT then RECORD_READING, and confirms', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(6));
    const result = await readings().recordReading();
    expect(result.status).toBe('recorded');
    const saved = await listReadings(db, attemptId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ attemptId, taskId: 'main', supplyVoltage: 6, voltmeter: 6, ammeter: 0.6 });
    expect(result).toEqual({ status: 'recorded', reading: saved[0] });
    expect(readings().readings).toEqual(saved);
    expect(await types(db, attemptId)).toEqual(['CHECKPOINT', 'RECORD_READING']);
    const event = (await listEvents(db, attemptId))[1];
    expect(event).toMatchObject({ targetId: saved[0]?.id, taskId: 'main', after: { supplyVoltage: 6, voltmeter: 6, ammeter: 0.6 } });
    expect(tutor().errors).toEqual([]);
    expect(tutor().confirmations.length).toBeGreaterThan(0);
    expect(await db.errorOccurrences.count()).toBe(0);
  });

  it('saves the numbers the meters show, rounded to 2 decimals', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(7, 15));
    await readings().recordReading();
    expect((await listReadings(db, attemptId))[0]).toMatchObject({ supplyVoltage: 7, voltmeter: 7, ammeter: 0.47 });
  });

  it('allows the same voltage again', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(4));
    await readings().recordReading();
    await readings().recordReading();
    expect(await listReadings(db, attemptId)).toHaveLength(2);
    expect(readings().readings).toHaveLength(2);
    expect(await types(db, attemptId)).toEqual(['CHECKPOINT', 'RECORD_READING', 'CHECKPOINT', 'RECORD_READING']);
  });

  it('runs the check before the new reading exists', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(5));
    await readings().recordReading();
    // The CHECKPOINT event comes first in the log and the reading's timestamp is later than it.
    const log = await listEvents(db, attemptId);
    expect(log[0]?.actionType).toBe('CHECKPOINT');
    expect(log[0]?.timestamp).toBeLessThan((await listReadings(db, attemptId))[0]?.timestamp ?? 0);
  });

  it('does nothing without an open bench', async () => {
    expect(await readings().recordReading()).toEqual({ status: 'no-bench' });
  });

  it('works for a practice attempt with the same rules', async () => {
    const db = await makeTestDb();
    const clock = fixedClock();
    const attempt = await startAttempt(db, {
      id: clock.newId(), userId: USER, experimentId: 'ohms-law', kind: 'practice', practiceTaskId: 'p', startedAt: clock.now(),
    });
    useBenchStore.setState({
      session: { db, clock, experiment: ohmsLaw, userId: USER, attemptId: attempt.id },
      circuit: wired(6),
    });
    expect((await readings().recordReading()).status).toBe('recorded');
    expect(await listReadings(db, attempt.id)).toHaveLength(1);
    useBenchStore.setState({ circuit: wired(6, 10, ['w4']) });
    expect((await readings().recordReading()).status).toBe('blocked');
    expect(await listReadings(db, attempt.id)).toHaveLength(1);
    expect(await db.errorProfile.count()).toBe(0);
  });
});

describe('loading and the current task', () => {
  const nextTask = (attemptId: string, target: string, timestamp: number): ActionEvent => ({
    id: `n-${timestamp}`, userId: USER, attemptId, experimentId: 'series-parallel',
    actionType: 'NEXT_TASK', targetId: target, timestamp,
  });

  it('is the first task for a new attempt', async () => {
    const db = await makeTestDb();
    await openBench(db, seriesParallel);
    await flushBenchWrites();
    expect(selectCurrentTaskId(useTaskStore.getState(), seriesParallel)).toBe('series');
    expect(selectTaskProgress(seriesParallel, 'series')).toEqual({ current: 1, total: 2 });
  });

  it('comes from the latest NEXT_TASK event and survives a reload', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db, seriesParallel);
    await appendEvent(db, nextTask(attemptId, 'parallel', 5000));
    resetStores(); // a reload: nothing in memory
    await openBench(db, seriesParallel);
    await flushBenchWrites();
    expect(bench().session?.attemptId).toBe(attemptId);
    expect(useTaskStore.getState().taskId).toBe('parallel');
    expect(selectTaskProgress(seriesParallel, 'parallel')).toEqual({ current: 2, total: 2 });
  });

  it('is what the tutor checks and what a reading is saved for', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db, seriesParallel);
    await appendEvent(db, nextTask(attemptId, 'parallel', 5000));
    resetStores();
    await openBench(db, seriesParallel);
    await tutor().runCheckpoint('SWITCH_CLOSE');
    const checks = (await listEvents(db, attemptId)).filter((e) => e.actionType === 'CHECKPOINT');
    expect(checks[0]?.taskId).toBe('parallel');
  });

  it('loads the attempt\'s readings again after a reload and filters them by task', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(6));
    await readings().recordReading();
    resetStores();
    await openBench(db);
    await flushBenchWrites();
    expect(readings().readings).toHaveLength(1);
    expect(selectTaskReadings(readings().readings, 'main')).toHaveLength(1);
    expect(selectTaskReadings(readings().readings, 'other')).toEqual([]);
    expect(readings().readings[0]?.attemptId).toBe(attemptId);
  });

  it('gives the same array until the readings or the task change', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(6));
    await readings().recordReading();
    const first = selectTaskReadings(readings().readings, 'main');
    expect(selectTaskReadings(readings().readings, 'main')).toBe(first);
  });
});

describe('selectors', () => {
  it('allows recording only when the supply is above 0 V', () => {
    expect(selectRecordingAllowed({ circuit: wired(0) })).toBe(false);
    expect(selectRecordingAllowed({ circuit: wired(1) })).toBe(true);
  });

  it('falls back to the first task for an unknown task id', () => {
    expect(selectCurrentTaskId({ taskId: 'nope' }, seriesParallel)).toBe('series');
    expect(selectCurrentTaskId({ taskId: undefined }, ohmsLaw)).toBe('main');
  });
});
