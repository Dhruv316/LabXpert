import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BENCH_VIEW } from '../../src/bench/catalog';
import { knobAngle } from '../../src/bench/live';
import { CONTROL_MIN_PX } from '../../src/bench/overlay';
import type { LabXpertDB } from '../../src/db/database';
import { listEvents } from '../../src/db/events';
import { t } from '../../src/i18n';
import tokens from '../../src/spec/design-tokens.json';
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
const svg = () => screen.getByRole('group', { name: TITLE });
const NBSP = /\u00a0/g;
const liveText = () => (screen.getByTestId('live-region').textContent ?? '').replace(NBSP, '');

function chipOf(id: string): Element {
  const found = document.querySelector(`[data-part-chip="${id}"]`);
  if (found === null) throw new Error(`no label for ${id}`);
  return found;
}

function partEl(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-part-id="${id}"]`);
  if (found === null) throw new Error(`no part ${id}`);
  return found;
}

const switchPart = () => store().circuit.components.find((c) => c.type === 'switch');
const supplyPart = () => store().circuit.components.find((c) => c.type === 'supply');
function closedNow(): boolean | undefined {
  const part = switchPart();
  return part?.type === 'switch' ? part.closed : undefined;
}

function voltageNow(): number | undefined {
  const part = supplyPart();
  return part?.type === 'supply' ? part.voltage : undefined;
}

function rect(width: number, height: number) {
  return { left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) };
}

/** The SVG's rectangle is exactly the scene, so client pixels equal mat units (scale 1). */
function mockSvgRect() {
  vi.spyOn(svg(), 'getBoundingClientRect').mockReturnValue(rect(BENCH_VIEW.width, BENCH_VIEW.height));
}

/** A bench with a supply and a switch (and no wires): the supply at (100, 100), the switch at (400, 100). */
async function openWithSupplyAndSwitch(db: LabXpertDB) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
  await store().place('supply', { x: 100, y: 100 });
  await store().place('switch', { x: 400, y: 100 });
  await waitFor(() => expect(document.querySelector('[data-part-id="SW"]')).not.toBeNull());
}

async function eventTypes(db: LabXpertDB) {
  return (await listEvents(db, store().session?.attemptId ?? '')).map((e) => e.actionType);
}

const press = (el: Element, x: number, y: number) => fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: x, clientY: y });
const moveTo = (el: Element, x: number, y: number) => fireEvent.pointerMove(el, { pointerId: 1, clientX: x, clientY: y });
const release = (el: Element, x: number, y: number) => fireEvent.pointerUp(el, { pointerId: 1, clientX: x, clientY: y });

function click(el: Element, x = 450, y = 130) {
  press(el, x, y);
  release(el, x, y);
}

const raise = () => screen.getByRole<HTMLButtonElement>('button', { name: t('bench.supplyUp') });
const lower = () => screen.getByRole<HTMLButtonElement>('button', { name: t('bench.supplyDown') });

describe('Switch', () => {
  it('is a switch with a checked state, named by its state', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    const open = screen.getByRole('switch', { name: t('bench.switchOpen') });
    expect(open).toBe(partEl('SW'));
    expect(open.getAttribute('aria-checked')).toBe('false');
    expect(open.getAttribute('tabindex')).toBe('0');
    expect(open.hasAttribute('aria-pressed')).toBe(false);
  });

  it('a click toggles it, saves it and logs TOGGLE_SWITCH with before and after', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    click(partEl('SW'));
    await waitFor(() => expect(closedNow()).toBe(true));
    const events = await listEvents(db, store().session?.attemptId ?? '');
    const toggle = events.find((e) => e.actionType === 'TOGGLE_SWITCH');
    expect(toggle).toMatchObject({ targetId: 'SW', before: { closed: false }, after: { closed: true } });
    expect(screen.getByRole('switch', { name: t('bench.switchClosed') }).getAttribute('aria-checked')).toBe('true');
    click(partEl('SW'));
    await waitFor(() => expect(closedNow()).toBe(false));
    expect((await eventTypes(db)).filter((type) => type === 'TOGGLE_SWITCH')).toHaveLength(2);
  });

  it('a press that moves under 6 px is still a click, and the part stays where it was', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    mockSvgRect();
    const sw = partEl('SW');
    press(sw, 450, 130);
    moveTo(sw, 453, 132);
    release(sw, 453, 132);
    await waitFor(() => expect(closedNow()).toBe(true));
    expect(switchPart()).toMatchObject({ x: 400, y: 100 });
  });

  it('a drag moves the part and never toggles it', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    mockSvgRect();
    const sw = partEl('SW');
    press(sw, 450, 130);
    moveTo(sw, 520, 190);
    release(sw, 520, 190);
    await flushBenchWrites();
    expect(switchPart()).toMatchObject({ x: 470, y: 160, closed: false });
    expect(await eventTypes(db)).not.toContain('TOGGLE_SWITCH');
  });

  it('a drag that comes back to where it started does not toggle either', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    mockSvgRect();
    const sw = partEl('SW');
    press(sw, 450, 130);
    moveTo(sw, 500, 130);
    moveTo(sw, 450, 130);
    release(sw, 450, 130);
    await flushBenchWrites();
    expect(closedNow()).toBe(false);
    expect(await eventTypes(db)).not.toContain('TOGGLE_SWITCH');
  });

  it('a cancelled press does not toggle', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    const sw = partEl('SW');
    press(sw, 450, 130);
    fireEvent.pointerCancel(sw, { pointerId: 1 });
    await flushBenchWrites();
    expect(closedNow()).toBe(false);
  });

  it('a right-button press does nothing', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    const sw = partEl('SW');
    fireEvent.pointerDown(sw, { button: 2, pointerId: 1, clientX: 450, clientY: 130 });
    fireEvent.pointerUp(sw, { button: 2, pointerId: 1, clientX: 450, clientY: 130 });
    await flushBenchWrites();
    expect(closedNow()).toBe(false);
  });

  it('Enter and Space toggle it, and a held key does not flicker it', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    const sw = partEl('SW');
    fireEvent.keyDown(sw, { key: 'Enter' });
    await waitFor(() => expect(closedNow()).toBe(true));
    fireEvent.keyDown(sw, { key: ' ' });
    await waitFor(() => expect(closedNow()).toBe(false));
    fireEvent.keyDown(sw, { key: 'Enter', repeat: true });
    await flushBenchWrites();
    expect(closedNow()).toBe(false);
    expect((await eventTypes(db)).filter((type) => type === 'TOGGLE_SWITCH')).toHaveLength(2);
  });

  it('announces the new state politely, and says it again for the same state later', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    expect(screen.getByTestId('live-region').getAttribute('aria-live')).toBe('polite');
    const sw = partEl('SW');
    fireEvent.keyDown(sw, { key: 'Enter' });
    await waitFor(() => expect(liveText()).toBe(t('bench.switchClosed')));
    fireEvent.keyDown(sw, { key: 'Enter' });
    await waitFor(() => expect(liveText()).toBe(t('bench.switchOpen')));
  });

  it('closing it logs TOGGLE_SWITCH and then one SWITCH_CLOSE check; opening it checks nothing', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(closedNow()).toBe(true));
    await flushBenchWrites();
    expect(await eventTypes(db)).toEqual(['PLACE_COMPONENT', 'PLACE_COMPONENT', 'TOGGLE_SWITCH', 'CHECKPOINT']);
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(closedNow()).toBe(false));
    await flushBenchWrites();
    expect(await eventTypes(db)).toEqual([
      'PLACE_COMPONENT',
      'PLACE_COMPONENT',
      'TOGGLE_SWITCH',
      'CHECKPOINT',
      'TOGGLE_SWITCH',
    ]);
  });

  it('can still be toggled when the part is locked, but not moved', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    useBenchStore.setState({ circuit: { components: [{ id: 'SW', type: 'switch', x: 400, y: 100, closed: false, locked: true }], wires: [] } });
    mockSvgRect();
    const sw = partEl('SW');
    press(sw, 450, 130);
    moveTo(sw, 560, 230);
    release(sw, 560, 230);
    await flushBenchWrites();
    expect(closedNow()).toBe(false);
    expect(switchPart()).toMatchObject({ x: 400, y: 100 });
    click(sw);
    await waitFor(() => expect(closedNow()).toBe(true));
    expect(switchPart()).toMatchObject({ x: 400, y: 100 });
  });
});

describe('Switch blade', () => {
  const blade = () => {
    const found = partEl('SW').querySelector<SVGGElement>('[data-blade]');
    if (found === null) throw new Error('no blade');
    return found;
  };

  it('is drawn open (-25°) and closed (0°) with the angle from bladeAngle', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    expect(blade().getAttribute('data-blade-angle')).toBe('-25');
    expect(blade().style.transform).toBe('rotate(-25deg)');
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(blade().getAttribute('data-blade-angle')).toBe('0'));
    expect(blade().style.transform).toBe('rotate(0deg)');
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(blade().getAttribute('data-blade-angle')).toBe('-25'));
  });

  it('does not animate its first placement, then turns in the base duration with the easing token', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    expect(blade().style.transition).toBe('none');
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(blade().getAttribute('data-blade-angle')).toBe('0'));
    expect(blade().style.transition).toContain(`${tokens.motion.base}ms`);
    expect(blade().style.transition).toContain(tokens.motion.easing);
  });

  it('does not animate at all under reduced motion', async () => {
    const db = await makeTestDb();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    await openWithSupplyAndSwitch(db);
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(blade().getAttribute('data-blade-angle')).toBe('0'));
    expect(blade().style.transition).toBe('none');
  });

  it('is drawn in the right position again after a reload', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(closedNow()).toBe(true));
    await flushBenchWrites();
    cleanup();
    resetAppState();
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: TITLE });
    await waitFor(() => expect(document.querySelector('[data-part-id="SW"]')).not.toBeNull());
    expect(partEl('SW').getAttribute('aria-checked')).toBe('true');
    expect(blade().getAttribute('data-blade-angle')).toBe('0');
    expect(blade().style.transition).toBe('none');
  });
});

describe('Supply stepper', () => {
  it('sits in the control overlay, with a Lower and a Raise button named from the strings', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    const overlay = screen.getByTestId('control-overlay');
    expect(within(overlay).getByRole('button', { name: t('bench.supplyDown') })).toBe(lower());
    expect(within(overlay).getByRole('button', { name: t('bench.supplyUp') })).toBe(raise());
    expect(within(overlay).getByRole('group', { name: t('bench.supplyVoltage') })).toBeTruthy();
  });

  it('Raise and Lower change the voltage by 1 V and log SET_VALUE', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.click(raise());
    await waitFor(() => expect(voltageNow()).toBe(1));
    fireEvent.click(raise());
    await waitFor(() => expect(voltageNow()).toBe(2));
    fireEvent.click(lower());
    await waitFor(() => expect(voltageNow()).toBe(1));
    const events = (await listEvents(db, store().session?.attemptId ?? '')).filter((e) => e.actionType === 'SET_VALUE');
    expect(events.map((e) => [e.targetId, e.before, e.after])).toEqual([
      ['S', { voltage: 0 }, { voltage: 1 }],
      ['S', { voltage: 1 }, { voltage: 2 }],
      ['S', { voltage: 2 }, { voltage: 1 }],
    ]);
  });

  it('works from the keyboard on the buttons (Enter and Space)', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.keyDown(raise(), { key: 'Enter' });
    await waitFor(() => expect(voltageNow()).toBe(1));
    fireEvent.keyDown(raise(), { key: ' ' });
    fireEvent.keyUp(raise(), { key: ' ' });
    await waitFor(() => expect(voltageNow()).toBe(2));
  });

  it('Lower is disabled at the minimum and Raise at the maximum', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    expect(lower().disabled).toBe(true);
    expect(raise().disabled).toBe(false);
    await store().setSupplyVoltage('S', 12);
    await waitFor(() => expect(raise().disabled).toBe(true));
    expect(lower().disabled).toBe(false);
    await store().setSupplyVoltage('S', 11);
    await waitFor(() => expect(raise().disabled).toBe(false));
  });

  it('a disabled button does nothing, and no event is logged', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.click(lower());
    await flushBenchWrites();
    expect(voltageNow()).toBe(0);
    expect(await eventTypes(db)).not.toContain('SET_VALUE');
  });

  it('moves focus to the other button when the focused one reaches its limit', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    await store().setSupplyVoltage('S', 11);
    await waitFor(() => expect(raise().disabled).toBe(false));
    raise().focus();
    fireEvent.click(raise());
    await waitFor(() => expect(voltageNow()).toBe(12));
    await waitFor(() => expect(document.activeElement).toBe(lower()));
  });

  it('is disabled for a supply whose value is locked', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    useBenchStore.setState({ circuit: { components: [{ id: 'S', type: 'supply', x: 100, y: 100, voltage: 3, valueLocked: true }], wires: [] } });
    await waitFor(() => expect(raise().disabled).toBe(true));
    expect(lower().disabled).toBe(true);
    fireEvent.keyDown(partEl('S'), { key: 'ArrowUp' });
    await flushBenchWrites();
    expect(voltageNow()).toBe(3);
  });

  it('announces the new voltage politely on each change', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.click(raise());
    await waitFor(() => expect(liveText()).toBe(t('bench.supplyAnnounce', { volts: 1 })));
    fireEvent.click(raise());
    await waitFor(() => expect(liveText()).toBe(t('bench.supplyAnnounce', { volts: 2 })));
    fireEvent.click(lower());
    await waitFor(() => expect(liveText()).toBe(t('bench.supplyAnnounce', { volts: 1 })));
  });

  it('runs no check: only SET_VALUE is logged', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.click(raise());
    await waitFor(() => expect(voltageNow()).toBe(1));
    expect(await eventTypes(db)).toEqual(['PLACE_COMPONENT', 'PLACE_COMPONENT', 'SET_VALUE']);
  });

  it('pressing a stepper button leaves the selected part selected', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    store().select('SW');
    fireEvent.pointerDown(raise(), { button: 0, pointerId: 1 });
    expect(store().selectedId).toBe('SW');
  });
});

describe('Supply arrow keys', () => {
  it('Up and Right raise the voltage, Down and Left lower it', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    const supply = partEl('S');
    fireEvent.keyDown(supply, { key: 'ArrowUp' });
    await waitFor(() => expect(voltageNow()).toBe(1));
    fireEvent.keyDown(supply, { key: 'ArrowRight' });
    await waitFor(() => expect(voltageNow()).toBe(2));
    fireEvent.keyDown(supply, { key: 'ArrowDown' });
    await waitFor(() => expect(voltageNow()).toBe(1));
    fireEvent.keyDown(supply, { key: 'ArrowLeft' });
    await waitFor(() => expect(voltageNow()).toBe(0));
    expect(supplyPart()).toMatchObject({ x: 100, y: 100 });
  });

  it('stop at the minimum and the maximum without logging anything', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.keyDown(partEl('S'), { key: 'ArrowDown' });
    await flushBenchWrites();
    expect(voltageNow()).toBe(0);
    await store().setSupplyVoltage('S', 12);
    await waitFor(() => expect(voltageNow()).toBe(12));
    fireEvent.keyDown(partEl('S'), { key: 'ArrowUp' });
    await flushBenchWrites();
    expect(voltageNow()).toBe(12);
    expect((await eventTypes(db)).filter((type) => type === 'SET_VALUE')).toHaveLength(1);
  });

  it('a burst of presses (a held key) is not lost', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    const supply = partEl('S');
    for (let i = 0; i < 5; i += 1) fireEvent.keyDown(supply, { key: 'ArrowUp' });
    await waitFor(() => expect(voltageNow()).toBe(5));
    expect((await eventTypes(db)).filter((type) => type === 'SET_VALUE')).toHaveLength(5);
  });

  it('also work while the stepper buttons have focus', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.keyDown(raise(), { key: 'ArrowUp' });
    await waitFor(() => expect(voltageNow()).toBe(1));
    fireEvent.keyDown(lower(), { key: 'ArrowLeft' });
    await waitFor(() => expect(voltageNow()).toBe(0));
  });

  it('on the stepper leave browser shortcuts alone (Alt + Left is "back")', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    await store().setSupplyVoltage('S', 5);
    await waitFor(() => expect(voltageNow()).toBe(5));
    const notPrevented = fireEvent.keyDown(raise(), { key: 'ArrowLeft', altKey: true });
    await flushBenchWrites();
    expect(notPrevented).toBe(true);
    expect(voltageNow()).toBe(5);
  });

  it('Shift and an arrow still move the supply, by 12 units, and change no voltage', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.keyDown(partEl('S'), { key: 'ArrowRight', shiftKey: true });
    await waitFor(() => expect(supplyPart()).toMatchObject({ x: 112, y: 100, voltage: 0 }));
    expect(await eventTypes(db)).not.toContain('SET_VALUE');
  });
});

describe('Supply display and knob', () => {
  const texts = () => [chipOf('S').textContent];
  const knobTransform = () => partEl('S').querySelector('line')?.parentElement?.getAttribute('transform');

  it('start at the default: "0 V" and the knob at -135°', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    expect(texts()).toContain(t('bench.supplyValue', { volts: 0 }));
    expect(knobTransform()).toBe('rotate(-135 148 52)');
  });

  it('follow the voltage: the text comes from supplyValue and the knob from knobAngle', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    for (const volts of [3, 6, 12]) {
      await store().setSupplyVoltage('S', volts);
      await waitFor(() => expect(texts()).toContain(t('bench.supplyValue', { volts })));
      expect(knobTransform()).toBe(`rotate(${knobAngle(volts, 0, 12)} 148 52)`);
    }
    expect(knobTransform()).toBe('rotate(135 148 52)');
  });

  it('follow the arrow keys and the stepper too', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.keyDown(partEl('S'), { key: 'ArrowUp' });
    fireEvent.click(raise());
    await waitFor(() => expect(texts()).toContain(t('bench.supplyValue', { volts: 2 })));
    expect(knobTransform()).toBe(`rotate(${knobAngle(2, 0, 12)} 148 52)`);
  });
});

describe('Status strip', () => {
  const strip = () => screen.getByTestId('bench-status');

  it('shows the switch state with its text, and the supply voltage worded by supplyValue', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    expect(within(strip()).getByText(t('bench.switchOpen'))).toBeTruthy();
    expect(within(strip()).getByText(t('bench.supplyVoltage'))).toBeTruthy();
    expect(within(strip()).getByText(t('bench.supplyValue', { volts: 0 }))).toBeTruthy();
  });

  it('updates at once when the switch or the supply changes', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(within(strip()).getByText(t('bench.switchClosed'))).toBeTruthy());
    expect(within(strip()).queryByText(t('bench.switchOpen'))).toBeNull();
    fireEvent.click(raise());
    await waitFor(() => expect(within(strip()).getByText(t('bench.supplyValue', { volts: 1 }))).toBeTruthy());
  });
});

describe('Undo and reload', () => {
  it('Undo reverts a switch change, then a voltage change, and logs UNDO', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(closedNow()).toBe(true));
    fireEvent.click(raise());
    await waitFor(() => expect(voltageNow()).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await waitFor(() => expect(voltageNow()).toBe(0));
    expect(closedNow()).toBe(true);
    expect(partEl('SW').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await waitFor(() => expect(closedNow()).toBe(false));
    expect(partEl('SW').getAttribute('aria-checked')).toBe('false');
    expect((await eventTypes(db)).filter((type) => type === 'UNDO')).toHaveLength(2);
  });

  it('keeps a switch change and a voltage change after a reload', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(closedNow()).toBe(true));
    for (let i = 0; i < 4; i += 1) fireEvent.click(raise());
    await waitFor(() => expect(voltageNow()).toBe(4));
    await flushBenchWrites();

    cleanup();
    resetAppState();
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: TITLE });
    await waitFor(() => expect(document.querySelector('[data-part-id="S"]')).not.toBeNull());
    expect(partEl('SW').getAttribute('aria-checked')).toBe('true');
    expect(chipOf('S').textContent).toBe(t('bench.supplyValue', { volts: 4 }));
    expect(within(screen.getByTestId('bench-status')).getByText(t('bench.switchClosed'))).toBeTruthy();
    expect(within(screen.getByTestId('bench-status')).getByText(t('bench.supplyValue', { volts: 4 }))).toBeTruthy();
  });
});

describe('Control overlay', () => {
  const overlay = () => screen.getByTestId('control-overlay');
  const slot = () => {
    const found = document.querySelector<HTMLElement>('[data-overlay-slot="supply:S"]');
    if (found === null) throw new Error('no slot');
    return found;
  };

  /** Pretend the layer was laid out at this size, then let it measure again (jsdom has no ResizeObserver, so the window event does it). */
  function layOut(width: number, height: number) {
    vi.spyOn(overlay(), 'getBoundingClientRect').mockReturnValue(rect(width, height));
    fireEvent(window, new Event('resize'));
  }

  it('keeps every control at 44 × 44 px or more (the class rule) whatever the bench scale', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    expect(CONTROL_MIN_PX).toBe(44);
    const buttons = within(overlay()).getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const button of buttons) {
      expect(button.className).toContain('min-h-[44px]');
      expect(button.className).toContain('min-w-[44px]');
    }
    layOut(550, 324); // the bench at half size: the controls do not shrink with it
    for (const button of within(overlay()).getAllByRole('button')) {
      expect(button.className).toContain('min-h-[44px]');
      expect(button.className).toContain('min-w-[44px]');
    }
  });

  it('places the stepper under the supply from its mat coordinates', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    layOut(BENCH_VIEW.width, BENCH_VIEW.height);
    await waitFor(() => expect(slot().style.left).toBe('200px'));
    expect(slot().style.top).toBe('240px'); // 100 + the supply's 132 + an 8 px gap
    expect(slot().getAttribute('data-edge')).toBe('below');
  });

  it('scales its position with the bench (half size) but not its buttons', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    layOut(550, 324);
    await waitFor(() => expect(slot().style.left).toBe('100px'));
    expect(slot().style.top).toBe('124px'); // 232 × 0.5 + 8
  });

  it('follows a part that is nudged, dragged and undone', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    layOut(BENCH_VIEW.width, BENCH_VIEW.height);
    await waitFor(() => expect(slot().style.left).toBe('200px'));

    await store().nudge('S', 48, 0);
    await waitFor(() => expect(slot().style.left).toBe('248px'));

    mockSvgRect();
    press(partEl('S'), 150, 130);
    moveTo(partEl('S'), 250, 230);
    await waitFor(() => expect(slot().style.left).toBe('348px'));
    expect(slot().style.top).toBe('340px');
    release(partEl('S'), 250, 230);
    await flushBenchWrites();

    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await waitFor(() => expect(slot().style.left).toBe('248px'));
  });

  it('goes above a part at the bottom of the mat, so it stays on screen', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    layOut(BENCH_VIEW.width, BENCH_VIEW.height);
    await store().nudge('S', 0, 400);
    await waitFor(() => expect(slot().getAttribute('data-edge')).toBe('above'));
    expect(slot().style.bottom).not.toBe('');
  });

  it('goes away with its part', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    await store().remove('S');
    await waitFor(() => expect(document.querySelector('[data-overlay-slot="supply:S"]')).toBeNull());
    expect(screen.queryByRole('button', { name: t('bench.supplyUp') })).toBeNull();
  });

  it('lets the pointer through: the layer and its slots ignore it, only the buttons take it', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    expect(overlay().className).toContain('pointer-events-none');
    expect(slot().className).toContain('pointer-events-none');
    expect(slot().parentElement).toBe(overlay());
    for (const button of within(overlay()).getAllByRole('button')) expect(button.className).toContain('pointer-events-auto');
    // The group around the two buttons is not a hit target either.
    expect(within(overlay()).getByRole('group').className).not.toContain('pointer-events-auto');
  });

  it('does not stop a part being dragged or selected while the overlay is there', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    mockSvgRect();
    store().select(undefined);
    press(partEl('S'), 150, 130);
    expect(store().selectedId).toBe('S');
    moveTo(partEl('S'), 250, 180);
    release(partEl('S'), 250, 180);
    await flushBenchWrites();
    expect(supplyPart()).toMatchObject({ x: 200, y: 150 });
    // A press on empty mat still clears the selection.
    fireEvent.pointerDown(svg(), { button: 0, pointerId: 1 });
    expect(store().selectedId).toBeUndefined();
  });

  it('keeps the tab order: parts and terminals first, then the stepper', async () => {
    const db = await makeTestDb();
    await openWithSupplyAndSwitch(db);
    const order = Array.from(document.querySelectorAll('[data-part-id], [data-terminal-ref], [data-supply-stepper] button'));
    const lastTerminal = order.map((el) => el.hasAttribute('data-terminal-ref')).lastIndexOf(true);
    const firstStep = order.findIndex((el) => el.tagName.toLowerCase() === 'button');
    expect(lastTerminal).toBeGreaterThanOrEqual(0);
    expect(firstStep).toBeGreaterThan(lastTerminal);
  });
});
