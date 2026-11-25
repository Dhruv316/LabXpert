import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { listEvents } from '../../src/db/events';
import { t } from '../../src/i18n';
import { allTerminals } from '../../src/bench/wires';
import type { ComponentType, TerminalRef } from '../../src/model/types';
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

// Spelled out from the approved strings, not taken from src/ui/bench/names.ts.
const supply = t('components.supply');
const resistor = `${t('components.resistor')} R`;
const label = (part: string, terminal: string) => t('bench.terminalLabel', { part, terminal });
const SUPPLY_POS = label(supply, t('bench.terminalPos'));
const RESISTOR_LEFT = label(resistor, t('bench.terminalA'));

const liveText = () => (screen.getByTestId('live-region').textContent ?? '').replace(/\u00a0/g, '');
const svg = () => screen.getByRole('group', { name: TITLE });

function terminal(ref: TerminalRef): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-terminal-ref="${ref}"]`);
  if (found === null) throw new Error(`no terminal ${ref}`);
  return found;
}

function wireEl(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-wire-id="${id}"]`);
  if (found === null) throw new Error(`wire ${id} is not on screen`);
  return found;
}

/** Moves focus the way Tab would, inside act so React sees the focus event before the next step. */
function focus(el: Element | null) {
  if (!(el instanceof SVGElement || el instanceof HTMLElement)) throw new Error('nothing to focus');
  act(() => el.focus());
}

/** What a keyboard user does: focus the terminal, then press the key on it. */
function key(ref: TerminalRef, pressed: string) {
  const el = terminal(ref);
  focus(el);
  fireEvent.keyDown(el, { key: pressed });
}

async function openBench(db: LabXpertDB) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
}

async function placeAt(type: ComponentType, x: number, y: number) {
  const id = await store().place(type, { x, y });
  if (id === undefined) throw new Error(`could not place ${type}`);
  await waitFor(() => expect(document.querySelector(`[data-part-id="${id}"]`)).not.toBeNull());
  return id;
}

/** Supply S (pos 250,214) and resistor R (a 412,138). */
async function supplyAndResistor(db: LabXpertDB) {
  await openBench(db);
  await placeAt('supply', 100, 100);
  await placeAt('resistor', 400, 100);
}

async function connectionEvents(db: LabXpertDB) {
  const events = await listEvents(db, store().session?.attemptId ?? '');
  return events.filter((e) => e.actionType === 'CONNECT_WIRE');
}

function toastShows(message: string): boolean {
  return screen.getAllByText(message).some((el) => el.closest('[data-testid="live-region"]') === null);
}

/** The pill around a toast's words, which carries its variant. */
function toastPill(message: string): Element {
  const pill = screen
    .getAllByText(message)
    .map((el) => el.closest('[data-variant]'))
    .find((el) => el !== null);
  if (pill === null || pill === undefined) throw new Error(`no toast pill for "${message}"`);
  return pill;
}

/** A page reload: nothing in memory, the db stays. */
async function reload(db: LabXpertDB) {
  await flushBenchWrites();
  cleanup();
  resetAppState();
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
}

describe('Keyboard wiring', () => {
  it('Enter starts a wire (the post stays lit), Enter on another post connects, and the event says click', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    expect(store().drawing).toMatchObject({ from: 'S.pos', method: 'click' });
    expect(terminal('S.pos').getAttribute('data-snap-target')).toBe('true');
    expect(terminal('S.pos').getAttribute('data-wire-origin')).toBe('true');
    expect(screen.getByTestId('drawing-wire')).toBeTruthy();
    expect(liveText()).toBe(t('bench.wireStarted', { terminal: SUPPLY_POS }));
    // Nothing is made until the second post.
    expect(store().circuit.wires).toEqual([]);

    key('R.a', 'Enter');
    await waitFor(() => expect(store().circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]));
    expect(store().drawing).toBeUndefined();
    await waitFor(() => expect(liveText()).toBe(t('bench.wireConnected', { from: SUPPLY_POS, to: RESISTOR_LEFT })));
    const events = await connectionEvents(db);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ connectionMethod: 'click', after: { from: 'S.pos', to: 'R.a' } });
  });

  it('focus stays on the terminal that was pressed, after starting and after connecting', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    expect(document.activeElement).toBe(terminal('S.pos'));
    key('R.a', 'Enter');
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
    expect(document.activeElement).toBe(terminal('R.a'));
  });

  it('Space works as well as Enter, and does not scroll the page', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    const first = terminal('S.neg');
    focus(first);
    const started = fireEvent.keyDown(first, { key: ' ' });
    // fireEvent returns false when the handler called preventDefault.
    expect(started).toBe(false);
    expect(store().drawing).toMatchObject({ from: 'S.neg', method: 'click' });
    key('R.b', ' ');
    await waitFor(() => expect(store().circuit.wires).toEqual([{ id: 'w1', from: 'S.neg', to: 'R.b' }]));
    expect((await connectionEvents(db))[0]).toMatchObject({ connectionMethod: 'click' });
  });

  it('a held key (repeat) does not start a wire and end it on itself', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    const el = terminal('S.pos');
    focus(el);
    fireEvent.keyDown(el, { key: 'Enter' });
    fireEvent.keyDown(el, { key: 'Enter', repeat: true });
    expect(store().drawing).toMatchObject({ from: 'S.pos' });
    expect(liveText()).toBe(t('bench.wireStarted', { terminal: SUPPLY_POS }));
  });

  it('other keys on a terminal do nothing', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    key('S.pos', 'a');
    key('S.pos', 'ArrowRight');
    expect(store().drawing).toBeUndefined();
  });

  it('Escape cancels without logging anything, and focus stays put', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    fireEvent.keyDown(terminal('S.pos'), { key: 'Escape' });
    expect(store().drawing).toBeUndefined();
    expect(screen.queryByTestId('drawing-wire')).toBeNull();
    await waitFor(() => expect(liveText()).toBe(t('bench.wireCancelled')));
    expect(store().circuit.wires).toEqual([]);
    expect(await connectionEvents(db)).toHaveLength(0);
    expect(document.activeElement).toBe(terminal('S.pos'));
  });

  it('Escape from another terminal cancels too', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    key('R.a', 'Escape');
    expect(store().drawing).toBeUndefined();
    expect(store().circuit.wires).toEqual([]);
  });

  it('moving focus onto another terminal lights it and snaps the live wire to it', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    focus(terminal('R.b'));
    expect(store().highlightedTerminal).toBe('R.b');
    expect(terminal('R.b').getAttribute('data-snap-target')).toBe('true');
    expect(screen.getByTestId('drawing-wire').getAttribute('data-snapped')).toBe('true');
    // The start post keeps its ring while another is lit.
    expect(terminal('S.pos').getAttribute('data-wire-origin')).toBe('true');
    focus(terminal('S.pos'));
    expect(screen.getByTestId('drawing-wire').getAttribute('data-snapped')).toBe('false');
  });

  it('shows the same pulse ring as pointer wiring, and drops it under reduce motion', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    expect(document.querySelectorAll('[data-pulse-ring]')).toHaveLength(0);
    key('S.pos', 'Enter');
    // Four terminals; the start post has the solid ring instead.
    expect(document.querySelectorAll('[data-pulse-ring]')).toHaveLength(3);
    fireEvent.keyDown(terminal('S.pos'), { key: 'Escape' });
    await waitFor(() => expect(document.querySelectorAll('[data-pulse-ring]')).toHaveLength(0));
  });

  it('leaves the pulse ring out when reduce motion is on, keeping the solid ring', async () => {
    const db = await makeTestDb();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    expect(store().drawing).toBeDefined();
    expect(document.querySelectorAll('[data-pulse-ring]')).toHaveLength(0);
    expect(terminal('S.pos').getAttribute('data-wire-origin')).toBe('true');
  });
});

describe('Keyboard rejections', () => {
  it('a wire from a terminal to itself: warning toast, announced, nothing added or logged, wire stays open', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    key('S.pos', 'Enter');
    const message = t('bench.wireSameTerminal');
    await waitFor(() => expect(liveText()).toBe(message));
    expect(toastShows(message)).toBe(true);
    expect(store().circuit.wires).toEqual([]);
    expect(await connectionEvents(db)).toHaveLength(0);
    expect(store().drawing).toMatchObject({ from: 'S.pos' });
    // The learner can still pick another end.
    key('R.a', 'Enter');
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
  });

  it('a duplicate wire, from the other end: warning toast, announced, nothing added, only the first is logged', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    key('R.a', 'Enter');
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
    key('R.a', 'Enter');
    key('S.pos', 'Enter');
    const message = t('bench.wireDuplicate');
    await waitFor(() => expect(liveText()).toBe(message));
    expect(toastShows(message)).toBe(true);
    expect(store().circuit.wires).toHaveLength(1);
    expect(store().drawing).toBeUndefined();
    expect(await connectionEvents(db)).toHaveLength(1);
  });

  it('both rejection toasts show the warning icon, not the check mark', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    key('S.pos', 'Enter');
    // The rejection is decided in the store's queue, so the toast arrives a moment after the key press.
    await waitFor(() => expect(toastShows(t('bench.wireSameTerminal'))).toBe(true));
    const same = toastPill(t('bench.wireSameTerminal'));
    expect(same.getAttribute('data-variant')).toBe('warning');
    expect(same.querySelector('svg')?.getAttribute('class') ?? '').toMatch(/alert/);
    expect(same.querySelector('svg')?.getAttribute('class') ?? '').not.toMatch(/check/);

    key('R.a', 'Enter');
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
    key('R.a', 'Enter');
    key('S.pos', 'Enter');
    await waitFor(() => expect(toastShows(t('bench.wireDuplicate'))).toBe(true));
    const duplicate = toastPill(t('bench.wireDuplicate'));
    expect(duplicate.getAttribute('data-variant')).toBe('warning');
    expect(duplicate.querySelector('svg')?.getAttribute('class') ?? '').toMatch(/alert/);
  });
});

describe('Terminal tab order', () => {
  const order = () => Array.from(svg().querySelectorAll('[data-terminal-ref]')).map((el) => el.getAttribute('data-terminal-ref'));

  it('is by part in placement order, then by terminal, and every terminal is a plain tab stop', async () => {
    const db = await makeTestDb();
    await openBench(db);
    // Placed supply, ammeter, resistor: placement order, not the shelf's order.
    await placeAt('supply', 60, 60);
    await placeAt('ammeter', 360, 60);
    await placeAt('resistor', 660, 60);
    expect(order()).toEqual(['S.pos', 'S.neg', 'A.pos', 'A.neg', 'R.a', 'R.b']);
    for (const el of Array.from(svg().querySelectorAll('[data-terminal-ref]'))) {
      expect(el.getAttribute('tabindex')).toBe('0');
    }
    // No positive tabindex anywhere on the bench, so the page's own order is never overridden.
    for (const el of Array.from(svg().querySelectorAll('[tabindex]'))) {
      expect(Number(el.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    }
  });

  it('matches the circuit model and does not change when parts move or wires are added', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeAt('supply', 60, 60);
    await placeAt('ammeter', 360, 60);
    await placeAt('resistor', 660, 60);
    const before = order();
    expect(before).toEqual(allTerminals(store().circuit).map((terminalMark) => terminalMark.ref));

    fireEvent.keyDown(document.querySelector('[data-part-id="A"]') as Element, { key: 'ArrowDown' });
    fireEvent.keyDown(document.querySelector('[data-part-id="S"]') as Element, { key: 'ArrowRight', shiftKey: true });
    key('S.pos', 'Enter');
    key('R.a', 'Enter');
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
    expect(order()).toEqual(before);
  });

  it('is the same after a reload', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeAt('supply', 60, 60);
    await placeAt('ammeter', 360, 60);
    await placeAt('resistor', 660, 60);
    const before = order();
    await reload(db);
    await waitFor(() => expect(order()).toEqual(before));
  });
});

describe('Reaching and deleting a wire by keyboard', () => {
  async function twoWires(db: LabXpertDB) {
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    key('R.a', 'Enter');
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
    key('S.neg', 'Enter');
    key('R.b', 'Enter');
    await waitFor(() => expect(store().circuit.wires).toHaveLength(2));
  }

  it('wires are one Tab stop; the arrow keys move between them, wrapping, and Home and End jump', async () => {
    const db = await makeTestDb();
    await twoWires(db);
    // Only one wire is a Tab stop.
    expect(wireEl('w1').getAttribute('tabindex')).toBe('0');
    expect(wireEl('w2').getAttribute('tabindex')).toBe('-1');

    focus(wireEl('w1'));
    fireEvent.keyDown(wireEl('w1'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(wireEl('w2'));
    // The stop follows focus, so Tab back into the bench lands where the learner was.
    expect(wireEl('w2').getAttribute('tabindex')).toBe('0');
    expect(wireEl('w1').getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(wireEl('w2'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(wireEl('w1'));
    fireEvent.keyDown(wireEl('w1'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(wireEl('w2'));
    fireEvent.keyDown(wireEl('w2'), { key: 'Home' });
    expect(document.activeElement).toBe(wireEl('w1'));
    fireEvent.keyDown(wireEl('w1'), { key: 'End' });
    expect(document.activeElement).toBe(wireEl('w2'));
    // Moving focus does not select.
    expect(store().selectedWireId).toBeUndefined();
  });

  it('a wire takes Enter or Space to select', async () => {
    const db = await makeTestDb();
    await twoWires(db);
    focus(wireEl('w2'));
    fireEvent.keyDown(wireEl('w2'), { key: ' ' });
    expect(store().selectedWireId).toBe('w2');
    expect(wireEl('w2').getAttribute('aria-pressed')).toBe('true');
  });

  it('Delete removes the keyboard-selected wire, says so, and focus moves to the next wire', async () => {
    const db = await makeTestDb();
    await twoWires(db);
    focus(wireEl('w1'));
    fireEvent.keyDown(wireEl('w1'), { key: 'Enter' });
    expect(store().selectedWireId).toBe('w1');
    fireEvent.keyDown(wireEl('w1'), { key: 'Delete' });
    await waitFor(() => expect(store().circuit.wires.map((w) => w.id)).toEqual(['w2']));
    await waitFor(() => expect(liveText()).toBe(t('bench.wireRemoved')));
    expect(document.activeElement).toBe(wireEl('w2'));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('after the last wire goes, focus lands on the terminal it started at', async () => {
    const db = await makeTestDb();
    await twoWires(db);
    focus(wireEl('w2'));
    fireEvent.keyDown(wireEl('w2'), { key: 'Enter' });
    fireEvent.keyDown(wireEl('w2'), { key: 'Delete' });
    await waitFor(() => expect(store().circuit.wires.map((w) => w.id)).toEqual(['w1']));
    // w2 was the last, so focus goes to the one before it.
    expect(document.activeElement).toBe(wireEl('w1'));
    fireEvent.keyDown(wireEl('w1'), { key: 'Enter' });
    fireEvent.keyDown(wireEl('w1'), { key: 'Delete' });
    await waitFor(() => expect(store().circuit.wires).toEqual([]));
    expect(document.activeElement).toBe(terminal('S.pos'));
  });

  it('Delete pressed on a terminal removes the selected wire, and focus still lands somewhere valid', async () => {
    const db = await makeTestDb();
    await twoWires(db);
    focus(wireEl('w1'));
    fireEvent.keyDown(wireEl('w1'), { key: 'Enter' });
    key('R.b', 'Delete');
    await waitFor(() => expect(store().circuit.wires.map((w) => w.id)).toEqual(['w2']));
    expect(document.activeElement).toBe(wireEl('w2'));
  });

  it('the Remove button in the toolbar leaves focus on the bench, not on nothing', async () => {
    const db = await makeTestDb();
    await twoWires(db);
    focus(wireEl('w1'));
    fireEvent.keyDown(wireEl('w1'), { key: 'Enter' });
    // The selected wire's own trash button has the same name, so look inside the toolbar only.
    const remove = within(screen.getByTestId('selection-toolbar')).getByRole('button', { name: t('bench.deleteSelected') });
    focus(remove);
    fireEvent.click(remove);
    await waitFor(() => expect(store().circuit.wires.map((w) => w.id)).toEqual(['w2']));
    expect(document.activeElement).toBe(wireEl('w2'));
  });

  it('Undo brings a keyboard-deleted wire back', async () => {
    const db = await makeTestDb();
    await twoWires(db);
    focus(wireEl('w1'));
    fireEvent.keyDown(wireEl('w1'), { key: 'Enter' });
    fireEvent.keyDown(wireEl('w1'), { key: 'Delete' });
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await waitFor(() => expect(store().circuit.wires).toHaveLength(2));
  });
});

describe('Focus visibility', () => {
  it('every terminal and wire has a focus ring that shows on keyboard focus', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    key('R.a', 'Enter');
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
    for (const el of [terminal('S.pos'), terminal('R.b'), wireEl('w1')]) {
      const ring = Array.from(el.querySelectorAll('[class]')).find((c) => (c.getAttribute('class') ?? '').includes('group-focus-visible:opacity-100'));
      expect(ring, el.getAttribute('aria-label') ?? '').toBeDefined();
    }
  });
});

describe('Keyboard wiring survives a reload', () => {
  it('a wire built by keyboard is drawn again after a reload', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    key('S.pos', 'Enter');
    key('R.a', 'Enter');
    await waitFor(() => expect(store().circuit.wires).toHaveLength(1));
    await reload(db);
    await screen.findByRole('button', { name: t('bench.wireLabel', { from: SUPPLY_POS, to: RESISTOR_LEFT }) });
    expect(store().circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]);
  });
});

describe('Keyboard-only run-through', () => {
  const tile = (type: string) => {
    const found = document.querySelector<HTMLButtonElement>(`[data-shelf-type="${type}"]`);
    if (found === null) throw new Error(`no shelf tile for ${type}`);
    return found;
  };

  it('places a supply, a resistor and an ammeter from the shelf, wires them by keyboard, and has three wires', async () => {
    const db = await makeTestDb();
    await openBench(db);
    for (const type of ['supply', 'resistor', 'ammeter'] as const) {
      fireEvent.keyDown(tile(type), { key: 'Enter' });
      await waitFor(() => expect(store().circuit.components.some((c) => c.type === type)).toBe(true));
    }
    await flushBenchWrites();
    expect(store().circuit.components.map((c) => c.id)).toEqual(['S', 'R', 'A']);

    // Supply + to the resistor, resistor on to the ammeter, ammeter back to the supply −.
    const steps: Array<[TerminalRef, TerminalRef]> = [
      ['S.pos', 'R.a'],
      ['R.b', 'A.pos'],
      ['A.neg', 'S.neg'],
    ];
    for (const [from, to] of steps) {
      key(from, 'Enter');
      key(to, ' ');
      await waitFor(() => expect(store().drawing).toBeUndefined());
    }
    await waitFor(() => expect(store().circuit.wires).toHaveLength(3));
    expect(store().circuit.wires).toEqual([
      { id: 'w1', from: 'S.pos', to: 'R.a' },
      { id: 'w2', from: 'R.b', to: 'A.pos' },
      { id: 'w3', from: 'A.neg', to: 'S.neg' },
    ]);
    const events = await connectionEvents(db);
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.connectionMethod === 'click')).toBe(true);
    expect(document.querySelectorAll('[data-wire-id]')).toHaveLength(3);
    expect(Array.from(document.querySelectorAll('[data-connected="true"]'))).toHaveLength(6);

    await reload(db);
    await waitFor(() => expect(document.querySelectorAll('[data-wire-id]')).toHaveLength(3));
    expect(store().circuit.wires).toHaveLength(3);
  });
});
