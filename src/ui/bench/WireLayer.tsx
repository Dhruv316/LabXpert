import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { trashRadius } from '../../bench/targets';
import { wirePath, type WireGeometry } from '../../bench/wires';
import { cn, useMotionReduced } from '../../components/ui';
import { t } from '../../i18n';
import tokens from '../../spec/design-tokens.json';
import { useBenchStore } from '../../state';
import { FlowDotsLayer } from './FlowDotsLayer';
import { wireName } from './names';
import type { Flagged } from './use-flagged';
import { moveWireFocus } from './wire-focus';

const { outlineWidth, fillWidth } = tokens.wire;

interface WireViewProps {
  id: string;
  label: string;
  geometry: WireGeometry;
  selected: boolean;
  /** Wires are one Tab stop (the others are reached with the arrow keys), so only one has tabIndex 0. */
  tabStop: boolean;
  /** The pointer is on the wire's click band (decided by `hitTest`, since the band is not drawn): orange, as hover always was. */
  hovered: boolean;
  /** The tutor flags this wire: `error` fill and a dashed pulsing outline, whatever else the wire is. */
  flagged: boolean;
  /** Restarts the single pulse when a new error is chosen. */
  pulseKey: number;
  /** The hidden element holding the primary error's title. */
  describedBy: string | undefined;
  onFocusWire: (id: string) => void;
  onRemove: (id: string) => void;
}

/**
 * One wire (DESIGN §7): ink outline under a teal fill, orange on hover, orange with a dashed ink overlay when selected.
 * Flagged by the tutor it is `error`-filled inside a dashed `error` outline that pulses once; selected on top of that
 * keeps its dashed ink overlay and trash button, so both states can be read.
 *
 * Nothing in here takes a pointer press: a press is given to a wire by `hitTest` (terminal, then part, then wire), so the
 * wire's wide click band never covers a part or a post. The element still has its own handlers for keyboard focus and for
 * a plain click from assistive technology, which is sent to the element itself.
 */
function WireView({ id, label, geometry, selected, tabStop, hovered, flagged, pulseKey, describedBy, onFocusWire, onRemove }: WireViewProps) {
  const select = useBenchStore((state) => state.selectWire);
  const reduced = useMotionReduced();

  const onPointerDown = (event: PointerEvent<SVGGElement>) => {
    if (event.button !== 0) return;
    // Not a press on empty space, so the mat must not deselect it.
    event.stopPropagation();
    // Focus follows the press, so Delete goes to this wire and the focus ring shows where the learner is.
    event.currentTarget.focus?.();
    select(id);
  };

  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      // Handled here, so the mat's own Delete handler (which acts on the selection) sees it as taken.
      event.preventDefault();
      onRemove(id);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select(id);
    } else if (event.key === 'Escape') {
      select(undefined);
    } else if (moveWireFocus(event.currentTarget, event.key)) {
      event.preventDefault();
    }
  };

  return (
    <g
      role="button"
      tabIndex={tabStop ? 0 : -1}
      aria-label={label}
      aria-pressed={selected}
      aria-describedby={flagged ? describedBy : undefined}
      data-wire-id={id}
      data-selected={selected}
      data-flagged={flagged}
      className="group outline-none"
      onPointerDown={onPointerDown}
      // A plain click with no pointer events (assistive technology) selects too.
      onClick={() => select(id)}
      onKeyDown={onKeyDown}
      onFocus={() => onFocusWire(id)}
    >
      {/* Error: a wide dashed outline under everything else, so the wire's own look stays on top of it. */}
      {flagged && (
        <path
          key={pulseKey}
          d={geometry.d}
          strokeWidth={outlineWidth + 12}
          strokeDasharray="16 8"
          aria-hidden="true"
          data-wire-error-outline=""
          className={cn('pointer-events-none fill-none stroke-error opacity-60', !reduced && 'animate-error-pulse')}
        />
      )}
      {/* Focus: a teal halo outside the ink outline. */}
      <path
        d={geometry.d}
        strokeWidth={outlineWidth + 8}
        strokeLinecap="round"
        aria-hidden="true"
        className="pointer-events-none fill-none stroke-teal-deep opacity-0 group-focus-visible:opacity-100"
      />
      <path d={geometry.d} strokeWidth={outlineWidth} strokeLinecap="round" className="pointer-events-none fill-none stroke-ink" />
      <path
        d={geometry.d}
        strokeWidth={fillWidth}
        strokeLinecap="round"
        className={cn(
          'pointer-events-none fill-none',
          flagged ? 'stroke-error' : selected || hovered ? 'stroke-orange' : 'stroke-teal',
        )}
      />
      {selected && (
        <path
          d={geometry.d}
          strokeWidth={2}
          strokeDasharray="6 6"
          strokeLinecap="round"
          aria-hidden="true"
          className="pointer-events-none fill-none stroke-ink"
        />
      )}
    </g>
  );
}

/** The little trash button on the selected wire. It is a sibling of the wire so a button is never nested in a button. */
function WireTrash({ at, onRemove, id, scale }: { at: { x: number; y: number }; id: string; scale: number; onRemove: (id: string) => void }) {
  // 44 screen px across at any bench scale; the icon is half its width, as before.
  const radius = trashRadius(scale);
  return (
    <g
      transform={`translate(${at.x} ${at.y})`}
      role="button"
      tabIndex={0}
      aria-label={t('bench.deleteSelected')}
      data-wire-trash={id}
      className="group cursor-pointer outline-none"
      // Without this the mat would deselect the wire, and the trash button with it, before the click lands.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => onRemove(id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onRemove(id);
        }
      }}
    >
      <circle r={radius} strokeWidth={3} className="fill-cream stroke-ink group-hover:fill-error-tint" />
      <circle
        r={radius + 5}
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
        aria-hidden="true"
        className="pointer-events-none fill-none stroke-teal-deep opacity-0 group-focus-visible:opacity-100"
      />
      <Trash2 x={-radius / 2} y={-radius / 2} size={radius} strokeWidth={2} aria-hidden="true" focusable="false" className="pointer-events-none stroke-ink" />
    </g>
  );
}

/**
 * Every wire, drawn from where its two terminals are now, so a moved, nudged, undone or
 * reloaded part always has its wires attached. Positions are never stored on the wire.
 */
export function WireLayer({
  scale,
  hoveredId,
  onRemove,
  flagged,
}: {
  scale: number;
  /** The wire the pointer is on, if any. */
  hoveredId: string | undefined;
  onRemove: (id: string) => void;
  flagged: Flagged | undefined;
}) {
  const circuit = useBenchStore((state) => state.circuit);
  const selectedWireId = useBenchStore((state) => state.selectedWireId);
  const [lastFocused, setLastFocused] = useState<string | undefined>(undefined);

  const drawn = circuit.wires.flatMap((wire) => {
    const geometry = wirePath(circuit, wire);
    const label = wireName(circuit, wire);
    return geometry === undefined || label === undefined ? [] : [{ wire, geometry, label }];
  });
  const selected = drawn.find((entry) => entry.wire.id === selectedWireId);
  // The one wire Tab lands on: the one last focused, else the selected one, else the first.
  const stopId = [lastFocused, selectedWireId].find((id) => drawn.some((entry) => entry.wire.id === id)) ?? drawn[0]?.wire.id;

  return (
    <g data-testid="wire-layer">
      {drawn.map(({ wire, geometry, label }) => (
        <WireView
          key={wire.id}
          id={wire.id}
          label={label}
          geometry={geometry}
          selected={wire.id === selectedWireId}
          tabStop={wire.id === stopId}
          hovered={wire.id === hoveredId}
          flagged={flagged?.wireIds.has(wire.id) === true}
          pulseKey={flagged?.pulseKey ?? 0}
          describedBy={flagged?.descriptionId}
          onFocusWire={setLastFocused}
          onRemove={onRemove}
        />
      ))}
      {/* Above every wire, below the trash button, the part text and the terminals. */}
      <FlowDotsLayer />
      {selected !== undefined && <WireTrash id={selected.wire.id} at={selected.geometry.mid} scale={scale} onRemove={onRemove} />}
    </g>
  );
}
