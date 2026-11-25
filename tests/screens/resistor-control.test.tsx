import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BENCH_VIEW } from '../../src/bench/catalog';
import type { LabXpertDB } from '../../src/db/database';
import { listEvents } from '../../src/db/events';
import { t } from '../../src/i18n';
import ohmsLawJson from '../../src/spec/experiments/ohms-law.json';
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
const VALUES: readonly number[] = ohmsLawJson.resistorValues;
const NBSP = /\u00a0/g;
const liveText = () => (screen.getByTestId('live-region').textContent ?? '').replace(NBSP, '');
const label = (ohms: number) => t('bench.resistanceValue', { ohms });

type ExperimentId = 'ohms-law' | 'series-parallel';

async function openBench(db: LabXpertDB, id: ExperimentId = 'ohms-law') {
  await seedUser(db, 'Asha');
  renderAppAt(db, `#/experiment/${id}`);
  await screen.findByRole('group', { name: t(`exp.${id}.title`) });
}

async function withResistor(db: LabXpertDB) {
  await openBench(db);
  await store().place('supply', { x: 100, y: 40 });
  await store().place('resistor', { x: 400, y: 200 });
  await waitFor(() => expect(document.querySelector('[data-part-id="R"]')).not.toBeNull());
}

async function withTwoResistors(db: LabXpertDB) {
  await openBench(db, 'series-parallel');
  await store().place('resistor', { x: 100, y: 200 });
  await store().place('resistor', { x: 500, y: 200 });
  await waitFor(() => expect(document.querySelector('[data-part-id="R2"]')).not.toBeNull());
}

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

function ohmsOf(id: string): number | undefined {
  const part = store().circuit.components.find((c) => c.id === id);
  return part?.type === 'resistor' ? part.ohms : undefined;
}

const group = () => screen.getByRole('radiogroup', { name: t('bench.resistance') });
const radio = (ohms: number) => within(group()).getByRole<HTMLButtonElement>('radio', { name: label(ohms) });
const radios = () => within(group()).getAllByRole<HTMLButtonElement>('radio');
const noGroup = () => screen.queryByRole('radiogroup');
const textsOf = (id: string) => [chipOf(id).textContent];
const otherThan = (value: number | undefined) => VALUES.find((v) => v !== value) ?? 0;

async function eventsOf(db: LabXpertDB, type: string) {
  return (await listEvents(db, store().session?.attemptId ?? '')).filter((e) => e.actionType === type);
}

function rect(width: number, height: number) {
  return { left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) };
}

describe('Resistor control: when it shows', () => {
  it('is not there until a resistor is selected, then lists the allowed values', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select(undefined);
    await waitFor(() => expect(noGroup()).toBeNull());
    store().select('R');
    const found = await screen.findByRole('radiogroup', { name: t('bench.resistance') });
    expect(found.getAttribute('data-resistor-control')).toBe('R');
    expect(radios().map((node) => node.textContent)).toEqual(VALUES.map(label));
  });

  it('marks the current value as checked and makes only it a Tab stop', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    const current = ohmsOf('R');
    for (const node of radios()) {
      const isCurrent = node.textContent === label(current ?? 0);
      expect(node.getAttribute('aria-checked')).toBe(String(isCurrent));
      expect(node.getAttribute('tabindex')).toBe(isCurrent ? '0' : '-1');
    }
  });

  it('is not shown for another kind of part, and goes away on deselect, on Escape and on removal', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('S');
    await flushBenchWrites();
    expect(noGroup()).toBeNull();
    store().select('R');
    await screen.findByRole('radiogroup');
    store().select(undefined);
    await waitFor(() => expect(noGroup()).toBeNull());
    store().select('R');
    await screen.findByRole('radiogroup');
    await store().remove('R');
    await waitFor(() => expect(noGroup()).toBeNull());
  });

  it('Escape inside it deselects the resistor and puts focus back on the part', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    radios()[0]?.focus();
    fireEvent.keyDown(radios()[0] as HTMLElement, { key: 'Escape' });
    await waitFor(() => expect(noGroup()).toBeNull());
    expect(document.activeElement).toBe(partEl('R'));
  });

  it('Enter on the resistor selects it and moves focus to the checked option', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select(undefined);
    partEl('R').focus();
    fireEvent.keyDown(partEl('R'), { key: 'Enter' });
    await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('radio'));
    expect(document.activeElement?.getAttribute('aria-checked')).toBe('true');
    expect(store().selectedId).toBe('R');
  });

  it('a press on its buttons keeps the resistor selected', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    fireEvent.pointerDown(radio(otherThan(ohmsOf('R'))), { button: 0, pointerId: 1 });
    expect(store().selectedId).toBe('R');
  });
});

describe('Resistor control: choosing a value', () => {
  it('sets the value, logs SET_VALUE, and redraws the bands and the value text', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    const start = ohmsOf('R');
    store().select('R');
    await screen.findByRole('radiogroup');
    fireEvent.click(radio(30));
    await waitFor(() => expect(ohmsOf('R')).toBe(30));
    const events = await eventsOf(db, 'SET_VALUE');
    expect(events.map((e) => [e.targetId, e.before, e.after])).toEqual([['R', { ohms: start }, { ohms: 30 }]]);
    expect(partEl('R').innerHTML).toContain('#F28C28'); // 30 Ω: orange, black, black
    expect(textsOf('R')).toContain(label(30));
    expect(radio(30).getAttribute('aria-checked')).toBe('true');
    expect(radio(30).getAttribute('tabindex')).toBe('0');
    fireEvent.click(radio(5));
    await waitFor(() => expect(ohmsOf('R')).toBe(5));
    expect(partEl('R').innerHTML).toContain('#2E9E5B'); // 5 Ω: green, black, gold
    expect(textsOf('R')).toContain(label(5));
  });

  it('works with Enter and Space on an option', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    fireEvent.keyDown(radio(15), { key: 'Enter' });
    await waitFor(() => expect(ohmsOf('R')).toBe(15));
    fireEvent.keyDown(radio(20), { key: ' ' });
    fireEvent.keyUp(radio(20), { key: ' ' });
    await waitFor(() => expect(ohmsOf('R')).toBe(20));
  });

  it('choosing the value it already has logs nothing and says nothing', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    const current = ohmsOf('R') ?? 0;
    fireEvent.click(radio(current));
    await flushBenchWrites();
    expect(await eventsOf(db, 'SET_VALUE')).toHaveLength(0);
    expect(liveText()).toBe('');
  });

  it('announces the new value politely', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    expect(screen.getByTestId('live-region').getAttribute('aria-live')).toBe('polite');
    const target = ohmsOf('R') === 20 ? 15 : 20;
    fireEvent.click(radio(target));
    await waitFor(() => expect(liveText()).toBe(t('bench.resistanceAnnounce', { ohms: target })));
  });

  it('runs no check: only SET_VALUE is logged', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    fireEvent.click(radio(30));
    await waitFor(() => expect(ohmsOf('R')).toBe(30));
    const types = (await listEvents(db, store().session?.attemptId ?? '')).map((e) => e.actionType);
    expect(types).toEqual(['PLACE_COMPONENT', 'PLACE_COMPONENT', 'SET_VALUE']);
  });
});

describe('Resistor control: keyboard', () => {
  it('arrow keys move focus and choose the value, wrapping at both ends', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    await store().setResistorValue('R', 10);
    store().select('R');
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(radio(10).getAttribute('aria-checked')).toBe('true'));
    radio(10).focus();
    fireEvent.keyDown(radio(10), { key: 'ArrowRight' });
    await waitFor(() => expect(ohmsOf('R')).toBe(15));
    expect(document.activeElement).toBe(radio(15));
    fireEvent.keyDown(radio(15), { key: 'ArrowDown' });
    await waitFor(() => expect(ohmsOf('R')).toBe(20));
    fireEvent.keyDown(radio(20), { key: 'ArrowLeft' });
    await waitFor(() => expect(ohmsOf('R')).toBe(15));
    fireEvent.keyDown(radio(15), { key: 'ArrowUp' });
    await waitFor(() => expect(ohmsOf('R')).toBe(10));
    fireEvent.keyDown(radio(10), { key: 'End' });
    await waitFor(() => expect(ohmsOf('R')).toBe(30));
    fireEvent.keyDown(radio(30), { key: 'ArrowRight' });
    await waitFor(() => expect(ohmsOf('R')).toBe(5));
    fireEvent.keyDown(radio(5), { key: 'ArrowLeft' });
    await waitFor(() => expect(ohmsOf('R')).toBe(30));
    fireEvent.keyDown(radio(30), { key: 'Home' });
    await waitFor(() => expect(ohmsOf('R')).toBe(5));
  });

  it('keeps focus on the chosen option after the value changes', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    const start = radios().find((node) => node.getAttribute('aria-checked') === 'true');
    start?.focus();
    fireEvent.keyDown(start as HTMLElement, { key: 'End' });
    await waitFor(() => expect(ohmsOf('R')).toBe(30));
    expect(document.activeElement).toBe(radio(30));
    expect(group().contains(document.activeElement)).toBe(true);
  });

  it('a fast run of arrow presses is not lost', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    await store().setResistorValue('R', 5);
    store().select('R');
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(radio(5).getAttribute('aria-checked')).toBe('true'));
    radio(5).focus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    await waitFor(() => expect(ohmsOf('R')).toBe(20));
    expect(document.activeElement).toBe(radio(20));
  });

  it('leaves Alt and Ctrl combinations to the browser', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    const start = ohmsOf('R');
    const notPrevented = fireEvent.keyDown(radios()[0] as HTMLElement, { key: 'ArrowLeft', altKey: true });
    await flushBenchWrites();
    expect(notPrevented).toBe(true);
    expect(ohmsOf('R')).toBe(start);
  });
});

describe('Resistor control: locked value', () => {
  async function lockedBench(db: LabXpertDB) {
    await withResistor(db);
    useBenchStore.setState({
      circuit: { components: [{ id: 'R', type: 'resistor', x: 400, y: 200, ohms: 10, role: 'R', valueLocked: true }], wires: [] },
      selectedId: 'R',
    });
    await screen.findByRole('radiogroup');
  }

  it('is disabled for assistive tech but still reachable, and changes nothing', async () => {
    const db = await makeTestDb();
    await lockedBench(db);
    for (const node of radios()) {
      expect(node.getAttribute('aria-disabled')).toBe('true');
      expect(node.disabled).toBe(false);
    }
    fireEvent.click(radio(30));
    fireEvent.keyDown(radio(30), { key: 'Enter' });
    radio(10).focus();
    fireEvent.keyDown(radio(10), { key: 'ArrowRight' });
    await flushBenchWrites();
    expect(ohmsOf('R')).toBe(10);
    expect(await eventsOf(db, 'SET_VALUE')).toHaveLength(0);
    expect(liveText()).toBe('');
  });

  it('gives the reason as the group’s description and as a tooltip', async () => {
    const db = await makeTestDb();
    await lockedBench(db);
    const describedBy = group().getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    const reason = document.getElementById(describedBy ?? '');
    expect(reason?.textContent).toBe(t('bench.valueLocked'));
    expect(reason?.getAttribute('role')).toBe('tooltip');
  });

  it('an unlocked resistor has no reason attached', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    expect(group().hasAttribute('aria-describedby')).toBe(false);
    expect(screen.queryByText(t('bench.valueLocked'))).toBeNull();
  });

  it('still shows the lock icon on a locked part', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    useBenchStore.setState({
      circuit: { components: [{ id: 'R', type: 'resistor', x: 400, y: 200, ohms: 10, role: 'R', locked: true, valueLocked: true }], wires: [] },
      selectedId: 'R',
    });
    await screen.findByRole('radiogroup');
    expect(partEl('R').querySelector('circle.fill-ink')).not.toBeNull();
  });
});

describe('Resistor control: R1 and R2', () => {
  it('each has its own control, and changing one leaves the other alone', async () => {
    const db = await makeTestDb();
    await withTwoResistors(db);
    const r2Start = ohmsOf('R2');
    store().select('R1');
    await waitFor(() => expect(screen.getByRole('radiogroup').getAttribute('data-resistor-control')).toBe('R1'));
    fireEvent.click(radio(30));
    await waitFor(() => expect(ohmsOf('R1')).toBe(30));
    expect(ohmsOf('R2')).toBe(r2Start);
    expect(partEl('R1').innerHTML).toContain('#F28C28');

    store().select('R2');
    await waitFor(() => expect(group().getAttribute('data-resistor-control')).toBe('R2'));
    expect(document.querySelectorAll('[role="radiogroup"]')).toHaveLength(1);
    fireEvent.click(radio(5));
    await waitFor(() => expect(ohmsOf('R2')).toBe(5));
    expect(ohmsOf('R1')).toBe(30);
    const events = await eventsOf(db, 'SET_VALUE');
    expect(events.map((e) => e.targetId)).toEqual(['R1', 'R2']);
  });
});

describe('Resistor control: Undo and reload', () => {
  it('Undo puts the old value, bands and text back, and the control follows', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    const start = ohmsOf('R') ?? 0;
    store().select('R');
    await screen.findByRole('radiogroup');
    const target = otherThan(start);
    fireEvent.click(radio(target));
    await waitFor(() => expect(ohmsOf('R')).toBe(target));
    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await waitFor(() => expect(ohmsOf('R')).toBe(start));
    expect(textsOf('R')).toContain(label(start));
    await waitFor(() => expect(radio(start).getAttribute('aria-checked')).toBe('true'));
    expect((await eventsOf(db, 'UNDO')).length).toBe(1);
  });

  it('keeps the value, the bands and the text after a reload', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    fireEvent.click(radio(30));
    await waitFor(() => expect(ohmsOf('R')).toBe(30));
    await flushBenchWrites();
    cleanup();
    resetAppState();
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: t('exp.ohms-law.title') });
    await waitFor(() => expect(document.querySelector('[data-part-id="R"]')).not.toBeNull());
    expect(textsOf('R')).toContain(label(30));
    expect(partEl('R').innerHTML).toContain('#F28C28');
    expect(noGroup()).toBeNull();
  });
});

describe('Resistor control: placement', () => {
  const slot = () => {
    const found = document.querySelector<HTMLElement>('[data-overlay-slot="resistor:R"]');
    if (found === null) throw new Error('no slot');
    return found;
  };

  function layOut(width: number, height: number) {
    vi.spyOn(screen.getByTestId('control-overlay'), 'getBoundingClientRect').mockReturnValue(rect(width, height));
    fireEvent(window, new Event('resize'));
  }

  it('keeps every option at 44 × 44 px or more (the class rule), at full size and scaled down', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    const check = () => {
      expect(radios()).toHaveLength(VALUES.length);
      for (const node of radios()) {
        expect(node.className).toContain('min-h-[44px]');
        expect(node.className).toContain('min-w-[44px]');
        expect(node.className).toContain('pointer-events-auto');
      }
    };
    check();
    layOut(550, 324);
    check();
  });

  it('is placed under the resistor from its mat coordinates and follows it when moved, dragged and undone', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    layOut(BENCH_VIEW.width, BENCH_VIEW.height);
    store().select('R');
    await screen.findByRole('radiogroup');
    await waitFor(() => expect(slot().style.left).toBe('500px')); // 400 + half of the 200 wide resistor
    expect(slot().style.top).toBe('298px'); // 200 + 90 high + 8 gap
    await store().nudge('R', 48, 0);
    await waitFor(() => expect(slot().style.left).toBe('548px'));
    fireEvent.click(screen.getByRole('button', { name: t('bench.undo') }));
    await waitFor(() => expect(slot().style.left).toBe('500px'));
  });

  it('follows a part dragged by the pointer, and does not block the drag', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    layOut(BENCH_VIEW.width, BENCH_VIEW.height);
    vi.spyOn(screen.getByRole('group', { name: t('exp.ohms-law.title') }), 'getBoundingClientRect').mockReturnValue(
      rect(BENCH_VIEW.width, BENCH_VIEW.height),
    );
    store().select('R');
    await screen.findByRole('radiogroup');
    fireEvent.pointerDown(partEl('R'), { button: 0, pointerId: 1, clientX: 450, clientY: 230 });
    fireEvent.pointerMove(partEl('R'), { pointerId: 1, clientX: 550, clientY: 280 });
    await waitFor(() => expect(slot().style.left).toBe('600px'));
    fireEvent.pointerUp(partEl('R'), { pointerId: 1, clientX: 550, clientY: 280 });
    await flushBenchWrites();
    expect(store().selectedId).toBe('R');
  });

  it('sits in the overlay layer, which lets the pointer through', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    store().select('R');
    await screen.findByRole('radiogroup');
    expect(slot().parentElement).toBe(screen.getByTestId('control-overlay'));
    expect(slot().className).toContain('pointer-events-none');
    expect(screen.getByTestId('control-overlay').className).toContain('pointer-events-none');
  });

  it('goes above a resistor at the bottom of the mat', async () => {
    const db = await makeTestDb();
    await withResistor(db);
    layOut(BENCH_VIEW.width, BENCH_VIEW.height);
    store().select('R');
    await screen.findByRole('radiogroup');
    await store().nudge('R', 0, 400);
    await waitFor(() => expect(slot().getAttribute('data-edge')).toBe('above'));
  });
});
