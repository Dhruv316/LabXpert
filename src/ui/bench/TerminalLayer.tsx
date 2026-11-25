import { terminalHitRadius } from '../../bench/targets';
import { allTerminals, type PlacedTerminal } from '../../bench/wires';
import tokens from '../../spec/design-tokens.json';
import { useBenchStore } from '../../state';
import { terminalName } from './names';
import { findComponent } from '../../bench/ops';
import { useMotionReduced } from '../../components/ui';
import type { TerminalRef } from '../../model/types';
import type { KeyboardEvent, PointerEvent } from 'react';

const HIT = tokens.terminal.hitRadius;
const POST = tokens.terminal.radius;

interface TerminalMarkProps {
  terminal: PlacedTerminal;
  label: string;
  /** The press circle's radius in design units: the token's, widened on a small bench so the target stays 44 px. */
  hitRadius: number;
  connected: boolean;
  /** The snap target of a wire being drawn: solid ring. */
  snapTarget: boolean;
  /** A wire is being drawn: every terminal shows the soft ring. */
  wiring: boolean;
  /** A part is being dragged: terminals dim to 50% unless a wire is being drawn (DESIGN §6). */
  dimmed: boolean;
  /** The soft pulse ring is motion, so it is left out entirely under reduced motion (DESIGN §10). */
  pulse: boolean;
  /** The post a wire in progress started at: it keeps its solid ring, so the learner sees where the wire began. */
  origin: boolean;
  onPress: (ref: TerminalRef, event: PointerEvent<SVGGElement>) => void;
  /** Enter or Space (keyboard wiring). */
  onActivate: (ref: TerminalRef) => void;
  onFocusTerminal: (ref: TerminalRef) => void;
}

export interface TerminalLayerProps {
  /** Screen px per design unit. */
  scale: number;
  onPress: TerminalMarkProps['onPress'];
  onActivate: TerminalMarkProps['onActivate'];
  onFocusTerminal: TerminalMarkProps['onFocusTerminal'];
}

/**
 * One terminal: a big invisible hit area over the post the kit SVG already draws, a ring for
 * hover and focus, and a dark centre dot once a wire is attached (DESIGN §7). A press starts a
 * wire; so do Enter and Space, and Enter or Space on a second terminal ends it (use-wiring.ts).
 */
function TerminalMark({ terminal, label, hitRadius, connected, snapTarget, wiring, dimmed, pulse, origin, onPress, onActivate, onFocusTerminal }: TerminalMarkProps) {
  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // Space would scroll the page, and a held key must not start a wire and end it on itself.
    event.preventDefault();
    if (!event.repeat) onActivate(terminal.ref);
  };
  return (
    <g
      transform={`translate(${terminal.x} ${terminal.y})`}
      role="button"
      tabIndex={0}
      aria-label={label}
      data-terminal-ref={terminal.ref}
      data-connected={connected}
      data-snap-target={snapTarget}
      data-wire-origin={origin}
      opacity={dimmed ? 0.5 : 1}
      className="group cursor-crosshair outline-none"
      onPointerDown={(event) => onPress(terminal.ref, event)}
      onKeyDown={onKeyDown}
      onFocus={() => onFocusTerminal(terminal.ref)}
    >
      <circle r={hitRadius} data-hit-area="" className="fill-transparent" />
      {connected && <circle r={4.5} aria-hidden="true" className="pointer-events-none fill-ink" />}
      {wiring && pulse && !snapTarget && !origin && (
        <circle
          data-pulse-ring=""
          r={HIT}
          strokeWidth={4}
          aria-hidden="true"
          className="pointer-events-none fill-none stroke-teal-tint motion-safe:animate-pulse"
        />
      )}
      {/* Hover and snap: the solid teal ring. */}
      <circle
        r={HIT}
        strokeWidth={3}
        aria-hidden="true"
        className={
          snapTarget || origin
            ? 'pointer-events-none fill-none stroke-teal'
            : 'pointer-events-none fill-none stroke-teal opacity-0 group-hover:opacity-100'
        }
      />
      {/* Focus: a wider ring outside the post, so keyboard users can tell it from hover. */}
      <circle
        r={POST + 10}
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
        aria-hidden="true"
        className="pointer-events-none fill-none stroke-teal-deep opacity-0 group-focus-visible:opacity-100"
      />
    </g>
  );
}

/** Every terminal of every placed part, above the wires so a post can always be reached. */
export function TerminalLayer({ scale, onPress, onActivate, onFocusTerminal }: TerminalLayerProps) {
  const circuit = useBenchStore((state) => state.circuit);
  const gesture = useBenchStore((state) => state.gesture);
  const drawing = useBenchStore((state) => state.drawing);
  const highlighted = useBenchStore((state) => state.highlightedTerminal);
  const reduced = useMotionReduced();

  const terminals = allTerminals(circuit);
  const joined = new Set(circuit.wires.flatMap((wire) => [wire.from, wire.to]));
  const partDragging = gesture?.kind === 'drag' && gesture.pushed;

  return (
    <g data-testid="terminal-layer">
      {terminals.map((terminal) => {
        const part = findComponent(circuit, terminal.componentId);
        if (part === undefined) return null;
        return (
          <TerminalMark
            key={terminal.ref}
            terminal={terminal}
            label={terminalName(part, terminal.name)}
            hitRadius={terminalHitRadius(terminal, terminals, scale)}
            connected={joined.has(terminal.ref)}
            snapTarget={drawing !== undefined && highlighted === terminal.ref}
            wiring={drawing !== undefined}
            dimmed={partDragging && drawing === undefined}
            pulse={!reduced}
            origin={drawing?.from === terminal.ref}
            onPress={onPress}
            onActivate={onActivate}
            onFocusTerminal={onFocusTerminal}
          />
        );
      })}
    </g>
  );
}
