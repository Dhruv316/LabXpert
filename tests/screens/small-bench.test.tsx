import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { BENCH_VIEW } from '../../src/bench/catalog';
import { sceneLayout } from '../../src/bench/coords';
import { labelBoxHeight, labelPx, LABEL_DESIGN_SIZE } from '../../src/bench/labels';
import { circleHitsRect, WIRE_LEAD_PX, type Rect, type Segment } from '../../src/bench/overlay';
import { TERMINAL_OFFSETS, WIRE_SAG } from '../../src/bench/wires';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { Circuit, CircuitComponent, TerminalName, TerminalRef } from '../../src/model/types';
import tokens from '../../src/spec/design-tokens.json';
import { flushBenchWrites, useBenchStore } from '../../src/state';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await flushBenchWrites();
  await disposeTestDbs();
  resetAppState();
});

const TITLE = t('exp.ohms-law.title');
/** The bench box of a 1024 × 640 window: about 0.41 screen px per design unit. */
const SMALL = { width: Math.round(BENCH_VIEW.width * 0.41), height: Math.round(BENCH_VIEW.height * 0.41) };
const FULL = { width: BENCH_VIEW.width, height: BENCH_VIEW.height };
const HIT = tokens.terminal.hitRadius;
const STEPPER = { width: 96, height: 44 };

function partEl(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-part-id="${id}"]`);
  if (found === null) throw new Error(`no part ${id}`);
  return found;
}
function chipOf(id: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-part-chip="${id}"]`);
  if (found === null) throw new Error(`no label for ${id}`);
  return found;
}
const fontPx = (id: string): number => Number.parseFloat(chipOf(id).style.fontSize);

function rect(width: number, height: number) {
  return { left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) };
}

/** Pretend the bench layers were laid out at this size, then let them measure again (jsdom has no ResizeObserver, so the window event does it). */
function layOut(size: { width: number; height: number }) {
  for (const id of ['part-chip-layer', 'control-overlay']) {
    vi.spyOn(screen.getByTestId(id), 'getBoundingClientRect').mockReturnValue(rect(size.width, size.height));
  }
  fireEvent(window, new Event('resize'));
}

const circuitOf = (components: CircuitComponent[], wires: [TerminalRef, TerminalRef][]): Circuit => ({
  components,
  wires: wires.map(([from, to], index) => ({ id: `w${index + 1}`, from, to })),
});

async function openWith(db: LabXpertDB, circuit: Circuit) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
  useBenchStore.setState({ circuit });
  await waitFor(() => expect(document.querySelector('[data-part-chip]')).not.toBeNull());
}

// A closed series loop with both meters (6 V across 10 ohm: 0.60 A, 6.00 V).
const LOOP_PARTS: CircuitComponent[] = [
  { id: 'S', type: 'supply', x: 40, y: 40, voltage: 6 },
  { id: 'SW', type: 'switch', x: 300, y: 40, closed: true },
  { id: 'R', type: 'resistor', x: 500, y: 40, role: 'R', ohms: 10 },
  { id: 'A', type: 'ammeter', x: 700, y: 40 },
  { id: 'V', type: 'voltmeter', x: 900, y: 40 },
];
const LOOP_WIRES: [TerminalRef, TerminalRef][] = [
  ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
];

describe('Part labels: size on a small bench', () => {
  it('meter digits, resistor value, supply display and the switch name are all at least 14 px at 1024 × 640', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP_PARTS, LOOP_WIRES));
    layOut(SMALL);
    const scale = sceneLayout(SMALL.width, SMALL.height)?.scale ?? 0;
    expect(scale).toBeGreaterThan(0.4);
    expect(scale).toBeLessThan(0.42);
    await waitFor(() => expect(fontPx('A')).toBe(labelPx(LABEL_DESIGN_SIZE.meter, scale)));
    for (const id of ['A', 'V', 'R', 'S', 'SW']) expect(fontPx(id)).toBeGreaterThanOrEqual(14);
    expect(fontPx('A')).toBe(14);
    expect(fontPx('S')).toBe(14);
  });

  it('keeps the kit size on a full-size bench, and never goes under 14 px at any size in between', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP_PARTS, LOOP_WIRES));
    layOut(FULL);
    await waitFor(() => expect(fontPx('A')).toBe(22));
    expect(fontPx('S')).toBe(22);
    expect(fontPx('R')).toBe(17);
    for (const factor of [0.25, 0.41, 0.6, 0.8]) {
      const size = { width: Math.round(FULL.width * factor), height: Math.round(FULL.height * factor) };
      layOut(size);
      const scale = sceneLayout(size.width, size.height)?.scale ?? 0;
      await waitFor(() => expect(fontPx('A')).toBeCloseTo(labelPx(LABEL_DESIGN_SIZE.meter, scale), 5));
      for (const id of ['A', 'V', 'R', 'S', 'SW']) expect(fontPx(id)).toBeGreaterThanOrEqual(14);
    }
  });
});

describe('Part labels: values and accessible names', () => {
  it('show the live reading, the resistor value, the supply voltage and the switch name', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP_PARTS, LOOP_WIRES));
    expect(chipOf('A').textContent).toBe(t('bench.meterAmps', { value: '0.60' }));
    expect(chipOf('V').textContent).toBe(t('bench.meterVolts', { value: '6.00' }));
    expect(chipOf('R').textContent).toBe(t('bench.resistanceValue', { ohms: 10 }));
    expect(chipOf('S').textContent).toBe(t('bench.supplyValue', { volts: 6 }));
    expect(chipOf('SW').textContent).toBe(t('components.switch'));
  });

  it('show the role badge beside the value of a numbered resistor', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf([{ id: 'R1', type: 'resistor', x: 300, y: 200, role: 'R1', ohms: 10 }], []));
    expect(chipOf('R1').textContent).toBe(`R1${t('bench.resistanceValue', { ohms: 10 })}`);
  });

  it('are hidden from assistive tech and let presses through, while the parts keep their names and the meter its reading', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP_PARTS, LOOP_WIRES));
    const layer = screen.getByTestId('part-chip-layer');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.className).toContain('pointer-events-none');
    expect(screen.getByRole('button', { name: t('components.ammeter') })).toBe(partEl('A'));
    expect(screen.getByRole('button', { name: t('components.voltmeter') })).toBe(partEl('V'));
    expect(screen.getByRole('button', { name: t('components.supply') })).toBe(partEl('S'));
    expect(screen.getByRole('switch', { name: t('bench.switchClosed') })).toBe(partEl('SW'));
    const reading = t('bench.meterReading', { meter: t('components.ammeter'), value: t('bench.meterAmps', { value: '0.60' }) });
    expect(partEl('A').querySelector('desc')?.textContent).toBe(reading);
  });

  it('follow their part when it moves', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(LOOP_PARTS, LOOP_WIRES));
    layOut(FULL);
    await waitFor(() => expect(chipOf('R').style.left).toBe('600px'));
    await useBenchStore.getState().nudge('R', 48, 0);
    await waitFor(() => expect(chipOf('R').style.left).toBe('648px'));
  });
});

describe('Part labels: clear of the terminals', () => {
  /** Top and bottom of a label in layer px, from its pinned edge. */
  function verticalSpan(id: string, layerHeight: number): { top: number; bottom: number } {
    const chip = chipOf(id);
    const height = labelBoxHeight(fontPx(id));
    if (chip.style.top !== '') return { top: Number.parseFloat(chip.style.top), bottom: Number.parseFloat(chip.style.top) + height };
    const bottom = layerHeight - Number.parseFloat(chip.style.bottom);
    return { top: bottom - height, bottom };
  }

  async function check(size: { width: number; height: number }, y: number, edge: 'above' | 'below') {
    const db = await makeTestDb();
    await openWith(db, circuitOf([{ id: 'A', type: 'ammeter', x: 300, y }], []));
    layOut(size);
    const layout = sceneLayout(size.width, size.height);
    if (layout === undefined) throw new Error('no layout');
    await waitFor(() => expect(chipOf('A').getAttribute('data-edge')).toBe(edge));
    const span = verticalSpan('A', size.height);
    for (const terminal of Object.values(TERMINAL_OFFSETS.ammeter)) {
      if (terminal === undefined) continue;
      const centre = layout.offsetY + (y + terminal.y) * layout.scale;
      const ring = HIT * layout.scale;
      const clear = span.bottom <= centre - ring || span.top >= centre + ring;
      expect(clear).toBe(true);
    }
  }

  it('sits above a meter at 1024 × 640 and does not touch its terminals', async () => {
    await check(SMALL, 200, 'above');
  });

  it('goes under the meter when there is no room above, still clear of its terminals', async () => {
    await check(SMALL, 20, 'below');
  });

  it('is clear of the terminals on a full-size bench too', async () => {
    await check(FULL, 300, 'above');
  });
});

describe('Supply stepper: never covers a terminal or the first part of a wire', () => {
  /** The same cubic the wire layer draws, sampled independently of the code under test; layer px. */
  function wireStart(circuit: Circuit, scene: { scale: number; offsetX: number; offsetY: number }, wireId: string, partId: string): Segment[] {
    const wire = circuit.wires.find((w) => w.id === wireId);
    if (wire === undefined) throw new Error('no wire');
    const point = (ref: TerminalRef) => {
      const [id, name] = ref.split('.');
      const part = circuit.components.find((c) => c.id === id);
      const offset = part === undefined ? undefined : TERMINAL_OFFSETS[part.type][name as TerminalName];
      if (part === undefined || offset === undefined) throw new Error('no terminal');
      return { x: part.x + offset.x, y: part.y + offset.y };
    };
    const fromHere = wire.from.startsWith(`${partId}.`);
    const a = point(fromHere ? wire.from : wire.to);
    const b = point(fromHere ? wire.to : wire.from);
    const drop = WIRE_SAG * Math.hypot(b.x - a.x, b.y - a.y);
    const at = (t: number) => {
      const u = 1 - t;
      const c1 = { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 + drop };
      const c2 = { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 + drop };
      return {
        x: scene.offsetX + (u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x) * scene.scale,
        y: scene.offsetY + (u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y) * scene.scale,
      };
    };
    const out: Segment[] = [];
    let previous = at(0);
    for (let step = 1; step <= 200; step += 1) {
      const next = at(step / 200);
      if (Math.hypot(next.x - at(0).x, next.y - at(0).y) > WIRE_LEAD_PX) break;
      out.push({ from: previous, to: next });
      previous = next;
    }
    return out;
  }

  const slot = () => {
    const found = document.querySelector<HTMLElement>('[data-overlay-slot="supply:S"]');
    if (found === null) throw new Error('no slot');
    return found;
  };

  /** The stepper's rectangle in layer px, from the slot's pinned edges and the side it is on. */
  function stepperRect(layerHeight: number): Rect {
    const node = slot();
    const edge = node.getAttribute('data-edge');
    const left = Number.parseFloat(node.style.left);
    const x = edge === 'right' ? left : edge === 'left' ? left - STEPPER.width : left - STEPPER.width / 2;
    const top = node.style.top !== '' ? Number.parseFloat(node.style.top) : layerHeight - Number.parseFloat(node.style.bottom) - STEPPER.height;
    return { left: x, top, right: x + STEPPER.width, bottom: top + STEPPER.height };
  }

  const hits = (segment: Segment, r: Rect): boolean => {
    // A dense walk along the piece is enough for a check that does not share code with the placement.
    for (let step = 0; step <= 50; step += 1) {
      const x = segment.from.x + ((segment.to.x - segment.from.x) * step) / 50;
      const y = segment.from.y + ((segment.to.y - segment.from.y) * step) / 50;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  };

  const SUPPLY: CircuitComponent = { id: 'S', type: 'supply', x: 100, y: 100, voltage: 6 };
  const BELOW: CircuitComponent = { id: 'R', type: 'resistor', x: 100, y: 400, role: 'R', ohms: 10 };

  async function check(size: { width: number; height: number }) {
    const circuit = circuitOf([SUPPLY, BELOW], [['S.pos', 'R.a'], ['S.neg', 'R.b']]);
    const db = await makeTestDb();
    await openWith(db, circuit);
    layOut(size);
    const scene = sceneLayout(size.width, size.height);
    if (scene === undefined) throw new Error('no layout');
    await waitFor(() => expect(slot().getAttribute('data-edge')).not.toBe('below'));
    const box = stepperRect(size.height);
    for (const wireId of ['w1', 'w2']) {
      for (const piece of wireStart(circuit, scene, wireId, 'S')) expect(hits(piece, box)).toBe(false);
    }
    for (const terminal of Object.values(TERMINAL_OFFSETS.supply)) {
      if (terminal === undefined) continue;
      const centre = { x: scene.offsetX + (SUPPLY.x + terminal.x) * scene.scale, y: scene.offsetY + (SUPPLY.y + terminal.y) * scene.scale };
      expect(circleHitsRect(centre, HIT * scene.scale, box)).toBe(false);
    }
  }

  it('moves beside the supply when wires hang below its terminals (full size)', async () => {
    await check(FULL);
  });

  it('does the same at 1024 × 640', async () => {
    await check(SMALL);
  });

  it('stays under the supply when no wire is attached, and is still 44 px or more', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf([SUPPLY], []));
    layOut(FULL);
    await waitFor(() => expect(slot().getAttribute('data-edge')).toBe('below'));
    expect(slot().style.top).toBe('240px');
    for (const button of Array.from(slot().querySelectorAll('button'))) {
      expect(button.className).toContain('min-h-[44px]');
      expect(button.className).toContain('min-w-[44px]');
    }
  });

  it('goes back under the supply when the wires are removed', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf([SUPPLY, BELOW], [['S.pos', 'R.a']]));
    layOut(FULL);
    await waitFor(() => expect(slot().getAttribute('data-edge')).toBe('right'));
    useBenchStore.setState({ circuit: circuitOf([SUPPLY, BELOW], []) });
    await waitFor(() => expect(slot().getAttribute('data-edge')).toBe('below'));
  });
});
