import { useEffect, useState } from 'react';
import { PracticeUnavailableError } from '../../bench/practice-start';
import type { PracticeTask } from '../../model/types';
import { useBenchStore, useDb, usePracticeStore, type PracticeCurrent } from '../../state';
import { useCrash } from '../shell/use-crash';
import { EXPERIMENTS } from './experiment-list';
import { PRACTICE_TASKS } from './practice-list';

/** What a practice screen draws: nothing yet, not-found, or the attempt that is open and live on the bench store. */
export type PracticeOpeningState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; practice: PracticeCurrent };

/**
 * Finds the learner's in-progress attempt for this task or starts one (a reload resumes it) and opens it, for the
 * bench screen and the calculation screen alike. A failed background save (the completion write) goes to the error
 * boundary, as for the bench's own writes.
 */
export function usePracticeOpening(task: PracticeTask, userId: string): PracticeOpeningState {
  const db = useDb();
  const crash = useCrash();
  const [opening, setOpening] = useState<PracticeOpeningState>({ status: 'loading' });
  const saveError = usePracticeStore((state) => state.error);
  const attemptId = opening.status === 'ready' ? opening.practice.attemptId : undefined;
  const live = useBenchStore((state) => attemptId !== undefined && state.session?.attemptId === attemptId);

  useEffect(() => {
    let cancelled = false;
    usePracticeStore
      .getState()
      .open({ db, userId, taskId: task.id, tasks: PRACTICE_TASKS, experiments: EXPERIMENTS })
      .then(() => {
        const practice = usePracticeStore.getState().current;
        if (!cancelled && practice !== undefined) setOpening({ status: 'ready', practice });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Not-found for every reason, so the screen never says whether a task id exists.
        if (error instanceof PracticeUnavailableError) setOpening({ status: 'unavailable' });
        else crash(error);
      });
    return () => {
      cancelled = true;
    };
  }, [db, userId, task.id, crash]);

  useEffect(() => {
    if (saveError !== undefined) crash(saveError);
  }, [saveError, crash]);

  if (opening.status === 'unavailable') return { status: 'unavailable' };
  // Until the attempt is loaded nothing is drawn, so a bench left over from another run never flashes.
  if (opening.status !== 'ready' || !live) return { status: 'loading' };
  return opening;
}
