import { describe, expect, it } from 'vitest';
import {
  GRAPH_FALLBACK_SIZE,
  GRAPH_FONT_PX,
  formatTick,
  graphGeometry,
  pixelOf,
  usableSize,
} from '../../src/bench/graph-layout';
import { bestFitLineEnds, bestFitSlope, graphAxes } from '../../src/bench/readings';
import { ohmsLaw, seriesParallel } from './helpers';

const OHMS_AXES = graphAxes(ohmsLaw);
const SIZE = { width: 360, height: 190 };

function geometry(size = SIZE, axes = OHMS_AXES) {
  const found = graphGeometry(size, axes);
  if (found === undefined) throw new Error('no geometry');
  return found;
}

describe('formatTick', () => {
  it('keeps whole numbers whole and trims decimals', () => {
    expect(formatTick(0)).toBe('0');
    expect(formatTick(5)).toBe('5');
    expect(formatTick(0.5)).toBe('0.5');
    expect(formatTick(2.5)).toBe('2.5');
  });
});

describe('usableSize', () => {
  it('uses the measured size when there is one', () => {
    expect(usableSize({ width: 420, height: 200 })).toEqual({ width: 420, height: 200 });
  });

  it('falls back when nothing was measured or the size is 0', () => {
    expect(usableSize(undefined)).toEqual(GRAPH_FALLBACK_SIZE);
    expect(usableSize({ width: 0, height: 0 })).toEqual(GRAPH_FALLBACK_SIZE);
  });
});

describe('graphGeometry', () => {
  it('draws at the size given, with the plot inside it', () => {
    const g = geometry();
    expect(g.width).toBe(SIZE.width);
    expect(g.height).toBe(SIZE.height);
    expect(g.plot.left).toBeGreaterThan(0);
    expect(g.plot.top).toBeGreaterThan(0);
    expect(g.plot.left + g.plot.width).toBeLessThan(SIZE.width);
    expect(g.plot.top + g.plot.height).toBeLessThan(SIZE.height);
  });

  it('puts the ticks of the experiment on the axes, 0 at the origin and the range at the far edge', () => {
    const g = geometry();
    expect(g.xTicks[0]).toMatchObject({ value: 0, label: '0', x: g.plot.left });
    expect(g.xTicks[g.xTicks.length - 1]).toMatchObject({ value: 3, label: '3', x: g.plot.left + g.plot.width });
    expect(g.yTicks[0]).toMatchObject({ value: 0, y: g.plot.top + g.plot.height });
    expect(g.yTicks[g.yTicks.length - 1]).toMatchObject({ value: 15, label: '15', y: g.plot.top });
  });

  it('follows the experiment: series and parallel run to 6 A', () => {
    const g = geometry(SIZE, graphAxes(seriesParallel));
    expect(g.xTicks[g.xTicks.length - 1]?.label).toBe('6');
  });

  it('keeps tick labels clear of the axis title and the window edge at a small and a large size', () => {
    for (const size of [{ width: 300, height: 180 }, { width: 640, height: 400 }]) {
      const g = geometry(size);
      // Y labels end left of the plot; the title column (18 px) is left of the widest label.
      expect(g.yLabelX).toBeLessThan(g.plot.left);
      expect(g.yLabelX - 2 * 9).toBeGreaterThan(g.yTitle.x + GRAPH_FONT_PX / 2);
      // X labels sit between the plot and the X title, inside the drawing.
      expect(g.xLabelY).toBeGreaterThan(g.plot.top + g.plot.height);
      expect(g.xLabelY + GRAPH_FONT_PX / 2).toBeLessThan(g.xTitle.y - GRAPH_FONT_PX / 2);
      expect(g.xTitle.y + GRAPH_FONT_PX / 2).toBeLessThanOrEqual(size.height);
    }
  });

  it('is undefined when the container leaves no plot area', () => {
    expect(graphGeometry({ width: 40, height: 30 }, OHMS_AXES)).toBeUndefined();
  });

  it('text is at least 14 px', () => {
    expect(GRAPH_FONT_PX).toBeGreaterThanOrEqual(14);
  });
});

describe('pixelOf', () => {
  it('puts the origin bottom left and the corner of the axes top right', () => {
    const g = geometry();
    expect(pixelOf({ current: 0, voltage: 0 }, OHMS_AXES, g)).toEqual({ x: g.plot.left, y: g.plot.top + g.plot.height });
    expect(pixelOf({ current: 3, voltage: 15 }, OHMS_AXES, g)).toEqual({ x: g.plot.left + g.plot.width, y: g.plot.top });
  });

  it('draws the hand-checked best-fit line from the origin to the top edge', () => {
    const points = [
      { current: 0.2, voltage: 2 },
      { current: 0.4, voltage: 4 },
      { current: 0.6, voltage: 6 },
    ];
    const slope = bestFitSlope(points);
    expect(slope).toBeCloseTo(10, 10);
    const ends = bestFitLineEnds(slope ?? 0, OHMS_AXES);
    // Slope 10 on a 15 V axis meets the top edge at 1.5 A (to rounding).
    expect(ends?.[0]).toEqual({ current: 0, voltage: 0 });
    expect(ends?.[1]?.current).toBeCloseTo(1.5, 8);
    expect(ends?.[1]?.voltage).toBe(15);
    const g = geometry();
    const end = pixelOf(ends?.[1] ?? { current: 0, voltage: 0 }, OHMS_AXES, g);
    expect(end.x).toBeCloseTo(g.plot.left + g.plot.width / 2, 8);
    expect(end.y).toBeCloseTo(g.plot.top, 8);
  });
});
