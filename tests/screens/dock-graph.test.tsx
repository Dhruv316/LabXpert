import { disposeTestDbs, makeTestDb } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { graphGeometry, pixelOf } from '../../src/bench/graph-layout';
import { graphAxes } from '../../src/bench/readings';
import { t } from '../../src/i18n';
import type { Reading } from '../../src/model/types';
import { flushBenchWrites } from '../../src/state';
import { ohmsLaw, seriesParallel } from '../bench/helpers';
import { resetAll, openBench, putReadings, readingOf, pointEls, bestFit, THREE, mockGraphBox } from './dock-helpers';

beforeEach(resetAll);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await flushBenchWrites();
  await disposeTestDbs();
  resetAll();
});

describe('the V–I graph', () => {
  it('has an accessible name and draws one point per reading', async () => {
    const db = await makeTestDb();
    await openBench(db);
    putReadings(THREE);
    const graph = await screen.findByRole('img', { name: t('bench.graphTitle') });
    expect(graph.tagName.toLowerCase()).toBe('svg');
    expect(pointEls()).toHaveLength(3);
    expect(screen.queryByText(t('bench.graphEmpty'))).toBeNull();
  });

  it('draws the points as ink-outlined circles and the line dashed in another colour', async () => {
    const db = await makeTestDb();
    await openBench(db);
    putReadings(THREE);
    await waitFor(() => expect(bestFit()).not.toBeNull());
    const point = pointEls()[0];
    expect(point?.tagName.toLowerCase()).toBe('circle');
    expect(point?.getAttribute('class')).toContain('stroke-ink');
    expect(bestFit()?.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(bestFit()?.getAttribute('class')).not.toContain('stroke-ink');
    expect(bestFit()?.getAttribute('class')).not.toBe(point?.getAttribute('class'));
  });

  it('shows the best-fit line only with 2 or more points, and only for Ohm’s Law', async () => {
    const db = await makeTestDb();
    await openBench(db);
    putReadings([THREE[0] as Reading]);
    await waitFor(() => expect(pointEls()).toHaveLength(1));
    expect(bestFit()).toBeNull();
    putReadings(THREE.slice(0, 2));
    await waitFor(() => expect(bestFit()).not.toBeNull());
    cleanup();
    resetAll();
    await openBench(db, 'series-parallel');
    putReadings([readingOf('s1', 'series', 1, 0.5), readingOf('s2', 'series', 2, 1), readingOf('s3', 'series', 3, 1.5)]);
    await waitFor(() => expect(pointEls()).toHaveLength(3));
    expect(bestFit()).toBeNull();
  });

  it('draws the best-fit line through the origin with the hand-checked slope of 10', async () => {
    const size = { width: 400, height: 200 };
    mockGraphBox(size);
    const db = await makeTestDb();
    await openBench(db);
    putReadings(THREE);
    await waitFor(() => expect(bestFit()).not.toBeNull());
    const axes = graphAxes(ohmsLaw);
    const g = graphGeometry(size, axes);
    if (g === undefined) throw new Error('no geometry');
    const line = bestFit();
    const num = (name: string) => Number(line?.getAttribute(name));
    const origin = pixelOf({ current: 0, voltage: 0 }, axes, g);
    // Slope 10 V/A on a 15 V axis meets the top edge at 1.5 A: halfway along the 3 A axis.
    const top = pixelOf({ current: 1.5, voltage: 15 }, axes, g);
    expect(num('x1')).toBeCloseTo(origin.x, 6);
    expect(num('y1')).toBeCloseTo(origin.y, 6);
    expect(num('x2')).toBeCloseTo(top.x, 6);
    expect(num('y2')).toBeCloseTo(top.y, 6);
    // Each point sits where its reading says, on that line.
    const second = pointEls()[1];
    const expected = pixelOf({ current: 0.4, voltage: 4 }, axes, g);
    expect(Number(second?.getAttribute('cx'))).toBeCloseTo(expected.x, 6);
    expect(Number(second?.getAttribute('cy'))).toBeCloseTo(expected.y, 6);
  });

  it('titles the axes and runs the ticks to the experiment’s meter ranges', async () => {
    const db = await makeTestDb();
    await openBench(db);
    putReadings(THREE);
    await waitFor(() => expect(pointEls()).toHaveLength(3));
    expect(document.querySelector('[data-x-title]')?.textContent).toBe(t('bench.graphX'));
    expect(document.querySelector('[data-y-title]')?.textContent).toBe(t('bench.graphY'));
    const xs = Array.from(document.querySelectorAll('[data-x-tick] text')).map((el) => el.textContent);
    const ys = Array.from(document.querySelectorAll('[data-y-tick] text')).map((el) => el.textContent);
    expect(xs[0]).toBe('0');
    expect(xs[xs.length - 1]).toBe(String(ohmsLaw.meterRanges.ammeter));
    expect(ys[ys.length - 1]).toBe(String(ohmsLaw.meterRanges.voltmeter));

    cleanup();
    resetAll();
    await openBench(db, 'series-parallel');
    putReadings([readingOf('s1', 'series', 1, 0.5)]);
    await waitFor(() => expect(pointEls()).toHaveLength(1));
    const spXs = Array.from(document.querySelectorAll('[data-x-tick] text')).map((el) => el.textContent);
    expect(spXs[spXs.length - 1]).toBe(String(seriesParallel.meterRanges.ammeter));
  });

  it('draws at the size of its box, redraws when the box changes, and keeps every label at 14 px or more', async () => {
    mockGraphBox({ width: 500, height: 260 });
    const db = await makeTestDb();
    await openBench(db);
    putReadings(THREE);
    const graph = await screen.findByRole('img', { name: t('bench.graphTitle') });
    expect(graph.getAttribute('width')).toBe('500');
    expect(graph.getAttribute('height')).toBe('260');

    mockGraphBox({ width: 330, height: 200 });
    fireEvent(window, new Event('resize'));
    await waitFor(() => expect(graph.getAttribute('width')).toBe('330'));
    expect(graph.getAttribute('height')).toBe('200');

    const sizes = Array.from(graph.querySelectorAll('text')).map((el) => Number(el.getAttribute('font-size')));
    expect(sizes.length).toBeGreaterThan(4);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(14);
  });

  it('never moves: no animation class on the points or the line', async () => {
    const db = await makeTestDb();
    await openBench(db);
    putReadings(THREE);
    await waitFor(() => expect(bestFit()).not.toBeNull());
    const drawn = [...Array.from(pointEls()), bestFit()];
    for (const el of drawn) expect(el?.getAttribute('class') ?? '').not.toMatch(/animate|transition/);
    expect(document.querySelector('[data-graph-plot] animate, [data-graph-plot] animateTransform')).toBeNull();
  });
});

