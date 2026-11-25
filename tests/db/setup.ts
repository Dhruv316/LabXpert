// Test-only: gives Node an IndexedDB. Never imported from src/.
import 'fake-indexeddb/auto';
import { LabXpertDB } from '../../src/db/database';

const made: LabXpertDB[] = [];
let n = 0;

/** A fresh, empty database with its own name, so tests cannot see each other. */
export async function makeTestDb(): Promise<LabXpertDB> {
  n += 1;
  const db = new LabXpertDB(`labxpert-test-${n}`);
  await db.open();
  made.push(db);
  return db;
}

export async function disposeTestDbs(): Promise<void> {
  while (made.length > 0) {
    const db = made.pop();
    if (db) await db.delete();
  }
}
