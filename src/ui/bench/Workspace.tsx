import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { BENCH, BENCH_VIEW } from '../../bench/catalog';
import { clientToBench } from '../../bench/coords';
import { partsInTabOrder } from '../../bench/order';
import { layoutOrDefault } from '../../bench/overlay';
import { Ollie } from '../../components/Ollie';
import { t } from '../../i18n';
import type { ExperimentConfig } from '../../model/types';
import { selectLive, useBenchStore } from '../../state';
import { BenchControls } from './BenchControls';
import { BenchPart } from './BenchPart';
import { DrawingWire } from './DrawingWire';
import { HighlightLayer } from './HighlightLayer';
import { OverloadBanner } from './OverloadBanner';
import { PartLabelLayer } from './PartLabelLayer';
import { TerminalLayer } from './TerminalLayer';
import { WireLayer } from './WireLayer';
import { lookOf } from './part-art';
import type { FocusRequest } from './use-placement';
import { useBenchActions } from './use-bench-actions';
import { useElementSize } from './use-element-size';
import { useFlagged } from './use-flagged';
import { useWiring } from './use-wiring';

export interface WorkspaceProps {
  experiment: ExperimentConfig;
  /** Held by the screen so the shelf can turn a drop position into mat coordinates. */
  svgRef: RefObject<SVGSVGElement>;
  focusRequest: FocusRequest | undefined;
  /** Accessible name of the bench: the experiment's title. */
  label: string;
}

/**
 * The 1100 × 620 bench (DESIGN.md §5): a cream mat in a wood frame with a dot grid, lying on a
 * wood table strip, scaled with viewBox so it never distorts. Parts are placed in mat coordinates.
 */
export function Workspace({ experiment, svgRef, focusRequest, label }: WorkspaceProps) {
  const circuit = useBenchStore((state) => state.circuit);
  const selectedId = useBenchStore((state) => state.selectedId);
  const gesture = useBenchStore((state) => state.gesture);
  const select = useBenchStore((state) => state.select);
  const overload = useBenchStore((state) => selectLive(state)?.overload === true);
  // The layer for part text and meter digits is made by this component; each part draws into it once it exists.
  const [labelHost, setLabelHost] = useState<SVGGElement | null>(null);
  const actions = useBenchActions();
  const flagged = useFlagged();
  const surfaceRef = useRef<HTMLDivElement>(null);
  // Screen px per design unit, the same fit the SVG uses: the press targets are widened from it (bench/targets.ts).
  const scale = layoutOrDefault(useElementSize(surfaceRef)).layout.scale;

  // After Enter on a shelf tile the new part takes focus, so arrow keys can move it straight away.
  useEffect(() => {
    if (focusRequest === undefined) return;
    const svg = svgRef.current;
    if (svg === null) return;
    Array.from(svg.querySelectorAll<SVGGElement>('[data-part-id]'))
      .find((node) => node.getAttribute('data-part-id') === focusRequest.id)
      ?.focus();
  }, [focusRequest, svgRef]);

  const toBench = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    return svg === null ? undefined : clientToBench(svg.getBoundingClientRect(), clientX, clientY);
  };

  const wiring = useWiring(toBench);

  const removeAndRefocus = (id: string) => {
    // Focus leaves the part before it disappears, so keyboard users are not dropped at the page top.
    surfaceRef.current?.focus();
    actions.remove(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      select(undefined);
      return;
    }
    // Delete on anything that did not handle it itself (a wire or a part does) removes the selected wire.
    if ((event.key === 'Delete' || event.key === 'Backspace') && !event.defaultPrevented) {
      const wireId = useBenchStore.getState().selectedWireId;
      if (wireId === undefined) return;
      event.preventDefault();
      actions.removeWire(wireId);
    }
  };

  const { width, height, tableStrip, frame, dotSpacing, dotOpacity } = BENCH_VIEW;
  const inset = frame / 2;

  return (
    <div ref={surfaceRef} tabIndex={-1} onKeyDown={onKeyDown} className="relative min-h-0 flex-1 outline-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={label}
        className="absolute inset-0 h-full w-full touch-none select-none"
        onPointerDownCapture={wiring.onPointerDownCapture}
        onPointerDown={() => select(undefined)}
        onPointerMove={wiring.onPointerMove}
        onPointerUp={wiring.onPointerUp}
        onPointerCancel={wiring.onPointerCancel}
      >
        <defs>
          <pattern id="bench-dots" width={dotSpacing} height={dotSpacing} patternUnits="userSpaceOnUse">
            <circle cx={dotSpacing / 2} cy={dotSpacing / 2} r={1.5} className="fill-wood-dark" fillOpacity={dotOpacity} />
          </pattern>
          {/* shadow.component (0 6px 6px, 25%); the lifted one is for a part being dragged. */}
          <filter id="bench-shadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx={0} dy={6} stdDeviation={3} floodOpacity={0.25} className="[flood-color:theme(colors.ink.DEFAULT)]" />
          </filter>
          <filter id="bench-shadow-lift" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx={0} dy={12} stdDeviation={6} floodOpacity={0.35} className="[flood-color:theme(colors.ink.DEFAULT)]" />
          </filter>
        </defs>

        {/* Table: starts behind the mat so only a strip shows under it. */}
        <rect x={0} y={BENCH.height - 24} width={width} height={tableStrip + 24} rx={12} className="fill-wood" />
        <g aria-hidden="true" className="stroke-wood-dark" strokeWidth={2} strokeLinecap="round" opacity={0.35}>
          <path d={`M24 ${BENCH.height + 8}H${width * 0.42}`} />
          <path d={`M${width * 0.3} ${BENCH.height + 16}H${width * 0.78}`} />
          <path d={`M${width * 0.55} ${BENCH.height + 23}H${width - 28}`} />
        </g>

        {/* Mat: the frame is drawn inside the 1100 × 620 box so parts clamp to the mat itself. */}
        <rect
          x={inset}
          y={inset}
          width={BENCH.width - frame}
          height={BENCH.height - frame}
          rx={24}
          strokeWidth={frame}
          className="fill-mat stroke-wood"
        />
        <rect
          x={frame}
          y={frame}
          width={BENCH.width - frame * 2}
          height={BENCH.height - frame * 2}
          rx={20}
          fill="url(#bench-dots)"
        />

        {/* Tab visits parts in this order, so the switch comes after the other parts (DESIGN.md §11). */}
        {partsInTabOrder(circuit.components).map((part) => (
          <BenchPart
            key={part.id}
            part={part}
            look={lookOf(part, experiment.supply, overload)}
            selected={part.id === selectedId}
            dragging={gesture?.kind === 'drag' && gesture.id === part.id && gesture.pushed}
            toBench={toBench}
            labelHost={labelHost}
            onRemove={removeAndRefocus}
            flagged={flagged?.componentIds.has(part.id) === true}
            flagDescriptionId={flagged?.descriptionId}
          />
        ))}

        {/* Wires lie over the parts and under the terminals, so a post can always be reached. */}
        <WireLayer scale={scale} onRemove={actions.removeWire} flagged={flagged} />
        <DrawingWire />
        {/* The text left on a part's picture lies over the wires so a wire never covers it. They let every press through,
            so wires stay selectable and the parts underneath stay draggable. Terminals are still drawn after. */}
        <g ref={setLabelHost} data-testid="part-label-layer" pointerEvents="none" />
        {/* The tutor's error outlines and badges: over the wires and the part text, under the terminals; they let every press through. */}
        <HighlightLayer flagged={flagged} />
        <TerminalLayer scale={scale} onPress={wiring.pressTerminal} onActivate={wiring.activateTerminal} onFocusTerminal={wiring.previewTerminal} />
      </svg>

      {/* Values and names as real text, at least 14 px however far the bench is scaled down; under the controls. */}
      <PartLabelLayer />

      {/* Buttons over the bench, placed from each part's position; they let the pointer through everywhere else. */}
      <BenchControls experiment={experiment} />

      <OverloadBanner />

      {/* The reason a part or wire is flagged, said once; each flagged part and wire points to it (not a tab stop). */}
      {flagged !== undefined && (
        <span id={flagged.descriptionId} data-testid="flag-description" className="sr-only">
          {flagged.title}
        </span>
      )}

      {/* Real HTML on top of the SVG, so the text stays 16 px however far the bench is scaled down. */}
      {circuit.components.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-[26rem] rounded-panel border-2 border-dashed border-wood-dark px-6 py-4 text-center">
            <p className="font-body text-base font-semibold text-ink">{t('bench.benchHint')}</p>
          </div>
          <Ollie mood="happy" size={80} decorative className="absolute bottom-3 right-5" />
        </div>
      )}
    </div>
  );
}
