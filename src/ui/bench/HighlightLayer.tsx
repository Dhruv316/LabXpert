import { CircleAlert } from 'lucide-react';
import { BADGE_RADIUS, OUTLINE_PAD, partMarks } from '../../bench/highlight';
import { cn, useMotionReduced } from '../../components/ui';
import { useBenchStore } from '../../state';
import type { Flagged } from './use-flagged';

/**
 * The error highlight on parts (DESIGN.md §6): a 4 px dashed `error` outline and a round badge with a "!" at
 * the top-right corner, so it never rests on colour alone. It is drawn from the circuit's own part positions,
 * so it follows a part. It lies over the wires and under the terminals, lets every press through, and is
 * hidden from assistive technology: the part itself carries the description (see `useFlagged`).
 */
export function HighlightLayer({ flagged }: { flagged: Flagged | undefined }) {
  const circuit = useBenchStore((state) => state.circuit);
  const reduced = useMotionReduced();
  if (flagged === undefined) return null;
  const marks = partMarks(circuit, flagged.componentIds);
  if (marks.length === 0) return null;

  return (
    <g data-testid="highlight-layer" aria-hidden="true" pointerEvents="none">
      {marks.map((mark) => (
        // The key carries the pulse number: a newly chosen error starts one pulse; the same one stays steady.
        <g key={`${flagged.pulseKey}:${mark.id}`} data-part-highlight={mark.id} transform={`translate(${mark.x} ${mark.y})`}>
          <rect
            data-highlight-outline=""
            x={-OUTLINE_PAD}
            y={-OUTLINE_PAD}
            width={mark.width + OUTLINE_PAD * 2}
            height={mark.height + OUTLINE_PAD * 2}
            rx={18}
            strokeWidth={4}
            strokeDasharray="12 8"
            vectorEffect="non-scaling-stroke"
            className={cn('fill-none stroke-error', !reduced && 'animate-error-pulse')}
          />
          <g data-highlight-badge="" transform={`translate(${mark.width + OUTLINE_PAD} ${-OUTLINE_PAD})`}>
            <circle r={BADGE_RADIUS} strokeWidth={2} className="fill-error stroke-mat" />
            <CircleAlert
              x={-9}
              y={-9}
              size={18}
              strokeWidth={2.5}
              aria-hidden="true"
              focusable="false"
              className="stroke-white"
            />
          </g>
        </g>
      ))}
    </g>
  );
}
