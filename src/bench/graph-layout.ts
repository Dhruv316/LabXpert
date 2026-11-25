// Pixel layout of the V-I graph. The SVG is drawn at the size of its container (1 unit = 1 screen px),
// so a 14 px label is 14 px on screen at every window size. Pure: no React, no DOM.
import { toGraphXY, type GraphAxes, type GraphPoint, type PlotPoint, type PlotSize } from './readings';

/** Tick labels and axis titles (DESIGN.md §3: never below 14 px). */
export const GRAPH_FONT_PX = 14;

/** Used until the container has been measured (and in a test DOM, which has no layout). */
export const GRAPH_FALLBACK_SIZE: PlotSize = { width: 360, height: 190 };

const LINE_PX = 18;
const TICK_LEN = 5;
const GAP = 4;
// Room above the plot for the top tick label's half height and a point sitting on the top edge.
const PAD_TOP = 10;
// Room right of the plot for the last x label's half width and a point sitting on the right edge.
const PAD_RIGHT = 16;
// A generous width for one 14 px character, so a label never runs into the axis title.
const CHAR_PX = 9;

export interface PlotBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface XTick {
  value: number;
  label: string;
  x: number;
}

export interface YTick {
  value: number;
  label: string;
  y: number;
}

export interface GraphGeometry {
  width: number;
  height: number;
  plot: PlotBox;
  xTicks: XTick[];
  yTicks: YTick[];
  /** Tick label baselines (centre line of the text). */
  xLabelY: number;
  yLabelX: number;
  /** Centre of each axis title. The Y title is rotated a quarter turn about this point. */
  xTitle: PlotPoint;
  yTitle: PlotPoint;
}

/** Whole numbers stay whole; otherwise at most 2 decimals, no trailing zeros ("0.5", "1", "2.5"). */
export function formatTick(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** The container's measured size, or the fallback while it has none (not measured yet, or no layout). */
export function usableSize(measured: PlotSize | undefined): PlotSize {
  if (measured === undefined || measured.width <= 0 || measured.height <= 0) return GRAPH_FALLBACK_SIZE;
  return measured;
}

/** Undefined when the container is too small to leave any plot area after the margins. */
export function graphGeometry(size: PlotSize, axes: GraphAxes): GraphGeometry | undefined {
  const yLabels = axes.yTicks.map(formatTick);
  const widestY = Math.max(...yLabels.map((label) => label.length)) * CHAR_PX;
  const left = LINE_PX + GAP + widestY + GAP + TICK_LEN;
  const bottom = TICK_LEN + GAP + LINE_PX + GAP + LINE_PX;
  const plot: PlotBox = { left, top: PAD_TOP, width: size.width - left - PAD_RIGHT, height: size.height - PAD_TOP - bottom };
  if (plot.width <= 0 || plot.height <= 0) return undefined;

  const plotBottom = plot.top + plot.height;
  return {
    width: size.width,
    height: size.height,
    plot,
    xTicks: axes.xTicks.map((value) => ({ value, label: formatTick(value), x: plot.left + (value / axes.xMax) * plot.width })),
    yTicks: axes.yTicks.map((value) => ({ value, label: formatTick(value), y: plot.top + plot.height - (value / axes.yMax) * plot.height })),
    xLabelY: plotBottom + TICK_LEN + GAP + LINE_PX / 2,
    yLabelX: plot.left - TICK_LEN - GAP,
    xTitle: { x: plot.left + plot.width / 2, y: size.height - LINE_PX / 2 },
    yTitle: { x: LINE_PX / 2, y: plot.top + plot.height / 2 },
  };
}

/** A reading's place on the drawing, in screen px. */
export function pixelOf(point: GraphPoint, axes: GraphAxes, geometry: GraphGeometry): PlotPoint {
  const local = toGraphXY(point, axes, { width: geometry.plot.width, height: geometry.plot.height });
  return { x: geometry.plot.left + local.x, y: geometry.plot.top + local.y };
}
