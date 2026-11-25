import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { listEvents } from '../../src/db/events';
import { t } from '../../src/i18n';
import { flushBenchWrites, useBenchStore } from '../../src/state';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  await flushBenchWrites();
  await disposeTestDbs();
  resetAppState();
});

const store = () => useBenchStore.getState();

async function openBench(db: LabXpertDB, id: 'ohms-law' | 'series-parallel' = 'ohms-law') {
  await seedUser(db, 'Asha');
  renderAppAt(db, `#/experiment/${id}`);
  await screen.findByRole('group', { name: t(`exp.${id}.title`) });
}

function tile(type: string): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(`[data-shelf-type="${type}"]`);
  if (found === null) throw new Error(`no shelf tile for ${type}`);
  return found;
}

/** A part's value and role badge are real text in the label layer over the bench (always 14 px or more), not inside the part. */
function chipOf(id: string): Element | null {
  return document.querySelector(`[data-part-chip="${id}"]`);
}

function part(id: string): SVGGElement | null {
  return document.querySelector<SVGGElement>(`[data-part-id="${id}"]`);
}

/** Enter on a tile, then wait until the part has been saved and drawn. */
async function placeByKeyboard(type: string, id: string) {
  fireEvent.keyDown(tile(type), { key: 'Enter' });
  await waitFor(() => expect(part(id)).not.toBeNull());
}

describe('Bench screen frame', () => {
  it('shows the experiment title as the page heading, the shelf, the toolbar, the status strip and the dock', async () => {
    const db = await makeTestDb();
    await openBench(db);
    expect(screen.getByRole('heading', { level: 1, name: t('exp.ohms-law.title') })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: t('bench.shelfTitle') })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('bench.undo') })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('bench.reset') })).toBeTruthy();
    expect(screen.getByTestId('bench-status')).toBeTruthy();
    expect(screen.getByRole('region', { name: t('bench.readings') })).toBeTruthy();
  });

  it('shows the not-found screen for an unknown experiment', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    renderAppAt(db, '#/experiment/no-such-experiment');
    expect(await screen.findByRole('heading', { name: t('error.notFoundTitle') })).toBeTruthy();
  });

  it('opens with the tutor panel collapsed in a narrow window and expands it on request', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const panel = screen.getByRole('complementary', { name: t('bench.panelTitle') });
    // jsdom's window is 1024 px wide, below the 1200 px threshold.
    expect(panel.getAttribute('data-collapsed')).toBe('true');
    fireEvent.click(within(panel).getByRole('button', { name: t('bench.showPanel') }));
    expect(panel.getAttribute('data-collapsed')).toBe('false');
    expect(within(panel).getByRole('heading', { name: t('bench.panelTitle') })).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: t('bench.hidePanel') }));
    expect(panel.getAttribute('data-collapsed')).toBe('true');
  });

  it('starts an attempt for the learner when there is none', async () => {
    const db = await makeTestDb();
    await openBench(db);
    expect(await db.attempts.count()).toBe(1);
  });
});

describe('Shelf', () => {
  it('has one tile per allowed part, each with its name and its max badge', async () => {
    const db = await makeTestDb();
    await openBench(db);
    for (const type of ['supply', 'switch', 'resistor', 'ammeter', 'voltmeter'] as const) {
      // textContent, not getByText: the kit's supply drawing also contains the words "DC supply".
      expect(tile(type).textContent).toContain(t(`components.${type}`));
      expect(screen.getByTestId(`shelf-max-${type}`).textContent).toBe('1');
      expect(tile(type).disabled).toBe(false);
    }
    expect(tile('supply').querySelector('svg')).not.toBeNull();
  });

  it('shows ×2 for the resistors in series and parallel', async () => {
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    expect(screen.getByTestId('shelf-max-resistor').textContent).toBe('2');
  });

  it('Enter places the part, and at max the tile says All placed and is disabled', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    await waitFor(() => expect(tile('supply').disabled).toBe(true));
    expect(within(tile('supply')).getByText(t('bench.shelfFull'))).toBeTruthy();
    expect(tile('switch').disabled).toBe(false);
    expect(store().circuit.components).toHaveLength(1);
  });

  it('Enter on a disabled tile places nothing', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    await waitFor(() => expect(tile('supply').disabled).toBe(true));
    fireEvent.keyDown(tile('supply'), { key: 'Enter' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store().circuit.components).toHaveLength(1);
  });

  it('re-enables the tile once the part is removed', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    await waitFor(() => expect(tile('supply').disabled).toBe(true));
    const target = part('S');
    if (target === null) throw new Error('no part');
    fireEvent.keyDown(target, { key: 'Delete' });
    await waitFor(() => expect(tile('supply').disabled).toBe(false));
    expect(within(tile('supply')).queryByText(t('bench.shelfFull'))).toBeNull();
  });

  it('keeps the second resistor available until both are placed', async () => {
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    await placeByKeyboard('resistor', 'R1');
    expect(tile('resistor').disabled).toBe(false);
    await placeByKeyboard('resistor', 'R2');
    await waitFor(() => expect(tile('resistor').disabled).toBe(true));
  });

  it('places a dragged tile where it is dropped, with the part centred on the pointer', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const svg = screen.getByRole('group', { name: t('exp.ohms-law.title') });
    // jsdom has no layout: say the bench is drawn 1:1 at the top left of the page.
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1100, bottom: 648, width: 1100, height: 648, x: 0, y: 0, toJSON: () => ({}),
    });
    fireEvent.pointerDown(tile('supply'), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 500, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 500, clientY: 300 });
    await waitFor(() => expect(part('S')).not.toBeNull());
    expect(store().circuit.components[0]).toMatchObject({ x: 400, y: 234 });
  });

  it('ignores a drop outside the bench', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const svg = screen.getByRole('group', { name: t('exp.ohms-law.title') });
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 300, top: 100, right: 1400, bottom: 748, width: 1100, height: 648, x: 300, y: 100, toJSON: () => ({}),
    });
    fireEvent.pointerDown(tile('supply'), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 300 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store().circuit.components).toHaveLength(0);
  });

  it('places one part for a tap: a press that moves under 6 px, then the click the browser sends', async () => {
    const db = await makeTestDb();
    await openBench(db);
    fireEvent.pointerDown(tile('supply'), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 13, clientY: 12 });
    fireEvent.pointerUp(window, { clientX: 13, clientY: 12 });
    fireEvent.click(tile('supply'));
    await waitFor(() => expect(part('S')).not.toBeNull());
    expect(store().circuit.components).toHaveLength(1);
  });

  it('places one part for a plain click with no pointer events (assistive technology)', async () => {
    const db = await makeTestDb();
    await openBench(db);
    fireEvent.click(tile('supply'));
    await waitFor(() => expect(part('S')).not.toBeNull());
    expect(store().circuit.components).toHaveLength(1);
  });

  it('a drag does not also place a part at the next free spot, even when released over the tile', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const svg = screen.getByRole('group', { name: t('exp.ohms-law.title') });
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 300, top: 100, right: 1400, bottom: 748, width: 1100, height: 648, x: 300, y: 100, toJSON: () => ({}),
    });
    fireEvent.pointerDown(tile('supply'), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 300 });
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 });
    fireEvent.click(tile('supply'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(store().circuit.components).toHaveLength(0);
    // The next plain click is a tap again.
    fireEvent.click(tile('supply'));
    await waitFor(() => expect(part('S')).not.toBeNull());
  });
});

describe('Workspace', () => {
  it('shows the empty state with the hint until the first part is placed', async () => {
    const db = await makeTestDb();
    await openBench(db);
    expect(screen.getByText(t('bench.benchHint'))).toBeTruthy();
    await placeByKeyboard('supply', 'S');
    expect(screen.queryByText(t('bench.benchHint'))).toBeNull();
  });

  it('draws the real component SVG: a resistor with its colour bands and value', async () => {
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    await placeByKeyboard('resistor', 'R1');
    await placeByKeyboard('resistor', 'R2');
    const r1 = part('R1');
    const r2 = part('R2');
    await waitFor(() => expect(chipOf('R1')?.textContent).toContain(t('bench.resistanceValue', { ohms: 10 })));
    expect(chipOf('R2')?.textContent).toContain(t('bench.resistanceValue', { ohms: 20 }));
    // R1 is 10 Ω: brown, black, black. R2 is 20 Ω: red, black, black.
    expect(r1?.innerHTML).toContain('#7B4A22');
    expect(r2?.innerHTML).toContain('#D64545');
    // Ids of the kit SVG are dropped, so two resistors never share an id.
    expect(document.querySelectorAll('#band-1')).toHaveLength(0);
  });

  it('selects a part on click and clears the selection on a click in empty space', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    store().select(undefined);
    const target = part('S');
    if (target === null) throw new Error('no part');
    fireEvent.pointerDown(target, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(target);
    expect(target.getAttribute('aria-pressed')).toBe('true');
    expect(target.querySelector('[stroke-dasharray]')).not.toBeNull();
    fireEvent.pointerDown(screen.getByRole('group', { name: t('exp.ohms-law.title') }), { button: 0 });
    expect(part('S')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('Delete removes the focused part and its event is logged', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    const target = part('S');
    if (target === null) throw new Error('no part');
    fireEvent.keyDown(target, { key: 'Delete' });
    await waitFor(() => expect(part('S')).toBeNull());
    const attemptId = store().session?.attemptId ?? '';
    const events = await listEvents(db, attemptId);
    expect(events.map((e) => e.actionType)).toEqual(['PLACE_COMPONENT', 'REMOVE_COMPONENT']);
    expect(screen.getByText(t('bench.benchHint'))).toBeTruthy();
  });

  it('the selection toolbar Remove button removes the selected part', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    // Placing selects the part, so the Remove button is already there.
    fireEvent.click(await screen.findByRole('button', { name: t('bench.deleteSelected') }));
    await waitFor(() => expect(part('S')).toBeNull());
    expect(screen.queryByRole('button', { name: t('bench.deleteSelected') })).toBeNull();
  });

  it('shows no Remove button when nothing is selected, and a disabled one for a locked part', async () => {
    const db = await makeTestDb();
    await openBench(db);
    expect(screen.queryByRole('button', { name: t('bench.deleteSelected') })).toBeNull();
    useBenchStore.setState({
      circuit: { components: [{ id: 'A', type: 'ammeter', x: 0, y: 0, locked: true }], wires: [] },
      selectedId: 'A',
    });
    const remove = await screen.findByRole<HTMLButtonElement>('button', { name: t('bench.deleteSelected') });
    expect(remove.disabled).toBe(true);
  });

  // The supply is left out on purpose: its arrow keys change the voltage (tests/screens/controls.test.tsx).
  it('arrow keys move the part by 12 units, Shift by 48, and never off the mat', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('switch', 'SW');
    const start = store().circuit.components[0];
    const target = part('SW');
    if (start === undefined || target === null) throw new Error('no part');
    fireEvent.keyDown(target, { key: 'ArrowRight' });
    fireEvent.keyDown(target, { key: 'ArrowDown', shiftKey: true });
    expect(store().circuit.components[0]).toMatchObject({ x: start.x + 12, y: start.y + 48 });
    for (let i = 0; i < 40; i += 1) fireEvent.keyDown(target, { key: 'ArrowLeft', shiftKey: true });
    expect(store().circuit.components[0]?.x).toBe(0);
    expect(part('SW')?.getAttribute('transform')).toContain('translate(0 ');
  });

  it('a mouse drag moves the part without logging an event, and Undo puts it back', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    const svg = screen.getByRole('group', { name: t('exp.ohms-law.title') });
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1100, bottom: 648, width: 1100, height: 648, x: 0, y: 0, toJSON: () => ({}),
    });
    const start = store().circuit.components[0];
    const target = part('S');
    if (start === undefined || target === null) throw new Error('no part');
    fireEvent.pointerDown(target, { button: 0, pointerId: 1, clientX: start.x + 20, clientY: start.y + 20 });
    fireEvent.pointerMove(target, { pointerId: 1, clientX: start.x + 220, clientY: start.y + 120 });
    fireEvent.pointerUp(target, { pointerId: 1 });
    expect(store().circuit.components[0]).toMatchObject({ x: start.x + 200, y: start.y + 100 });
    const events = await listEvents(db, store().session?.attemptId ?? '');
    expect(events.map((e) => e.actionType)).toEqual(['PLACE_COMPONENT']);
    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await waitFor(() => expect(store().circuit.components[0]).toMatchObject({ x: start.x, y: start.y }));
  });

  it('Escape clears the selection', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    const target = part('S');
    if (target === null) throw new Error('no part');
    fireEvent.keyDown(target, { key: 'Escape' });
    expect(store().selectedId).toBeUndefined();
  });

  it('marks a locked part with a lock badge and keeps it where it is', async () => {
    const db = await makeTestDb();
    await openBench(db);
    useBenchStore.setState({
      circuit: { components: [{ id: 'A', type: 'ammeter', x: 40, y: 40, locked: true }], wires: [] },
    });
    const target = await waitFor(() => {
      const found = part('A');
      if (found === null) throw new Error('not drawn yet');
      return found;
    });
    expect(target.querySelector('circle.fill-ink')).not.toBeNull();
    fireEvent.keyDown(target, { key: 'ArrowRight' });
    fireEvent.keyDown(target, { key: 'Delete' });
    expect(store().circuit.components[0]).toMatchObject({ x: 40, y: 40 });
    expect(part('A')).not.toBeNull();
  });
});

describe('Toolbar and status strip', () => {
  it('starts with Undo and Clear bench disabled, and enables them after a part is placed', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const undo = screen.getByRole<HTMLButtonElement>('button', { name: t('bench.undo') });
    const clear = screen.getByRole<HTMLButtonElement>('button', { name: t('bench.reset') });
    expect(undo.disabled).toBe(true);
    expect(clear.disabled).toBe(true);
    await placeByKeyboard('supply', 'S');
    await waitFor(() => expect(undo.disabled).toBe(false));
    expect(clear.disabled).toBe(false);
  });

  it('Undo removes the last placed part and logs UNDO, then disables itself', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await waitFor(() => expect(part('S')).toBeNull());
    const events = await listEvents(db, store().session?.attemptId ?? '');
    expect(events.map((e) => e.actionType)).toEqual(['PLACE_COMPONENT', 'UNDO']);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: t('bench.undo') }).disabled).toBe(true);
    expect(screen.getByText(t('bench.benchHint'))).toBeTruthy();
  });

  it('Clear bench asks first, and Keep working leaves everything as it was', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    fireEvent.click(screen.getByRole('button', { name: t('bench.reset') }));
    const dialog = await screen.findByRole('dialog', { name: t('bench.resetConfirmTitle') });
    expect(within(dialog).getByText(t('bench.resetConfirmBody'))).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: t('bench.resetConfirmNo') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(part('S')).not.toBeNull();
    const events = await listEvents(db, store().session?.attemptId ?? '');
    expect(events.map((e) => e.actionType)).toEqual(['PLACE_COMPONENT']);
  });

  it('the first button in the dialog is the safe one and has focus', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    fireEvent.click(screen.getByRole('button', { name: t('bench.reset') }));
    const dialog = await screen.findByRole('dialog');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: t('bench.resetConfirmNo') }));
  });

  it('Escape closes the dialog without clearing', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    fireEvent.click(screen.getByRole('button', { name: t('bench.reset') }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(part('S')).not.toBeNull();
  });

  it('confirming Clear bench empties the bench, logs RESET_BENCH and brings the empty state back', async () => {
    const db = await makeTestDb();
    await openBench(db);
    await placeByKeyboard('supply', 'S');
    await placeByKeyboard('switch', 'SW');
    fireEvent.click(screen.getByRole('button', { name: t('bench.reset') }));
    const dialog = await screen.findByRole('dialog', { name: t('bench.resetConfirmTitle') });
    fireEvent.click(within(dialog).getByRole('button', { name: t('bench.resetConfirmYes') }));
    await waitFor(() => expect(store().circuit.components).toHaveLength(0));
    const events = await listEvents(db, store().session?.attemptId ?? '');
    expect(events.map((e) => e.actionType)).toEqual(['PLACE_COMPONENT', 'PLACE_COMPONENT', 'RESET_BENCH']);
    expect(screen.getByText(t('bench.benchHint'))).toBeTruthy();
    expect(tile('supply').disabled).toBe(false);
  });

  it('shows the switch state and the supply voltage once those parts are on the bench', async () => {
    const db = await makeTestDb();
    await openBench(db);
    const strip = screen.getByTestId('bench-status');
    expect(within(strip).queryByText(t('bench.switchOpen'))).toBeNull();
    await placeByKeyboard('supply', 'S');
    await placeByKeyboard('switch', 'SW');
    expect(within(strip).getByText(t('bench.switchOpen'))).toBeTruthy();
    expect(within(strip).getByText(t('bench.supplyVoltage'))).toBeTruthy();
    expect(within(strip).getByText('0 V')).toBeTruthy();
  });
});

describe('Resume after a reload', () => {
  it('shows the same bench again: parts, roles and positions, with an empty undo', async () => {
    const db = await makeTestDb();
    await openBench(db, 'series-parallel');
    await placeByKeyboard('resistor', 'R1');
    await placeByKeyboard('resistor', 'R2');
    await waitFor(() => expect(tile('resistor').disabled).toBe(true));
    const placed = store().circuit.components;
    await flushBenchWrites();
    // A reload: the page and the in-memory store are gone, the db stays.
    cleanup();
    resetAppState();
    renderAppAt(db, '#/experiment/series-parallel');
    await waitFor(() => expect(part('R2')).not.toBeNull());
    expect(store().circuit.components).toEqual(placed);
    await waitFor(() => expect(chipOf('R1')?.textContent).toContain(t('bench.resistanceValue', { ohms: 10 })));
    expect(chipOf('R2')?.textContent).toContain(t('bench.resistanceValue', { ohms: 20 }));
    expect(tile('resistor').disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: t('bench.undo') }).disabled).toBe(true);
    expect(await db.attempts.count()).toBe(1);
  });
});
