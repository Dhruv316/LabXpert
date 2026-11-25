import { flowDotsFor, type FlowDirection, FLOW_DOT_RING, FLOW_DOT_SIZE, FLOW_DOT_SPACING, FLOW_DOTS_LOOP_SECONDS } from '../../bench/flow-dots';
import { wirePath } from '../../bench/wires';
import { useMotionReduced } from '../../components/ui';
import { selectWireFlow, useBenchStore } from '../../state';

// A dash of length 0 with round caps is a round dot; the gap is the spacing between dots.
const DOT_PATTERN = `0 ${FLOW_DOT_SPACING}`;
const LOOP = `${FLOW_DOTS_LOOP_SECONDS}s`;

/**
 * The moving dots on every wire that carries current (DESIGN §7). Each wire gets one dotted overlay path whose
 * dash offset is animated by the browser (SMIL), so React renders it once and nothing re-renders per frame.
 * The offset moves one spacing per loop, so the pattern repeats exactly and the loop has no jump.
 *
 * Decoration only: hidden from assistive technology, and it lets every press through so wires stay selectable
 * and the terminals underneath stay usable. Under reduced motion nothing is drawn at all (DESIGN §10).
 */
export function FlowDotsLayer() {
  const circuit = useBenchStore((state) => state.circuit);
  const flow = useBenchStore(selectWireFlow);
  const reduced = useMotionReduced();
  if (reduced || flow === undefined) return null;

  const dots = flowDotsFor(circuit, flow).flatMap((entry) => {
    const wire = circuit.wires.find((candidate) => candidate.id === entry.wireId);
    const geometry = wire === undefined ? undefined : wirePath(circuit, wire);
    return geometry === undefined ? [] : [{ ...entry, d: geometry.d }];
  });

  return (
    <g data-testid="flow-dots-layer" aria-hidden="true" pointerEvents="none">
      {dots.map(({ wireId, direction, d }) => (
        <g key={wireId} data-flow-dots={wireId} data-flow-direction={direction} className="fill-none">
          {/* Ink ring under the mat-coloured dot, so a dot reads against both the teal and the orange fill. */}
          <path d={d} strokeWidth={FLOW_DOT_SIZE + FLOW_DOT_RING * 2} strokeLinecap="round" strokeDasharray={DOT_PATTERN} className="stroke-ink">
            <FlowDotsMotion direction={direction} />
          </path>
          <path d={d} strokeWidth={FLOW_DOT_SIZE} strokeLinecap="round" strokeDasharray={DOT_PATTERN} className="stroke-mat">
            <FlowDotsMotion direction={direction} />
          </path>
        </g>
      ))}
    </g>
  );
}

/** A decreasing dash offset slides the pattern toward the end of the path (the wire's `to` end). */
function FlowDotsMotion({ direction }: { direction: FlowDirection }) {
  const forward = direction === 'forward';
  return (
    <animate
      attributeName="stroke-dashoffset"
      from={forward ? 0 : -FLOW_DOT_SPACING}
      to={forward ? -FLOW_DOT_SPACING : 0}
      dur={LOOP}
      repeatCount="indefinite"
    />
  );
}
