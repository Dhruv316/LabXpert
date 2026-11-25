import { useEffect, useRef } from 'react';
import { useBenchStore, useTutorStore } from '../../state';
import { useAnnounce } from './announcer';
import { feedbackOf } from './tutor-text';

/**
 * What the panel does when results arrive: a checkpoint that finds errors reopens a collapsed panel
 * and says the primary error's title through the shared polite live region.
 * It watches the `errors` list itself (a new list per checkpoint), not `mistakeWaiting`, because
 * that flag is also true when the student closes the panel on purpose while errors remain.
 */
export function useResultsArrive(): void {
  const announce = useAnnounce();
  const errors = useTutorStore((state) => state.errors);
  // Starts as the current list, so a panel that mounts on old results neither reopens nor speaks.
  const seen = useRef(errors);

  useEffect(() => {
    if (seen.current === errors) return;
    seen.current = errors;
    const primary = errors[useTutorStore.getState().primaryIndex];
    if (primary === undefined) return;
    const { panelCollapsed, setPanelCollapsed } = useTutorStore.getState();
    if (panelCollapsed) setPanelCollapsed(false);
    announce(feedbackOf(primary).title);
  }, [errors, announce]);
}

/**
 * Esc puts the tutor highlight out. It listens in the capture phase so it sees the state as it was
 * before any other Esc handler ran, and stays out of the way when Esc already means something else:
 * a wire in progress (cancelled by the wiring), an open dialog (closed by it), a part being dragged.
 */
export function useEscapeClearsHighlight(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const bench = useBenchStore.getState();
      if (bench.drawing !== undefined || bench.gesture?.kind === 'drag') return;
      if (document.querySelector('[role="dialog"]') !== null) return;
      useTutorStore.getState().clearHighlight();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
}
