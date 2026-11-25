import { BENCH_VIEW } from './catalog';
import type { Point } from './geometry';

export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the scene sits inside its element: scaled by `scale`, centred, never stretched. */
export interface SceneLayout {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** The "meet" fit of the 1100 × 648 scene into a box. Undefined while the box has no size (not laid out yet). */
export function sceneLayout(width: number, height: number): SceneLayout | undefined {
  if (width <= 0 || height <= 0) return undefined;
  const scale = Math.min(width / BENCH_VIEW.width, height / BENCH_VIEW.height);
  return { scale, offsetX: (width - BENCH_VIEW.width * scale) / 2, offsetY: (height - BENCH_VIEW.height * scale) / 2 };
}

/** Mat coordinates to pixels inside the same box (the inverse of `clientToBench`, minus the box's own corner). */
export function benchToLocal(layout: SceneLayout, x: number, y: number): Point {
  return { x: layout.offsetX + x * layout.scale, y: layout.offsetY + y * layout.scale };
}

/**
 * Screen pixels to mat coordinates for an SVG drawn with viewBox and "meet" scaling (the scene is
 * centred and never stretched). Undefined while the element has no size (not laid out yet).
 */
export function clientToBench(rect: ClientRect, clientX: number, clientY: number): Point | undefined {
  const layout = sceneLayout(rect.width, rect.height);
  if (layout === undefined) return undefined;
  return { x: (clientX - rect.left - layout.offsetX) / layout.scale, y: (clientY - rect.top - layout.offsetY) / layout.scale };
}

export function isInside(rect: ClientRect, clientX: number, clientY: number): boolean {
  return (
    clientX >= rect.left &&
    clientX <= rect.left + rect.width &&
    clientY >= rect.top &&
    clientY <= rect.top + rect.height
  );
}
