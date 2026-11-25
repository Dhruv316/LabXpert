import Dexie from 'dexie';
import type { Table } from 'dexie';
import { DB_STORES } from '../model/types';
import type {
  ActionEvent,
  AnswerSubmission,
  Attempt,
  ErrorOccurrence,
  ErrorProfileEntry,
  PracticeRecord,
  Reading,
  SettingRecord,
  UserRecord,
} from '../model/types';

export const DB_NAME = 'labxpert';

export class LabXpertDB extends Dexie {
  users!: Table<UserRecord, string>;
  attempts!: Table<Attempt, string>;
  events!: Table<ActionEvent, string>;
  readings!: Table<Reading, string>;
  answers!: Table<AnswerSubmission, string>;
  errorOccurrences!: Table<ErrorOccurrence, string>;
  errorProfile!: Table<ErrorProfileEntry, [string, string, string]>;
  practiceRecords!: Table<PracticeRecord, string>;
  settings!: Table<SettingRecord, string>;

  /** The name is a parameter so tests can use a throwaway database per test. */
  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores(DB_STORES);
  }
}

let shared: LabXpertDB | undefined;

/** The one database the app uses. Created on first call; opening is lazy. */
export function getDb(): LabXpertDB {
  shared ??= new LabXpertDB();
  return shared;
}
