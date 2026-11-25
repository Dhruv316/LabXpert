import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BENCH_VIEW } from '../../src/bench/catalog';
import { terminalPosition } from '../../src/bench/wires';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { Circuit, CircuitComponent, TerminalRef } from '../../src/model/types';
import componentsSpec from '../../src/spec/components.json';
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

// The two colours come from the spec's own sentence about the light, so no colour is typed here.
const LIGHT_SPEC = componentsSpec.components.supply.dynamicElements['overload-light'];
const LIGHT_ON = /(#[0-9A-Fa-f]{6}) on\b/.exec(LIGHT_SPEC)?.[1];
const LIGHT_OFF = /(#[0-9A-Fa-f]{6}) off\b/.exec(LIGHT_SPEC)?.[1];

function byTestId(id: string): Element {
  const found = document.querySelector(`[data-testid="${id}"]`);
  if (found === null) throw new Error(`no ${id}`);
  return found;
}
function partEl(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-part-id="${id}"]`);
  if (found === null) throw new Error(`no part ${id}`);
  return found;
}
function chipOf(id: string): Element {
  const found = document.querySelector(`[data-part-chip="${id}"]`);
  if (found === null) throw new Error(`no label for ${id}`);
  return found;
}
const light = () => partEl('S').querySelector('[data-overload-light]');
const digits = (id: string) => chipOf(id).textContent ?? '';
const banner = () => document.querySelector('[data-testid="overload-banner"]');
const amps = (value: string) => t('bench.meterAmps', { value });
const volts = (value: string) => t('bench.meterVolts', { value });
const raise = () => screen.getByRole<HTMLButtonElement>('button', { name: t('bench.supplyUp') });
/** True when `later` comes after `earlier` in the document, which is the order SVG draws in. */
const drawnAfter = (later: Element, earlier: Element) => (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

const parts = (): CircuitComponent[] => [
  { id: 'S', type: 'supply', x: 40, y: 40, voltage: 6 },
  { id: 'SW', type: 'switch', x: 300, y: 40, closed: true },
  { id: 'R', type: 'resistor', x: 500, y: 40, role: 'R', ohms: 10 },
  { id: 'A', type: 'ammeter', x: 700, y: 40 },
  { id: 'V', type: 'voltmeter', x: 900, y: 40 },
];
const LOOP: [TerminalRef, TerminalRef][] = [
  ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
];
const SHORT: [TerminalRef, TerminalRef] = ['S.pos', 'S.neg'];
const circuitOf = (wires: [TerminalRef, TerminalRef][]): Circuit => ({
  components: parts(),
  wires: wires.map(([from, to], index) => ({ id: `w${index + 1}`, from, to })),
});

async function openWith(db: LabXpertDB, circuit: Circuit) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
  useBenchStore.setState({ circuit });
  await waitFor(() => expect(document.querySelector('[data-part-id="V"]')).not.toBeNull());
}

describe('Overload: a short circuit', () => {
  it('lights the overload light, shows the banner and reads zero on both meters', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf([...LOOP, SHORT]));
    expect(LIGHT_ON).toBeDefined();
    await waitFor(() => expect(light()?.getAttribute('data-overload-light')).toBe('true'));
    expect(light()?.getAttribute('fill')).toBe(LIGHT_ON);
    expect(banner()).not.toBeNull();
    expect(digits('A')).toBe(amps('0.00'));
    expect(digits('V')).toBe(volts('0.00'));
  });

  it('keeps the light off and shows no banner when there is no short', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    expect(LIGHT_OFF).toBeDefined();
    expect(light()?.getAttribute('data-overload-light')).toBe('false');
    expect(light()?.getAttribute('fill')).toBe(LIGHT_OFF);
    expect(banner()).toBeNull();
    expect(digits('A')).toBe(amps('0.60'));
  });

  it('turns the light off and removes the banner as soon as the short is removed', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf([...LOOP, SHORT]));
    await waitFor(() => expect(banner()).not.toBeNull());
    useBenchStore.setState({ circuit: circuitOf(LOOP) });
    await waitFor(() => expect(banner()).toBeNull());
    expect(light()?.getAttribute('data-overload-light')).toBe('false');
    expect(light()?.getAttribute('fill')).toBe(LIGHT_OFF);
    expect(digits('A')).toBe(amps('0.60'));
  });

  it('banner: the existing overload sentence, an icon, the alert role, and it never blocks or moves the bench', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf([...LOOP, SHORT]));
    const wrapper = byTestId('overload-banner');
    const alert = within(wrapper as HTMLElement).getByRole('alert');
    expect(alert.textContent).toBe(t('bench.overload'));
    expect(alert.querySelector('svg')).not.toBeNull();
    // Floats over the bench (out of the layout flow) and lets every pointer event through.
    expect(wrapper.className).toContain('absolute');
    expect(wrapper.className).toContain('pointer-events-none');
  });

  it('is still right after a reload', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf([...LOOP, SHORT]));
    // A supply change saves the whole circuit, so the short survives the reload.
    fireEvent.click(raise());
    await waitFor(() => expect(store().circuit.components.find((c) => c.id === 'S')).toMatchObject({ voltage: 7 }));
    await flushBenchWrites();
    cleanup();
    resetAppState();
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: TITLE });
    await waitFor(() => expect(document.querySelector('[data-part-id="V"]')).not.toBeNull());
    await waitFor(() => expect(banner()).not.toBeNull());
    expect(light()?.getAttribute('data-overload-light')).toBe('true');
    expect(digits('A')).toBe(amps('0.00'));
    expect(digits('V')).toBe(volts('0.00'));
  });
});

describe('Drawing order: labels over wires, terminals on top', () => {
  it('meter readouts, the resistor value and the switch label are in the label layer over the bench, after the wires', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    const wires = byTestId('wire-layer');
    const labels = byTestId('part-label-layer');
    const terminals = byTestId('terminal-layer');
    expect(drawnAfter(labels, wires)).toBe(true);
    expect(drawnAfter(terminals, labels)).toBe(true);
    const chips = byTestId('part-chip-layer');
    expect(drawnAfter(chips, wires)).toBe(true);
    for (const id of ['A', 'V']) {
      const readout = chipOf(id);
      expect(readout.getAttribute('data-meter-readout')).not.toBeNull();
      expect(chips.contains(readout)).toBe(true);
      expect(partEl(id).querySelector('[data-meter-readout]')).toBeNull();
    }
    expect(chipOf('R').textContent).toContain(t('bench.resistanceValue', { ohms: 10 }));
    expect(chipOf('SW').textContent?.toLowerCase()).toBe(t('components.switch'));
    expect(partEl('SW').querySelector('text')).toBeNull();
    expect(partEl('R').querySelector('text')).toBeNull();
  });

  it('the label layer lets presses through, so a wire under a meter’s digits can still be selected', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    expect(byTestId('part-label-layer').getAttribute('pointer-events')).toBe('none');
    const wire = document.querySelector('[data-wire-id="w1"]');
    expect(wire).not.toBeNull();
    fireEvent.pointerDown(wire as Element, { button: 0, pointerId: 1 });
    expect(store().selectedWireId).toBe('w1');
  });

  it('the supply shows its display digits as a label over the bench', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    expect(chipOf('S').textContent).toBe(t('bench.supplyValue', { volts: 6 }));
    expect(partEl('S').querySelector('text')).toBeNull();
  });
});

describe('Wiring still works after the change', () => {
  const at = (ref: TerminalRef) => {
    const point = terminalPosition(store().circuit, ref);
    if (point === undefined) throw new Error(`no position for ${ref}`);
    return point;
  };
  const terminal = (ref: TerminalRef) => {
    const found = document.querySelector<SVGGElement>(`[data-terminal-ref="${ref}"]`);
    if (found === null) throw new Error(`no terminal ${ref}`);
    return found;
  };
  const press = (ref: TerminalRef) => fireEvent.pointerDown(terminal(ref), { button: 0, pointerId: 1, clientX: at(ref).x, clientY: at(ref).y });
  const release = (ref: TerminalRef) => fireEvent.pointerUp(svg(), { pointerId: 1, clientX: at(ref).x, clientY: at(ref).y });

  it('click one terminal, then another, still adds a wire; the terminals are drawn after the labels', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: TITLE });
    // A rectangle the size of the viewBox at the page origin makes client pixels equal bench units.
    vi.spyOn(svg(), 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: BENCH_VIEW.width, bottom: BENCH_VIEW.height,
      width: BENCH_VIEW.width, height: BENCH_VIEW.height, x: 0, y: 0, toJSON: () => ({}),
    });
    await store().place('supply', { x: 100, y: 100 });
    await store().place('resistor', { x: 400, y: 100 });
    await waitFor(() => expect(document.querySelector('[data-part-id="R"]')).not.toBeNull());
    press('S.pos');
    release('S.pos');
    expect(store().drawing).toMatchObject({ from: 'S.pos', method: 'click' });
    press('R.a');
    await waitFor(() => expect(store().circuit.wires).toEqual([{ id: 'w1', from: 'S.pos', to: 'R.a' }]));
    expect(drawnAfter(terminal('R.a'), byTestId('part-label-layer'))).toBe(true);
  });
});
