import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { labelFootprint } from '../../bench/labels';
import { findComponent } from '../../bench/ops';
import { clampCentre, layoutOrDefault, placeClear, slotPlacement, wireLeads, type BoxSize, type SlotEdge, type SlotPlacement } from '../../bench/overlay';
import { cn } from '../../components/ui';
import { useBenchStore } from '../../state';
import { useElementSize } from './use-element-size';

/**
 * Classes every control in the layer carries. The layer lets pointer events through, so a control
 * opts back in; and it is never smaller than 44 × 44 screen px, however far the bench is scaled down.
 */
export const OVERLAY_CONTROL = 'pointer-events-auto min-h-[44px] min-w-[44px]';

export interface OverlaySlot {
  /** Unique among the slots. */
  key: string;
  /** The part the controls belong to; the slot follows it and disappears with it. */
  partId: string;
  /** Preferred side. It flips to the other side when there is no room. */
  edge?: SlotEdge;
  /**
   * The size of the controls, in screen px. With it the slot is also kept off the part's terminals and off the
   * first part of every wire leaving them: it moves beside the part, or to the other side, when a wire is in the way.
   */
  keepClear?: BoxSize;
  /** Controls. Each one must carry OVERLAY_CONTROL (OverlayButton does), or it will not receive pointer events. */
  children: ReactNode;
}

export interface ControlOverlayProps {
  slots: readonly OverlaySlot[];
}

/**
 * Real HTML controls laid over the bench SVG (so text and buttons keep their size when the bench is
 * scaled down). Each slot is placed from its part's mat coordinates with the same fit the SVG uses, and
 * is read from the store on every render, so it follows a part that is dragged, nudged or undone.
 * The layer and its slots ignore the pointer; only the controls inside take it, which keeps dragging,
 * wiring and selecting working everywhere else on the bench.
 */
export function ControlOverlay({ slots }: ControlOverlayProps) {
  const circuit = useBenchStore((state) => state.circuit);
  const ref = useRef<HTMLDivElement>(null);
  const measured = useElementSize(ref);
  const { layout, size } = layoutOrDefault(measured);

  return (
    <div ref={ref} data-testid="control-overlay" className="pointer-events-none absolute inset-0">
      {slots.map((slot) => {
        const part = findComponent(circuit, slot.partId);
        if (part === undefined) return null;
        const place =
          slot.keepClear === undefined
            ? slotPlacement(layout, size, part, slot.edge)
            : placeClear(layout, size, part, slot.edge ?? 'below', slot.keepClear, wireLeads(layout, circuit, part.id), labelFootprint(part.type, layout.scale));
        return (
          <Slot key={slot.key} slot={slot} place={place} boxWidth={size.width} />
        );
      })}
    </div>
  );
}

interface SlotViewProps {
  slot: OverlaySlot;
  place: SlotPlacement;
  boxWidth: number;
}

/** One slot: centred on its part, then pulled in from the layer's side edges if it is wider than the room (a row of five options is). */
function Slot({ slot, place, boxWidth }: SlotViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // Measured after every render; the state only changes when the width does, so this settles at once.
  useLayoutEffect(() => {
    const measured = ref.current?.offsetWidth ?? 0;
    setWidth((previous) => (previous === measured ? previous : measured));
  });
  // A control beside its part is pinned by its own edge; the usual one is centred and pulled in from the layer's sides.
  const left = place.align === undefined ? clampCentre(place.left, width, boxWidth) : place.left;
  const shift = place.align === 'start' ? '' : place.align === 'end' ? '-translate-x-full' : '-translate-x-1/2';
  return (
    <div
      ref={ref}
      data-overlay-slot={slot.key}
      data-edge={place.edge}
      style={place.anchor === 'top' ? { left, top: place.offset } : { left, bottom: place.offset }}
      className={cn('pointer-events-none absolute flex items-center gap-2', shift)}
    >
      {slot.children}
    </div>
  );
}
