import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { Circuit } from '../../src/model/types';
import { flushBenchWrites, useBenchStore } from '../../src/state';

// Part 10F-2: the checks from DESIGN.md §11 and §13 that a test can make without a browser.

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

// The switch is placed FIRST on purpose: Tab must still reach it after the other parts. The ammeter is locked
// so the lock badge can be checked. One wire gives the wire and its trash button something to show.
const CIRCUIT: Circuit = {
  components: [
    { id: 'SW', type: 'switch', x: 300, y: 40, closed: true },
    { id: 'S', type: 'supply', x: 40, y: 40, voltage: 6 },
    { id: 'R', type: 'resistor', x: 500, y: 40, role: 'R', ohms: 10 },
    { id: 'A', type: 'ammeter', x: 700, y: 40, locked: true },
  ],
  wires: [{ id: 'w1', from: 'S.pos', to: 'SW.a' }],
};

async function openWith(db: LabXpertDB, circuit: Circuit = CIRCUIT) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
  useBenchStore.setState({ circuit });
  await waitFor(() => expect(document.querySelector('[data-part-id="SW"]')).not.toBeNull());
}

function partEl(id: string): Element {
  const found = document.querySelector(`[data-part-id="${id}"]`);
  if (found === null) throw new Error(`no part ${id}`);
  return found;
}

function rect(width: number, height: number) {
  return { left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) };
}

// ---- Tab order (DESIGN.md §11) ----

const STOP = 'a[href], button, input, select, textarea, [tabindex]';

/** Everything Tab can land on, in page order: not disabled, and not taken out of the order with tabindex -1. */
function tabStops(): Element[] {
  return Array.from(document.querySelectorAll(STOP)).filter((element) => {
    const index = element.getAttribute('tabindex');
    return !element.hasAttribute('disabled') && (index === null || Number(index) >= 0);
  });
}

function zoneOf(element: Element): string {
  if (element.closest('header') !== null) return 'top bar';
  if (element.hasAttribute('data-shelf-type')) return 'shelf';
  if (element.hasAttribute('data-part-id')) return element.getAttribute('role') === 'switch' ? 'switch' : 'part';
  if (element.hasAttribute('data-terminal-ref')) return 'terminal';
  if (element.hasAttribute('data-wire-id') || element.hasAttribute('data-wire-trash')) return 'wire';
  if (element.closest('[data-supply-stepper]') !== null) return 'supply stepper';
  if (element.closest('[data-resistor-control]') !== null) return 'value control';
  if (element.closest('aside[data-collapsed]') !== null) return 'panel';
  if (element.closest('[data-dock]') !== null) return 'readings controls';
  if (element.closest('main') !== null) return 'toolbar';
  return 'other';
}

const inOrder = (zones: string[]) => zones.filter((zone, index) => index === 0 || zone !== zones[index - 1]);

describe('Tab order', () => {
  it('goes top bar, shelf, toolbar, bench parts, switch, then the bench wiring, supply stepper and panel', async () => {
    const db = await makeTestDb();
    await openWith(db);
    // The dock's controls (Record reading, then the Finish or Next task button; its table takes a Tab stop only when it scrolls) go between the stepper and the panel.
    expect(inOrder(tabStops().map(zoneOf))).toEqual([
      'top bar',
      'shelf',
      'toolbar',
      'part',
      'switch',
      'wire',
      'terminal',
      'supply stepper',
      'readings controls',
      'panel',
    ]);
  });

  it('visits the parts in placement order with the switch last, even though it was placed first', async () => {
    const db = await makeTestDb();
    await openWith(db);
    const ids = tabStops()
      .filter((element) => element.hasAttribute('data-part-id'))
      .map((element) => element.getAttribute('data-part-id'));
    expect(ids).toEqual(['S', 'R', 'A', 'SW']);
  });

  it('puts the selected resistor\'s value control after the supply stepper and before the readings controls and the panel', async () => {
    const db = await makeTestDb();
    await openWith(db);
    store().select('R');
    await waitFor(() => expect(document.querySelector('[data-resistor-control="R"]')).not.toBeNull());
    const zones = inOrder(tabStops().map(zoneOf));
    expect(zones.indexOf('supply stepper')).toBeGreaterThan(zones.indexOf('terminal'));
    expect(zones.indexOf('value control')).toBeGreaterThan(zones.indexOf('supply stepper'));
    expect(zones.indexOf('readings controls')).toBeGreaterThan(zones.indexOf('value control'));
    expect(zones.indexOf('panel')).toBeGreaterThan(zones.indexOf('readings controls'));
  });

  it('has no positive tabindex anywhere, so the page order is the only order', async () => {
    const db = await makeTestDb();
    await openWith(db);
    const positive = Array.from(document.querySelectorAll('[tabindex]')).filter((element) => Number(element.getAttribute('tabindex')) > 0);
    expect(positive).toHaveLength(0);
  });
});

// ---- Focus ring on every control (DESIGN.md §11) ----

const CONTROLS =
  'button, select, input, [role="radio"], [role="switch"], [data-part-id], [data-terminal-ref], [data-wire-id], [data-wire-trash]';
const SVG_CONTROL = '[data-part-id], [data-terminal-ref], [data-wire-id], [data-wire-trash]';
const hasClass = (element: Element, part: string) => (element.getAttribute('class') ?? '').includes(part);

/** A bench control draws its ring as a child that shows on focus (SVG), or carries the focus-visible outline classes (HTML). */
function hasRing(element: Element): boolean {
  if (element.matches(SVG_CONTROL)) {
    return [element, ...Array.from(element.querySelectorAll('[class]'))].some((node) => hasClass(node, 'group-focus-visible:'));
  }
  return hasClass(element, 'focus-visible:outline');
}

const withoutRing = () =>
  Array.from(document.querySelectorAll(CONTROLS))
    .filter((element) => !hasRing(element))
    .map((element) => element.getAttribute('aria-label') ?? element.tagName);

describe('Focus ring', () => {
  it('every control on screen has one: parts, terminals, wires, shelf tiles, stepper, value options, toolbar and top bar', async () => {
    const db = await makeTestDb();
    await openWith(db);
    store().select('R');
    await waitFor(() => expect(document.querySelector('[data-resistor-control="R"]')).not.toBeNull());
    // Every kind is really on screen, so the check below is not an empty one.
    expect(document.querySelectorAll('[data-part-id]')).toHaveLength(4);
    expect(document.querySelectorAll('[data-terminal-ref]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-wire-id]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-shelf-type]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-supply-stepper] button')).toHaveLength(2);
    expect(document.querySelectorAll('[data-resistor-control] [role="radio"]').length).toBeGreaterThan(0);
    expect(withoutRing()).toEqual([]);
  });

  it('the wire\'s trash button has one too, once the wire is selected', async () => {
    const db = await makeTestDb();
    await openWith(db);
    store().selectWire('w1');
    await waitFor(() => expect(document.querySelector('[data-wire-trash="w1"]')).not.toBeNull());
    expect(withoutRing()).toEqual([]);
  });
});

// ---- Targets of at least 44 px (DESIGN.md §9) ----

describe('Press targets on a small bench', () => {
  it('widen a terminal\'s press circle so it is 44 screen px across, and the wire trash button too', async () => {
    // A 550 × 324 box is the scene at scale 0.5, so 44 px is 88 design units across (radius 44).
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect(550, 324));
    const db = await makeTestDb();
    await openWith(db);
    const circle = document.querySelector('[data-terminal-ref="S.pos"] [data-hit-area]');
    expect(circle).not.toBeNull();
    expect(Number(circle?.getAttribute('r'))).toBe(44);

    store().selectWire('w1');
    await waitFor(() => expect(document.querySelector('[data-wire-trash="w1"]')).not.toBeNull());
    const trash = document.querySelector('[data-wire-trash="w1"] circle');
    expect(Number(trash?.getAttribute('r'))).toBe(44);
  });

  it('every button over the bench is at least 44 px (the layer\'s class, as in the overlay)', async () => {
    const db = await makeTestDb();
    await openWith(db);
    const overlay = screen.getByTestId('control-overlay');
    const buttons = within(overlay).getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(hasClass(button, 'min-h-[44px]')).toBe(true);
      expect(hasClass(button, 'min-w-[44px]')).toBe(true);
    }
  });
});

// ---- Never colour alone (DESIGN.md §1 item 3, §11) ----

describe('Every state has more than a colour', () => {
  it('the status strip gives the switch and the supply an icon beside the words', async () => {
    const db = await makeTestDb();
    await openWith(db);
    const strip = screen.getByTestId('bench-status');
    expect(within(strip).getByText(t('bench.switchClosed'))).toBeTruthy();
    expect(strip.querySelectorAll('svg')).toHaveLength(2);
  });

  it('a selected part has a dashed outline; an unselected one has none', async () => {
    const db = await makeTestDb();
    await openWith(db);
    store().select('R');
    await waitFor(() => expect(partEl('R').getAttribute('data-selected')).toBe('true'));
    expect(partEl('R').querySelector('rect[stroke-dasharray]')).not.toBeNull();
    expect(partEl('S').querySelector('rect[stroke-dasharray]')).toBeNull();
  });

  it('a selected wire has a dashed overlay and a trash button', async () => {
    const db = await makeTestDb();
    await openWith(db);
    const wire = () => {
      const found = document.querySelector('[data-wire-id="w1"]');
      if (found === null) throw new Error('no wire');
      return found;
    };
    expect(wire().querySelector('path[stroke-dasharray]')).toBeNull();
    store().selectWire('w1');
    await waitFor(() => expect(wire().getAttribute('data-selected')).toBe('true'));
    expect(wire().querySelector('path[stroke-dasharray]')).not.toBeNull();
    expect(document.querySelector('[data-wire-trash="w1"]')).not.toBeNull();
  });

  it('the chosen resistance has a check icon; the others do not', async () => {
    const db = await makeTestDb();
    await openWith(db);
    store().select('R');
    await waitFor(() => expect(document.querySelector('[data-resistor-control="R"]')).not.toBeNull());
    const group = screen.getByRole('radiogroup', { name: t('bench.resistance') });
    const checked = group.querySelectorAll('[role="radio"][aria-checked="true"]');
    expect(checked).toHaveLength(1);
    expect(checked[0]?.querySelector('svg')).not.toBeNull();
    for (const other of Array.from(group.querySelectorAll('[role="radio"][aria-checked="false"]'))) {
      expect(other.querySelector('svg')).toBeNull();
    }
  });

  it('a locked part has a lock badge; an unlocked one has none', async () => {
    const db = await makeTestDb();
    await openWith(db);
    expect(partEl('A').querySelector('svg')).not.toBeNull();
    expect(partEl('S').querySelector('svg')).toBeNull();
  });

  it('a shelf tile that is full says so in words with a check icon, and is disabled', async () => {
    const db = await makeTestDb();
    await openWith(db);
    const tile = document.querySelector<HTMLButtonElement>('[data-shelf-type="supply"]');
    expect(tile).not.toBeNull();
    expect(tile?.disabled).toBe(true);
    const words = within(tile as HTMLElement).getByText(t('bench.shelfFull'));
    expect(words.querySelector('svg')).not.toBeNull();
  });
});

// ---- Type (DESIGN.md §3) ----

describe('Fredoka and Nunito', () => {
  it('button labels, meter digits and the supply number are Fredoka', async () => {
    const db = await makeTestDb();
    await openWith(db);
    const tile = document.querySelector('[data-shelf-type="supply"]');
    expect(tile?.querySelector('span.font-heading')).not.toBeNull();
    expect(hasClass(document.querySelector('[data-part-chip="A"]') as Element, 'font-heading')).toBe(true);
    expect(hasClass(document.querySelector('[data-part-chip="S"]') as Element, 'font-heading')).toBe(true);
    const undo = screen.getByRole('button', { name: t('bench.undo') });
    expect(hasClass(undo, 'font-heading')).toBe(true);
  });

  it('the shelf hint and the status words are Nunito', async () => {
    const db = await makeTestDb();
    await openWith(db);
    expect(hasClass(screen.getByText(t('bench.shelfHint')), 'font-heading')).toBe(false);
    expect(hasClass(screen.getByTestId('bench-status'), 'font-body')).toBe(true);
  });
});

// ---- Empty bench ----

describe('Empty bench', () => {
  it('shows the hint, and it goes when the first part is placed', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: TITLE });
    expect(screen.getByText(t('bench.benchHint'))).toBeTruthy();
    await store().place('supply', { x: 100, y: 100 });
    await waitFor(() => expect(screen.queryByText(t('bench.benchHint'))).toBeNull());
  });
});
