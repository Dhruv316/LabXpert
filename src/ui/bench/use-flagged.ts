import { useId, useMemo, useRef } from 'react';
import { visibleHighlight } from '../../bench/highlight';
import type { RuleResult } from '../../model/types';
import { useBenchStore, useTutorStore } from '../../state';
import { feedbackOf } from './tutor-text';

export interface Flagged {
  /** The primary error's title: what a screen reader hears on every flagged part and wire. */
  title: string;
  /** Id of the one hidden element that holds `title`; flagged parts and wires point `aria-describedby` at it. */
  descriptionId: string;
  componentIds: ReadonlySet<string>;
  wireIds: ReadonlySet<string>;
  /** Changes with every new highlight, so what is newly flagged pulses once. */
  pulseKey: number;
}

/**
 * What the bench shows as flagged right now: the tutor store's highlight (the primary error's targets only,
 * since `selectError` replaces it) limited to parts and wires that are still on the bench.
 * Undefined when nothing is lit.
 */
export function useFlagged(): Flagged | undefined {
  const circuit = useBenchStore((state) => state.circuit);
  const highlight = useTutorStore((state) => state.highlight);
  const primary = useTutorStore((state): RuleResult | undefined => state.errors[state.primaryIndex]);
  const descriptionId = useId();
  const counter = useRef(0);
  const pulseKey = useMemo(() => {
    counter.current += 1;
    return counter.current;
    // The highlight is the only thing that should restart the pulse, though the callback does not read it.
  }, [highlight]);

  return useMemo(() => {
    if (primary === undefined) return undefined;
    const visible = visibleHighlight(circuit, highlight);
    if (visible.componentIds.size === 0 && visible.wireIds.size === 0) return undefined;
    return { title: feedbackOf(primary).title, descriptionId, pulseKey, ...visible };
  }, [circuit, highlight, primary, descriptionId, pulseKey]);
}
