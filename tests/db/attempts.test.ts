// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDbs, makeTestDb } from './setup';
import type { LabXpertDB } from '../../src/db/database';
import {
  abandonAttempt,
  finishAttempt,
  findInProgressAttempt,
  getAttempt,
  getAttemptCircuit,
  saveAttemptCircuit,
  getExperimentStatus,
  startAttempt,
} from '../../src/db/attempts';
import type { NewAttempt } from '../../src/db/attempts';

let db: LabXpertDB;
beforeEach(async () => {
  db = await makeTestDb();
});
afterEach(disposeTestDbs);

function input(over: Partial<NewAttempt> = {}): NewAttempt {
  return {
    id: 'a1',
    userId: 'asha',
    experimentId: 'ohms-law',
    kind: 'experiment',
    startedAt: 100,
    ...over,
  };
}

describe('startAttempt / getAttempt', () => {
  it('stores an in-progress attempt with no finish time', async () => {
    const a = await startAttempt(db, input());
    expect(a).toEqual({ ...input(), status: 'in_progress' });
    expect(a.finishedAt).toBeUndefined();
    expect(await getAttempt(db, 'a1')).toEqual(a);
  });

  it('keeps the practice task id on a practice attempt', async () => {
    const a = await startAttempt(db, input({ kind: 'practice', practiceTaskId: 'P-1' }));
    expect((await getAttempt(db, a.id))?.practiceTaskId).toBe('P-1');
  });

  it('refuses a duplicate id', async () => {
    await startAttempt(db, input());
    await expect(startAttempt(db, input())).rejects.toThrow();
  });

  it('getAttempt is undefined for an unknown id', async () => {
    expect(await getAttempt(db, 'nope')).toBeUndefined();
  });
});

describe('finishAttempt', () => {
  it('marks it completed with the finish time', async () => {
    await startAttempt(db, input());
    const done = await finishAttempt(db, 'a1', 900);
    expect(done.status).toBe('completed');
    expect(done.finishedAt).toBe(900);
    expect(await getAttempt(db, 'a1')).toEqual(done);
  });

  it('throws for an unknown attempt', async () => {
    await expect(finishAttempt(db, 'nope', 1)).rejects.toThrow('not found');
  });

  it('throws when the attempt is already closed, and leaves it unchanged', async () => {
    await startAttempt(db, input());
    await abandonAttempt(db, 'a1', 500);
    await expect(finishAttempt(db, 'a1', 900)).rejects.toThrow('abandoned');
    expect((await getAttempt(db, 'a1'))?.finishedAt).toBe(500);
  });
});

describe('abandonAttempt', () => {
  it('marks it abandoned with the time', async () => {
    await startAttempt(db, input());
    const gone = await abandonAttempt(db, 'a1', 700);
    expect(gone.status).toBe('abandoned');
    expect(gone.finishedAt).toBe(700);
  });

  it('throws for an unknown attempt and for a completed one', async () => {
    await expect(abandonAttempt(db, 'nope', 1)).rejects.toThrow('not found');
    await startAttempt(db, input());
    await finishAttempt(db, 'a1', 800);
    await expect(abandonAttempt(db, 'a1', 900)).rejects.toThrow('completed');
  });
});

describe('findInProgressAttempt (resume)', () => {
  it('is undefined when nothing is in progress', async () => {
    expect(await findInProgressAttempt(db, 'asha', 'ohms-law')).toBeUndefined();
  });

  it('finds the open attempt for that user and experiment only', async () => {
    await startAttempt(db, input({ id: 'o1' }));
    await startAttempt(db, input({ id: 's1', experimentId: 'series-parallel' }));
    await startAttempt(db, input({ id: 'r1', userId: 'ravi' }));
    expect((await findInProgressAttempt(db, 'asha', 'ohms-law'))?.id).toBe('o1');
    expect((await findInProgressAttempt(db, 'asha', 'series-parallel'))?.id).toBe('s1');
    expect((await findInProgressAttempt(db, 'ravi', 'ohms-law'))?.id).toBe('r1');
    expect(await findInProgressAttempt(db, 'ravi', 'series-parallel')).toBeUndefined();
  });

  it('ignores finished and abandoned attempts', async () => {
    await startAttempt(db, input({ id: 'x1', startedAt: 1 }));
    await startAttempt(db, input({ id: 'x2', startedAt: 2 }));
    await finishAttempt(db, 'x1', 10);
    await abandonAttempt(db, 'x2', 11);
    expect(await findInProgressAttempt(db, 'asha', 'ohms-law')).toBeUndefined();
  });

  it('picks the most recently started when several are open', async () => {
    await startAttempt(db, input({ id: 'old', startedAt: 1 }));
    await startAttempt(db, input({ id: 'new', startedAt: 5 }));
    expect((await findInProgressAttempt(db, 'asha', 'ohms-law'))?.id).toBe('new');
  });

  it('does not offer a practice attempt as the experiment to resume', async () => {
    await startAttempt(db, input({ id: 'p1', kind: 'practice', practiceTaskId: 'P-1' }));
    expect(await findInProgressAttempt(db, 'asha', 'ohms-law')).toBeUndefined();
    expect((await findInProgressAttempt(db, 'asha', 'ohms-law', 'practice'))?.id).toBe('p1');
  });
});

describe('getExperimentStatus', () => {
  it('walks not_started, in_progress, done', async () => {
    expect(await getExperimentStatus(db, 'asha', 'ohms-law')).toBe('not_started');
    await startAttempt(db, input());
    expect(await getExperimentStatus(db, 'asha', 'ohms-law')).toBe('in_progress');
    await finishAttempt(db, 'a1', 200);
    expect(await getExperimentStatus(db, 'asha', 'ohms-law')).toBe('done');
  });

  it('is per experiment and per user', async () => {
    await startAttempt(db, input());
    expect(await getExperimentStatus(db, 'asha', 'series-parallel')).toBe('not_started');
    expect(await getExperimentStatus(db, 'ravi', 'ohms-law')).toBe('not_started');
  });

  it('abandoned alone is not_started', async () => {
    await startAttempt(db, input());
    await abandonAttempt(db, 'a1', 200);
    expect(await getExperimentStatus(db, 'asha', 'ohms-law')).toBe('not_started');
  });

  it('in_progress wins over an earlier completion', async () => {
    await startAttempt(db, input({ id: 'a1' }));
    await finishAttempt(db, 'a1', 200);
    await startAttempt(db, input({ id: 'a2', startedAt: 300 }));
    expect(await getExperimentStatus(db, 'asha', 'ohms-law')).toBe('in_progress');
  });

  it('a completed practice attempt does not make the experiment done', async () => {
    await startAttempt(db, input({ kind: 'practice', practiceTaskId: 'P-1' }));
    await finishAttempt(db, 'a1', 200);
    expect(await getExperimentStatus(db, 'asha', 'ohms-law')).toBe('not_started');
  });
});

describe('saveAttemptCircuit / getAttemptCircuit', () => {
  const circuit = {
    components: [{ id: 'R2', type: 'resistor' as const, x: 40, y: 60, role: 'R2' as const, ohms: 20 }],
    wires: [],
  };

  it('round-trips a circuit, with roles and positions', async () => {
    await startAttempt(db, input());
    expect(await getAttemptCircuit(db, 'a1')).toBeUndefined();
    await saveAttemptCircuit(db, 'a1', circuit);
    expect(await getAttemptCircuit(db, 'a1')).toEqual(circuit);
  });

  it('keeps the circuit when the attempt is finished, and keeps other attempts apart', async () => {
    await startAttempt(db, input());
    await startAttempt(db, input({ id: 'a2', experimentId: 'series-parallel' }));
    await saveAttemptCircuit(db, 'a1', circuit);
    await finishAttempt(db, 'a1', 200);
    expect(await getAttemptCircuit(db, 'a1')).toEqual(circuit);
    expect(await getAttemptCircuit(db, 'a2')).toBeUndefined();
  });

  it('refuses to save for an attempt that does not exist', async () => {
    await expect(saveAttemptCircuit(db, 'nope', circuit)).rejects.toThrow('Attempt not found');
  });
});
