// Import order matters: tests/db/setup loads fake-indexeddb before Dexie is first imported.
import { disposeTestDbs, makeTestDb } from '../db/setup';
import { render } from '@testing-library/react';
import App from '../../src/App';
import type { LabXpertDB } from '../../src/db/database';
import { loginUser } from '../../src/db/users';
import { useAppStore, useBenchStore } from '../../src/state';

export { disposeTestDbs, makeTestDb };

/** A learner who is logged in, as the db would hold them after a real login. */
export async function seedUser(db: LabXpertDB, name = 'Asha') {
  return loginUser(db, name, 1000);
}

export function resetAppState(): void {
  useAppStore.setState(useAppStore.getInitialState(), true);
  useBenchStore.setState(useBenchStore.getInitialState(), true);
  window.location.hash = '';
  document.documentElement.removeAttribute('data-reduce-motion');
}

export function renderAppAt(db: LabXpertDB, hash: string) {
  window.location.hash = hash;
  return render(<App db={db} />);
}
