import type { LabXpertDB } from './database';
import { getDb } from './database';

/**
 * Why the database cannot be used. Codes only: the full-page message (Part 6)
 * takes its text from the language files.
 */
export type DbUnavailableReason = 'indexeddb_missing' | 'open_failed';

export type DbAvailability =
  | { ok: true }
  | { ok: false; reason: DbUnavailableReason; detail: string };

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * Opens the database and reports the outcome instead of throwing. Call once at
 * start-up; when `ok` is false the app shows the full-page message and stops.
 * There is deliberately no fallback storage.
 */
export async function checkDatabase(db: LabXpertDB = getDb()): Promise<DbAvailability> {
  if (typeof indexedDB === 'undefined' || indexedDB === null) {
    return { ok: false, reason: 'indexeddb_missing', detail: 'indexedDB is not defined' };
  }
  try {
    await db.open();
    return { ok: true };
  } catch (error) {
    // Private windows, blocked site data, quota or a damaged store all land here.
    return { ok: false, reason: 'open_failed', detail: describe(error) };
  }
}
