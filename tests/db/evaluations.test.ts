// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disposeTestDbs, makeTestDb } from './setup';
import type { LabXpertDB } from '../../src/db/database';
import { startAttempt } from '../../src/db/attempts';
import { saveEvaluation } from '../../src/db/evaluations';
import { getErrorProfile } from '../../src/db/history';
import { err, evaluate, idMaker, startExperiment } from './helpers';

let db: LabXpertDB;
beforeEach(async () => {
  db = await makeTestDb();
  await startExperiment(db, 'e1');
});
afterEach(async () => {
  vi.restoreAllMocks();
  await disposeTestDbs();
});

describe('saveEvaluation', () => {
  it('saves new occurrences and profile counts together', async () => {
    const out = await evaluate(db, {
      attemptId: 'e1',
      results: [err('OPEN_CIRCUIT'), err('AMMETER_PARALLEL')],
      signature: 'A',
      timestamp: 100,
    });
    expect(out.occurrences).toHaveLength(2);
    const saved = await db.errorOccurrences.toArray();
    expect(saved.map((o) => o.code).sort()).toEqual(['AMMETER_PARALLEL', 'OPEN_CIRCUIT']);
    expect(saved.every((o) => o.userId === 'asha' && o.experimentId === 'ohms-law' && o.attemptId === 'e1')).toBe(true);
    expect(await getErrorProfile(db, 'asha')).toEqual([
      { userId: 'asha', experimentId: 'ohms-law', code: 'AMMETER_PARALLEL', count: 1, lastSeenAt: 100 },
      { userId: 'asha', experimentId: 'ohms-law', code: 'OPEN_CIRCUIT', count: 1, lastSeenAt: 100 },
    ]);
  });

  it('does not count a repeat on an unchanged circuit, and counts a changed one', async () => {
    await evaluate(db, { attemptId: 'e1', results: [err('OPEN_CIRCUIT')], signature: 'A', timestamp: 100 });
    await evaluate(db, { attemptId: 'e1', results: [err('OPEN_CIRCUIT')], signature: 'A', timestamp: 200 });
    expect(await db.errorOccurrences.count()).toBe(1);
    expect((await getErrorProfile(db, 'asha'))[0]?.count).toBe(1);
    await evaluate(db, { attemptId: 'e1', results: [err('OPEN_CIRCUIT')], signature: 'B', timestamp: 300 });
    const profile = await getErrorProfile(db, 'asha');
    expect(profile[0]?.count).toBe(2);
    expect(profile[0]?.lastSeenAt).toBe(300);
  });

  it('sets resolvedAt when the error is gone, leaving the profile count alone', async () => {
    await evaluate(db, { attemptId: 'e1', results: [err('OPEN_CIRCUIT')], signature: 'A', timestamp: 100 });
    const out = await evaluate(db, { attemptId: 'e1', results: [], signature: 'B', timestamp: 200 });
    expect(out.resolutions).toHaveLength(1);
    const [occ] = await db.errorOccurrences.toArray();
    expect(occ?.resolvedAt).toBe(200);
    expect((await getErrorProfile(db, 'asha'))[0]?.count).toBe(1);
  });

  it('practice attempts save occurrences but never touch the profile', async () => {
    await startAttempt(db, {
      id: 'p1', userId: 'asha', experimentId: 'ohms-law', kind: 'practice', practiceTaskId: 'practice-fix-open-circuit', startedAt: 5,
    });
    const out = await evaluate(db, { attemptId: 'p1', results: [err('OPEN_CIRCUIT')], signature: 'A', timestamp: 100 });
    expect(out.occurrences).toHaveLength(1);
    expect(out.profileIncrements).toEqual([]);
    expect(await db.errorOccurrences.count()).toBe(1);
    expect(await db.errorProfile.count()).toBe(0);
  });

  it('throws for an unknown attempt and saves nothing', async () => {
    await expect(
      evaluate(db, { attemptId: 'nope', results: [err('OPEN_CIRCUIT')], signature: 'A', timestamp: 1 }),
    ).rejects.toThrow('not found');
    expect(await db.errorOccurrences.count()).toBe(0);
  });
});

describe('saveEvaluation is atomic', () => {
  it('saves nothing when one new occurrence fails (duplicate id)', async () => {
    const sameId = (): string => 'dup';
    await expect(
      evaluate(db, {
        attemptId: 'e1',
        results: [err('OPEN_CIRCUIT'), err('AMMETER_PARALLEL')],
        signature: 'A',
        timestamp: 100,
        makeId: sameId,
      }),
    ).rejects.toThrow();
    expect(await db.errorOccurrences.count()).toBe(0);
    expect(await db.errorProfile.count()).toBe(0);
  });

  it('rolls back occurrences and resolutions when the profile write fails', async () => {
    await evaluate(db, { attemptId: 'e1', results: [err('OPEN_CIRCUIT')], signature: 'A', timestamp: 100 });
    // Next check: OPEN_CIRCUIT gone (resolution), AMMETER_PARALLEL new (occurrence + profile increment).
    vi.spyOn(db.errorProfile, 'put').mockRejectedValue(new Error('disk full'));
    await expect(
      saveEvaluation(db, {
        results: [err('AMMETER_PARALLEL')],
        checkpoint: 'RECORD_READING',
        attemptId: 'e1',
        circuitSignature: 'B',
        actionSignature: '',
        makeId: idMaker('later-'),
        timestamp: 200,
      }),
    ).rejects.toThrow('disk full');
    vi.restoreAllMocks();
    const rows = await db.errorOccurrences.toArray();
    expect(rows.map((o) => o.code)).toEqual(['OPEN_CIRCUIT']);
    expect(rows[0]?.resolvedAt).toBeUndefined();
    expect(await getErrorProfile(db, 'asha')).toEqual([
      { userId: 'asha', experimentId: 'ohms-law', code: 'OPEN_CIRCUIT', count: 1, lastSeenAt: 100 },
    ]);
  });
});
