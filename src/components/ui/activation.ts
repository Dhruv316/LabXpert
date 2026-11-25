import { useRef, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from 'react';

export type PressHandler = (event: SyntheticEvent<HTMLElement>) => void;

/** A browser may still send a click right after a key we already handled; ignore that echo. */
const KEY_ECHO_MS = 80;

/**
 * One activation path for buttons: mouse, touch, Enter and Space all call `onPress` once.
 * Enter and Space are handled here (not left to the browser) so behaviour is the same in every
 * browser and testable in jsdom, which does not turn key presses into clicks.
 * Blocked (disabled) controls never call `onPress`. Submit buttons keep the browser's own keys.
 */
export function useActivation<E extends HTMLElement>(
  onPress: PressHandler | undefined,
  blocked: boolean,
  keepNativeKeys = false,
) {
  const spaceDown = useRef(false);
  const lastKeyAt = useRef(0);

  const fireFromKey = (event: SyntheticEvent<E>) => {
    lastKeyAt.current = Date.now();
    if (!blocked) onPress?.(event);
  };

  return {
    onClick: (event: MouseEvent<E>) => {
      if (blocked) {
        event.preventDefault();
        return;
      }
      if (event.detail === 0 && Date.now() - lastKeyAt.current < KEY_ECHO_MS) return;
      onPress?.(event);
    },
    onKeyDown: (event: KeyboardEvent<E>) => {
      if (keepNativeKeys) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!event.repeat) fireFromKey(event);
      } else if (event.key === ' ') {
        event.preventDefault();
        spaceDown.current = true;
      }
    },
    onKeyUp: (event: KeyboardEvent<E>) => {
      if (keepNativeKeys || event.key !== ' ' || !spaceDown.current) return;
      event.preventDefault();
      spaceDown.current = false;
      fireFromKey(event);
    },
  };
}
