import { useMemo, useRef } from 'react';
import { GRAPH_FONT_PX, graphGeometry, pixelOf, usableSize } from '../../bench/graph-layout';
import { bestFitLineEnds, bestFitSlope, graphAxes, showsBestFitLine, type GraphPoint } from '../../bench/readings';
import { t } from '../../i18n';
import type { ExperimentConfig } from '../../model/types';
import { useElementSize } from './use-element-size';

const POINT_RADIUS = 5;
const AXIS_WIDTH = 2;
const FIT_WIDTH = 3;
const FIT_DASH = '8 6';
const TICK_LEN = 5;
const TEXT = 'fill-ink font-body font-semibold';

export interface VIGraphProps {
  experiment: ExperimentConfig;
  /** The current task's readings as points (current on X, voltage on Y). */
  points: GraphPoint[];
}

/**
 * The V–I graph in plain SVG, drawn at the container's real pixel size so every label is 14 px on screen.
 * Points are ink-outlined circles; the best-fit line (Ohm's Law, 2 or more points) is dashed and another
 * token colour, so neither relies on colour alone. Nothing moves.
 */
export function VIGraph({ experiment, points }: VIGraphProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measured = useElementSize(boxRef);
  const axes = useMemo(() => graphAxes(experiment), [experiment]);
  const geometry = graphGeometry(usableSize(measured), axes);

  const slope = showsBestFitLine(experiment.id) ? bestFitSlope(points) : undefined;
  const ends = slope === undefined ? undefined : bestFitLineEnds(slope, axes);

  return (
    <div data-graph ref={boxRef} className="relative min-h-0 min-w-0 overflow-hidden">
      {points.length === 0 && (
        <p
          data-graph-empty
          className="absolute inset-0 flex items-center justify-center rounded-card border-2 border-dashed border-wood px-4 text-center font-body text-base text-ink"
        >
          {t('bench.graphEmpty')}
        </p>
      )}
      {points.length > 0 && geometry !== undefined && (
        <svg
          role="img"
          aria-label={t('bench.graphTitle')}
          data-graph-plot
          width={geometry.width}
          height={geometry.height}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          className="absolute left-0 top-0 block"
        >
          {geometry.xTicks.map((tick) => (
            <line key={`gx-${tick.value}`} x1={tick.x} x2={tick.x} y1={geometry.plot.top} y2={geometry.plot.top + geometry.plot.height} strokeWidth={1} className="stroke-wood-light" />
          ))}
          {geometry.yTicks.map((tick) => (
            <line key={`gy-${tick.value}`} x1={geometry.plot.left} x2={geometry.plot.left + geometry.plot.width} y1={tick.y} y2={tick.y} strokeWidth={1} className="stroke-wood-light" />
          ))}

          <path
            d={`M ${geometry.plot.left} ${geometry.plot.top} V ${geometry.plot.top + geometry.plot.height} H ${geometry.plot.left + geometry.plot.width}`}
            strokeWidth={AXIS_WIDTH}
            className="fill-none stroke-ink"
          />
          {geometry.xTicks.map((tick) => (
            <g key={`tx-${tick.value}`} data-x-tick>
              <line x1={tick.x} x2={tick.x} y1={geometry.plot.top + geometry.plot.height} y2={geometry.plot.top + geometry.plot.height + TICK_LEN} strokeWidth={AXIS_WIDTH} className="stroke-ink" />
              <text x={tick.x} y={geometry.xLabelY} fontSize={GRAPH_FONT_PX} textAnchor="middle" dominantBaseline="central" className={TEXT}>
                {tick.label}
              </text>
            </g>
          ))}
          {geometry.yTicks.map((tick) => (
            <g key={`ty-${tick.value}`} data-y-tick>
              <line x1={geometry.plot.left - TICK_LEN} x2={geometry.plot.left} y1={tick.y} y2={tick.y} strokeWidth={AXIS_WIDTH} className="stroke-ink" />
              <text x={geometry.yLabelX} y={tick.y} fontSize={GRAPH_FONT_PX} textAnchor="end" dominantBaseline="central" className={TEXT}>
                {tick.label}
              </text>
            </g>
          ))}
          <text data-x-title x={geometry.xTitle.x} y={geometry.xTitle.y} fontSize={GRAPH_FONT_PX} textAnchor="middle" dominantBaseline="central" className={TEXT}>
            {t('bench.graphX')}
          </text>
          <text
            data-y-title
            x={geometry.yTitle.x}
            y={geometry.yTitle.y}
            transform={`rotate(-90 ${geometry.yTitle.x} ${geometry.yTitle.y})`}
            fontSize={GRAPH_FONT_PX}
            textAnchor="middle"
            dominantBaseline="central"
            className={TEXT}
          >
            {t('bench.graphY')}
          </text>

          {ends !== undefined && (
            <line
              data-best-fit
              x1={pixelOf(ends[0], axes, geometry).x}
              y1={pixelOf(ends[0], axes, geometry).y}
              x2={pixelOf(ends[1], axes, geometry).x}
              y2={pixelOf(ends[1], axes, geometry).y}
              strokeWidth={FIT_WIDTH}
              strokeDasharray={FIT_DASH}
              className="stroke-orange-deep"
            />
          )}
          {points.map((point, index) => {
            const { x, y } = pixelOf(point, axes, geometry);
            // Readings have no id here, and two can be equal, so the position in the list is the key.
            return <circle key={index} data-graph-point cx={x} cy={y} r={POINT_RADIUS} strokeWidth={2} className="fill-teal stroke-ink" />;
          })}
        </svg>
      )}
    </div>
  );
}
