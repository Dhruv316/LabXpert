import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { t } from '../../i18n';
import type { ExperimentConfig } from '../../model/types';
import { selectFinishLabel, selectTaskProgress, useReadingsStore } from '../../state';
import { useCrash } from '../shell/use-crash';
import { useAnnounce } from './announcer';

/**
 * Finish experiment on the last task, Next task before it. Never disabled: pressing it runs the FINISH
 * check, so a student who is not ready gets the reason in the tutor panel. Focus stays on the button.
 */
export function FinishButton({ experiment, taskId, compact = false }: { experiment: ExperimentConfig; taskId: string; compact?: boolean }) {
  const finish = useReadingsStore((state) => state.finish);
  const navigate = useNavigate();
  const announce = useAnnounce();
  const crash = useCrash();
  // One press at a time, on top of the store's own guard.
  const working = useRef(false);
  const label = selectFinishLabel(experiment, taskId) === 'finish' ? t('bench.finish') : t('bench.nextTask');

  const press = () => {
    if (working.current) return;
    working.current = true;
    finish()
      .then((result) => {
        if (result.status === 'finished') {
          navigate(`/result/${result.attemptId}`);
        } else if (result.status === 'next-task') {
          // The panel now shows the new task's steps; say where the student is, politely.
          const { current, total } = selectTaskProgress(experiment, result.taskId);
          announce(t('bench.taskProgress', { current, total }));
        }
      })
      .catch(crash)
      .finally(() => {
        working.current = false;
      });
  };

  return (
    <Button variant="primary" className={compact ? 'shrink-0 !min-h-[44px] !px-4' : 'shrink-0'} onClick={press}>
      {label}
    </Button>
  );
}
