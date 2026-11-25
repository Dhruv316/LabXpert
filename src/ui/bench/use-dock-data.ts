import type { ExperimentConfig, Reading } from '../../model/types';
import { selectCurrentTaskId, selectTaskReadings, useReadingsStore, useTaskStore } from '../../state';

export interface DockData {
  taskId: string;
  /** The current task's readings only, oldest first. The same array until a reading is added or the task changes. */
  readings: Reading[];
}

/** What the dock shows: the task the bench is on and that task's readings. */
export function useDockData(experiment: ExperimentConfig): DockData {
  const storedTaskId = useTaskStore((state) => state.taskId);
  const allReadings = useReadingsStore((state) => state.readings);
  const taskId = selectCurrentTaskId({ taskId: storedTaskId }, experiment);
  return { taskId, readings: selectTaskReadings(allReadings, taskId) };
}
