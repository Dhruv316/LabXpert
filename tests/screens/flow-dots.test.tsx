import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { BENCH_VIEW } from '../../src/bench/catalog';
import { FLOW_DOTS_LOOP_SECONDS } from '../../src/bench/flow-dots';
import { terminalPosition, wirePath } from '../../src/bench/wires';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { Circuit, CircuitComponent, TerminalRef } from '../../src/model/types';
import { flushBenchWrites, selectWireFlow, useBenchStore } from '../../src/state';

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
const circuitOf = (wires: [TerminalRef, TerminalRef][], changes: Partial<Record<string, Partial<CircuitComponent>>> = {}): Circuit => ({
  components: parts().map((part) => ({ ...part, ...changes[part.id] }) as CircuitComponent),
  wires: wires.map(([from, to], index) => ({ id: `w${index + 1}`, from, to })),
});

async function openWith(db: LabXpertDB, circuit: Circuit) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
  useBenchStore.setState({ circuit });
  await waitFor(() => expect(document.querySelector('[data-part-id="V"]')).not.toBeNull());
}

function pretendReducedMotion() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function byTestId(id: string): Element {
  const found = document.querySelector(`[data-testid="${id}"]`);
  if (found === null) throw new Error(`no ${id}`);
  return found;
}
const dotWires = (): string[] => Array.from(document.querySelectorAll('[data-flow-dots]')).map((el) => el.getAttribute('data-flow-dots') ?? '');
const dotsOn = (id: string) => document.querySelector(`[data-flow-dots="${id}"]`);
const wireEl = (id: string): SVGGElement => {
  const found = document.querySelector<SVGGElement>(`[data-wire-id="${id}"]`);
  if (found === null) throw new Error(`no wire ${id}`);
  return found;
};
const terminal = (ref: TerminalRef): SVGGElement => {
  const found = document.querySelector<SVGGElement>(`[data-terminal-ref="${ref}"]`);
  if (found === null) throw new Error(`no terminal ${ref}`);
  return found;
};
const drawnAfter = (later: Element, earlier: Element) => (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
const raise = () => screen.getByRole<HTMLButtonElement>('button', { name: t('bench.supplyUp') });

describe('Flow dots: where they appear', () => {
  it('are on exactly the wires selectWireFlow marks, and not on the voltmeter wires', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    await waitFor(() => expect(dotWires().length).toBeGreaterThan(0));
    const flow = selectWireFlow(store());
    const expected = store()
      .circuit.wires.filter((wire) => flow?.get(wire.id)?.flowing === true)
      .map((wire) => wire.id);
    expect(expected).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(dotWires()).toEqual(expected);
  });

  it('carry the direction of the current: forward when it enters at the wire’s first end, reverse otherwise', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf([['SW.a', 'S.pos'], ['SW.b', 'A.pos'], ['R.a', 'A.neg'], ['R.b', 'S.neg']]));
    await waitFor(() => expect(dotWires()).toEqual(['w1', 'w2', 'w3', 'w4']));
    expect(['w1', 'w2', 'w3', 'w4'].map((id) => dotsOn(id)?.getAttribute('data-flow-direction'))).toEqual(['reverse', 'forward', 'reverse', 'forward']);
  });

  it('animate with a dash offset, one dot spacing per loop, so nothing re-renders per frame', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    await waitFor(() => expect(dotsOn('w1')).not.toBeNull());
    const motion = dotsOn('w1')?.querySelectorAll('animate');
    expect(motion).toHaveLength(2);
    for (const animate of Array.from(motion ?? [])) {
      expect(animate.getAttribute('attributeName')).toBe('stroke-dashoffset');
      expect(animate.getAttribute('dur')).toBe(`${FLOW_DOTS_LOOP_SECONDS}s`);
      expect(animate.getAttribute('repeatCount')).toBe('indefinite');
    }
  });

  it('are not there when the switch is open', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP, { SW: { closed: false } }));
    expect(dotWires()).toEqual([]);
  });

  it('go when the switch is opened and come back when it is closed again', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    await waitFor(() => expect(dotWires()).toHaveLength(4));
    useBenchStore.setState({ circuit: circuitOf(LOOP, { SW: { closed: false } }) });
    await waitFor(() => expect(dotWires()).toEqual([]));
    useBenchStore.setState({ circuit: circuitOf(LOOP) });
    await waitFor(() => expect(dotWires()).toHaveLength(4));
  });

  it('are not there on a short circuit', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf([...LOOP, SHORT]));
    expect(dotWires()).toEqual([]);
  });

  it('are not there at 0 V', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP, { S: { voltage: 0 } }));
    expect(dotWires()).toEqual([]);
  });
});

describe('Flow dots: Reduce motion', () => {
  it('are not drawn when the operating system asks for reduced motion', async () => {
    pretendReducedMotion();
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    expect(dotWires()).toEqual([]);
    expect(document.querySelector('[data-testid="flow-dots-layer"]')).toBeNull();
    expect(document.querySelector('animate')).toBeNull();
  });

  it('go when the app’s Reduce motion switch is turned on, and come back when it is turned off', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    await waitFor(() => expect(dotWires()).toHaveLength(4));
    const toggle = screen.getByRole('switch', { name: t('common.reduceMotion') });
    fireEvent.click(toggle);
    await waitFor(() => expect(document.documentElement.dataset.reduceMotion).toBe('true'));
    expect(dotWires()).toEqual([]);
    fireEvent.click(toggle);
    await waitFor(() => expect(dotWires()).toHaveLength(4));
  });
});

describe('Flow dots: decoration only', () => {
  it('are hidden from assistive technology and offer nothing to focus or press', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    await waitFor(() => expect(dotWires()).toHaveLength(4));
    const layer = byTestId('flow-dots-layer');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.getAttribute('pointer-events')).toBe('none');
    expect(layer.querySelector('[tabindex], [role], text, title, desc')).toBeNull();
    // Every wire is still a named button for assistive technology; the dots add none.
    expect(screen.getAllByRole('button').filter((el) => el.hasAttribute('data-wire-id'))).toHaveLength(LOOP.length);
  });

  it('lie over the wires and under the part text and the terminals, outside every wire’s own group', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    await waitFor(() => expect(dotWires()).toHaveLength(4));
    const layer = byTestId('flow-dots-layer');
    for (const wire of LOOP.map((_, index) => wireEl(`w${index + 1}`))) {
      expect(wire.contains(layer)).toBe(false);
      expect(drawnAfter(layer, wire)).toBe(true);
    }
    expect(drawnAfter(byTestId('part-label-layer'), layer)).toBe(true);
    expect(drawnAfter(byTestId('terminal-layer'), layer)).toBe(true);
  });

  it('use the mat colour with an ink ring, so a dot reads on both the teal and the orange wire', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    await waitFor(() => expect(dotsOn('w1')).not.toBeNull());
    const [ring, dot] = Array.from(dotsOn('w1')?.querySelectorAll('path') ?? []);
    expect(ring?.getAttribute('class')).toContain('stroke-ink');
    expect(dot?.getAttribute('class')).toContain('stroke-mat');
    expect(Number(ring?.getAttribute('stroke-width'))).toBeGreaterThan(Number(dot?.getAttribute('stroke-width')));
  });

  it('do not stop a wire being selected', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    await waitFor(() => expect(dotsOn('w2')).not.toBeNull());
    fireEvent.pointerDown(wireEl('w2'), { button: 0, pointerId: 1 });
    expect(store().selectedWireId).toBe('w2');
    // Still flowing while selected, and the trash button is there too.
    expect(dotsOn('w2')).not.toBeNull();
    expect(document.querySelector('[data-wire-trash="w2"]')).not.toBeNull();
  });

  it('do not stop a wire being started from a terminal', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    await waitFor(() => expect(dotsOn('w1')).not.toBeNull());
    const point = terminalPosition(store().circuit, 'R.a');
    vi.spyOn(svg(), 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: BENCH_VIEW.width, bottom: BENCH_VIEW.height, width: BENCH_VIEW.width, height: BENCH_VIEW.height, x: 0, y: 0, toJSON: () => ({}),
    });
    fireEvent.pointerDown(terminal('R.a'), { button: 0, pointerId: 1, clientX: point?.x ?? 0, clientY: point?.y ?? 0 });
    expect(store().drawing).toMatchObject({ from: 'R.a' });
    expect(dotWires()).toHaveLength(4);
  });
});

describe('Flow dots: moving parts and reloading', () => {
  it('follow the wires when a part is moved', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    await waitFor(() => expect(dotsOn('w3')).not.toBeNull());
    const dOf = (id: string) => dotsOn(id)?.querySelector('path')?.getAttribute('d');
    const before = dOf('w3');
    const wireOf = (circuit: Circuit, id: string) => circuit.wires.find((wire) => wire.id === id);
    const first = store().circuit;
    expect(before).toBe(wirePath(first, wireOf(first, 'w3') ?? first.wires[0])?.d);

    const moved: Circuit = {
      ...first,
      components: first.components.map((part) => (part.id === 'R' ? { ...part, x: 520, y: 260 } : part)),
    };
    useBenchStore.setState({ circuit: moved });
    await waitFor(() => expect(dOf('w3')).not.toBe(before));
    expect(dOf('w3')).toBe(wirePath(moved, wireOf(moved, 'w3') ?? moved.wires[0])?.d);
    // The dots sit on the same curve as the wire they belong to.
    expect(dOf('w3')).toBe(wireEl('w3').querySelector('path')?.getAttribute('d'));
    expect(dotWires()).toEqual(['w1', 'w2', 'w3', 'w4']);
  });

  it('are right after a reload', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP));
    // A supply change saves the whole circuit, so the loop survives the reload.
    fireEvent.click(raise());
    await waitFor(() => expect(store().circuit.components.find((c) => c.id === 'S')).toMatchObject({ voltage: 7 }));
    await flushBenchWrites();
    cleanup();
    resetAppState();
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: TITLE });
    await waitFor(() => expect(document.querySelector('[data-part-id="V"]')).not.toBeNull());
    await waitFor(() => expect(dotWires()).toEqual(['w1', 'w2', 'w3', 'w4']));
    expect(['w1', 'w2', 'w3', 'w4'].map((id) => dotsOn(id)?.getAttribute('data-flow-direction'))).toEqual(['forward', 'forward', 'forward', 'forward']);
  });

  it('are still absent after a reload of a circuit with the switch open', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP, { SW: { closed: false } }));
    fireEvent.click(raise());
    await waitFor(() => expect(store().circuit.components.find((c) => c.id === 'S')).toMatchObject({ voltage: 7 }));
    await flushBenchWrites();
    cleanup();
    resetAppState();
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: TITLE });
    await waitFor(() => expect(document.querySelector('[data-part-id="V"]')).not.toBeNull());
    expect(dotWires()).toEqual([]);
  });
});
