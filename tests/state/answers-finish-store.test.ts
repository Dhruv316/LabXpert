// Import order matters: tests/db/setup loads fake-indexeddb before Dexie is first imported.
import { disposeTestDbs, makeTestDb } from '../db/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAttempt, startAttempt } from '../../src/db/attempts';
import { listAnswers } from '../../src/db/answers';
import { appendEvent, listEvents } from '../../src/db/events';
import { listReadings } from '../../src/db/readings';
import type { LabXpertDB } from '../../src/db/database';
import type { ActionEvent, ActionType, Circuit, ExperimentConfig, TerminalRef } from '../../src/model/types';
import {
  flushBenchWrites,
  selectCurrentTaskId,
  selectLastAnswerResult,
  useBenchStore,
  useReadingsStore,
  useTaskStore,
  useTutorStore,
} from '../../src/state';
import { fixedClock, ohmsLaw, seriesParallel } from '../bench/helpers';

const USER = 'asha';
const bench = () => useBenchStore.getState();
const tutor = () => useTutorStore.getState();
const store = () => useReadingsStore.getState();

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
  await flushBenchWrites();
  return attemptId;
}

const wire = (pairs: [TerminalRef, TerminalRef][]) => pairs.map(([from, to], i) => ({ id: `w${i + 1}`, from, to }));

/** S -> SW -> A -> R -> S, voltmeter across R. */
function ohmsCircuit(voltage: number): Circuit {
  return {
    components: [
      { id: 'S', type: 'supply', x: 0, y: 0, voltage },
      { id: 'SW', type: 'switch', x: 0, y: 0, closed: true },
      { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 10 },
      { id: 'A', type: 'ammeter', x: 0, y: 0 },
      { id: 'V', type: 'voltmeter', x: 0, y: 0 },
    ],
    wires: wire([['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b']]),
  };
}

function spParts(voltage: number, r1: number, r2: number): Circuit['components'] {
  return [
    { id: 'S', type: 'supply', x: 0, y: 0, voltage },
    { id: 'SW', type: 'switch', x: 0, y: 0, closed: true },
    { id: 'R1', type: 'resistor', x: 0, y: 0, role: 'R1', ohms: r1 },
    { id: 'R2', type: 'resistor', x: 0, y: 0, role: 'R2', ohms: r2 },
    { id: 'A', type: 'ammeter', x: 0, y: 0 },
    { id: 'V', type: 'voltmeter', x: 0, y: 0 },
  ];
}

/** S -> SW -> R1 -> A -> R2 -> S, voltmeter across both. R1 = 10, R2 = 20 by default: 30 ohms in series. */
function seriesCircuit(voltage = 6, r1 = 10, r2 = 20): Circuit {
  return {
    components: spParts(voltage, r1, r2),
    wires: wire([
      ['S.pos', 'SW.a'], ['SW.b', 'R1.a'], ['R1.b', 'A.pos'], ['A.neg', 'R2.a'], ['R2.b', 'S.neg'], ['V.pos', 'R1.a'], ['V.neg', 'R2.b'],
    ]),
  };
}

/** Both resistors between the same two points, ammeter in the main path. 10 and 20 ohms give 6.67. */
function parallelCircuit(voltage = 6, r1 = 10, r2 = 20): Circuit {
  return {
    components: spParts(voltage, r1, r2),
    wires: wire([
      ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['R1.a', 'R2.a'], ['R1.b', 'S.neg'], ['R2.b', 'S.neg'], ['V.pos', 'R1.a'], ['V.neg', 'R1.b'],
    ]),
  };
}

const setCircuit = (circuit: Circuit) => useBenchStore.setState({ circuit });

/**
 * Swaps the open bench's clock for one whose ids come from `idAt(n)` (n counts the calls, from 1). Handing out an
 * id twice makes the table refuse the second record with a ConstraintError: a real failed save that Dexie
 * reports the same way inside a transaction, which patching a table method would not.
 */
function useIds(idAt: (n: number) => string) {
  const session = bench().session;
  if (session === undefined) throw new Error('bench is not open');
  let n = 0;
  useBenchStore.setState({ session: { ...session, clock: { now: session.clock.now, newId: () => idAt((n += 1)) } } });
  return () => useBenchStore.setState({ session });
}

async function openWith(db: LabXpertDB, circuit: Circuit, experiment: ExperimentConfig = ohmsLaw) {
  const attemptId = await openBench(db, experiment);
  setCircuit(circuit);
  return attemptId;
}

/** A reload: nothing in memory, then the same attempt is opened again. */
async function reload(db: LabXpertDB, experiment: ExperimentConfig) {
  resetStores();
  return openBench(db, experiment);
}

async function record(circuit: Circuit) {
  setCircuit(circuit);
  const result = await store().recordReading();
  expect(result.status).toBe('recorded');
}

const types = async (db: LabXpertDB, attemptId: string): Promise<ActionType[]> =>
  (await listEvents(db, attemptId)).map((event) => event.actionType);
const eventsOf = async (db: LabXpertDB, attemptId: string, type: ActionType): Promise<ActionEvent[]> =>
  (await listEvents(db, attemptId)).filter((event) => event.actionType === type);

describe('submitAnswer', () => {
  it('accepts a right answer: saved with its flag and task, logged, shown in the stores', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    const result = await store().submitAnswer(30);
    const saved = await listAnswers(db, attemptId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ attemptId, taskId: 'series', typed: 30, expected: 30, correct: true });
    expect(result).toEqual({ status: 'correct', answer: saved[0] });
    expect(store().answers).toEqual(saved);
    expect(selectLastAnswerResult(store().answers, 'series')).toBe('correct');
    // The check ran first, then the answer was saved with its own event.
    expect(await types(db, attemptId)).toEqual(['CHECKPOINT', 'SUBMIT_ANSWER']);
    const [check, event] = await listEvents(db, attemptId);
    expect(check).toMatchObject({ taskId: 'series', targetId: 'ANSWER_SUBMIT', after: { errors: [], confirmations: ['OK_ANSWER'] } });
    expect(event).toMatchObject({
      taskId: 'series',
      targetId: saved[0]?.id,
      after: { typed: 30, expected: 30, correct: true },
    });
    expect(tutor().status).toBe('results');
    expect(tutor().errors).toEqual([]);
    expect(tutor().confirmations.map((r) => r.code)).toEqual(['OK_ANSWER']);
  });

  it('rejects a wrong answer: saved as wrong, the error is in the tutor store', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    const result = await store().submitAnswer(10);
    const saved = await listAnswers(db, attemptId);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ taskId: 'series', typed: 10, expected: 30, correct: false });
    expect(result).toEqual({ status: 'wrong', answer: saved[0] });
    expect(selectLastAnswerResult(store().answers, 'series')).toBe('wrong');
    expect(tutor().errors.map((r) => r.feedbackKey)).toEqual(['EQUIVALENT_R_WRONG.series']);
    expect(await types(db, attemptId)).toEqual(['CHECKPOINT', 'SUBMIT_ANSWER']);
    expect((await eventsOf(db, attemptId, 'SUBMIT_ANSWER'))[0]?.after).toEqual({ typed: 10, expected: 30, correct: false });
  });

  it('accepts exactly 2% off and rejects anything just over', async () => {
    const db = await makeTestDb();
    await openWith(db, seriesCircuit(), seriesParallel);
    const statuses: string[] = [];
    for (const typed of [30.6, 29.4, 30.61, 29.39]) statuses.push((await store().submitAnswer(typed)).status);
    expect(statuses).toEqual(['correct', 'correct', 'wrong', 'wrong']);
  });

  it('judges a parallel task by the parallel formula on the current resistor values', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db, seriesParallel);
    await appendEvent(db, { id: 'n1', userId: USER, attemptId, experimentId: 'series-parallel', actionType: 'NEXT_TASK', targetId: 'parallel', timestamp: 5000 });
    await reload(db, seriesParallel);
    setCircuit(parallelCircuit(6, 10, 20));
    expect(selectCurrentTaskId(useTaskStore.getState(), seriesParallel)).toBe('parallel');
    expect((await store().submitAnswer(30)).status).toBe('wrong');
    expect((await store().submitAnswer(6.67)).status).toBe('correct');
    const saved = await listAnswers(db, attemptId);
    expect(saved.map((a) => [a.taskId, a.typed, a.correct])).toEqual([['parallel', 30, false], ['parallel', 6.67, true]]);
    expect(saved[0]?.expected).toBeCloseTo(20 / 3, 6);
    // The values on the bench are what counts, not the experiment's defaults.
    setCircuit(parallelCircuit(6, 30, 30));
    expect((await store().submitAnswer(15)).status).toBe('correct');
  });

  it('lets a wrong answer be tried again any number of times; every try is saved', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    for (const typed of [1, 2, 3, 4]) expect((await store().submitAnswer(typed)).status).toBe('wrong');
    expect((await store().submitAnswer(30)).status).toBe('correct');
    const saved = await listAnswers(db, attemptId);
    expect(saved.map((a) => a.correct)).toEqual([false, false, false, false, true]);
    expect(store().answers).toEqual(saved);
    expect(selectLastAnswerResult(store().answers, 'series')).toBe('correct');
    expect(await eventsOf(db, attemptId, 'SUBMIT_ANSWER')).toHaveLength(5);
  });

  it('refuses a value that is not a number: nothing is run or saved', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 'abc' as unknown as number, undefined as unknown as number]) {
      expect(await store().submitAnswer(bad)).toEqual({ status: 'invalid' });
    }
    expect(await listAnswers(db, attemptId)).toEqual([]);
    expect(await listEvents(db, attemptId)).toEqual([]);
    expect(await db.errorOccurrences.count()).toBe(0);
    expect(tutor().status).toBe('instructions');
    expect(store().answers).toEqual([]);
  });

  it('does not judge when a resistor is missing: blocked, nothing saved', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, { components: seriesCircuit().components.filter((c) => c.id !== 'R2'), wires: [] }, seriesParallel);
    expect(await store().submitAnswer(30)).toEqual({ status: 'blocked' });
    expect(await listAnswers(db, attemptId)).toEqual([]);
    expect(store().answers).toEqual([]);
    expect(tutor().errors.map((r) => r.code)).toEqual(['MISSING_COMPONENT']);
    expect(await types(db, attemptId)).toEqual(['CHECKPOINT']);
  });

  it('has nothing to check on a task without an equivalent answer (Ohm\'s Law)', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, ohmsCircuit(6));
    expect(await store().submitAnswer(10)).toEqual({ status: 'not-needed' });
    expect(await listEvents(db, attemptId)).toEqual([]);
    expect(await listAnswers(db, attemptId)).toEqual([]);
    expect(tutor().status).toBe('instructions');
  });

  it('does nothing without an open bench', async () => {
    expect(await store().submitAnswer(30)).toEqual({ status: 'no-bench' });
  });

  it('works for a practice attempt', async () => {
    const db = await makeTestDb();
    const clock = fixedClock();
    const attempt = await startAttempt(db, { id: clock.newId(), userId: USER, experimentId: 'series-parallel', kind: 'practice', practiceTaskId: 'p', startedAt: clock.now() });
    useBenchStore.setState({ session: { db, clock, experiment: seriesParallel, userId: USER, attemptId: attempt.id }, circuit: seriesCircuit() });
    expect((await store().submitAnswer(30)).status).toBe('correct');
    expect(await listAnswers(db, attempt.id)).toHaveLength(1);
  });

  it('a failed save rejects and leaves the table, the log and the store as they were', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    // Every id is 'dup': the check's own event takes it, so the answer's event is refused and the answer with it.
    const restore = useIds(() => 'dup');
    let failed = false;
    try {
      await store().submitAnswer(30);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(await listAnswers(db, attemptId)).toEqual([]);
    expect(await eventsOf(db, attemptId, 'SUBMIT_ANSWER')).toEqual([]);
    expect(store().answers).toEqual([]);
    // The write queue is not stuck: the next try works.
    restore();
    expect((await store().submitAnswer(30)).status).toBe('correct');
    expect(await listAnswers(db, attemptId)).toHaveLength(1);
  });
});

describe('finish: blocked', () => {
  it('reports MISSING_READING and MISSING_ANSWER together and changes nothing else', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    const circuit = bench().circuit;
    expect(await store().finish()).toEqual({ status: 'blocked' });
    expect(tutor().errors.map((r) => r.code)).toEqual(['MISSING_READING', 'MISSING_ANSWER']);
    expect(tutor().errors[0]?.params).toEqual({ have: 0, need: 3 });
    // Only the check itself was logged: no FINISH_TASK, NEXT_TASK or FINISH_ATTEMPT.
    expect(await types(db, attemptId)).toEqual(['CHECKPOINT']);
    expect((await eventsOf(db, attemptId, 'CHECKPOINT'))[0]).toMatchObject({ taskId: 'series', targetId: 'FINISH' });
    expect(useTaskStore.getState().taskId).toBe('series');
    expect(bench().circuit).toBe(circuit);
    expect((await getAttempt(db, attemptId))?.status).toBe('in_progress');
    expect(store().readings).toEqual([]);
    expect(store().answers).toEqual([]);
  });

  it('reports only what is missing', async () => {
    const db = await makeTestDb();
    await openWith(db, seriesCircuit(), seriesParallel);
    for (const v of [2, 4, 6]) await record(seriesCircuit(v));
    expect(await store().finish()).toEqual({ status: 'blocked' });
    expect(tutor().errors.map((r) => r.code)).toEqual(['MISSING_ANSWER']);

    expect((await store().submitAnswer(30)).status).toBe('correct');
    expect(await store().finish()).toEqual({ status: 'next-task', taskId: 'parallel' });
  });

  it('a wrong answer does not count', async () => {
    const db = await makeTestDb();
    await openWith(db, seriesCircuit(), seriesParallel);
    for (const v of [2, 4, 6]) await record(seriesCircuit(v));
    await store().submitAnswer(31);
    expect(await store().finish()).toEqual({ status: 'blocked' });
    expect(tutor().errors.map((r) => r.code)).toEqual(['MISSING_ANSWER']);
  });

  it('counts the same voltage once: five readings at one voltage are not enough', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, ohmsCircuit(4));
    for (let i = 0; i < 5; i += 1) await record(ohmsCircuit(4));
    expect(await listReadings(db, attemptId)).toHaveLength(5);
    expect(await store().finish()).toEqual({ status: 'blocked' });
    expect(tutor().errors.map((r) => r.code)).toEqual(['MISSING_READING']);
    expect(tutor().errors[0]?.params).toEqual({ have: 1, need: 5 });
    expect(await eventsOf(db, attemptId, 'FINISH_ATTEMPT')).toEqual([]);
    expect((await getAttempt(db, attemptId))?.status).toBe('in_progress');
  });

  it('saves the FINISH check once per press', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    await store().finish();
    const finishChecks = async () => (await eventsOf(db, attemptId, 'CHECKPOINT')).filter((e) => e.targetId === 'FINISH');
    expect(await finishChecks()).toHaveLength(1);
    // One occurrence and one profile count for each of the two errors.
    expect(await db.errorOccurrences.count()).toBe(2);
    expect((await db.errorProfile.toArray()).map((e) => [e.code, e.count]).sort()).toEqual([['MISSING_ANSWER', 1], ['MISSING_READING', 1]]);
    await store().finish();
    expect(await finishChecks()).toHaveLength(2);
  });

  it('two presses at once run one check and give the same answer', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    const [first, second] = await Promise.all([store().finish(), store().finish()]);
    expect(first).toEqual({ status: 'blocked' });
    expect(second).toBe(first);
    expect((await eventsOf(db, attemptId, 'CHECKPOINT')).filter((e) => e.targetId === 'FINISH')).toHaveLength(1);
  });

  it('does nothing without an open bench', async () => {
    expect(await store().finish()).toEqual({ status: 'no-bench' });
  });
});

describe('finish: the last task', () => {
  it('Ohm\'s Law with 5 readings at 5 distinct voltages finishes the attempt', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, ohmsCircuit(1));
    for (const v of [1, 2, 3, 4, 5]) await record(ohmsCircuit(v));
    const circuit = bench().circuit;
    const result = await store().finish();
    expect(result).toEqual({ status: 'finished', attemptId });
    const log = await listEvents(db, attemptId);
    expect(log.slice(-3).map((e) => e.actionType)).toEqual(['CHECKPOINT', 'FINISH_TASK', 'FINISH_ATTEMPT']);
    expect(log.slice(-3)[0]).toMatchObject({ targetId: 'FINISH', after: { errors: [] } });
    expect(log.slice(-2)[0]).toMatchObject({ taskId: 'main', targetId: 'main' });
    const ended = log[log.length - 1];
    expect(ended).toMatchObject({ taskId: 'main', targetId: attemptId, after: { status: 'completed' } });
    expect(await eventsOf(db, attemptId, 'NEXT_TASK')).toEqual([]);
    const attempt = await getAttempt(db, attemptId);
    expect(attempt?.status).toBe('completed');
    expect(attempt?.finishedAt).toBe(ended?.timestamp);
    expect(bench().circuit).toBe(circuit);
    expect(await db.errorOccurrences.count()).toBe(0);
  });

  it('the last series-parallel task finishes after the parallel task', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    for (const v of [2, 4, 6]) await record(seriesCircuit(v));
    await store().submitAnswer(30);
    expect((await store().finish()).status).toBe('next-task');

    // Parallel task: rebuilt bench, three readings, the parallel answer.
    for (const v of [2, 4, 6]) await record(parallelCircuit(v));
    expect(await store().finish()).toEqual({ status: 'blocked' });
    expect(tutor().errors.map((r) => r.code)).toEqual(['MISSING_ANSWER']);
    await store().submitAnswer(6.67);
    expect(await store().finish()).toEqual({ status: 'finished', attemptId });
    const log = await listEvents(db, attemptId);
    expect(log.filter((e) => e.actionType === 'FINISH_TASK').map((e) => e.taskId)).toEqual(['series', 'parallel']);
    expect(log.slice(-2).map((e) => e.actionType)).toEqual(['FINISH_TASK', 'FINISH_ATTEMPT']);
    expect((await getAttempt(db, attemptId))?.status).toBe('completed');
  });

  it('a finished attempt cannot be finished again', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, ohmsCircuit(1));
    for (const v of [1, 2, 3, 4, 5]) await record(ohmsCircuit(v));
    expect((await store().finish()).status).toBe('finished');
    const count = (await listEvents(db, attemptId)).length;
    expect(await store().finish()).toEqual({ status: 'not-available' });
    expect(await listEvents(db, attemptId)).toHaveLength(count);
  });
});

describe('finish: moving to the next task', () => {
  it('logs FINISH_TASK and NEXT_TASK, keeps the bench and puts the tutor back to the instructions', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    for (const v of [2, 4, 6]) await record(seriesCircuit(v));
    await store().submitAnswer(30);
    expect(tutor().status).toBe('results');
    const before = bench();
    const circuit = before.circuit;
    const history = before.history;
    const readingsBefore = store().readings;

    expect(await store().finish()).toEqual({ status: 'next-task', taskId: 'parallel' });

    const log = await listEvents(db, attemptId);
    expect(log.slice(-3).map((e) => e.actionType)).toEqual(['CHECKPOINT', 'FINISH_TASK', 'NEXT_TASK']);
    expect(log.slice(-2)[0]).toMatchObject({ taskId: 'series', targetId: 'series' });
    expect(log.slice(-1)[0]).toMatchObject({ taskId: 'parallel', targetId: 'parallel', before: { taskId: 'series' }, after: { taskId: 'parallel' } });
    // The current task moved on, and the attempt did not finish.
    expect(useTaskStore.getState().taskId).toBe('parallel');
    expect(selectCurrentTaskId(useTaskStore.getState(), seriesParallel)).toBe('parallel');
    expect((await getAttempt(db, attemptId))?.status).toBe('in_progress');
    // The bench is exactly as it was.
    expect(bench().circuit).toBe(circuit);
    expect(bench().history).toBe(history);
    expect(bench().session?.attemptId).toBe(attemptId);
    expect(store().readings).toBe(readingsBefore);
    // The tutor shows the new task's instructions, with nothing left over from the check.
    expect(tutor().status).toBe('instructions');
    expect(tutor().errors).toEqual([]);
    expect(tutor().confirmations).toEqual([]);
    expect(tutor().highlight.componentIds).toEqual([]);
  });

  it('checks and saves the next task\'s work under that task', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    for (const v of [2, 4, 6]) await record(seriesCircuit(v));
    await store().submitAnswer(30);
    await store().finish();
    // The series work does not count towards the parallel task.
    expect(await store().finish()).toEqual({ status: 'blocked' });
    expect(tutor().errors[0]?.params).toEqual({ have: 0, need: 3 });
    setCircuit(parallelCircuit(2));
    await store().recordReading();
    expect((await listReadings(db, attemptId)).map((r) => r.taskId)).toEqual(['series', 'series', 'series', 'parallel']);
  });

  it('survives a reload: the current task is read back from NEXT_TASK', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    for (const v of [2, 4, 6]) await record(seriesCircuit(v));
    await store().submitAnswer(30);
    await store().finish();
    expect(await reload(db, seriesParallel)).toBe(attemptId);
    expect(useTaskStore.getState().taskId).toBe('parallel');
    expect(selectCurrentTaskId(useTaskStore.getState(), seriesParallel)).toBe('parallel');
    expect(tutor().status).toBe('instructions');
    // And the next check is for the parallel task.
    await store().finish();
    const checks = (await eventsOf(db, attemptId, 'CHECKPOINT')).filter((e) => e.targetId === 'FINISH');
    // Sorted: the test's fixed clock starts over after the simulated reload, so the log's own order is not the order pressed.
    expect(checks.map((e) => e.taskId).sort()).toEqual(['parallel', 'series']);
  });

  it('a failed save rejects, keeps neither event, and the task does not move', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, seriesCircuit(), seriesParallel);
    for (const v of [2, 4, 6]) await record(seriesCircuit(v));
    await store().submitAnswer(30);
    // The check's event gets its own id; FINISH_TASK and NEXT_TASK then get the same one, so the second is
    // refused and the first has to be rolled back with it.
    const restore = useIds((n) => (n === 1 ? 'check' : 'dup'));
    let failed = false;
    try {
      await store().finish();
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(await eventsOf(db, attemptId, 'FINISH_TASK')).toEqual([]);
    expect(await eventsOf(db, attemptId, 'NEXT_TASK')).toEqual([]);
    expect(useTaskStore.getState().taskId).toBe('series');
    expect(tutor().status).toBe('results');
    // Not stuck: pressing again works.
    restore();
    expect(await store().finish()).toEqual({ status: 'next-task', taskId: 'parallel' });
  });
});

describe('finish: practice attempts', () => {
  it('refuses, runs nothing and finishes nothing; recording and checking still work', async () => {
    const db = await makeTestDb();
    const clock = fixedClock();
    const attempt = await startAttempt(db, { id: clock.newId(), userId: USER, experimentId: 'ohms-law', kind: 'practice', practiceTaskId: 'p', startedAt: clock.now() });
    useBenchStore.setState({ session: { db, clock, experiment: ohmsLaw, userId: USER, attemptId: attempt.id }, circuit: ohmsCircuit(1) });
    for (const v of [1, 2, 3, 4, 5]) await record(ohmsCircuit(v));
    const before = (await listEvents(db, attempt.id)).length;

    expect(await store().finish()).toEqual({ status: 'not-available' });
    expect(await listEvents(db, attempt.id)).toHaveLength(before);
    expect(await eventsOf(db, attempt.id, 'FINISH_TASK')).toEqual([]);
    expect(await eventsOf(db, attempt.id, 'FINISH_ATTEMPT')).toEqual([]);
    expect((await getAttempt(db, attempt.id))?.status).toBe('in_progress');
    expect((await getAttempt(db, attempt.id))?.finishedAt).toBeUndefined();
    expect(tutor().status).toBe('results');
    expect(tutor().errors).toEqual([]);
  });
});
