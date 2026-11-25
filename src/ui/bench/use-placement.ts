import { useCallback, useState, type RefObject } from 'react';
import { clientToBench, isInside } from '../../bench/coords';
import { topLeftFromCenter } from '../../bench/geometry';
import type { ComponentType } from '../../model/types';
import { useBenchStore } from '../../state';
import { useCrash } from '../shell/use-crash';

/** Asks the workspace to move keyboard focus to a part. `nonce` makes a repeat request for the same part count. */
export interface FocusRequest {
  id: string;
  nonce: number;
}

/** Placing from the shelf: Enter puts the part at the next free spot, a drop puts it under the pointer. */
export function usePlacement(svgRef: RefObject<SVGSVGElement>) {
  const crash = useCrash();
  const [focusRequest, setFocusRequest] = useState<FocusRequest | undefined>(undefined);

  const placeNext = useCallback(
    (type: ComponentType) => {
      useBenchStore
        .getState()
        .place(type)
        .then((id) => {
          if (id !== undefined) setFocusRequest((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
        })
        .catch(crash);
    },
    [crash],
  );

  const dropAt = useCallback(
    (type: ComponentType, clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (svg === null) return;
      const rect = svg.getBoundingClientRect();
      if (!isInside(rect, clientX, clientY)) return;
      const point = clientToBench(rect, clientX, clientY);
      if (point === undefined) return;
      useBenchStore.getState().place(type, topLeftFromCenter(type, point.x, point.y)).catch(crash);
    },
    [svgRef, crash],
  );

  return { focusRequest, placeNext, dropAt };
}
