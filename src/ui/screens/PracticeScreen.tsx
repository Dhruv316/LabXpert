import { useParams } from 'react-router-dom';
import type { PracticeTask } from '../../model/types';
import { useAppStore } from '../../state';
import { BenchView } from '../bench/BenchView';
import { CompletionOverlay } from '../bench/CompletionOverlay';
import { PracticeBanner } from '../bench/PracticeBanner';
import { practiceTitle } from '../bench/practice-text';
import { NotFoundScreen } from './NotFoundScreen';
import { PracticeCalculation } from './PracticeCalculation';
import { PRACTICE_TASKS } from './practice-list';
import { usePracticeOpening } from './use-practice-opening';

function PracticeBench({ task, userId }: { task: PracticeTask; userId: string }) {
  const opening = usePracticeOpening(task, userId);
  if (opening.status === 'unavailable') return <NotFoundScreen />;
  if (opening.status === 'loading') return <div className="flex-1" aria-busy="true" />;
  const { practice } = opening;
  return (
    <>
      <BenchView
        experiment={practice.experiment}
        title={practiceTitle(practice.task)}
        banner={<PracticeBanner practice={practice} />}
      />
      <CompletionOverlay />
    </>
  );
}

/** Practice `/practice/:taskId` (UI_SCREENS §5). Bench tasks run on the bench; calculation tasks on their own cards. */
export function PracticeScreen() {
  const { taskId } = useParams();
  const user = useAppStore((state) => state.user);
  const task = PRACTICE_TASKS.find((candidate) => candidate.id === taskId);
  if (task === undefined) return <NotFoundScreen />;
  // The route guard guarantees a user.
  if (user === undefined) return null;
  // Keyed so another learner or another task never inherits this attempt.
  const key = `${user.userId}:${task.id}`;
  if (task.kind === 'calculation') return <PracticeCalculation key={key} task={task} userId={user.userId} />;
  return <PracticeBench key={key} task={task} userId={user.userId} />;
}
