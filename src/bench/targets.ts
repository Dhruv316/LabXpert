// How big a press target is on screen (DESIGN.md §9 and §11: at least 44 × 44 px). The bench is scaled with
// viewBox, so a target drawn in design units shrinks with it; these rules widen it back. Pure maths.
import type { PlacedTerminal } from './wires';
import tokens from '../spec/design-tokens.json';

/** The smallest press target, in screen px. */
export const TARGET_MIN_PX = 44;

const BASE_HIT_RADIUS: number = tokens.terminal.hitRadius;

/**
 * The radius (design units) of a terminal's invisible press circle. It is the token's `hitRadius` at least, and
 * grows until the circle is 44 screen px across at this bench scale. It never grows past half the distance to
 * the nearest other terminal, so two neighbouring circles never overlap (on a very small bench that means the
 * circle stays under 44 px: the posts are closer than two targets would need).
 */
export function terminalHitRadius(terminal: PlacedTerminal, all: readonly PlacedTerminal[], scale: number): number {
  if (!(scale > 0)) return BASE_HIT_RADIUS;
  const wanted = TARGET_MIN_PX / 2 / scale;
  let nearest = Infinity;
  for (const other of all) {
    if (other.ref === terminal.ref) continue;
    nearest = Math.min(nearest, Math.hypot(other.x - terminal.x, other.y - terminal.y));
  }
  return Math.max(BASE_HIT_RADIUS, Math.min(wanted, nearest / 2));
}

/** The wire trash button's radius when the bench is drawn at scale 1 (design units). */
export const TRASH_BASE_RADIUS = 20;

/** The trash button's radius in design units: its base size, grown until it is 44 screen px across. */
export function trashRadius(scale: number): number {
  if (!(scale > 0)) return TRASH_BASE_RADIUS;
  return Math.max(TRASH_BASE_RADIUS, TARGET_MIN_PX / 2 / scale);
}
