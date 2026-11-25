import { terminalPosition, wireGeometry } from '../../bench/wires';
import { cn } from '../../components/ui';
import tokens from '../../spec/design-tokens.json';
import { useBenchStore } from '../../state';

const { outlineWidth, fillWidth } = tokens.wire;

/**
 * The wire being drawn: it runs from the start terminal to the pointer, or to the terminal it
 * would snap to (DESIGN §7). Drawn like a finished wire so there is no jump when it connects.
 */
export function DrawingWire() {
  const circuit = useBenchStore((state) => state.circuit);
  const drawing = useBenchStore((state) => state.drawing);
  const lit = useBenchStore((state) => state.highlightedTerminal);
  if (drawing === undefined) return null;

  const start = terminalPosition(circuit, drawing.from);
  if (start === undefined) return null;
  const snapped = lit !== undefined && lit !== drawing.from ? terminalPosition(circuit, lit) : undefined;
  const { d } = wireGeometry(start, snapped ?? drawing.pointer);

  return (
    <g data-testid="drawing-wire" data-snapped={snapped !== undefined} aria-hidden="true" className="pointer-events-none">
      <path d={d} strokeWidth={outlineWidth} strokeLinecap="round" className="fill-none stroke-ink" />
      {/* The short settle onto a terminal; it is only on while snapped, so following the pointer is never laggy. */}
      <path
        d={d}
        strokeWidth={fillWidth}
        strokeLinecap="round"
        className={cn('fill-none stroke-teal', snapped !== undefined && 'duration-fast [transition-property:d]')}
      />
    </g>
  );
}
