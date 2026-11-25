// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDbs, makeTestDb } from './setup';
import type { LabXpertDB } from '../../src/db/database';
import {
  SETTING_KEYS,
  getBooleanSetting,
  getSetting,
  removeSetting,
  setSetting,
} from '../../src/db/settings';

let db: LabXpertDB;
beforeEach(async () => {
  db = await makeTestDb();
});
afterEach(disposeTestDbs);

describe('settings', () => {
  it('is undefined when unset', async () => {
    expect(await getSetting(db, 'missing')).toBeUndefined();
  });

  it('sets, reads and overwrites a value', async () => {
    await setSetting(db, 'k', 1);
    expect(await getSetting(db, 'k')).toBe(1);
    await setSetting(db, 'k', { a: [1, 2] });
    expect(await getSetting(db, 'k')).toEqual({ a: [1, 2] });
  });

  it('removes a value', async () => {
    await setSetting(db, 'k', 1);
    await removeSetting(db, 'k');
    expect(await getSetting(db, 'k')).toBeUndefined();
  });

  it('reduce motion: fallback when unset, stored boolean otherwise, fallback for a non-boolean', async () => {
    expect(await getBooleanSetting(db, SETTING_KEYS.reduceMotion, false)).toBe(false);
    await setSetting(db, SETTING_KEYS.reduceMotion, true);
    expect(await getBooleanSetting(db, SETTING_KEYS.reduceMotion, false)).toBe(true);
    await setSetting(db, SETTING_KEYS.reduceMotion, 'yes');
    expect(await getBooleanSetting(db, SETTING_KEYS.reduceMotion, false)).toBe(false);
  });
});
