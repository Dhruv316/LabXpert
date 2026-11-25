import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BENCH_VIEW } from '../../src/bench/catalog';
import { highlightTargets } from '../../src/bench/checkpoint';
import { terminalPosition } from '../../src/bench/wires';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { Circuit, TerminalRef } from '../../src/model/types';
import { flushBenchWrites, useBenchStore, useTutorStore } from '../../src/state';
import { feedbackOf } from '../../src/ui/bench/tutor-text';

// The tutor's highlight on the real bench screen: a real checkpoint, the real store clearing, the real layers.

function resetStores() {
  resetAppState();
  useTutorStore.setState(useTutorStore.getInitialState(), true);
}
beforeEach(resetStores);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
  await flushBenchWrites();
  await disposeTestDbs();
  resetStores();
});

const store = () => useBenchStore.getState();
const tutor = () => useTutorStore.getState();
const TITLE = t('exp.ohms-law.title');
const svg = () => screen.getByRole('group', { name: TITLE });
const panel = () => screen.getByRole('complementary', { name: t('bench.panelTitle') });

/** All five parts the Ohm's law experiment needs, so the engine gets past "missing parts". */
function circuitWith(closed: boolean, wires: Circuit['wires']): Circuit {
  return {
    components: [
      { id: 'S', type: 'supply', x: 60, y: 80, voltage: 6 },
      { id: 'SW', type: 'switch', x: 420, y: 80, closed },
      { id: 'R', type: 'resistor', x: 240, y: 320, role: 'R', ohms: 10 },
      { id: 'A', type: 'ammeter', x: 520, y: 320 },
      { id: 'V', type: 'voltmeter', x: 760, y: 320 },
    ],
    wires,
  };
}

/** The supply and the switch only: closing the switch shorts the supply (SHORT_CIRCUIT flags S and SW and both wires). */
const SHORT = circuitWith(false, [
  { id: 'w1', from: 'S.pos', to: 'SW.a' },
  { id: 'w2', from: 'SW.b', to: 'S.neg' },
]);

/** Ammeter left out of the loop and the voltmeter reversed: two errors with different targets. */
const TWO_ERRORS = circuitWith(true, [
  { id: 'w1', from: 'S.pos', to: 'SW.a' },
  { id: 'w2', from: 'SW.b', to: 'R.a' },
  { id: 'w3', from: 'R.b', to: 'S.neg' },
  { id: 'w4', from: 'V.pos', to: 'R.b' },
  { id: 'w5', from: 'V.neg', to: 'R.a' },
]);

function pretendReducedMotion() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

async function open(db: LabXpertDB, circuit: Circuit) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
  // A rectangle of exactly the viewBox size at the origin makes client px equal mat units (scale 1).
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
  act(() => useBenchStore.setState({ circuit }));
  await waitFor(() => expect(document.querySelector('[data-part-id="V"]')).not.toBeNull());
}

/** A real checkpoint on the circuit that is on the bench. */
async function check(): Promise<void> {
  await act(async () => {
    await tutor().runCheckpoint('SWITCH_CLOSE');
  });
}

/** The switch is closed with the keyboard, which runs the real SWITCH_CLOSE check. */
async function closeShortedSwitch(db: LabXpertDB) {
  await open(db, SHORT);
  fireEvent.keyDown(part('SW'), { key: 'Enter' });
  await waitFor(() => expect(tutor().highlight.componentIds.length).toBeGreaterThan(0));
}

function part(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-part-id="${id}"]`);
  if (found === null) throw new Error(`no part ${id}`);
  return found;
}
function wire(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-wire-id="${id}"]`);
  if (found === null) throw new Error(`no wire ${id}`);
  return found;
}
function terminal(ref: TerminalRef): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-terminal-ref="${ref}"]`);
  if (found === null) throw new Error(`no terminal ${ref}`);
  return found;
}
const markOf = (id: string) => document.querySelector<SVGGElement>(`[data-part-highlight="${id}"]`);
const markedParts = (): string[] =>
  Array.from(document.querySelectorAll('[data-part-highlight]'))
    .map((node) => node.getAttribute('data-part-highlight') ?? '')
    .sort();
const flaggedWires = (): string[] =>
  Array.from(document.querySelectorAll('[data-wire-id][data-flagged="true"]'))
    .map((node) => node.getAttribute('data-wire-id') ?? '')
    .sort();
const sorted = (ids: readonly string[]): string[] => [...ids].sort();

function expectNothingLit() {
  expect(markedParts()).toEqual([]);
  expect(flaggedWires()).toEqual([]);
  expect(document.querySelector('[data-testid="highlight-layer"]')).toBeNull();
  expect(document.querySelector('[data-wire-error-outline]')).toBeNull();
  expect(document.querySelector('[data-testid="flag-description"]')).toBeNull();
  expect(document.querySelector('[data-flagged="true"]')).toBeNull();
}

describe('Highlight: closing the switch', () => {
  it('lights the flagged parts with an outline and a badge, and the wires that touch them', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    expect(tutor().errors[0]?.code).toBe('SHORT_CIRCUIT');
    expect(markedParts()).toEqual(['S', 'SW']);
    expect(flaggedWires()).toEqual(['w1', 'w2']);
    // Parts that are not part of the mistake are left alone.
    expect(markOf('R')).toBeNull();
    expect(part('R').getAttribute('data-flagged')).toBe('false');
    for (const id of ['S', 'SW']) {
      expect(part(id).getAttribute('data-flagged')).toBe('true');
      expect(markOf(id)?.querySelector('[data-highlight-outline]')).not.toBeNull();
      expect(markOf(id)?.querySelector('[data-highlight-badge]')).not.toBeNull();
    }
    for (const id of ['w1', 'w2']) {
      expect(wire(id).querySelector('[data-wire-error-outline]')).not.toBeNull();
      expect(wire(id).querySelector('path.stroke-error:not([data-wire-error-outline])')).not.toBeNull();
    }
  });

  it('draws the outline dashed and the badge with its “!” icon, so colour is never the only cue', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    const outline = markOf('S')?.querySelector('[data-highlight-outline]');
    expect(outline?.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(outline?.getAttribute('stroke-width')).toBe('4');
    expect(outline?.getAttribute('class')).toContain('stroke-error');
    const badge = markOf('S')?.querySelector('[data-highlight-badge]');
    expect(badge?.querySelector('circle')?.getAttribute('class')).toContain('fill-error');
    expect(badge?.querySelector('svg')).not.toBeNull();
    // The wire's outline is dashed too.
    expect(wire('w1').querySelector('[data-wire-error-outline]')?.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('the outline pulses once (an animation that runs one time), and the badge and wires do not loop', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    expect(markOf('S')?.querySelector('[data-highlight-outline]')?.getAttribute('class')).toContain('animate-error-pulse');
    expect(wire('w1').querySelector('[data-wire-error-outline]')?.getAttribute('class')).toContain('animate-error-pulse');
  });
});

describe('Highlight: layers and pointer events', () => {
  it('lies over the wires and under the terminals, hidden from assistive technology, and lets every press through', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    const layer = screen.getByTestId('highlight-layer');
    expect(layer.getAttribute('pointer-events')).toBe('none');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.querySelectorAll('[tabindex], a, button')).toHaveLength(0);
    const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(screen.getByTestId('wire-layer'), layer)).toBe(true);
    expect(after(layer, terminal('S.pos'))).toBe(true);
  });

  it('a flagged wire can still be selected, and shows both states: error fill, dashed overlay and the trash button', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    fireEvent.pointerDown(wire('w1'), { button: 0, pointerId: 1 });
    await waitFor(() => expect(store().selectedWireId).toBe('w1'));
    expect(wire('w1').getAttribute('data-selected')).toBe('true');
    expect(wire('w1').getAttribute('data-flagged')).toBe('true');
    expect(wire('w1').querySelector('path.stroke-error:not([data-wire-error-outline])')).not.toBeNull();
    expect(wire('w1').querySelector('path[stroke-dasharray="6 6"]')).not.toBeNull();
    expect(wire('w1').querySelector('[data-wire-error-outline]')).not.toBeNull();
    expect(document.querySelector('[data-wire-trash="w1"]')).not.toBeNull();
    // Selecting changes nothing about what the tutor lit.
    expect(flaggedWires()).toEqual(['w1', 'w2']);
    // The trash button still removes the wire.
    fireEvent.click(document.querySelector('[data-wire-trash="w1"]') as Element);
    await waitFor(() => expect(store().circuit.wires.map((w) => w.id)).toEqual(['w2']));
  });

  it('a selected flagged part shows the teal dashed outline and the error outline and badge together', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    act(() => store().select('S'));
    expect(part('S').getAttribute('data-selected')).toBe('true');
    expect(part('S').querySelector('rect[stroke-dasharray="10 7"]')).not.toBeNull();
    expect(markOf('S')?.querySelector('[data-highlight-outline]')).not.toBeNull();
    expect(markOf('S')?.querySelector('[data-highlight-badge]')).not.toBeNull();
  });

  it('a terminal of a flagged part still starts a wire', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    const at = terminalPosition(store().circuit, 'S.pos');
    expect(at).toBeDefined();
    fireEvent.pointerDown(terminal('S.pos'), { button: 0, pointerId: 1, clientX: at?.x ?? 0, clientY: at?.y ?? 0 });
    expect(store().drawing).toMatchObject({ from: 'S.pos' });
  });

  it('a flagged part can still be dragged (and the highlight goes out as soon as it moves)', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    const start = store().circuit.components.find((c) => c.id === 'S');
    expect(start).toBeDefined();
    const x = (start?.x ?? 0) + 20;
    const y = (start?.y ?? 0) + 20;
    fireEvent.pointerDown(part('S'), { button: 0, pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerMove(part('S'), { pointerId: 1, clientX: x + 40, clientY: y });
    fireEvent.pointerUp(part('S'), { pointerId: 1, clientX: x + 40, clientY: y });
    expect(store().circuit.components.find((c) => c.id === 'S')?.x).toBe((start?.x ?? 0) + 40);
    expectNothingLit();
  });

  it('the outline follows its part (the part moved while the same ids stay lit)', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    expect(markOf('S')?.getAttribute('transform')).toBe('translate(60 80)');
    const lit = tutor().highlight;
    const moved: Circuit = { ...store().circuit, components: store().circuit.components.map((c) => (c.id === 'S' ? { ...c, x: 100, y: 130 } : c)) };
    // The store puts the highlight out for any circuit change; lighting it again isolates what the layer draws from.
    act(() => {
      useBenchStore.setState({ circuit: moved });
      useTutorStore.setState({ highlight: lit });
    });
    expect(markOf('S')?.getAttribute('transform')).toBe('translate(100 130)');
  });
});

describe('Highlight: the primary error only, and the Also check chips', () => {
  it('moves with the chip, and the large card changes with it', async () => {
    const db = await makeTestDb();
    await open(db, TWO_ERRORS);
    await check();
    expect(tutor().errors).toHaveLength(2);
    const [first, second] = tutor().errors;
    if (first === undefined || second === undefined) throw new Error('expected two errors');
    const circuit = store().circuit;
    const firstTargets = highlightTargets(first, circuit);
    const secondTargets = highlightTargets(second, circuit);
    expect(sorted(firstTargets.componentIds)).not.toEqual(sorted(secondTargets.componentIds));

    await waitFor(() => expect(panel().getAttribute('data-collapsed')).toBe('false'));
    expect(markedParts()).toEqual(sorted(firstTargets.componentIds));
    expect(flaggedWires()).toEqual(sorted(firstTargets.wireIds));
    expect(within(panel()).getByRole('heading', { level: 3, name: feedbackOf(first).title })).toBeTruthy();

    fireEvent.click(within(panel()).getByRole('button', { name: feedbackOf(second).title }));
    expect(markedParts()).toEqual(sorted(secondTargets.componentIds));
    expect(flaggedWires()).toEqual(sorted(secondTargets.wireIds));
    expect(within(panel()).getByRole('heading', { level: 3, name: feedbackOf(second).title })).toBeTruthy();
    // What is lit and what the card says agree, and the part left behind carries no flag.
    expect(screen.getByTestId('flag-description').textContent).toBe(feedbackOf(second).title);
    for (const id of firstTargets.componentIds.filter((id) => !secondTargets.componentIds.includes(id))) {
      expect(part(id).getAttribute('data-flagged')).toBe('false');
      expect(part(id).getAttribute('aria-describedby') ?? '').not.toContain(screen.getByTestId('flag-description').id);
    }
  });
});

describe('Highlight: it goes out', () => {
  it('Esc puts it out and the results stay', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    fireEvent.keyDown(svg(), { key: 'Escape' });
    expectNothingLit();
    expect(tutor().errors.length).toBeGreaterThan(0);
    expect(tutor().status).toBe('results');
  });

  it('undo puts it out at once', async () => {
    const db = await makeTestDb();
    await open(db, SHORT);
    // Something to undo first: the check itself leaves no history to step back through.
    await act(async () => {
      await store().nudge('R', 12, 0);
    });
    fireEvent.keyDown(part('SW'), { key: 'Enter' });
    await waitFor(() => expect(tutor().highlight.componentIds.length).toBeGreaterThan(0));
    await act(async () => {
      await store().undo();
    });
    expectNothingLit();
  });

  it('moving a part puts it out at once', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    fireEvent.keyDown(part('R'), { key: 'ArrowRight' });
    expectNothingLit();
  });

  it('wiring puts it out at once', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    act(() => {
      store().startWire('R.a', 'click');
    });
    await act(async () => {
      await store().finishWire('A.pos');
    });
    expect(store().circuit.wires).toHaveLength(3);
    expectNothingLit();
  });

  it('a value change puts it out at once', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    await act(async () => {
      expect(await store().setSupplyVoltage('S', 3)).toBe('changed');
    });
    expectNothingLit();
  });

  it('removing a flagged part leaves no outline, badge or flagged wire behind', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    await act(async () => {
      await store().remove('SW');
    });
    expectNothingLit();
    expect(document.querySelector('[data-part-id="SW"]')).toBeNull();
  });

  it('a second guard: ids that no longer exist are never drawn even if the store still holds them', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    const lit = tutor().highlight;
    const without: Circuit = {
      components: store().circuit.components.filter((c) => c.id !== 'SW'),
      wires: store().circuit.wires.filter((w) => !w.from.startsWith('SW.') && !w.to.startsWith('SW.')),
    };
    act(() => {
      useBenchStore.setState({ circuit: without });
      useTutorStore.setState({ highlight: lit });
    });
    expect(markedParts()).toEqual(['S']);
    expect(flaggedWires()).toEqual([]);
  });
});

describe('Highlight: what a screen reader hears', () => {
  it('every flagged part and wire is described by the primary error’s title, from the feedback file', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    const primary = tutor().errors[0];
    if (primary === undefined) throw new Error('expected an error');
    const title = feedbackOf(primary).title;
    const description = screen.getByTestId('flag-description');
    expect(description.textContent).toBe(title);
    for (const element of [part('S'), part('SW'), wire('w1'), wire('w2')]) {
      expect((element.getAttribute('aria-describedby') ?? '').split(' ')).toContain(description.id);
    }
    expect(part('R').getAttribute('aria-describedby')).toBeNull();
  });

  it('never shows a rule code or a feedback key as text, and the badge is not a tab stop', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    const code = tutor().errors[0]?.code ?? '';
    const key = tutor().errors[0]?.feedbackKey ?? '';
    const words = [screen.getByTestId('flag-description').textContent ?? '', screen.getByTestId('highlight-layer').textContent ?? ''].join(' ');
    expect(words).not.toContain(code);
    expect(words).not.toContain(key);
    expect(words).not.toMatch(/undefined|\{\w+\}|[A-Z]{2,}_[A-Z]+/);
    expect(screen.getByTestId('highlight-layer').querySelector('[tabindex]')).toBeNull();
  });

  it('a meter keeps its reading description and gains the reason (both ids)', async () => {
    const db = await makeTestDb();
    await open(db, TWO_ERRORS);
    await check();
    const reason = screen.getByTestId('flag-description').id;
    const flaggedMeter = ['A', 'V'].map(part).find((node) => node.getAttribute('data-flagged') === 'true');
    expect(flaggedMeter).toBeDefined();
    const ids = (flaggedMeter?.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toContain(reason);
    expect(ids.length).toBe(2);
  });
});

describe('Highlight: Reduce motion', () => {
  it('has no pulse when the operating system asks for reduced motion, and the outlines are still there, static', async () => {
    pretendReducedMotion();
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    expect(markedParts()).toEqual(['S', 'SW']);
    expect(document.querySelector('.animate-error-pulse')).toBeNull();
    expect(document.querySelector('[data-wire-error-outline]')).not.toBeNull();
    expect(document.querySelector('[data-highlight-badge]')).not.toBeNull();
  });

  it('has no pulse once the app’s Reduce motion switch is turned on, and none comes back for the same highlight', async () => {
    const db = await makeTestDb();
    await closeShortedSwitch(db);
    expect(document.querySelector('.animate-error-pulse')).not.toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: t('common.reduceMotion') }));
    await waitFor(() => expect(document.documentElement.dataset.reduceMotion).toBe('true'));
    expect(document.querySelector('.animate-error-pulse')).toBeNull();
    expect(markedParts()).toEqual(['S', 'SW']);
  });
});
