import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { listEvents } from '../../src/db/events';
import { t } from '../../src/i18n';
import { BENCH_VIEW } from '../../src/bench/catalog';
import { SNAP_RADIUS, terminalPosition } from '../../src/bench/wires';
import type { TerminalRef } from '../../src/model/types';
import { flushBenchWrites, useBenchStore } from '../../src/state';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
  await flushBenchWrites();
  await disposeTestDbs();
  resetAppState();
});

const store = () => useBenchStore.getState();
const TITLE = t('exp.ohms-law.title');
const supply = t('components.supply');
const resistor = `${t('components.resistor')} R`;
const SUPPLY_POS = t('bench.terminalLabel', { part: supply, terminal: t('bench.terminalPos') });
const RESISTOR_LEFT = t('bench.terminalLabel', { part: resistor, terminal: t('bench.terminalA') });
const svg = () => screen.getByRole('group', { name: TITLE });
const liveText = () => (screen.getByTestId('live-region').textContent ?? '').replace(/ /g, '');

function terminal(ref: TerminalRef): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-terminal-ref="${ref}"]`);
  if (found === null) throw new Error(`no terminal ${ref}`);
  return found;
}

function at(ref: TerminalRef) {
  const point = terminalPosition(store().circuit, ref);
  if (point === undefined) throw new Error(`no position for ${ref}`);
  return point;
}

/**
 * A bench with a supply and a resistor. The mocked rectangle is exactly the SVG's viewBox size
 * (BENCH_VIEW: the 1100 × 620 mat plus the table strip, 1100 × 648), at the page origin, so the
 * scale is 1 and client pixels equal mat units. A rectangle of any other shape is letterboxed by
 * "meet" scaling and moves every point, which is correct behaviour of clientToBench.
 */
async function openWithTwoParts(db: LabXpertDB) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
  vi.spyOn(svg(), 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: BENCH_VIEW.width,
    bottom: BENCH_VIEW.height,
    width: BENCH_VIEW.width,
    height: BENCH_VIEW.height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  await store().place('supply', { x: 100, y: 100 });
  await store().place('resistor', { x: 400, y: 100 });
  await waitFor(() => expect(document.querySelector('[data-part-id="R"]')).not.toBeNull());
}

const press = (ref: TerminalRef) => fireEvent.pointerDown(terminal(ref), { button: 0, pointerId: 1, clientX: at(ref).x, clientY: at(ref).y });
const moveTo = (x: number, y: number) => fireEvent.pointerMove(svg(), { pointerId: 1, clientX: x, clientY: y });
const release = (x: number, y: number) => fireEvent.pointerUp(svg(), { pointerId: 1, clientX: x, clientY: y });

/** Press and release on the same post: the first click of click-click. */
function clickTerminal(ref: TerminalRef) {
  press(ref);
  release(at(ref).x, at(ref).y);
}

async function connectionEvents(db: LabXpertDB) {
  const events = await listEvents(db, store().session?.attemptId ?? '');
  return events.filter((e) => e.actionType === 'CONNECT_WIRE');
}

function toastShows(message: string): boolean {
  return screen.getAllByText(message).some((el) => el.closest('[data-testid="live-region"]') === null);
}

describe('Click-click wiring', () => {
  it('click one terminal, then another: connects and logs connectionMethod click', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    clickTerminal('S.pos');
    expect(store().drawing).toMatchObject({ from: 'S.pos', method: 'click' });
    // The start post stays lit and a live wire is drawn.
    expect(terminal('S.pos').getAttribute('data-snap-target')).toBe('true');
    expect(screen.getByTestId('drawing-wire')).toBeTruthy();
    press('R.a');
    await waitFor(() => expect(store().circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]));
    expect(store().drawing).toBeUndefined();
    expect(screen.queryByTestId('drawing-wire')).toBeNull();
    await screen.findByRole('button', { name: t('bench.wireLabel', { from: SUPPLY_POS, to: RESISTOR_LEFT }) });
    const events = await connectionEvents(db);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ connectionMethod: 'click', after: { from: 'S.pos', to: 'R.a' } });
  });

  it('the live wire follows the pointer', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    clickTerminal('S.pos');
    moveTo(700, 500);
    expect(store().drawing?.pointer).toEqual({ x: 700, y: 500 });
    const d = screen.getByTestId('drawing-wire').querySelector('path')?.getAttribute('d') ?? '';
    expect(d.endsWith('700 500')).toBe(true);
  });

  it('a click within snap range of a post, but off it, still connects to that post', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    clickTerminal('S.pos');
    const target = at('R.a');
    // On the mat, not on the terminal: (SNAP_RADIUS - 2) away from the post centre.
    fireEvent.pointerDown(svg(), { button: 0, pointerId: 1, clientX: target.x, clientY: target.y - (SNAP_RADIUS - 2) });
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
    expect(store().circuit.wires[0]).toMatchObject({ from: 'S.pos', to: 'R.a' });
  });

  it('Escape cancels without logging anything', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    clickTerminal('S.pos');
    fireEvent.keyDown(terminal('S.pos'), { key: 'Escape' });
    expect(store().drawing).toBeUndefined();
    expect(screen.queryByTestId('drawing-wire')).toBeNull();
    await waitFor(() => expect(liveText()).toBe(t('bench.wireCancelled')));
    expect(store().circuit.wires).toEqual([]);
    expect(await connectionEvents(db)).toHaveLength(0);
  });

  it('clicking empty space cancels without logging anything', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    clickTerminal('S.pos');
    fireEvent.pointerDown(svg(), { button: 0, pointerId: 1, clientX: 900, clientY: 560 });
    expect(store().drawing).toBeUndefined();
    await waitFor(() => expect(liveText()).toBe(t('bench.wireCancelled')));
    expect(store().circuit.wires).toEqual([]);
    expect(await connectionEvents(db)).toHaveLength(0);
  });

  it('Escape with no wire in progress says nothing', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    fireEvent.keyDown(terminal('S.pos'), { key: 'Escape' });
    expect(liveText()).toBe('');
  });
});

describe('Drag wiring', () => {
  it('release within snapRadius of a terminal connects and logs connectionMethod drag', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    const target = at('R.a');
    press('S.pos');
    expect(store().drawing).toMatchObject({ from: 'S.pos', method: 'drag' });
    moveTo(target.x + 10, target.y + 8);
    // The nearest terminal in range is lit while dragging, and the live wire snaps onto it.
    expect(store().highlightedTerminal).toBe('R.a');
    expect(terminal('R.a').getAttribute('data-snap-target')).toBe('true');
    expect(screen.getByTestId('drawing-wire').getAttribute('data-snapped')).toBe('true');
    release(target.x + 10, target.y + 8);
    await waitFor(() => expect(store().circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]));
    const events = await connectionEvents(db);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ connectionMethod: 'drag' });
  });

  it('release outside snapRadius cancels and logs nothing', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    const target = at('R.a');
    press('S.pos');
    moveTo(target.x + SNAP_RADIUS + 20, target.y);
    expect(store().highlightedTerminal).toBeUndefined();
    release(target.x + SNAP_RADIUS + 20, target.y);
    await waitFor(() => expect(store().drawing).toBeUndefined());
    await waitFor(() => expect(liveText()).toBe(t('bench.wireCancelled')));
    expect(store().circuit.wires).toEqual([]);
    expect(await connectionEvents(db)).toHaveLength(0);
  });

  it('a press and release on the same post is a click, so the wire stays open', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    clickTerminal('S.pos');
    expect(store().drawing).toMatchObject({ from: 'S.pos', method: 'click' });
  });

  it('dropping back on the start post cancels instead of making a wire to itself', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    const start = at('S.pos');
    press('S.pos');
    moveTo(start.x + 200, start.y + 100);
    moveTo(start.x + 2, start.y + 2);
    release(start.x + 2, start.y + 2);
    await waitFor(() => expect(store().drawing).toBeUndefined());
    expect(store().circuit.wires).toEqual([]);
    expect(await connectionEvents(db)).toHaveLength(0);
  });
});

describe('Rejections', () => {
  it('a wire from a terminal to itself: toast, announced, nothing added or logged', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    clickTerminal('S.pos');
    press('S.pos');
    const message = t('bench.wireSameTerminal');
    await waitFor(() => expect(liveText()).toBe(message));
    expect(toastShows(message)).toBe(true);
    expect(store().circuit.wires).toEqual([]);
    expect(await connectionEvents(db)).toHaveLength(0);
    // The wire stays open so the learner can pick another end.
    expect(store().drawing).toMatchObject({ from: 'S.pos' });
  });

  it('a duplicate wire: toast, announced, nothing added, only the first is logged', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    clickTerminal('S.pos');
    press('R.a');
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
    // The same two terminals again, from the other end.
    clickTerminal('R.a');
    press('S.pos');
    const message = t('bench.wireDuplicate');
    await waitFor(() => expect(liveText()).toBe(message));
    expect(toastShows(message)).toBe(true);
    expect(store().circuit.wires).toHaveLength(1);
    expect(store().drawing).toBeUndefined();
    expect(await connectionEvents(db)).toHaveLength(1);
  });
});

describe('Pulse ring', () => {
  it('shows on the other terminals while a wire is being drawn, and not otherwise', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    expect(document.querySelectorAll('[data-pulse-ring]')).toHaveLength(0);
    press('S.pos');
    // Four terminals; the start post has the solid ring instead.
    expect(document.querySelectorAll('[data-pulse-ring]')).toHaveLength(3);
    release(at('S.pos').x, at('S.pos').y);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.querySelectorAll('[data-pulse-ring]')).toHaveLength(0));
  });

  it('is left out when reduce motion is on', async () => {
    const db = await makeTestDb();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    await openWithTwoParts(db);
    press('S.pos');
    expect(store().drawing).toBeDefined();
    expect(document.querySelectorAll('[data-pulse-ring]')).toHaveLength(0);
    // The solid snap ring on the start post is not motion, so it stays.
    expect(terminal('S.pos').getAttribute('data-snap-target')).toBe('true');
  });
});

describe('Announcements', () => {
  it('says started, connected and cancelled with the approved sentences', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    press('S.pos');
    expect(liveText()).toBe(t('bench.wireStarted', { terminal: SUPPLY_POS }));
    release(at('S.pos').x, at('S.pos').y);
    press('R.a');
    await waitFor(() => expect(liveText()).toBe(t('bench.wireConnected', { from: SUPPLY_POS, to: RESISTOR_LEFT })));
    clickTerminal('R.b');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(liveText()).toBe(t('bench.wireCancelled')));
  });
});

describe('Undo and reload', () => {
  it('Undo removes a wire made on screen', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    clickTerminal('S.pos');
    press('R.a');
    await waitFor(() => expect(document.querySelector('[data-wire-id="w1"]')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await waitFor(() => expect(document.querySelector('[data-wire-id="w1"]')).toBeNull());
    expect(store().circuit.wires).toEqual([]);
    expect(document.querySelector('[data-terminal-ref="S.pos"]')?.getAttribute('data-connected')).toBe('false');
  });

  it('a wire made on screen is drawn again after a reload', async () => {
    const db = await makeTestDb();
    await openWithTwoParts(db);
    press('S.pos');
    moveTo(at('R.a').x, at('R.a').y);
    release(at('R.a').x, at('R.a').y);
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
    await flushBenchWrites();
    cleanup();
    resetAppState();
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('button', { name: t('bench.wireLabel', { from: SUPPLY_POS, to: RESISTOR_LEFT }) });
    expect(store().circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]);
  });
});
