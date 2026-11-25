import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { ExperimentConfig } from '../../model/types';
import { useBenchStore, useTutorStore } from '../../state';
import { AnnouncerProvider } from './LiveRegion';
import { BenchToolbar } from './BenchToolbar';
import { installDevWiring } from './dev-wiring';
import { Dock } from './Dock';
import { Shelf } from './Shelf';
import { StatusStrip } from './StatusStrip';
import { TutorPanel } from './TutorPanel';
import { useBenchLayout } from './use-bench-layout';
import { useElementSize } from './use-element-size';
import { usePlacement } from './use-placement';
import { Workspace } from './Workspace';

/** Below this width the tutor panel starts collapsed (UI_SCREENS §3); opened there, it narrows so the bench keeps scale 0.5 (src/bench/layout.ts). */
const PANEL_OPEN_MIN_WIDTH = 1200;

export interface BenchViewProps {
  experiment: ExperimentConfig;
  /** Accessible name of the bench mat. */
  title: string;
  /** Sits above the bench inside the screen's height, so the bench shrinks to make room instead of being pushed down. */
  banner?: ReactNode;
}

/**
 * The bench screen's layout: shelf, workspace, dock and tutor panel under an optional banner. Shared by the
 * experiment bench and the practice bench; the caller has already opened the attempt it shows.
 */
export function BenchView({ experiment, title, banner }: BenchViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { focusRequest, placeNext, dropAt } = usePlacement(svgRef);
  const bannerRef = useRef<HTMLDivElement>(null);
  const bannerSize = useElementSize(bannerRef);
  const panelCollapsed = useTutorStore((state) => state.panelCollapsed);
  const hasFooter = useBenchStore((state) => (state.session?.kind ?? 'experiment') === 'experiment');
  // Dock height, panel width and bar heights for this window (src/bench/layout.ts).
  const layout = useBenchLayout({ panelCollapsed, bannerHeight: bannerSize?.height ?? 0, hasFooter });
  const compact = layout.dockMode === 'compact';

  // Every visit starts the panel the way the window width says (open, or collapsed below 1200 px). Before paint, so it never flashes open.
  useLayoutEffect(() => {
    useTutorStore.getState().setPanelCollapsed(window.innerWidth < PANEL_OPEN_MIN_WIDTH);
  }, []);

  // The console helper that adds a wire before wire drawing exists (development builds only).
  useEffect(() => installDevWiring(), []);

  return (
    <AnnouncerProvider>
      <div className="flex h-[calc(100vh-4rem)] min-h-[34rem] min-w-0 flex-col overflow-hidden">
        {banner !== undefined && (
          <div ref={bannerRef} className="shrink-0">
            {banner}
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <Shelf experiment={experiment} onPlace={placeNext} onDrop={dropAt} />
          <main className="flex min-w-0 flex-1 flex-col">
            <BenchToolbar compact={compact} />
            <Workspace experiment={experiment} svgRef={svgRef} focusRequest={focusRequest} label={title} />
            <StatusStrip compact={compact} />
            <Dock experiment={experiment} mode={layout.dockMode} height={layout.dockHeight} />
          </main>
          <TutorPanel experiment={experiment} width={layout.panelWidth} />
        </div>
      </div>
    </AnnouncerProvider>
  );
}
