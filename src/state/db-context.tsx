import { createContext, useContext, type ReactNode } from 'react';
import type { LabXpertDB } from '../db/database';

const DbContext = createContext<LabXpertDB | undefined>(undefined);

/** Lets the app and its tests choose the database. The app passes the shared one. */
export function DbProvider({ db, children }: { db: LabXpertDB; children: ReactNode }) {
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): LabXpertDB {
  const db = useContext(DbContext);
  // A programming error, never a student one: the error boundary turns it into the friendly screen.
  if (db === undefined) throw new Error('useDb was called outside a DbProvider');
  return db;
}
