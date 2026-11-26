import { useLayoutEffect, useRef } from 'react';
import { CircleAlert, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Ollie } from '../../components/Ollie';
import { Icon, IconButton, Tooltip, cn } from '../../components/ui';
import { t } from '../../i18n';
import { LAYOUT } from '../../bench/layout';
import type { ExperimentConfig } from '../../model/types';
import { selectCurrentTaskId, usePracticeStore, useTaskStore, useTutorStore } from '../../state';
import { Bubble, TutorResults } from './TutorResults';
import { practiceGoal } from './practice-text';
import { instructionSteps } from './tutor-text';
import { useEscapeClearsHighlight, useResultsArrive } from './use-tutor-panel';

export interface TutorPanelProps {
  experiment: ExperimentConfig;
}

/** The open panel's border (`border-l-4`): the content is this much narrower than the panel. */
const PANEL_BORDER_PX = 4;
const OPEN_PANEL_PX = LAYOUT.panelOpen;
const OPEN_OLLIE_PX = 96;

/** Before the first check: Ollie's line, then the current task's steps (numbering means something here: it is a sequence). A practice run shows its goal instead. */
function Instructions({ experiment }: TutorPanelProps) {
  const taskId = useTaskStore((state) => selectCurrentTaskId(state, experiment));
  const practice = usePracticeStore((state) => state.current);
  // A practice run has one goal instead of the experiment's steps (the bench experiment's task text is for the experiment).
  if (practice !== undefined) {
    return (
      <Bubble>
        <p data-testid="practice-goal-panel" className="font-body text-base leading-[1.625rem] text-ink">
          {practiceGoal(practice.task)}
        </p>
      </Bubble>
    );
  }
  const steps = instructionSteps(experiment, taskId);
  return (
    <>
      <Bubble>
        <p className="font-body text-base leading-[1.625rem] text-ink">{t('bench.panelEmpty')}</p>
      </Bubble>
      <ol className="list-decimal space-y-2 pl-6 font-body text-base leading-[1.625rem] text-ink">
        {steps.map((step) => (
          <li key={step} className="pl-1">
            {step}
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * Ollie's panel (DESIGN.md §8): 360 px open, a 56 px strip when collapsed. Whether it is collapsed
 * lives in the tutor store, so a checkpoint can reopen it. The width change is one 220 ms slide,
 * which the reduced-motion rules in index.css remove.
 */
export function TutorPanel({ experiment, width = OPEN_PANEL_PX, ollieSize = OPEN_OLLIE_PX }: TutorPanelProps & { width?: number; ollieSize?: number }) {
  const collapsed = useTutorStore((state) => state.panelCollapsed);
  const setCollapsed = useTutorStore((state) => state.setPanelCollapsed);
  const status = useTutorStore((state) => state.status);
  const mood = useTutorStore((state) => state.mood);
  const mistakeWaiting = useTutorStore((state) => state.errors.length > 0 && state.panelCollapsed);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const userToggled = useRef(false);

  useResultsArrive();
  useEscapeClearsHighlight();

  // The button that was pressed is replaced by its twin, so focus moves to the new one. A panel that
  // opens by itself (a mistake) leaves focus where the student was.
  useLayoutEffect(() => {
    if (!userToggled.current) return;
    userToggled.current = false;
    toggleRef.current?.focus();
  }, [collapsed]);

  const toggle = () => {
    userToggled.current = true;
    setCollapsed(!collapsed);
  };

  return (
    <aside
      aria-label={t('bench.panelTitle')}
      data-collapsed={collapsed}
      className={cn(
        'flex shrink-0 flex-col overflow-hidden rounded-panel border-l-4 border-wood-dark bg-mat transition-[width] duration-base ease-bouncy',
        collapsed && 'w-14',
      )}
      style={collapsed ? undefined : { width }}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-3 py-3">
          <Ollie mood={mood} size={40} decorative />
          <div className="relative">
            <Tooltip content={t('bench.showPanel')}>
              {(describedBy) => (
                <IconButton ref={toggleRef} icon={PanelRightOpen} label={t('bench.showPanel')} aria-describedby={describedBy} onClick={toggle} />
              )}
            </Tooltip>
            {mistakeWaiting && (
              <span
                role="img"
                aria-label={t('bench.mistakeWaiting')}
                data-testid="mistake-dot"
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-error text-white ring-2 ring-mat"
              >
                <Icon icon={CircleAlert} size={16} />
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" style={{ width: width - PANEL_BORDER_PX }}>
          {/* The header stays put (the hide button is always reachable); only the tips below it scroll. */}
          <div className="flex shrink-0 items-start gap-3 p-4 pb-2">
            <Ollie mood={mood} size={ollieSize} decorative />
            <h2 className="min-w-0 flex-1 break-words font-heading text-xl font-semibold leading-7 text-ink">{t('bench.panelTitle')}</h2>
            <IconButton ref={toggleRef} icon={PanelRightClose} label={t('bench.hidePanel')} onClick={toggle} />
          </div>
          <div data-panel-body className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-4 pt-2">
            {status === 'instructions' ? <Instructions experiment={experiment} /> : <TutorResults />}
          </div>
        </div>
      )}
    </aside>
  );
}
