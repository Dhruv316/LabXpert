import practiceFile from '../../spec/practice-tasks.json';
import type { PracticeTask } from '../../model/types';

/** Every practice task in `spec/practice-tasks.json`; the file's shape is the `PracticeTask` type (as the tests also read it). */
export const PRACTICE_TASKS = practiceFile.tasks as unknown as PracticeTask[];
