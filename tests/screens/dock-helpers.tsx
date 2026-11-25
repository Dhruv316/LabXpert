import { renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { Circuit, Reading, TerminalRef } from '../../src/model/types';
import { flushBenchWrites, useBenchStore, useReadingsStore, useTaskStore, useTutorStore } from '../../src/state';

export function resetAll() {
  resetAppState();
  useTutorStore.setState(useTutorStore.getInitialState(), true);
  useReadingsStore.setState(useReadingsStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
}

export const TITLES = { 'ohms-law': t('exp.ohms-law.title'), 'series-parallel': t('exp.series-parallel.title') } as const;
export type ExperimentKey = keyof typeof TITLES;

/** S -> SW -> A -> R -> S with the voltmeter across R. `omit` drops wires (w1..w6) to open the loop. */
export function wired(voltage: number, ohms = 10, omit: string[] = []): Circuit {
  const pairs: [TerminalRef, TerminalRef][] = [
    ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
  ];
  return {
    components: [
      { id: 'S', type: 'supply', x: 40, y: 40, voltage },
      { id: 'SW', type: 'switch', x: 300, y: 40, closed: true },
      { id: 'R', type: 'resistor', x: 500, y: 40, role: 'R', ohms },
      { id: 'A', type: 'ammeter', x: 300, y: 220 },
      { id: 'V', type: 'voltmeter', x: 500, y: 220 },
    ],
    wires: pairs.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })).filter((w) => !omit.includes(w.id)),
  };
}

/** Logs in, opens the bench and waits until the attempt's records have loaded. */
export async function openBench(db: LabXpertDB, id: ExperimentKey = 'ohms-law', circuit?: Circuit) {
  await seedUser(db, 'Asha');
  renderAppAt(db, `#/experiment/${id}`);
  await screen.findByRole('group', { name: TITLES[id] });
  await flushBenchWrites();
  if (circuit !== undefined) useBenchStore.setState({ circuit });
}

export const recordButton = () => screen.getByRole('button', { name: t('bench.record') });
export const rowEls = () => Array.from(document.querySelectorAll('[data-reading-row]'));
export const cellTexts = (row: Element) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent);
export const columnTitles = () => screen.getAllByRole('columnheader').map((cell) => cell.textContent);
export const pointEls = () => document.querySelectorAll('[data-graph-point]');
export const bestFit = () => document.querySelector('[data-best-fit]');
export const toasts = () => document.querySelectorAll('[data-variant="success"]');
export const NBSP = /\u00a0/g;
/** All the visible text on the page, one text node per piece with a space between, so words from neighbouring elements never run together. */
export function pageText(): string {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) parts.push(node.textContent ?? '');
  return parts.join(' ').replace(NBSP, ' ');
}

export const liveText = () => (screen.getByTestId('live-region').textContent ?? '').replace(NBSP, '');

/** Sets the supply, presses Record reading and waits for the toast of that press. */
export async function recordAt(voltage: number) {
  const shown = toasts().length;
  useBenchStore.setState({ circuit: wired(voltage) });
  fireEvent.click(recordButton());
  await waitFor(() => expect(toasts()).toHaveLength(shown + 1));
}

/** Readings set straight in the store, for the cases that do not need a real check. */
export function putReadings(readings: Reading[]) {
  useReadingsStore.setState({ readings });
}

export function readingOf(id: string, taskId: string, voltmeter: number, ammeter: number): Reading {
  return { id, attemptId: 'a', taskId, supplyVoltage: voltmeter, voltmeter, ammeter, timestamp: 1000 + voltmeter };
}

export const THREE = [readingOf('r1', 'main', 2, 0.2), readingOf('r2', 'main', 4, 0.4), readingOf('r3', 'main', 6, 0.6)];

function rect(width: number, height: number) {
  return { left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) };
}

/** Pretends the graph's box is laid out at this size; every other element measures 0 x 0 as in jsdom. */
export function mockGraphBox(size: { width: number; height: number }) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.hasAttribute('data-graph') ? rect(size.width, size.height) : rect(0, 0);
  });
}

