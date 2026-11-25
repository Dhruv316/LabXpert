import { disposeTestDbs, makeTestDb } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { NO_VALUE } from '../../src/bench/readings-table';
import { listEvents } from '../../src/db/events';
import { t } from '../../src/i18n';
import { flushBenchWrites, useBenchStore, useTaskStore, useTutorStore } from '../../src/state';
import { resetAll, openBench, wired, recordAt, putReadings, readingOf, recordButton, rowEls, cellTexts, columnTitles, pointEls, toasts, liveText, pageText } from './dock-helpers';

beforeEach(resetAll);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await flushBenchWrites();
  await disposeTestDbs();
  resetAll();
});

describe('the empty dock', () => {
  it('shows the empty texts for the table and the graph, and no plot', async () => {
    const db = await makeTestDb();
    await openBench(db);
    expect(screen.getByText(t('bench.noReadings'))).toBeTruthy();
    expect(screen.getByText(t('bench.graphEmpty'))).toBeTruthy();
    expect(screen.queryByRole('img', { name: t('bench.graphTitle') })).toBeNull();
    expect(rowEls()).toHaveLength(0);
  });

  it('has a Readings heading and a named, empty container for the answer box', async () => {
    const db = await makeTestDb();
    await openBench(db);
    expect(screen.getByRole('heading', { level: 2, name: t('bench.readings') })).toBeTruthy();
    const slot = document.querySelector('[data-dock-slot="answer"]');
    expect(slot).not.toBeNull();
    expect(slot?.childNodes).toHaveLength(0);
  });
});


describe('the readings table', () => {
  it('is a real table named Readings, with header cells', async () => {
    const db = await makeTestDb();
    await openBench(db);
    expect(screen.getByRole('table', { name: t('bench.readings') })).toBeTruthy();
    expect(columnTitles()).toEqual([t('bench.colVoltage'), t('bench.colCurrent'), t('bench.colRatio')]);
  });

  it('has the V ÷ I column for Ohm’s Law and not for series and parallel', async () => {
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    expect(columnTitles()).toEqual([t('bench.colVoltage'), t('bench.colCurrent')]);
    cleanup();
    resetAll();
    await openBench(db, 'ohms-law');
    expect(columnTitles()).toContain(t('bench.colRatio'));
  });

  it('shows 2 decimals, the ratio, and the newest reading last', async () => {
    const db = await makeTestDb();
    await openBench(db, 'ohms-law', wired(2));
    await recordAt(2);
    await recordAt(5);
    expect(rowEls().map(cellTexts)).toEqual([
      ['2.00', '0.20', '10.00'],
      ['5.00', '0.50', '10.00'],
    ]);
    expect(screen.queryByText(t('bench.noReadings'))).toBeNull();
  });

  it('shows a dash for the ratio at 0 A', async () => {
    const db = await makeTestDb();
    await openBench(db);
    putReadings([readingOf('r1', 'main', 3, 0)]);
    await waitFor(() => expect(rowEls()).toHaveLength(1));
    expect(cellTexts(rowEls()[0] as Element)).toEqual(['3.00', '0.00', NO_VALUE]);
  });

  it('shows only the current task’s readings', async () => {
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    putReadings([readingOf('s1', 'series', 1, 0.5), readingOf('p1', 'parallel', 7, 3.5), readingOf('p2', 'parallel', 8, 4)]);
    // Before any task has been chosen the first task (series) is current.
    await waitFor(() => expect(rowEls().map(cellTexts)).toEqual([['1.00', '0.50']]));
    useTaskStore.getState().setTaskId('parallel');
    await waitFor(() => expect(rowEls().map(cellTexts)).toEqual([['7.00', '3.50'], ['8.00', '4.00']]));
    expect(pointEls()).toHaveLength(2);
  });

  it('keeps the table body inside the dock: the box scrolls, the page does not', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const box = document.querySelector('[data-readings-scroll]');
    expect(box?.className).toContain('overflow-y-auto');
    expect(box?.className).toContain('overflow-x-hidden');
    expect(document.querySelector('[data-dock]')?.className).toContain('h-[220px]');
    // The header cells stay put while the body scrolls.
    for (const cell of screen.getAllByRole('columnheader')) expect(cell.className).toContain('sticky');
  });

  it('keeps the newest row in view when a row is added', async () => {
    const db = await makeTestDb();
    await openBench(db, 'ohms-law', wired(2));
    const box = document.querySelector<HTMLElement>('[data-readings-scroll]');
    if (box === null) throw new Error('no scroll box');
    // jsdom has no layout: give the box a scroll height and record what the table does with scrollTop.
    let top = 0;
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 500 });
    Object.defineProperty(box, 'scrollTop', { configurable: true, get: () => top, set: (value: number) => { top = value; } });
    await recordAt(2);
    expect(top).toBe(500);
  });
});


describe('Record reading', () => {
  it('is disabled at 0 V, stays focusable, and the tooltip text describes it', async () => {
    const db = await makeTestDb();
    await openBench(db, 'ohms-law', wired(0));
    const button = recordButton();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(t('bench.recordNeedVoltage'));
    const tooltip = document.getElementById(describedBy ?? '');
    expect(tooltip?.getAttribute('role')).toBe('tooltip');
    expect(tooltip?.className).toContain('hidden');
    button.focus();
    fireEvent.focus(button);
    expect(document.activeElement).toBe(button);
    expect(tooltip?.className).not.toContain('hidden');
  });

  it('does nothing when pressed at 0 V', async () => {
    const db = await makeTestDb();
    await openBench(db, 'ohms-law', wired(0));
    fireEvent.click(recordButton());
    await flushBenchWrites();
    expect(rowEls()).toHaveLength(0);
    expect(toasts()).toHaveLength(0);
    expect(await listEvents(db, useBenchStore.getState().session?.attemptId ?? '')).toEqual([]);
  });

  it('is at least 44 px tall (the button’s own minimum)', async () => {
    const db = await makeTestDb();
    await openBench(db);
    expect(recordButton().className).toContain('min-h-[48px]');
  });

  it('adds a row and a point, shows the toast and says it politely', async () => {
    const db = await makeTestDb();
    await openBench(db, 'ohms-law', wired(4));
    fireEvent.click(recordButton());
    await waitFor(() => expect(toasts()).toHaveLength(1));
    expect(toasts()[0]?.textContent).toContain(t('bench.recordedToast'));
    expect(liveText()).toBe(t('bench.recordedToast'));
    expect(rowEls().map(cellTexts)).toEqual([['4.00', '0.40', '10.00']]);
    expect(pointEls()).toHaveLength(1);
  });

  it('works from the keyboard and leaves focus on the button', async () => {
    const db = await makeTestDb();
    await openBench(db, 'ohms-law', wired(3));
    const button = recordButton();
    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });
    await waitFor(() => expect(rowEls()).toHaveLength(1));
    expect(document.activeElement).toBe(recordButton());
    expect(recordButton()).toBe(button);
  });

  it('adds nothing, shows no toast and leaves the error in the tutor store when the check finds an error', async () => {
    const db = await makeTestDb();
    await openBench(db, 'ohms-law', wired(4, 10, ['w3']));
    fireEvent.click(recordButton());
    await waitFor(() => expect(useTutorStore.getState().status).toBe('results'));
    await flushBenchWrites();
    expect(useTutorStore.getState().errors.length).toBeGreaterThan(0);
    expect(rowEls()).toHaveLength(0);
    expect(toasts()).toHaveLength(0);
    expect(liveText()).not.toContain(t('bench.recordedToast'));
    expect(pointEls()).toHaveLength(0);
    expect(screen.getByText(t('bench.noReadings'))).toBeTruthy();
  });

  it('keeps the readings after a reload', async () => {
    const db = await makeTestDb();
    await openBench(db, 'ohms-law', wired(2));
    await recordAt(2);
    await flushBenchWrites();
    cleanup();
    resetAll();
    await openBench(db);
    await waitFor(() => expect(rowEls().map(cellTexts)).toEqual([['2.00', '0.20', '10.00']]));
    expect(pointEls()).toHaveLength(1);
  });
});


describe('what the student sees', () => {
  it('never shows a rule code or a key after a blocked press', async () => {
    const db = await makeTestDb();
    await openBench(db, 'ohms-law', wired(4, 10, ['w3']));
    fireEvent.click(recordButton());
    await waitFor(() => expect(useTutorStore.getState().status).toBe('results'));
    await flushBenchWrites();
    const text = pageText();
    expect(text).not.toMatch(/\b[A-Z]{3,}(?:_[A-Z]+)+\b/);
    expect(text).not.toMatch(/\b(?:bench|feedback|exp|common|picker)\.[A-Za-z]/);
  });
});
