import type { LabXpertDB } from './database';
import { SETTING_KEYS } from './settings';
import type { UserRecord } from '../model/types';

/** The login key: trimmed and lower-case (UI_SCREENS, Login). */
export function normaliseUserId(typed: string): string {
  return typed.trim().toLowerCase();
}

/**
 * Creates the learner on first login, or refreshes them on a later one.
 * The userId is the normalised text; the display name is the text as typed
 * (trimmed). The login is also remembered as the active user until logout.
 * The caller has already checked the field is not empty.
 */
export async function loginUser(
  db: LabXpertDB,
  typedId: string,
  now: number,
): Promise<UserRecord> {
  const userId = normaliseUserId(typedId);
  if (userId === '') throw new RangeError('loginUser: user id is empty');
  const record: UserRecord = { userId, displayName: typedId.trim(), lastLoginAt: now };
  await db.transaction('rw', db.users, db.settings, async () => {
    await db.users.put(record);
    await db.settings.put({ key: SETTING_KEYS.activeUserId, value: userId });
  });
  return record;
}

export async function getUser(db: LabXpertDB, userId: string): Promise<UserRecord | undefined> {
  return db.users.get(userId);
}

/** The user with the latest `lastLoginAt` (ties: the later userId). */
export async function getLastLoggedInUser(db: LabXpertDB): Promise<UserRecord | undefined> {
  const all = await db.users.toArray();
  let best: UserRecord | undefined;
  for (const user of all) {
    if (
      best === undefined ||
      user.lastLoginAt > best.lastLoginAt ||
      (user.lastLoginAt === best.lastLoginAt && user.userId > best.userId)
    ) {
      best = user;
    }
  }
  return best;
}

/** The learner who is logged in right now, or undefined after logout. */
export async function getActiveUser(db: LabXpertDB): Promise<UserRecord | undefined> {
  const row = await db.settings.get(SETTING_KEYS.activeUserId);
  return typeof row?.value === 'string' ? db.users.get(row.value) : undefined;
}

/** Log out: forgets the active user. Their records stay. */
export async function logoutUser(db: LabXpertDB): Promise<void> {
  await db.settings.delete(SETTING_KEYS.activeUserId);
}
