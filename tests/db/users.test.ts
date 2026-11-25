// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { disposeTestDbs, makeTestDb } from './setup';
import type { LabXpertDB } from '../../src/db/database';
import {
  getActiveUser,
  getLastLoggedInUser,
  getUser,
  loginUser,
  logoutUser,
  normaliseUserId,
} from '../../src/db/users';

let db: LabXpertDB;
beforeEach(async () => {
  db = await makeTestDb();
});
afterEach(disposeTestDbs);

describe('normaliseUserId', () => {
  it('trims and lower-cases', () => {
    expect(normaliseUserId('  AsHa_7 ')).toBe('asha_7');
  });
});

describe('loginUser', () => {
  it('creates a new user with a normalised id and the typed text as display name', async () => {
    const rec = await loginUser(db, '  Asha_7 ', 1000);
    expect(rec).toEqual({ userId: 'asha_7', displayName: 'Asha_7', lastLoginAt: 1000 });
    expect(await getUser(db, 'asha_7')).toEqual(rec);
  });

  it('treats different casing as the same user and updates login time and display name', async () => {
    await loginUser(db, 'Asha', 1000);
    const again = await loginUser(db, 'ASHA', 2000);
    expect(again).toEqual({ userId: 'asha', displayName: 'ASHA', lastLoginAt: 2000 });
    expect(await db.users.count()).toBe(1);
  });

  it('rejects an empty id', async () => {
    await expect(loginUser(db, '   ', 1)).rejects.toThrow(RangeError);
    expect(await db.users.count()).toBe(0);
  });
});

describe('getUser', () => {
  it('returns undefined for an unknown user', async () => {
    expect(await getUser(db, 'nobody')).toBeUndefined();
  });
});

describe('getLastLoggedInUser', () => {
  it('is undefined with no users', async () => {
    expect(await getLastLoggedInUser(db)).toBeUndefined();
  });

  it('returns the user with the latest login', async () => {
    await loginUser(db, 'asha', 1000);
    await loginUser(db, 'ravi', 3000);
    await loginUser(db, 'meena', 2000);
    expect((await getLastLoggedInUser(db))?.userId).toBe('ravi');
    await loginUser(db, 'asha', 4000);
    expect((await getLastLoggedInUser(db))?.userId).toBe('asha');
  });

  it('breaks a timestamp tie by the later userId', async () => {
    await loginUser(db, 'asha', 1000);
    await loginUser(db, 'ravi', 1000);
    expect((await getLastLoggedInUser(db))?.userId).toBe('ravi');
  });
});

describe('active user and logout', () => {
  it('remembers the logged-in user until logout, keeping the user record', async () => {
    expect(await getActiveUser(db)).toBeUndefined();
    await loginUser(db, 'asha', 1000);
    expect((await getActiveUser(db))?.userId).toBe('asha');
    await logoutUser(db);
    expect(await getActiveUser(db)).toBeUndefined();
    expect(await getUser(db, 'asha')).toBeDefined();
    expect((await getLastLoggedInUser(db))?.userId).toBe('asha');
  });
});
