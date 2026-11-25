import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { listEvents } from '../../src/db/events';
import { t } from '../../src/i18n';
import { terminalPosition } from '../../src/bench/wires';
import type { ComponentType } from '../../src/model/types';
import { flushBenchWrites, useBenchStore } from '../../src/state';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  await flushBenchWrites();
  await disposeTestDbs();
  resetAppState();
});

const store = () => useBenchStore.getState();
const TITLE = t('exp.ohms-law.title');

// Names are spelled out from the approved strings, not taken from src/ui/bench/names.ts, so a
// slip in that file cannot hide itself.
const supply = t('components.supply');
const resistor = `${t('components.resistor')} R`;
const pos = t('bench.terminalPos');
const neg = t('bench.terminalNeg');
const left = t('bench.terminalA');
const right = t('bench.terminalB');
const label = (part: string, terminal: string) => t('bench.terminalLabel', { part, terminal });
const wireLabel = (from: string, to: string) => t('bench.wireLabel', { from, to });

const SUPPLY_POS = label(supply, pos);
const RESISTOR_LEFT = label(resistor, left);
const RESISTOR_RIGHT = label(resistor, right);

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

/** Supply and resistor side by side, as in the store tests: S.pos (250,214), R.a (412,138). */
async function supplyAndResistor(db: LabXpertDB) {
  await openBench(db);
  await placeAt('supply', 100, 100);
  await placeAt('resistor', 400, 100);
}

async function wireUp(from: 'S.pos' | 'S.neg', to: 'R.a' | 'R.b') {
  store().startWire(from, 'click');
  expect(await store().finishWire(to)).toBe('connected');
}

function wireEl(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-wire-id="${id}"]`);
  if (found === null) throw new Error(`wire ${id} is not on screen`);
  return found;
}

function partEl(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-part-id="${id}"]`);
  if (found === null) throw new Error(`part ${id} is not on screen`);
  return found;
}

const svg = () => screen.getByRole('group', { name: TITLE });
const liveText = () => (screen.getByTestId('live-region').textContent ?? '').replace(/ /g, '');

describe('Terminals', () => {
  it('every part type has its terminals, with the part and terminal in the accessible name', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeAt('supply', 40, 40);
    await placeAt('switch', 300, 40);
    await placeAt('resistor', 520, 40);
    await placeAt('ammeter', 40, 300);
    await placeAt('voltmeter', 400, 300);

    const expected: [string, string][] = [
      [t('components.supply'), pos],
      [t('components.supply'), neg],
      [t('components.switch'), left],
      [t('components.switch'), right],
      [resistor, left],
      [resistor, right],
      [t('components.ammeter'), pos],
      [t('components.ammeter'), neg],
      [t('components.voltmeter'), pos],
      [t('components.voltmeter'), neg],
    ];
    for (const [part, terminal] of expected) {
      expect(within(svg()).getByRole('button', { name: label(part, terminal) })).toBeTruthy();
    }
    expect(document.querySelectorAll('[data-terminal-ref]')).toHaveLength(10);
  });

  it('are keyboard-focusable, and sit on the part where components.json puts them', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    const terminal = within(svg()).getByRole('button', { name: SUPPLY_POS });
    expect(terminal.getAttribute('tabindex')).toBe('0');
    terminal.focus();
    expect(document.activeElement).toBe(terminal);
    const at = terminalPosition(store().circuit, 'S.pos');
    expect(terminal.getAttribute('transform')).toBe(`translate(${at?.x} ${at?.y})`);
  });

  it('a press on a terminal starts a wire from it and adds nothing to the circuit', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    const terminal = within(svg()).getByRole('button', { name: SUPPLY_POS });
    fireEvent.pointerDown(terminal, { button: 0 });
    expect(store().drawing).toMatchObject({ from: 'S.pos', method: 'drag' });
    expect(store().circuit.wires).toEqual([]);
    // Released where it was pressed, it is a click: the wire stays open for a second terminal.
    fireEvent.pointerUp(terminal, { button: 0 });
    expect(store().drawing).toMatchObject({ from: 'S.pos', method: 'click' });
    expect(store().circuit.wires).toEqual([]);
  });

  it('a plain click on a terminal, with no press, starts and connects nothing (Enter and Space are covered in wiring-keyboard.test.tsx)', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    const terminal = within(svg()).getByRole('button', { name: SUPPLY_POS });
    fireEvent.click(terminal);
    expect(store().drawing).toBeUndefined();
    expect(store().circuit.wires).toEqual([]);
  });

  it('show a dark centre dot once a wire is attached', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    expect(document.querySelector('[data-terminal-ref="S.pos"]')?.getAttribute('data-connected')).toBe('false');
    await wireUp('S.pos', 'R.a');
    await waitFor(() => expect(document.querySelector('[data-terminal-ref="S.pos"]')?.getAttribute('data-connected')).toBe('true'));
    expect(document.querySelector('[data-terminal-ref="S.neg"]')?.getAttribute('data-connected')).toBe('false');
  });

  it('follow their part when it moves', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    const before = document.querySelector('[data-terminal-ref="S.pos"]')?.getAttribute('transform');
    fireEvent.keyDown(partEl('S'), { key: 'ArrowRight', shiftKey: true });
    await waitFor(() => expect(document.querySelector('[data-terminal-ref="S.pos"]')?.getAttribute('transform')).not.toBe(before));
    const at = terminalPosition(store().circuit, 'S.pos');
    expect(document.querySelector('[data-terminal-ref="S.pos"]')?.getAttribute('transform')).toBe(`translate(${at?.x} ${at?.y})`);
  });
});

describe('Wire rendering', () => {
  it('draws a wire with an accessible name from the two terminals', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    expect(document.querySelector('[data-wire-id]')).toBeNull();
    await wireUp('S.pos', 'R.a');
    const wire = await screen.findByRole('button', { name: wireLabel(SUPPLY_POS, RESISTOR_LEFT) });
    expect(wire.getAttribute('data-wire-id')).toBe('w1');
    // An ink outline under a teal fill, both with round caps (DESIGN §7).
    const strokes = Array.from(wire.querySelectorAll('path')).filter((p) => p.getAttribute('stroke-linecap') === 'round');
    expect(strokes.length).toBeGreaterThanOrEqual(2);
    expect(wire.querySelector('path[stroke-width="9"]')).not.toBeNull();
    expect(wire.querySelector('path[stroke-width="5"]')).not.toBeNull();
  });

  it('starts and ends the curve on its two terminals', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.neg', 'R.b');
    const from = terminalPosition(store().circuit, 'S.neg');
    const to = terminalPosition(store().circuit, 'R.b');
    const d = wireEl('w1').querySelector('path')?.getAttribute('d') ?? '';
    expect(d.startsWith(`M ${from?.x} ${from?.y} C`)).toBe(true);
    expect(d.endsWith(`${to?.x} ${to?.y}`)).toBe(true);
  });

  it('stays attached when its part is dragged', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    vi.spyOn(svg(), 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1100, bottom: 648, width: 1100, height: 648, x: 0, y: 0, toJSON: () => ({}),
    });
    const target = partEl('R');
    const part = store().circuit.components.find((c) => c.id === 'R');
    if (part === undefined) throw new Error('no resistor');
    fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: part.x + 10, clientY: part.y + 10 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: part.x + 110, clientY: part.y + 60 });
    // Mid-drag, before the pointer is released, the wire already ends on the moved terminal.
    const moved = terminalPosition(store().circuit, 'R.a');
    expect(moved).toEqual({ x: 412 + 100, y: 138 + 50 });
    expect(wireEl('w1').querySelector('path')?.getAttribute('d')?.endsWith(`${moved?.x} ${moved?.y}`)).toBe(true);
    fireEvent.pointerUp(target, { pointerId: 1 });
  });

  it('stays attached when its part is nudged, and again after Undo', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    const before = wireEl('w1').querySelector('path')?.getAttribute('d');
    fireEvent.keyDown(partEl('R'), { key: 'ArrowDown', shiftKey: true });
    await waitFor(() => expect(wireEl('w1').querySelector('path')?.getAttribute('d')).not.toBe(before));
    const moved = terminalPosition(store().circuit, 'R.a');
    expect(wireEl('w1').querySelector('path')?.getAttribute('d')?.endsWith(`${moved?.x} ${moved?.y}`)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await waitFor(() => expect(wireEl('w1').querySelector('path')?.getAttribute('d')).toBe(before));
  });

  it('disappears with its part, and not before', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    await wireUp('S.neg', 'R.b');
    expect(document.querySelectorAll('[data-wire-id]')).toHaveLength(2);
    fireEvent.keyDown(partEl('R'), { key: 'Delete' });
    await waitFor(() => expect(document.querySelector('[data-part-id="R"]')).toBeNull());
    expect(document.querySelectorAll('[data-wire-id]')).toHaveLength(0);
    expect(store().circuit.wires).toEqual([]);
    // The supply is untouched.
    expect(document.querySelector('[data-part-id="S"]')).not.toBeNull();
  });

  it('is drawn again after a reload', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    await flushBenchWrites();
    cleanup();
    resetAppState();
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('button', { name: wireLabel(SUPPLY_POS, RESISTOR_LEFT) });
    expect(store().circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]);
    expect(document.querySelector('[data-terminal-ref="S.pos"]')?.getAttribute('data-connected')).toBe('true');
  });
});

describe('Selecting a wire', () => {
  it('a click selects it, with a selected state and a trash button', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    const wire = wireEl('w1');
    expect(wire.getAttribute('data-selected')).toBe('false');
    expect(document.querySelector('[data-wire-trash]')).toBeNull();
    fireEvent.pointerDown(wire, { button: 0 });
    expect(store().selectedWireId).toBe('w1');
    expect(wire.getAttribute('data-selected')).toBe('true');
    expect(wire.getAttribute('aria-pressed')).toBe('true');
    // The selected look: a dashed ink overlay, and the trash button at the midpoint.
    expect(wire.querySelector('path[stroke-dasharray]')).not.toBeNull();
    expect(within(svg()).getByRole('button', { name: t('bench.deleteSelected') })).toBeTruthy();
  });

  it('a click with no pointer events (assistive technology) selects it too', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    fireEvent.click(wireEl('w1'));
    expect(store().selectedWireId).toBe('w1');
  });

  it('Enter selects a focused wire, and a wire can take keyboard focus', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    const wire = wireEl('w1');
    expect(wire.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(wire, { key: 'Enter' });
    expect(store().selectedWireId).toBe('w1');
  });

  it('clicking empty space deselects it, and so does Escape', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    fireEvent.pointerDown(wireEl('w1'), { button: 0 });
    expect(store().selectedWireId).toBe('w1');
    fireEvent.pointerDown(svg(), { button: 0 });
    expect(store().selectedWireId).toBeUndefined();
    expect(wireEl('w1').getAttribute('data-selected')).toBe('false');

    fireEvent.pointerDown(wireEl('w1'), { button: 0 });
    fireEvent.keyDown(wireEl('w1'), { key: 'Escape' });
    expect(store().selectedWireId).toBeUndefined();
  });

  it('a press on a terminal is not a press on empty space', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    fireEvent.pointerDown(wireEl('w1'), { button: 0 });
    fireEvent.pointerDown(within(svg()).getByRole('button', { name: SUPPLY_POS }), { button: 0 });
    expect(store().selectedWireId).toBe('w1');
  });

  it('selecting a wire clears the part selection, and selecting a part clears the wire', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    fireEvent.pointerDown(partEl('S'), { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(partEl('S'), { pointerId: 0 });
    expect(store().selectedId).toBe('S');
    expect(store().selectedWireId).toBeUndefined();

    fireEvent.pointerDown(wireEl('w1'), { button: 0 });
    expect(store().selectedWireId).toBe('w1');
    expect(store().selectedId).toBeUndefined();
    expect(partEl('S').getAttribute('data-selected')).toBe('false');

    fireEvent.pointerDown(partEl('R'), { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(partEl('R'), { pointerId: 0 });
    expect(store().selectedId).toBe('R');
    expect(store().selectedWireId).toBeUndefined();
    expect(wireEl('w1').getAttribute('data-selected')).toBe('false');
    // Only one selection toolbar, whichever kind is selected.
    expect(screen.getAllByTestId('selection-toolbar')).toHaveLength(1);
  });

  it('placing a part while a wire is selected clears the wire selection', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    fireEvent.pointerDown(wireEl('w1'), { button: 0 });
    await placeAt('ammeter', 600, 300);
    expect(store().selectedWireId).toBeUndefined();
    expect(store().selectedId).toBe('A');
  });
});

describe('Deleting a wire', () => {
  async function selectedWire(db: LabXpertDB) {
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    fireEvent.pointerDown(wireEl('w1'), { button: 0 });
  }

  async function expectRemoved() {
    await waitFor(() => expect(document.querySelector('[data-wire-id="w1"]')).toBeNull());
    expect(store().circuit.wires).toEqual([]);
    expect(store().selectedWireId).toBeUndefined();
    // The parts stay.
    expect(document.querySelector('[data-part-id="S"]')).not.toBeNull();
    expect(document.querySelector('[data-part-id="R"]')).not.toBeNull();
    await waitFor(() => expect(liveText()).toBe(t('bench.wireRemoved')));
  }

  it('the Delete key on the wire removes it, and says so', async () => {
    const db = await makeTestDb();
    await selectedWire(db);
    fireEvent.keyDown(wireEl('w1'), { key: 'Delete' });
    await expectRemoved();
  });

  it('the Delete key removes the selected wire even when focus is elsewhere on the bench', async () => {
    const db = await makeTestDb();
    await selectedWire(db);
    fireEvent.keyDown(within(svg()).getByRole('button', { name: RESISTOR_RIGHT }), { key: 'Delete' });
    await expectRemoved();
  });

  it('Delete with nothing selected removes nothing', async () => {
    const db = await makeTestDb();
    await supplyAndResistor(db);
    await wireUp('S.pos', 'R.a');
    fireEvent.keyDown(within(svg()).getByRole('button', { name: RESISTOR_RIGHT }), { key: 'Delete' });
    await flushBenchWrites();
    expect(store().circuit.wires).toHaveLength(1);
    expect(liveText()).toBe('');
  });

  it('the trash button on the selected wire removes it', async () => {
    const db = await makeTestDb();
    await selectedWire(db);
    fireEvent.click(within(svg()).getByRole('button', { name: t('bench.deleteSelected') }));
    await expectRemoved();
  });

  it('a press on the trash button does not deselect the wire first', async () => {
    const db = await makeTestDb();
    await selectedWire(db);
    fireEvent.pointerDown(within(svg()).getByRole('button', { name: t('bench.deleteSelected') }), { button: 0 });
    expect(store().selectedWireId).toBe('w1');
  });

  it('the Remove button in the selection toolbar removes it', async () => {
    const db = await makeTestDb();
    await selectedWire(db);
    const toolbar = screen.getByTestId('selection-toolbar');
    fireEvent.click(within(toolbar).getByRole('button', { name: t('bench.deleteSelected') }));
    await expectRemoved();
    // With nothing selected the selection toolbar goes away.
    expect(screen.queryByTestId('selection-toolbar')).toBeNull();
  });

  it('goes through the store: one REMOVE_WIRE event carrying the wire', async () => {
    const db = await makeTestDb();
    await selectedWire(db);
    fireEvent.keyDown(wireEl('w1'), { key: 'Delete' });
    await expectRemoved();
    const events = await listEvents(db, store().session?.attemptId ?? '');
    const removed = events.filter((e) => e.actionType === 'REMOVE_WIRE');
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ targetId: 'w1', before: { id: 'w1', from: 'S.pos', to: 'R.a' } });
  });

  it('Undo brings the deleted wire back', async () => {
    const db = await makeTestDb();
    await selectedWire(db);
    fireEvent.keyDown(wireEl('w1'), { key: 'Delete' });
    await expectRemoved();
    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await screen.findByRole('button', { name: wireLabel(SUPPLY_POS, RESISTOR_LEFT) });
    expect(store().circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]);
  });

  it('is announced again when a second wire is deleted straight after the first', async () => {
    const db = await makeTestDb();
    await selectedWire(db);
    fireEvent.keyDown(wireEl('w1'), { key: 'Delete' });
    await waitFor(() => expect(liveText()).toBe(t('bench.wireRemoved')));
    const first = screen.getByTestId('live-region').textContent;
    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await screen.findByRole('button', { name: wireLabel(SUPPLY_POS, RESISTOR_LEFT) });
    fireEvent.keyDown(wireEl('w1'), { key: 'Delete' });
    await waitFor(() => expect(document.querySelector('[data-wire-id="w1"]')).toBeNull());
    // Same words, but the region's text changed, so a screen reader reads it out again.
    expect(screen.getByTestId('live-region').textContent).not.toBe(first);
    expect(liveText()).toBe(t('bench.wireRemoved'));
  });

  it('the live region is polite, atomic and visually hidden', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const region = screen.getByTestId('live-region');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.className).toContain('sr-only');
    expect(screen.getAllByTestId('live-region')).toHaveLength(1);
  });
});
