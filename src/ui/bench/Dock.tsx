import { useEffect, useId, useMemo } from 'react';
import { LAYOUT, type DockMode } from '../../bench/layout';
import { readingRows } from '../../bench/readings-table';
import { readingPoints, showsRatioColumn } from '../../bench/readings';
import { cn } from '../../components/ui';
import { t } from '../../i18n';
import type { ExperimentConfig } from '../../model/types';
import { selectTaskNeedsAnswer, useBenchStore, useReadingsStore } from '../../state';
import { useCrash } from '../shell/use-crash';
import { AnswerBox } from './AnswerBox';
import { FinishButton } from './FinishButton';
import { ReadingsTable } from './ReadingsTable';
import { RecordButton } from './RecordButton';
import { useDockData } from './use-dock-data';
import { VIGraph } from './VIGraph';

export interface DockProps {
  experiment: ExperimentConfig;
  /** `compact` is the short-window dock (src/bench/layout.ts): same parts, one row of three columns. */
  mode?: DockMode;
  /** The compact dock's height in px; the full dock is the design's 220 px. */
  height?: number;
}

// The compact dock's columns (fr): table, graph, answer and Finish. The table needs room for its ratio column; the answer box needs room for its label.
const COMPACT_COLUMNS = {
  answer: 'grid-cols-[minmax(0,20fr)_minmax(0,15fr)_minmax(0,37fr)]',
  finishOnly: 'grid-cols-[minmax(0,30fr)_minmax(0,25fr)_minmax(0,17fr)]',
  noFooter: 'grid-cols-[minmax(0,11fr)_minmax(0,9fr)]',
} as const;

/**
 * The 220 px dock under the bench (a compact one on short windows): Readings (table and Record reading) on the left, the V–I graph on the
 * right, and along the bottom the equivalent-resistance box (`data-dock-slot="answer"`, only for a task
 * that asks for one) with Finish experiment / Next task at the right end. Practice attempts have no bottom row.
 */
export function Dock({ experiment, mode = 'full', height = LAYOUT.dockFull }: DockProps) {
  const titleId = useId();
  const crash = useCrash();
  const loadError = useReadingsStore((state) => state.loadError);
  const { taskId, readings } = useDockData(experiment);
  // Only experiment attempts finish tasks and answer; the session leaves the kind out for the usual experiment attempt.
  const isExperiment = useBenchStore((state) => (state.session?.kind ?? 'experiment') === 'experiment');
  const needsAnswer = isExperiment && selectTaskNeedsAnswer(experiment, taskId);
  const rows = useMemo(() => readingRows(readings, showsRatioColumn(experiment.id)), [readings, experiment.id]);
  const points = useMemo(() => readingPoints(readings), [readings]);

  // Loading the attempt's records failed: hand it to the error boundary, as the bench does for its writes.
  useEffect(() => {
    if (loadError !== undefined) crash(loadError);
  }, [loadError, crash]);

  const compact = mode === 'compact';
  const columns = !isExperiment ? COMPACT_COLUMNS.noFooter : needsAnswer ? COMPACT_COLUMNS.answer : COMPACT_COLUMNS.finishOnly;

  return (
    <div
      data-dock
      data-dock-mode={mode}
      // The design's 220 px is a class; above 100% text the layout rule gives a taller dock, which wins as an inline height.
      style={compact || height !== LAYOUT.dockFull ? { height } : undefined}
      className={cn(
        'grid shrink-0 border-t-4 border-wood bg-mat',
        compact
          ? cn('grid-rows-[minmax(0,1fr)] gap-x-3 px-3 py-0.5', columns)
          : cn(
              'h-[220px] grid-cols-[minmax(0,11fr)_minmax(0,9fr)] gap-x-4 gap-y-1 px-4 py-2',
              isExperiment ? 'grid-rows-[minmax(0,1fr)_auto]' : 'grid-rows-[minmax(0,1fr)]',
            ),
      )}
    >
      <section aria-labelledby={titleId} className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-heading text-xl font-semibold leading-7">
            {t('bench.readings')}
          </h2>
          <RecordButton compact={compact} />
        </div>
        <ReadingsTable rows={rows} showRatio={showsRatioColumn(experiment.id)} titleId={titleId} compact={compact} />
      </section>
      <VIGraph experiment={experiment} points={points} />
      {isExperiment && (
        <div
          data-dock-footer
          className={cn(
            !compact && 'col-span-2 flex items-start justify-between gap-3',
            compact && needsAnswer && 'grid min-h-0 min-w-0 grid-cols-[minmax(7rem,14rem)_auto_minmax(0,1fr)] grid-rows-[auto_minmax(44px,auto)] content-start gap-x-2 gap-y-1',
            compact && !needsAnswer && 'flex min-w-0 items-center justify-end',
          )}
        >
          <div data-dock-slot="answer" className={compact && needsAnswer ? 'contents' : 'min-w-0 flex-1'}>
            {needsAnswer && <AnswerBox experiment={experiment} taskId={taskId} readings={readings} compact={compact} />}
          </div>
          <div className={compact && needsAnswer ? 'col-span-2 col-start-2 row-start-2 justify-self-end' : undefined}>
            <FinishButton experiment={experiment} taskId={taskId} compact={compact} />
          </div>
        </div>
      )}
    </div>
  );
}
