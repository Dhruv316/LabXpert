import { t } from '../../i18n';
import { selectCurrentTaskId, selectTaskProgress, useBenchStore, useTaskStore } from '../../state';

/** "Task 1 of 2" at the right of the toolbar. Only for an experiment attempt with more than one task, so Ohm's Law and practice have none. */
export function TaskProgress() {
  const experiment = useBenchStore((state) => state.session?.experiment);
  // A practice run has its own progress indicator; the bench experiment's task count means nothing there.
  const isPractice = useBenchStore((state) => state.session?.kind === 'practice');
  const storedTaskId = useTaskStore((state) => state.taskId);
  if (isPractice || experiment === undefined || experiment.tasks.length < 2) return null;
  const { current, total } = selectTaskProgress(experiment, selectCurrentTaskId({ taskId: storedTaskId }, experiment));
  return (
    <span
      data-task-progress
      className="ml-auto rounded-control border-2 border-wood-light bg-cream px-3 py-1 font-body text-sm font-bold text-ink"
    >
      {t('bench.taskProgress', { current, total })}
    </span>
  );
}
