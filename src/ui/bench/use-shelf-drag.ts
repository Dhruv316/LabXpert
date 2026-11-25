import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ComponentType } from '../../model/types';

export interface ShelfGhost {
  type: ComponentType;
  x: number;
  y: number;
}

/** A press that moves less than this is not a drag, so a stray click on a tile does nothing. */
const DRAG_START_PX = 6;

/**
 * Drag a tile out of the shelf with pointer events (no drag-and-drop library). The ghost follows
 * the pointer; on release `onDrop` gets the screen position. Escape or a cancelled pointer ends it.
 * A press that moves less than DRAG_START_PX is a tap: no drop, and the tile's click places the part.
 */
export function useShelfDrag(onDrop: (type: ComponentType, clientX: number, clientY: number) => void) {
  const [ghost, setGhost] = useState<ShelfGhost | undefined>(undefined);
  const stopRef = useRef<(() => void) | undefined>(undefined);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  // True from a press that became a drag until the next press. The browser still sends a click when
  // the drag is released back over the tile; that click is the end of the drag, not a tap.
  const draggedRef = useRef(false);

  useEffect(() => () => stopRef.current?.(), []);

  const begin = useCallback((type: ComponentType, event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    stopRef.current?.();
    draggedRef.current = false;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;

    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('keydown', onKey);
      stopRef.current = undefined;
      setGhost(undefined);
    };
    const onMove = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_START_PX) return;
      moved = true;
      setGhost({ type, x: e.clientX, y: e.clientY });
    };
    const onUp = (e: PointerEvent) => {
      stop();
      draggedRef.current = moved;
      if (moved) dropRef.current(type, e.clientX, e.clientY);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('keydown', onKey);
    stopRef.current = stop;
  }, []);

  /** Call from the tile's click: true means the click closes a drag and must not place a part. */
  const consumeDrag = useCallback(() => {
    const wasDrag = draggedRef.current;
    draggedRef.current = false;
    return wasDrag;
  }, []);

  return { ghost, begin, consumeDrag };
}
