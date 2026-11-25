import type { LabXpertDB } from './database';

/** Keys used by the app. Values are stored per device, not per learner. */
export const SETTING_KEYS = {
  reduceMotion: 'reduceMotion',
  /** Id of the learner who is logged in. Removed on log out. */
  activeUserId: 'activeUserId',
} as const;

export async function getSetting(db: LabXpertDB, key: string): Promise<unknown> {
  const row = await db.settings.get(key);
  return row?.value;
}

export async function setSetting(db: LabXpertDB, key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export async function removeSetting(db: LabXpertDB, key: string): Promise<void> {
  await db.settings.delete(key);
}

/** A stored value that is not a boolean counts as missing. */
export async function getBooleanSetting(
  db: LabXpertDB,
  key: string,
  fallback: boolean,
): Promise<boolean> {
  const value = await getSetting(db, key);
  return typeof value === 'boolean' ? value : fallback;
}
