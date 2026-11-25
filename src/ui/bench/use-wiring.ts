import { useCallback, useEffect, useRef, type PointerEvent } from 'react';
import type { Point } from '../../bench/geometry';
import { allTerminals, nearestTerminal, terminalPosition } from '../../bench/wires';
import { useToast } from '../../components/ui';
import { t } from '../../i18n';
import type { TerminalRef } from '../../model/types';
import { useBenchStore } from '../../state';
import { useCrash } from '../shell/use-crash';
import { useAnnounce } from './announcer';
import { terminalRefName } from './names';

/** A press that travels less than this (design units) is a click, not the start of a drag. */
const DRAG_SLOP = 8;

interface PressState {
  origin: Point | undefined;
  moved: boolean;
}

/**
 * Wiring (UI_SCREENS §3): press a terminal and drag, click one terminal then another, or do the
 * same with Enter or Space. All the rules (snap, duplicates, saving, the event) live in the store
 * and `src/bench`; this only turns input into those actions and says what happened, by toast and
 * live region. The keyboard goes through the same `finish` and announcements as the pointer.
 */
export function useWiring(toBench: (clientX: number, clientY: number) => Point | undefined) {
  const announce = useAnnounce();
  const toast = useToast();
  const crash = useCrash();
  const press = useRef<PressState | undefined>(undefined);
  const wiring = useBenchStore((state) => state.drawing !== undefined);

  const nameOf = useCallback((ref: TerminalRef | undefined) => {
    return ref === undefined ? '' : (terminalRefName(useBenchStore.getState().circuit, ref) ?? '');
  }, []);

  const reject = useCallback(
    (message: string) => {
      toast.show(message, 'warning');
      announce(message);
    },
    [toast, announce],
  );

  const cancel = useCallback(() => {
    press.current = undefined;
    if (useBenchStore.getState().cancelWire()) announce(t('bench.wireCancelled'));
  }, [announce]);

  /** Ends the wire at `target` (undefined = over nothing) and reports how it ended. */
  const finish = useCallback(
    (target: TerminalRef | undefined) => {
      const from = useBenchStore.getState().drawing?.from;
      const names = { from: nameOf(from), to: nameOf(target) };
      useBenchStore
        .getState()
        .finishWire(target)
        .then((result) => {
          if (result === 'connected') announce(t('bench.wireConnected', names));
          else if (result === 'cancelled') announce(t('bench.wireCancelled'));
          else if (result === 'same-terminal') reject(t('bench.wireSameTerminal'));
          else if (result === 'duplicate') reject(t('bench.wireDuplicate'));
        })
        .catch(crash);
    },
    [announce, crash, nameOf, reject],
  );

  // Esc cancels from wherever focus is, as long as a wire is in progress.
  useEffect(() => {
    if (!wiring) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [wiring, cancel]);

  /** A press on a terminal with no wire in progress starts one (drag until it proves to be a click). */
  const pressTerminal = useCallback(
    (ref: TerminalRef, event: PointerEvent<SVGGElement>) => {
      if (event.button !== 0) return;
      // A press on a post is not a press on empty space, so it must not clear the selection.
      event.stopPropagation();
      if (useBenchStore.getState().drawing !== undefined) return;
      if (!useBenchStore.getState().startWire(ref, 'drag')) return;
      press.current = { origin: toBench(event.clientX, event.clientY), moved: false };
      announce(t('bench.wireStarted', { terminal: nameOf(ref) }));
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [announce, nameOf, toBench],
  );

  /**
   * Enter or Space on a terminal: starts a wire, or ends the one in progress. It is the click-click
   * path, so the event says `click`. A pointer press that is still down owns its wire.
   */
  const activateTerminal = useCallback(
    (ref: TerminalRef) => {
      const store = useBenchStore.getState();
      if (store.drawing === undefined) {
        if (store.startWire(ref, 'click')) announce(t('bench.wireStarted', { terminal: nameOf(ref) }));
        return;
      }
      if (store.drawing.method === 'click') finish(ref);
    },
    [announce, finish, nameOf],
  );

  /** Focus moving onto a terminal while a click-style wire is open lights it, as hovering does for the pointer. */
  const previewTerminal = useCallback((ref: TerminalRef) => {
    const { drawing, circuit, moveWire } = useBenchStore.getState();
    if (drawing?.method !== 'click') return;
    const at = terminalPosition(circuit, ref);
    if (at !== undefined) moveWire(at.x, at.y);
  }, []);

  /** Capture phase on the bench: while a click-started wire is open, the next press ends it or cancels it. */
  const onPointerDownCapture = (event: PointerEvent<SVGSVGElement>) => {
    const { drawing, circuit } = useBenchStore.getState();
    if (drawing === undefined || drawing.method !== 'click' || event.button !== 0) return;
    const onTerminal = event.target instanceof Element ? event.target.closest('[data-terminal-ref]') : null;
    const point = toBench(event.clientX, event.clientY);
    // A press within snap range of a post counts as that post, so a wire never lands "near" one without joining.
    const pressed = onTerminal?.getAttribute('data-terminal-ref');
    const ref =
      allTerminals(circuit).find((candidate) => candidate.ref === pressed)?.ref ??
      (point === undefined ? undefined : nearestTerminal(circuit, point)?.ref);
    if (ref === undefined) {
      cancel();
      return;
    }
    event.stopPropagation();
    finish(ref);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (useBenchStore.getState().drawing === undefined) return;
    const point = toBench(event.clientX, event.clientY);
    if (point === undefined) return;
    const state = press.current;
    if (state?.origin !== undefined && !state.moved && Math.hypot(point.x - state.origin.x, point.y - state.origin.y) > DRAG_SLOP) {
      state.moved = true;
    }
    useBenchStore.getState().moveWire(point.x, point.y);
  };

  const onPointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const state = press.current;
    press.current = undefined;
    const { drawing } = useBenchStore.getState();
    if (state === undefined || drawing === undefined || drawing.method !== 'drag') return;
    const point = toBench(event.clientX, event.clientY);
    if (point !== undefined) useBenchStore.getState().moveWire(point.x, point.y);
    if (!state.moved) {
      // Pressed and released on the same post: a click. The wire stays open for the second click.
      useBenchStore.getState().startWire(drawing.from, 'click');
      return;
    }
    const lit = useBenchStore.getState().highlightedTerminal;
    finish(lit === drawing.from ? undefined : lit);
  };

  const onPointerCancel = () => {
    if (press.current !== undefined) cancel();
  };

  return { pressTerminal, activateTerminal, previewTerminal, onPointerDownCapture, onPointerMove, onPointerUp, onPointerCancel };
}
