import { create } from 'zustand';

// Its own small store so the tutor store (which needs the current task) and the readings store (which
// runs the tutor's checkpoint) do not import each other. The readings store fills it when a bench opens.
export interface TaskState {
  /** The task the bench is on; undefined until the attempt's events are read (selectors then use the first task). */
  taskId: string | undefined;
  setTaskId: (taskId: string | undefined) => void;
}

export const useTaskStore = create<TaskState>()((set) => ({
  taskId: undefined,
  setTaskId: (taskId) => set({ taskId }),
}));
