import { disposeTestDbs, makeTestDb } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { GRAPH_FONT_PX } from '../../src/bench/graph-layout';
import { DOCK_MIN_CONTROL_PX, DOCK_MIN_TEXT_PX, LAYOUT } from '../../src/bench/layout';
import { t } from '../../src/i18n';
import { flushBenchWrites } from '../../src/state';
import { openBench, recordButton, resetAll } from './dock-helpers';

const original = { width: window.innerWidth, height: window.innerHeight };

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

beforeEach(resetAll);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  setViewport(original.width, original.height);
  await flushBenchWrites();
  await disposeTestDbs();
  resetAll();
});

const dock = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>('[data-dock]');
  if (found === null) throw new Error('no dock');
  return found;
};
const panel = (): HTMLElement => screen.getByRole('complementary', { name: t('bench.panelTitle') });

/** The px values of the classes that start with `prefix` and end with `px]` (prefix `min-h-` or `!min-h-` matches `min-h-[44px]`). */
const pxOf = (element: Element, prefix: string): number[] =>
  element.className
    .split(/\s+/)
    .filter((token) => token.startsWith(`${prefix}[`))
    .map((token) => Number.parseInt(token.slice(prefix.length + 1), 10));

describe('the compact dock at 1024 × 640', () => {
  it('is 141 px high, not the 220 px dock, with its three columns able to shrink', async () => {
    setViewport(1024, 640);
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    expect(dock().getAttribute('data-dock-mode')).toBe('compact');
    expect(dock().style.height).toBe(`${LAYOUT.dockCompact}px`);
    expect(dock().className).not.toContain('h-[220px]');
    // Every column is minmax(0, …), so no column can push the dock wider than the window.
    const columns = /grid-cols-\[([^\]]+)\]/.exec(dock().className)?.[1] ?? '';
    expect(columns.split('_')).toHaveLength(3);
    for (const column of columns.split('_')) expect(column.startsWith('minmax(0,')).toBe(true);
  });

  it('keeps every button at least 44 px high', async () => {
    setViewport(1024, 640);
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    const buttons = Array.from(dock().querySelectorAll('button'));
    expect(buttons.map((button) => button.textContent)).toEqual([t('bench.record'), t('bench.check'), t('bench.nextTask')]);
    for (const button of buttons) {
      // The `!` class wins over the base 48 px class; a button with none keeps the base one.
      const forced = button.className.split(/\s+/).find((token) => token.startsWith('!min-h-['));
      const heights = forced === undefined ? pxOf(button, 'min-h-') : pxOf(button, '!min-h-');
      expect(heights.length).toBeGreaterThan(0);
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(DOCK_MIN_CONTROL_PX);
    }
  });

  it('keeps the number field 44 px high and its label on one line of at least 14 px', async () => {
    setViewport(1024, 640);
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    const cell = screen.getByLabelText(t('bench.equivalentLabel')).closest('div[class*="[&_input]"]');
    expect(cell).not.toBeNull();
    expect(cell?.className).toContain('[&_input]:h-11');
    expect(cell?.className).toContain('[&_label]:leading-5');
  });

  it('uses no text below 14 px', async () => {
    setViewport(1024, 640);
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    const allowed = new Set(['text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl']);
    for (const element of Array.from(dock().querySelectorAll('*'))) {
      const sizes = element.getAttribute('class')?.split(/\s+/).filter((token) => /^text-(xs|sm|base|lg|xl|2xl|3xl|\[\d+px\])$/.test(token)) ?? [];
      for (const size of sizes) {
        const arbitrary = /^text-\[(\d+)px\]$/.exec(size);
        if (arbitrary !== null) expect(Number(arbitrary[1])).toBeGreaterThanOrEqual(DOCK_MIN_TEXT_PX);
        else expect(allowed.has(size)).toBe(true);
      }
    }
    expect(GRAPH_FONT_PX).toBeGreaterThanOrEqual(DOCK_MIN_TEXT_PX);
  });

  it('keeps the Tab order of the full dock: Record, the field, Check, then Next task', async () => {
    setViewport(1024, 640);
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    const order = [recordButton(), screen.getByLabelText(t('bench.equivalentLabel')), screen.getByRole('button', { name: t('bench.check') }), screen.getByRole('button', { name: t('bench.nextTask') })];
    for (let i = 1; i < order.length; i += 1) {
      const before = order[i - 1];
      const after = order[i];
      expect(before !== undefined && after !== undefined && (before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    }
  });

  it('still has the table with its sticky header scrolling inside the dock, the graph and the answer slot', async () => {
    setViewport(1024, 640);
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    expect(screen.getByRole('table', { name: t('bench.readings') })).toBeTruthy();
    expect(document.querySelector('[data-readings-scroll]')?.className).toContain('overflow-y-auto');
    for (const cell of screen.getAllByRole('columnheader')) expect(cell.className).toContain('sticky');
    expect(document.querySelector('[data-graph]')).not.toBeNull();
    expect(document.querySelector('[data-dock-slot="answer"]')).not.toBeNull();
    expect(document.querySelector('[data-dock-footer]')).not.toBeNull();
  });

  it('puts Ohm’s Law’s Finish button beside the table and graph, with no answer box', async () => {
    setViewport(1024, 640);
    const db = await makeTestDb();
    await openBench(db);
    expect(dock().getAttribute('data-dock-mode')).toBe('compact');
    expect(screen.getByRole('button', { name: t('bench.finish') })).toBeTruthy();
    expect(screen.queryByLabelText(t('bench.equivalentLabel'))).toBeNull();
    expect(screen.getByRole('columnheader', { name: t('bench.colRatio') })).toBeTruthy();
  });
});

describe('the dock and panel at other sizes', () => {
  it('keeps the 220 px dock at 1366 × 768', async () => {
    setViewport(1366, 768);
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    expect(dock().getAttribute('data-dock-mode')).toBe('full');
    expect(dock().className).toContain('h-[220px]');
  });

  it('starts the panel collapsed at 1024 px and opens it 274 px wide', async () => {
    setViewport(1024, 640);
    const db = await makeTestDb();
    await openBench(db);
    expect(panel().getAttribute('data-collapsed')).toBe('true');
    expect(panel().className).toContain('w-14');
    fireEvent.click(screen.getByRole('button', { name: t('bench.showPanel') }));
    await waitFor(() => expect(panel().getAttribute('data-collapsed')).toBe('false'));
    expect(panel().style.width).toBe('274px');
  });

  it('opens the panel 360 px wide at 1366 px', async () => {
    setViewport(1366, 768);
    const db = await makeTestDb();
    await openBench(db);
    expect(panel().getAttribute('data-collapsed')).toBe('false');
    expect(panel().style.width).toBe('360px');
  });
});
