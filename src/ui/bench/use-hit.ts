import { useCallback, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import { clientToBench, sceneLayout } from '../../bench/coords';
import { hitTest, type HitResult } from '../../bench/hit';
import { useBenchStore } from '../../state';
import { focusTarget } from './wire-focus';

/** What lies under a screen position, by the rules in `bench/hit.ts`. Undefined until the bench has a size (not laid out yet). */
export type HitAt = (clientX: number, clientY: number) => HitResult | undefined;

/**
 * The screen's one way to ask `hitTest` a question. The bench scale is read from the same rectangle the pointer is
 * converted with, so a press and the size of the targets under it always agree.
 */
export function useHitAt(svgRef: RefObject<SVGSVGElement>): HitAt {
  return useCallback(
    (clientX, clientY) => {
      const svg = svgRef.current;
      if (svg === null) return undefined;
      const rect = svg.getBoundingClientRect();
      const layout = sceneLayout(rect.width, rect.height);
      const point = clientToBench(rect, clientX, clientY);
      return layout === undefined || point === undefined ? undefined : hitTest(useBenchStore.getState().circuit, point, layout.scale);
    },
    [svgRef],
  );
}

/**
 * Wires are selected by `hitTest`, not by the browser: a wire's wide click band is not drawn, so it cannot take a press
 * that a part or a terminal should have. Parts and terminals take their own presses (they are in the page, and they stop
 * the event); a press that reaches the bench itself is asked here, so it selects the wire under it, or clears the selection.
 * The same question lights the wire under the pointer (hover), as the drawn lead used to do.
 */
export function useWireHit(svgRef: RefObject<SVGSVGElement>, hitAt: HitAt) {
  const [hoveredWireId, setHoveredWireId] = useState<string | undefined>(undefined);
  // True when the press just put focus on a wire, so the mouse press that follows must not move it to the bench frame.
  const focusedByPress = useRef(false);

  const wireAt = (clientX: number, clientY: number): string | undefined => {
    const target = hitAt(clientX, clientY)?.target;
    return target?.kind === 'wire' ? target.id : undefined;
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    focusedByPress.current = false;
    const store = useBenchStore.getState();
    const id = event.button === 0 ? wireAt(event.clientX, event.clientY) : undefined;
    if (id === undefined) {
      store.select(undefined);
      return;
    }
    // Like a press on the drawn lead: the wire is selected and takes focus, so Delete and the focus ring go to it.
    store.selectWire(id);
    const svg = svgRef.current;
    focusedByPress.current = svg !== null && focusTarget(svg, { kind: 'wire', id });
  };

  const onMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    if (!focusedByPress.current) return;
    focusedByPress.current = false;
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const { drawing, gesture } = useBenchStore.getState();
    const busy = drawing !== undefined || (gesture?.kind === 'drag' && gesture.pushed);
    setHoveredWireId(busy ? undefined : wireAt(event.clientX, event.clientY));
  };

  const onPointerLeave = () => setHoveredWireId(undefined);

  return { hoveredWireId, onPointerDown, onMouseDown, onPointerMove, onPointerLeave };
}
