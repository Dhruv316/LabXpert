// Keyboard focus helpers for the wire layer. Which element to move to is decided in src/bench;
// this only finds it on screen and focuses it.
import type { FocusTarget } from '../../bench/wires';

/** Focuses the element a FocusTarget names. False when it is not on screen. */
export function focusTarget(root: ParentNode, target: FocusTarget | undefined): boolean {
  if (target === undefined) return false;
  const selector = target.kind === 'wire' ? `[data-wire-id="${target.id}"]` : `[data-terminal-ref="${target.ref}"]`;
  const found = root.querySelector<SVGElement>(selector);
  if (found === null) return false;
  found.focus();
  return true;
}

const WIRE_KEYS = new Set(['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End']);

/**
 * Arrow keys move focus between wires (they are one Tab stop, see WireLayer): right and down go
 * to the next, left and up to the previous, both wrapping; Home and End jump to the ends.
 * Returns true when the key was a wire-navigation key (the caller then stops the page scrolling).
 */
export function moveWireFocus(current: SVGElement, key: string): boolean {
  if (!WIRE_KEYS.has(key)) return false;
  const wires = Array.from(current.parentElement?.children ?? []).filter(
    (el): el is SVGElement => el instanceof SVGElement && el.hasAttribute('data-wire-id'),
  );
  const at = wires.indexOf(current);
  if (at === -1 || wires.length === 0) return true;
  const last = wires.length - 1;
  const next =
    key === 'Home' ? 0 : key === 'End' ? last : key === 'ArrowRight' || key === 'ArrowDown' ? (at + 1) % wires.length : (at + last) % wires.length;
  wires[next]?.focus();
  return true;
}
