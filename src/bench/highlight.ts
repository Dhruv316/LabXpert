// Pure helpers for drawing the tutor's highlight on the bench (DESIGN.md §6 and §7). No React, no text.
import type { Circuit } from '../model/types';
import { PART_SIZE } from './catalog';
import type { Highlight } from './checkpoint';

/** How far the dashed error outline stands off the part's box. The selected outline sits at 8 and the focus ring at 14, so all three can be seen at once. */
export const OUTLINE_PAD = 12;
export const BADGE_RADIUS = 13;

export interface PartMark {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisibleHighlight {
  componentIds: ReadonlySet<string>;
  wireIds: ReadonlySet<string>;
}

/**
 * The part of a highlight that still exists on the bench. The store already clears a highlight when the
 * circuit changes; this is the second guard, so an id that is gone can never leave an outline behind.
 */
export function visibleHighlight(circuit: Circuit, highlight: Highlight): VisibleHighlight {
  const parts = new Set(circuit.components.map((part) => part.id));
  const wires = new Set(circuit.wires.map((wire) => wire.id));
  return {
    componentIds: new Set(highlight.componentIds.filter((id) => parts.has(id))),
    wireIds: new Set(highlight.wireIds.filter((id) => wires.has(id))),
  };
}

/** Where each flagged part is now, so an outline follows its part. */
export function partMarks(circuit: Circuit, ids: ReadonlySet<string>): PartMark[] {
  return circuit.components
    .filter((part) => ids.has(part.id))
    .map((part) => ({ id: part.id, x: part.x, y: part.y, ...PART_SIZE[part.type] }));
}
