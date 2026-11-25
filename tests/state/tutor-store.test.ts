// Import order matters: tests/db/setup loads fake-indexeddb before Dexie is first imported.
import { disposeTestDbs, makeTestDb } from '../db/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { highlightTargets } from '../../src/bench/checkpoint';
import { startAttempt } from '../../src/db/attempts';
import { listEvents } from '../../src/db/events';
import type { LabXpertDB } from '../../src/db/database';
import { evaluate } from '../../src/engine/evaluate';
import { t } from '../../src/i18n';
import type { ActionEvent, Circuit, ExperimentConfig, TerminalRef } from '../../src/model/types';
import { checkAfterSwitchToggle, flushBenchWrites, useBenchStore, useTutorStore } from '../../src/state';
import { fixedClock, ohmsLaw } from '../bench/helpers';

const USER = 'asha';
const bench = () => useBenchStore.getState();
const tutor = () => useTutorStore.getState();

function resetStores() {
  useBenchStore.setState(useBenchStore.getInitialState(), true);
  useTutorStore.setState(useTutorStore.getInitialState(), true);
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
function wired(closed: boolean, voltage = 6, omit: string[] = []): Circuit {
  const pairs: [TerminalRef, TerminalRef][] = [
    ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
  ];
  return {
    components: [
      { id: 'S', type: 'supply', x: 0, y: 0, voltage },
      { id: 'SW', type: 'switch', x: 0, y: 0, closed },
      { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 10 },
      { id: 'A', type: 'ammeter', x: 0, y: 0 },
      { id: 'V', type: 'voltmeter', x: 0, y: 0 },
    ],
    wires: pairs.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })).filter((w) => !omit.includes(w.id)),
  };
}

/** Ammeter left unwired and voltmeter reversed: two errors, AMMETER_NOT_IN_SERIES then WRONG_POLARITY (w1..w5). */
function twoErrors(closed: boolean): Circuit {
  const pairs: [TerminalRef, TerminalRef][] = [
    ['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.b'], ['V.neg', 'R.a'],
  ];
  return { components: wired(closed).components, wires: pairs.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })) };
}

const BROKEN = ['w4'];

async function openWith(db: LabXpertDB, circuit: Circuit) {
  const attemptId = await openBench(db);
  useBenchStore.setState({ circuit });
  return attemptId;
}

async function checkpoints(db: LabXpertDB, attemptId: string): Promise<ActionEvent[]> {
  return (await listEvents(db, attemptId)).filter((e) => e.actionType === 'CHECKPOINT');
}

/** What the switch hook does: toggle, then let the tutor decide whether a check follows. */
async function toggle(id: string) {
  await checkAfterSwitchToggle(await bench().toggleSwitch(id));
}

describe('the SWITCH_CLOSE trigger', () => {
  it('closing the switch runs SWITCH_CLOSE once; opening runs nothing', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(false));
    await toggle('SW');
    let found = await checkpoints(db, attemptId);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ targetId: 'SWITCH_CLOSE', taskId: 'main', experimentId: 'ohms-law', userId: USER });
    await toggle('SW');
    found = await checkpoints(db, attemptId);
    expect(found).toHaveLength(1);
    expect(bench().circuit.components.find((c) => c.id === 'SW')).toMatchObject({ closed: false });
  });

  it('checkAfterSwitchToggle runs a check only for a switch that is now closed', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(true));
    await checkAfterSwitchToggle(false);
    await checkAfterSwitchToggle(undefined);
    expect(await checkpoints(db, attemptId)).toHaveLength(0);
    await checkAfterSwitchToggle(true);
    expect(await checkpoints(db, attemptId)).toHaveLength(1);
  });

  it('logs the check after the toggle it follows', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(false));
    await toggle('SW');
    const types = (await listEvents(db, attemptId)).map((e) => e.actionType);
    expect(types).toEqual(['TOGGLE_SWITCH', 'CHECKPOINT']);
  });

  it('does nothing when no bench is open', async () => {
    expect(await tutor().runCheckpoint('SWITCH_CLOSE')).toBeUndefined();
    expect(tutor().status).toBe('instructions');
  });
});

describe('saving the results', () => {
  it('saves the occurrence and the profile count once, and an unchanged circuit rechecked is not counted twice', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(false, 6, BROKEN));
    await toggle('SW');
    expect(await db.errorOccurrences.toArray()).toMatchObject([{ attemptId, code: 'OPEN_CIRCUIT', checkpoint: 'SWITCH_CLOSE' }]);
    expect(await db.errorProfile.toArray()).toMatchObject([
      { userId: USER, experimentId: 'ohms-law', code: 'OPEN_CIRCUIT', count: 1 },
    ]);
    await toggle('SW'); // open
    await toggle('SW'); // closed again, same circuit
    expect(await db.errorOccurrences.count()).toBe(1);
    expect((await db.errorProfile.toArray())[0]).toMatchObject({ count: 1 });
    expect(await checkpoints(db, attemptId)).toHaveLength(2);
  });

  it('gives a fixed error resolvedAt, and leaves the profile count alone', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(false, 6, BROKEN));
    await toggle('SW');
    expect((await db.errorOccurrences.toArray())[0]?.resolvedAt).toBeUndefined();
    useBenchStore.setState({ circuit: wired(false) });
    await toggle('SW');
    const [occurrence] = await db.errorOccurrences.toArray();
    expect(occurrence).toMatchObject({ code: 'OPEN_CIRCUIT' });
    expect(typeof occurrence?.resolvedAt).toBe('number');
    expect((await db.errorProfile.toArray())[0]).toMatchObject({ count: 1 });
  });

  it('a practice attempt saves occurrences but never changes the profile', async () => {
    const db = await makeTestDb();
    await startAttempt(db, { id: 'practice-1', userId: USER, experimentId: 'ohms-law', kind: 'practice', practiceTaskId: 'p', startedAt: 1 });
    useBenchStore.setState({
      session: { db, clock: fixedClock(), experiment: ohmsLaw, userId: USER, attemptId: 'practice-1' },
      circuit: wired(true, 6, BROKEN),
    });
    await tutor().runCheckpoint('SWITCH_CLOSE');
    expect(await db.errorOccurrences.count()).toBe(1);
    expect(await db.errorProfile.count()).toBe(0);
    expect(await checkpoints(db, 'practice-1')).toHaveLength(1);
  });

  it('a failed save is rejected to the caller, leaves the panel as it was, and does not block the next check', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(true, 6, BROKEN));
    vi.spyOn(db.events, 'add').mockRejectedValueOnce(new Error('disk full'));
    await expect(tutor().runCheckpoint('SWITCH_CLOSE')).rejects.toThrow('disk full');
    expect(tutor().status).toBe('instructions');
    await tutor().runCheckpoint('SWITCH_CLOSE');
    expect(tutor().status).toBe('results');
  });
});

describe('the CHECKPOINT event', () => {
  it('is logged for a clean run, with confirmations and no errors, and saves nothing else', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(false));
    await toggle('SW');
    const [event] = await checkpoints(db, attemptId);
    expect(event?.after).toMatchObject({ errors: [] });
    const confirmations = event?.after?.confirmations;
    expect(Array.isArray(confirmations) && confirmations.includes('OK_CIRCUIT_COMPLETE')).toBe(true);
    expect(await db.errorOccurrences.count()).toBe(0);
    expect(await db.errorProfile.count()).toBe(0);
  });

  it('is logged for a failing run, with the error codes only', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(false, 6, BROKEN));
    await toggle('SW');
    const [event] = await checkpoints(db, attemptId);
    expect(event?.after).toEqual({ errors: ['OPEN_CIRCUIT'], confirmations: [] });
  });

  it('carries the checkpoint name and the task for every checkpoint', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(true));
    await tutor().runCheckpoint('RECORD_READING');
    await tutor().runCheckpoint('FINISH', { taskId: 'main' });
    await tutor().runCheckpoint('ANSWER_SUBMIT', { submittedAnswer: 30 });
    const found = await checkpoints(db, attemptId);
    expect(found.map((e) => e.targetId)).toEqual(['RECORD_READING', 'FINISH', 'ANSWER_SUBMIT']);
    expect(found.every((e) => e.taskId === 'main')).toBe(true);
  });
});

describe('the tutor state after a check', () => {
  it('starts with the instructions and a happy owl', () => {
    expect(tutor()).toMatchObject({ status: 'instructions', errors: [], confirmations: [], primaryIndex: 0, mood: 'happy' });
    expect(tutor().highlight).toEqual({ componentIds: [], wireIds: [] });
    expect(tutor().mistakeWaiting).toBe(false);
  });

  it('a clean circuit gives confirmations, no errors, a happy owl and nothing to highlight', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(false));
    await toggle('SW');
    expect(tutor().status).toBe('results');
    expect(tutor().errors).toEqual([]);
    expect(tutor().confirmations.map((r) => r.code)).toContain('OK_CIRCUIT_COMPLETE');
    expect(tutor().mood).toBe('happy');
    expect(tutor().highlight).toEqual({ componentIds: [], wireIds: [] });
  });

  it('an open circuit gives an error, and the owl comes from its feedback entry', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(false, 6, BROKEN));
    await toggle('SW');
    expect(tutor().errors.map((r) => r.feedbackKey)).toEqual(['OPEN_CIRCUIT.gap']);
    expect(tutor().primaryIndex).toBe(0);
    expect(tutor().mood).toBe(t('OPEN_CIRCUIT.gap').owl);
  });

  it('matches what the engine returns for the same circuit', async () => {
    const db = await makeTestDb();
    await openWith(db, twoErrors(false));
    await toggle('SW');
    const expected = evaluate({
      experiment: ohmsLaw,
      taskId: 'main',
      circuit: bench().circuit,
      checkpoint: 'SWITCH_CLOSE',
      readings: [],
      answers: [],
    });
    expect([...tutor().errors, ...tutor().confirmations]).toEqual(expect.arrayContaining(expected));
    expect(tutor().errors.map((r) => r.code)).toEqual(['AMMETER_NOT_IN_SERIES', 'WRONG_POLARITY']);
  });

  it('highlights the primary error’s parts and the wires touching them', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(false));
    await tutor().runCheckpoint('RECORD_READING'); // switch still open
    expect(tutor().errors.map((r) => r.feedbackKey)).toEqual(['OPEN_CIRCUIT.switch_open']);
    expect(tutor().highlight).toEqual({ componentIds: ['SW'], wireIds: ['w1', 'w2'] });
  });

  it('MISSING_COMPONENT keeps its params.types', async () => {
    const db = await makeTestDb();
    await openWith(db, { components: wired(true).components.filter((c) => c.id === 'S' || c.id === 'SW'), wires: [] });
    await tutor().runCheckpoint('RECORD_READING');
    const missing = Object.keys(ohmsLaw.requiredComponents).filter((type) => type !== 'supply' && type !== 'switch');
    expect(tutor().errors[0]).toMatchObject({ code: 'MISSING_COMPONENT', params: { types: missing } });
  });

  it('does not apply a highlight when the bench changed while the check was saving', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(false));
    const running = tutor().runCheckpoint('RECORD_READING');
    useBenchStore.setState({ circuit: wired(true) });
    await running;
    expect(tutor().errors).toHaveLength(1);
    expect(tutor().highlight).toEqual({ componentIds: [], wireIds: [] });
  });
});

describe('choosing another error', () => {
  async function withTwoErrors() {
    const db = await makeTestDb();
    await openWith(db, twoErrors(false));
    await toggle('SW');
    return db;
  }

  it('selectError moves the primary error, the owl and the highlight', async () => {
    await withTwoErrors();
    expect(tutor().primaryIndex).toBe(0);
    expect(tutor().highlight.componentIds).toEqual(['A']);
    tutor().selectError(1);
    expect(tutor().primaryIndex).toBe(1);
    expect(tutor().mood).toBe(t('WRONG_POLARITY').owl);
    expect(tutor().highlight).toEqual(highlightTargets(tutor().errors[1], bench().circuit));
    expect(tutor().highlight.componentIds).toEqual(['V']);
    expect(tutor().highlight.wireIds).toEqual(['w4', 'w5']);
  });

  it('ignores an index with no error behind it', async () => {
    await withTwoErrors();
    tutor().selectError(7);
    tutor().selectError(-1);
    expect(tutor().primaryIndex).toBe(0);
    expect(tutor().highlight.componentIds).toEqual(['A']);
  });

  it('shows no highlight for a chip chosen after the circuit changed', async () => {
    await withTwoErrors();
    await bench().nudge('S', 12, 0);
    tutor().selectError(1);
    expect(tutor().primaryIndex).toBe(1);
    expect(tutor().highlight).toEqual({ componentIds: [], wireIds: [] });
  });
});

describe('clearing the highlight', () => {
  it('clearHighlight (Esc) lights nothing and keeps the results', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(false));
    await tutor().runCheckpoint('RECORD_READING');
    expect(tutor().highlight.componentIds).toEqual(['SW']);
    tutor().clearHighlight();
    expect(tutor().highlight).toEqual({ componentIds: [], wireIds: [] });
    expect(tutor().errors).toHaveLength(1);
    expect(tutor().status).toBe('results');
  });

  it('a circuit change clears the highlight but keeps the results', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(false));
    await tutor().runCheckpoint('RECORD_READING');
    expect(tutor().highlight.componentIds).toEqual(['SW']);
    await bench().toggleSwitch('SW');
    expect(tutor().highlight).toEqual({ componentIds: [], wireIds: [] });
    expect(tutor().errors.map((r) => r.code)).toEqual(['OPEN_CIRCUIT']);
    expect(tutor().status).toBe('results');
  });

  it('a move clears it too', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(false));
    await tutor().runCheckpoint('RECORD_READING');
    await bench().nudge('R', 12, 0);
    expect(tutor().highlight).toEqual({ componentIds: [], wireIds: [] });
    expect(tutor().errors).toHaveLength(1);
  });

  it('a selection change alone keeps the highlight', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(false));
    await tutor().runCheckpoint('RECORD_READING');
    bench().select('R');
    expect(tutor().highlight.componentIds).toEqual(['SW']);
  });
});

describe('resetting the tutor', () => {
  it('resetTutor goes back to the instructions and leaves the collapsed state to the screen', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(false));
    tutor().setPanelCollapsed(true);
    await tutor().runCheckpoint('RECORD_READING');
    expect(tutor().status).toBe('results');
    tutor().resetTutor();
    expect(tutor()).toMatchObject({ status: 'instructions', errors: [], confirmations: [], mood: 'happy', mistakeWaiting: false, panelCollapsed: true });
    expect(tutor().highlight).toEqual({ componentIds: [], wireIds: [] });
  });

  it('opening another attempt resets it by itself; reopening the same one does not', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(false));
    await tutor().runCheckpoint('RECORD_READING');
    await bench().open({ db, userId: USER, experiment: ohmsLaw, clock: fixedClock() });
    expect(bench().session?.attemptId).toBe(attemptId);
    expect(tutor().status).toBe('results');
    await startAttempt(db, { id: 'other', userId: USER, experimentId: 'ohms-law', kind: 'experiment', startedAt: 9 });
    useBenchStore.setState({ session: { db, clock: fixedClock(), experiment: ohmsLaw, userId: USER, attemptId: 'other' } });
    expect(tutor().status).toBe('instructions');
  });
});

describe('mistakeWaiting', () => {
  it('is true only with errors and a collapsed panel, and follows setPanelCollapsed', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(false));
    tutor().setPanelCollapsed(true);
    expect(tutor().mistakeWaiting).toBe(false);
    await tutor().runCheckpoint('RECORD_READING');
    expect(tutor().mistakeWaiting).toBe(true);
    tutor().setPanelCollapsed(false);
    expect(tutor().mistakeWaiting).toBe(false);
    tutor().setPanelCollapsed(true);
    expect(tutor().mistakeWaiting).toBe(true);
  });

  it('is false for a clean check even when the panel is collapsed', async () => {
    const db = await makeTestDb();
    await openWith(db, wired(true));
    tutor().setPanelCollapsed(true);
    await tutor().runCheckpoint('SWITCH_CLOSE');
    expect(tutor().errors).toEqual([]);
    expect(tutor().mistakeWaiting).toBe(false);
  });
});

describe('nothing is evaluated while building (rules-spec §C)', () => {
  it('place, move, wire, value changes, undo, remove and clear log no CHECKPOINT and save no errors', async () => {
    const db = await makeTestDb();
    const attemptId = await openBench(db);
    await bench().place('supply', { x: 10, y: 10 });
    await bench().place('switch', { x: 300, y: 10 });
    await bench().place('resistor', { x: 500, y: 10 });
    bench().startDrag('R');
    bench().dragTo('R', 520, 40);
    await bench().endDrag();
    await bench().nudge('R', 12, 0);
    expect(bench().startWire('S.pos', 'drag')).toBe(true);
    expect(await bench().finishWire('SW.a')).toBe('connected');
    expect(await bench().setSupplyVoltage('S', 3)).toBe('changed');
    const resistor = bench().circuit.components.find((c) => c.id === 'R');
    const next = ohmsLaw.resistorValues.find((v) => resistor?.type === 'resistor' && v !== resistor.ohms);
    expect(next).toBeDefined();
    expect(await bench().setResistorValue('R', next ?? -1)).toBe('changed');
    await bench().undo();
    await bench().remove('R');
    await bench().clear();
    await flushBenchWrites();
    expect(await checkpoints(db, attemptId)).toHaveLength(0);
    expect(await db.errorOccurrences.count()).toBe(0);
    expect(tutor().status).toBe('instructions');
  });

  it('closing a switch through the store alone runs nothing either (the hook is what triggers it)', async () => {
    const db = await makeTestDb();
    const attemptId = await openWith(db, wired(false));
    await bench().toggleSwitch('SW');
    await flushBenchWrites();
    expect(await checkpoints(db, attemptId)).toHaveLength(0);
  });
});
