// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeTestDbs, makeTestDb } from './setup';
import { LabXpertDB, getDb } from '../../src/db/database';
import { DB_STORES } from '../../src/model/types';
import { checkDatabase } from '../../src/db/availability';
import { appNow, newRecordId } from '../../src/db/app-clock-and-ids';

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await disposeTestDbs();
});

describe('database', () => {
  it('creates exactly the stores in DB_STORES, with their key paths', async () => {
    const db = await makeTestDb();
    expect(db.tables.map((t) => t.name).sort()).toEqual(Object.keys(DB_STORES).sort());
    expect(db.table('users').schema.primKey.keyPath).toBe('userId');
    expect(db.table('settings').schema.primKey.keyPath).toBe('key');
    expect(db.table('errorProfile').schema.primKey.keyPath).toEqual(['userId', 'experimentId', 'code']);
    expect(db.table('attempts').schema.idxByName['[userId+experimentId]']).toBeDefined();
    expect(db.table('events').schema.idxByName['[userId+timestamp]']).toBeDefined();
  });

  it('getDb returns the same instance every time', () => {
    expect(getDb()).toBe(getDb());
  });
});

describe('checkDatabase', () => {
  it('reports ok when the database opens', async () => {
    const db = new LabXpertDB('labxpert-test-avail-ok');
    expect(await checkDatabase(db)).toEqual({ ok: true });
    await db.delete();
  });

  it('reports indexeddb_missing when IndexedDB does not exist', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const db = new LabXpertDB('labxpert-test-avail-missing');
    const result = await checkDatabase(db);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('indexeddb_missing');
  });

  it('reports open_failed, with the error name, when opening is refused', async () => {
    const db = new LabXpertDB('labxpert-test-avail-fail');
    const refusal = new Error('blocked');
    refusal.name = 'SecurityError';
    vi.spyOn(db, 'open').mockRejectedValue(refusal);
    const result = await checkDatabase(db);
    expect(result).toEqual({ ok: false, reason: 'open_failed', detail: 'SecurityError: blocked' });
  });
});

describe('clock and id helper', () => {
  it('appNow returns epoch milliseconds', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    expect(appNow()).toBe(1234);
  });

  it('newRecordId is unique and sorts in creation order, even in one millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(5_000_000);
    const ids = Array.from({ length: 50 }, () => newRecordId());
    expect(new Set(ids).size).toBe(50);
    expect([...ids].sort()).toEqual(ids);
    vi.spyOn(Date, 'now').mockReturnValue(5_000_001);
    expect(newRecordId() > ids[ids.length - 1]).toBe(true);
  });
});

describe('src/db hygiene', () => {
  const sources = import.meta.glob<string>('../../src/db/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  });

  it('only the clock-and-id helper reads the clock or random numbers', () => {
    const names = Object.keys(sources);
    expect(names.length).toBeGreaterThan(5);
    for (const [path, text] of Object.entries(sources)) {
      if (path.endsWith('app-clock-and-ids.ts')) continue;
      expect(text, path).not.toMatch(/Date\.now|new Date\(|Math\.random|crypto\./);
    }
  });

  it('nothing in src/db touches localStorage or sessionStorage', () => {
    for (const [path, text] of Object.entries(sources)) {
      expect(text, path).not.toMatch(/localStorage|sessionStorage/);
    }
  });
});
