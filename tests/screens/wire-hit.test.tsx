import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { BENCH_VIEW } from '../../src/bench/catalog';
import type { Point } from '../../src/bench/geometry';
import { hitTest } from '../../src/bench/hit';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { Circuit, TerminalRef } from '../../src/model/types';
import { flushBenchWrites, useBenchStore } from '../../src/state';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await flushBenchWrites();
  await disposeTestDbs();
  resetAppState();
});

const store = () => useBenchStore.getState();
const TITLE = t('exp.ohms-law.title');
const svg = () => screen.getByRole('group', { name: TITLE });

/** Bench scale of these tests: the scene is drawn at half size, like a 1024 × 640 window, so 1 client px is 2 mat units. */
const SCALE = 0.5;
const at = (mat: Point) => ({ clientX: mat.x * SCALE, clientY: mat.y * SCALE });

const supply = { id: 'S', type: 'supply', x: 40, y: 40, voltage: 6 } as const;
// Level with the supply's posts, so the wire S.pos to R.a runs level and its lowest point is straight below its middle.
const resistor = { id: 'R', type: 'resistor', x: 700, y: 116, role: 'R', ohms: 10 } as const;
/** The lowest point of the wire S.pos (190,154) to R.a (712,154): x 451, y 154 + 0.75 × 0.18 × 522. */
const MID: Point = { x: 451, y: 224.5 };

async function openWith(db: LabXpertDB, circuit: Circuit) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
  // The scene at SCALE, at the page origin, so a client position maps straight to the mat (see wiring-pointer.test.tsx).
  const width = BENCH_VIEW.width * SCALE;
  const height = BENCH_VIEW.height * SCALE;
  vi.spyOn(svg(), 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}),
  });
  useBenchStore.setState({ circuit });
  await waitFor(() => expect(document.querySelector(`[data-part-id="${circuit.components[0]?.id}"]`)).not.toBeNull());
}

function wireEl(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-wire-id="${id}"]`);
  if (found === null) throw new Error(`no wire ${id}`);
  return found;
}

function terminal(ref: TerminalRef): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-terminal-ref="${ref}"]`);
  if (found === null) throw new Error(`no terminal ${ref}`);
  return found;
}

function partEl(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-part-id="${id}"]`);
  if (found === null) throw new Error(`no part ${id}`);
  return found;
}

const oneWire: Circuit = { components: [supply, resistor], wires: [{ id: 'w1', from: 'S.pos', to: 'R.a' }] };

/** A press that reaches the bench itself (the mat), as one on empty mat does. */
const pressMat = (mat: Point) => fireEvent.pointerDown(svg(), { button: 0, pointerId: 1, ...at(mat) });

describe('Wire click area (15C-3)', () => {
  it('a press within 15 screen px of a wire selects it and gives it keyboard focus', async () => {
    const db = await makeTestDb();
    await openWith(db, oneWire);
    pressMat({ x: MID.x, y: MID.y + 15 / SCALE });
    expect(store().selectedWireId).toBe('w1');
    expect(wireEl('w1').getAttribute('data-selected')).toBe('true');
    expect(document.activeElement).toBe(wireEl('w1'));
  });

  it('a press just outside the 32 px band selects nothing, and still clears what was selected', async () => {
    const db = await makeTestDb();
    await openWith(db, oneWire);
    store().selectWire('w1');
    pressMat({ x: MID.x, y: MID.y + 17 / SCALE });
    expect(store().selectedWireId).toBeUndefined();
    expect(wireEl('w1').getAttribute('data-selected')).toBe('false');
  });

  it('only the primary button picks a wire', async () => {
    const db = await makeTestDb();
    await openWith(db, oneWire);
    fireEvent.pointerDown(svg(), { button: 2, pointerId: 1, ...at(MID) });
    expect(store().selectedWireId).toBeUndefined();
  });

  it('the wire under the pointer is lit, with a hand cursor, and goes back when the pointer leaves or is far', async () => {
    const db = await makeTestDb();
    await openWith(db, oneWire);
    const fill = () => wireEl('w1').querySelector('path[stroke-width="5"]')?.getAttribute('class') ?? '';
    expect(fill()).toContain('stroke-teal');
    fireEvent.pointerMove(svg(), { pointerId: 1, ...at({ x: MID.x, y: MID.y + 14 / SCALE }) });
    expect(fill()).toContain('stroke-orange');
    expect(svg().style.cursor).toBe('pointer');
    fireEvent.pointerMove(svg(), { pointerId: 1, ...at({ x: MID.x, y: MID.y + 60 / SCALE }) });
    expect(fill()).toContain('stroke-teal');
    expect(svg().style.cursor).toBe('');
    fireEvent.pointerMove(svg(), { pointerId: 1, ...at(MID) });
    expect(fill()).toContain('stroke-orange');
    fireEvent.pointerLeave(svg());
    expect(fill()).toContain('stroke-teal');
  });

  it('draws the wire without a click area of its own: the band is decided by the hit test, not by the browser', async () => {
    const db = await makeTestDb();
    await openWith(db, oneWire);
    // Every stroke in a wire lets the press through, so nothing in the wire can sit over a part or a post.
    for (const path of Array.from(wireEl('w1').querySelectorAll('path'))) {
      expect(path.getAttribute('class') ?? '').toContain('pointer-events-none');
    }
  });
});

describe('A part beside or under a wire', () => {
  // The ammeter's picture lies across the wire: at x 470 the wire is at y 224, inside the ammeter (x 400 to 560, y 190 to 340).
  const crossing: Circuit = { components: [supply, resistor, { id: 'A', type: 'ammeter', x: 400, y: 190 }], wires: oneWire.wires };
  const onBoth: Point = { x: 470, y: 226 };

  it('the press is on the wire and on the part, and the hit test gives it to the part', async () => {
    const db = await makeTestDb();
    await openWith(db, crossing);
    expect(hitTest(crossing, onBoth, SCALE).order.map((hit) => hit.kind)).toEqual(['part', 'wire']);
  });

  it('a drag that starts there moves the part and does not select the wire', async () => {
    const db = await makeTestDb();
    await openWith(db, crossing);
    const part = partEl('A');
    fireEvent.pointerDown(part, { button: 0, pointerId: 1, ...at(onBoth) });
    // 40 client px right is 80 mat units.
    fireEvent.pointerMove(part, { pointerId: 1, clientX: onBoth.x * SCALE + 40, clientY: onBoth.y * SCALE });
    fireEvent.pointerUp(part, { pointerId: 1 });
    expect(store().circuit.components.find((c) => c.id === 'A')).toMatchObject({ x: 480, y: 190 });
    expect(store().selectedId).toBe('A');
    expect(store().selectedWireId).toBeUndefined();
  });

  it('a press on the mat 15 screen px from the wire, beside the part, selects the wire', async () => {
    const db = await makeTestDb();
    await openWith(db, crossing);
    // Left of the ammeter (x 400): the wire is at y 219 there, so this is 15 px (30 units) below it and outside the part.
    const beside: Point = { x: 380, y: 249.3 };
    expect(hitTest(crossing, beside, SCALE).target).toEqual({ kind: 'wire', id: 'w1' });
    pressMat(beside);
    expect(store().selectedWireId).toBe('w1');
  });
});

describe('Terminals under the wire band', () => {
  it('a press on a post starts a wire from it, though the wire that ends there is within reach', async () => {
    const db = await makeTestDb();
    await openWith(db, oneWire);
    // 15 px from S.pos along the wire: in the wire's band, in the post's 44 px circle, inside the supply's picture.
    const near: Point = { x: 190 + 15 / SCALE, y: 154 + 6 };
    fireEvent.pointerDown(terminal('S.pos'), { button: 0, pointerId: 1, ...at(near) });
    expect(store().drawing).toMatchObject({ from: 'S.pos', method: 'drag' });
    expect(store().selectedWireId).toBeUndefined();
  });

  // The ammeter's + post sits 10 mat units from the supply's + post, so their press circles overlap.
  const crowded: Circuit = {
    components: [
      { id: 'S', type: 'supply', x: 0, y: 0, voltage: 6 },
      { id: 'A', type: 'ammeter', x: 120, y: -20 },
    ],
    wires: [],
  };

  it('where two press circles overlap, the press goes to the nearest post, whichever circle the browser picked', async () => {
    const db = await makeTestDb();
    await openWith(db, crowded);
    // The browser would give both presses to the circle drawn last or first; the nearest post is what counts.
    fireEvent.pointerDown(terminal('S.pos'), { button: 0, pointerId: 1, ...at({ x: 157, y: 114 }) });
    expect(store().drawing?.from).toBe('A.pos');
    expect(store().cancelWire()).toBe(true);
    fireEvent.pointerDown(terminal('A.pos'), { button: 0, pointerId: 1, ...at({ x: 153, y: 114 }) });
    expect(store().drawing?.from).toBe('S.pos');
  });

  it('the second click of click-click goes to the nearest post too', async () => {
    const db = await makeTestDb();
    await openWith(db, crowded);
    store().startWire('S.neg', 'click');
    // Pressed on the S.pos circle but nearer A.pos: the wire ends on A.pos.
    fireEvent.pointerDown(terminal('S.pos'), { button: 0, pointerId: 1, ...at({ x: 157, y: 114 }) });
    await waitFor(() => expect(store().circuit.wires).toEqual([{ id: 'w1', from: 'S.neg', to: 'A.pos' }]));
  });
});

describe('Overlapping wires', () => {
  // Both leave S.pos and run level to the right, lying on top of each other for a stretch.
  const twoWires: Circuit = {
    components: [supply, resistor],
    wires: [
      { id: 'w1', from: 'S.pos', to: 'R.a' },
      { id: 'w2', from: 'S.pos', to: 'R.b' },
    ],
  };
  const shared: Point = { x: 260, y: 187.3 };

  it('a click on the shared stretch selects the topmost wire, every time', async () => {
    const db = await makeTestDb();
    await openWith(db, twoWires);
    for (let i = 0; i < 3; i += 1) {
      pressMat(shared);
      expect(store().selectedWireId).toBe('w2');
      store().selectWire(undefined);
    }
  });

  it('a click near the shared stretch, not exactly on it, still picks the topmost: no pixel precision needed', async () => {
    const db = await makeTestDb();
    await openWith(db, twoWires);
    pressMat({ x: shared.x, y: shared.y + 28 });
    expect(store().selectedWireId).toBe('w2');
  });

  it('Tab and the arrow keys still reach every wire, including the one underneath', async () => {
    const db = await makeTestDb();
    await openWith(db, twoWires);
    // One Tab stop among the wires.
    expect(document.querySelectorAll('[data-wire-id][tabindex="0"]')).toHaveLength(1);
    pressMat(shared);
    const focusedWire = () => document.activeElement?.getAttribute('data-wire-id');
    expect(focusedWire()).toBe('w2');
    fireEvent.keyDown(wireEl('w2'), { key: 'ArrowLeft' });
    expect(focusedWire()).toBe('w1');
    fireEvent.keyDown(wireEl('w1'), { key: 'Enter' });
    expect(store().selectedWireId).toBe('w1');
    fireEvent.keyDown(wireEl('w1'), { key: 'ArrowRight' });
    expect(focusedWire()).toBe('w2');
    fireEvent.keyDown(wireEl('w2'), { key: 'Home' });
    expect(focusedWire()).toBe('w1');
    fireEvent.keyDown(wireEl('w1'), { key: 'End' });
    expect(focusedWire()).toBe('w2');
  });

  it('a click from assistive technology, sent to the wire itself, still selects it', async () => {
    const db = await makeTestDb();
    await openWith(db, twoWires);
    fireEvent.click(wireEl('w1'));
    expect(store().selectedWireId).toBe('w1');
  });
});

describe('Selecting and deleting after a press on the band', () => {
  it('Delete removes the wire that a press on its band selected', async () => {
    const db = await makeTestDb();
    await openWith(db, oneWire);
    pressMat({ x: MID.x, y: MID.y + 10 / SCALE });
    fireEvent.keyDown(wireEl('w1'), { key: 'Delete' });
    await waitFor(() => expect(store().circuit.wires).toEqual([]));
  });

  it('the trash button of the selected wire is still pressable and does not deselect first', async () => {
    const db = await makeTestDb();
    await openWith(db, oneWire);
    pressMat(MID);
    // Found by its data attribute: the toolbar's Remove button has the same name.
    const trash = document.querySelector('[data-wire-trash="w1"]');
    if (trash === null) throw new Error('no trash button');
    fireEvent.pointerDown(trash, { button: 0, pointerId: 1, ...at(MID) });
    expect(store().selectedWireId).toBe('w1');
    fireEvent.click(trash);
    await waitFor(() => expect(store().circuit.wires).toEqual([]));
  });
});
