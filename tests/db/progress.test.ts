// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { disposeTestDbs, makeTestDb } from './setup';
import { abandonAttempt, finishAttempt, startAttempt } from '../../src/db/attempts';
import { getBestResult, loadProgress } from '../../src/db/progress';
import type { LabXpertDB } from '../../src/db/database';
import type { ErrorCode, ExperimentId } from '../../src/model/types';

afterEach(disposeTestDbs);

async function seed(
  db: LabXpertDB,
  o: {
    id: string;
    userId?: string;
    experimentId?: ExperimentId;
    kind?: 'experiment' | 'practice';
    end?: 'done' | 'abandoned' | 'open';
    finishedAt?: number;
    codes?: ErrorCode[];
  },
) {
  const userId = o.userId ?? 'asha';
  const experimentId = o.experimentId ?? 'ohms-law';
  await startAttempt(db, { id: o.id, userId, experimentId, kind: o.kind ?? 'experiment', startedAt: 1 });
  const end = o.end ?? 'done';
  if (end === 'done') await finishAttempt(db, o.id, o.finishedAt ?? 100);
  if (end === 'abandoned') await abandonAttempt(db, o.id, o.finishedAt ?? 100);
  let n = 0;
  for (const code of o.codes ?? []) {
    n += 1;
    await db.errorOccurrences.add({
      id: `${o.id}-occ-${n}`,
      attemptId: o.id,
      userId,
      experimentId,
      code,
      feedbackKey: `${code}.x`,
      checkpoint: 'RECORD_READING',
      circuitSignature: `sig-${n}`,
      timestamp: n,
    });
  }
}

describe('getBestResult', () => {
  it('is undefined when the learner has no finished attempt', async () => {
    const db = await makeTestDb();
    await seed(db, { id: 'open', end: 'open', codes: ['OPEN_CIRCUIT'] });
    expect(await getBestResult(db, 'asha', 'ohms-law')).toBeUndefined();
  });

  it('counts distinct codes, not occurrences, and picks the fewest', async () => {
    const db = await makeTestDb();
    await seed(db, { id: 'many', codes: ['OPEN_CIRCUIT', 'SHORT_CIRCUIT', 'WRONG_POLARITY'] });
    // Three occurrences of one code is still one kind of mistake.
    await seed(db, { id: 'few', codes: ['OPEN_CIRCUIT', 'OPEN_CIRCUIT', 'OPEN_CIRCUIT'] });
    expect(await getBestResult(db, 'asha', 'ohms-law')).toEqual({ attemptId: 'few', kinds: 1, finishedAt: 100 });
  });

  it('gives a tie to the most recent finished attempt', async () => {
    const db = await makeTestDb();
    await seed(db, { id: 'older', finishedAt: 100, codes: ['OPEN_CIRCUIT'] });
    await seed(db, { id: 'newer', finishedAt: 200, codes: ['SHORT_CIRCUIT'] });
    expect((await getBestResult(db, 'asha', 'ohms-law'))?.attemptId).toBe('newer');
  });

  it('ignores practice attempts, abandoned attempts, other experiments and other learners', async () => {
    const db = await makeTestDb();
    await seed(db, { id: 'real', codes: ['OPEN_CIRCUIT', 'SHORT_CIRCUIT'] });
    await seed(db, { id: 'practice', kind: 'practice' });
    await seed(db, { id: 'gone', end: 'abandoned' });
    await seed(db, { id: 'other-exp', experimentId: 'series-parallel' });
    await seed(db, { id: 'other-user', userId: 'ben' });
    expect(await getBestResult(db, 'asha', 'ohms-law')).toEqual({ attemptId: 'real', kinds: 2, finishedAt: 100 });
  });
});

describe('loadProgress', () => {
  it('returns empty data for a learner with nothing saved', async () => {
    const db = await makeTestDb();
    expect(await loadProgress(db, 'asha', ['ohms-law', 'series-parallel'])).toEqual({
      experiments: [
        { experimentId: 'ohms-law', status: 'not_started' },
        { experimentId: 'series-parallel', status: 'not_started' },
      ],
      profile: [],
      practice: [],
    });
  });

  it('gives each experiment its status and best result', async () => {
    const db = await makeTestDb();
    await seed(db, { id: 'a', codes: ['OPEN_CIRCUIT'] });
    await seed(db, { id: 'b', end: 'open' });
    const data = await loadProgress(db, 'asha', ['ohms-law', 'series-parallel']);
    expect(data.experiments).toEqual([
      { experimentId: 'ohms-law', status: 'in_progress', bestKinds: 1 },
      { experimentId: 'series-parallel', status: 'not_started' },
    ]);
  });
});
