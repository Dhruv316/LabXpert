import { describe, expect, it } from 'vitest';
import { BENCH_VIEW } from '../../src/bench/catalog';
import { sceneLayout } from '../../src/bench/coords';
import { labelBoxHeight, labelEdge, labelGap, labelPx, LABEL_DESIGN_SIZE, MIN_TEXT_PX } from '../../src/bench/labels';

/** The bench box of a 1024 × 640 window: about 0.41 screen px per design unit (DESIGN.md, 10F-1). */
const SMALL = sceneLayout(Math.round(BENCH_VIEW.width * 0.41), Math.round(BENCH_VIEW.height * 0.41));

describe('labelPx: the sizing rule for part text', () => {
  it('is 14 px, the DESIGN.md §3 minimum', () => {
    expect(MIN_TEXT_PX).toBe(14);
  });

  it('gives every label at least 14 px at the 1024 × 640 bench scale (about 0.41)', () => {
    expect(SMALL?.scale).toBeGreaterThan(0.4);
    expect(SMALL?.scale).toBeLessThan(0.42);
    for (const size of Object.values(LABEL_DESIGN_SIZE)) expect(labelPx(size, SMALL?.scale ?? 0)).toBeGreaterThanOrEqual(14);
  });

  it('gives at least 14 px at every scale from a tiny bench to a large one', () => {
    for (let scale = 0.1; scale <= 3; scale += 0.05) {
      for (const size of Object.values(LABEL_DESIGN_SIZE)) expect(labelPx(size, scale)).toBeGreaterThanOrEqual(14);
    }
  });

  it('keeps the kit size on a bench big enough for it, and grows with the bench', () => {
    expect(labelPx(LABEL_DESIGN_SIZE.meter, 1)).toBe(22);
    expect(labelPx(LABEL_DESIGN_SIZE.supply, 1)).toBe(22);
    expect(labelPx(LABEL_DESIGN_SIZE.resistor, 1)).toBe(17);
    expect(labelPx(LABEL_DESIGN_SIZE.meter, 2)).toBe(44);
  });

  it('is exactly 14 where the design size would be smaller on screen', () => {
    expect(labelPx(LABEL_DESIGN_SIZE.meter, 0.41)).toBe(14);
    expect(labelPx(LABEL_DESIGN_SIZE.switch, 1)).toBe(14);
  });

  it('falls back to the design size (never under 14) before the bench is measured', () => {
    expect(labelPx(22, 0)).toBe(22);
    expect(labelPx(22, Number.NaN)).toBe(22);
    expect(labelPx(10, 0)).toBe(14);
  });
});

describe('label box and placement', () => {
  it('is one 1.2 line of text plus 4 px padding and a 2 px border on each side', () => {
    expect(labelBoxHeight(14)).toBe(17 + 12);
    expect(labelBoxHeight(22)).toBe(27 + 12);
  });

  it('keeps clear of the focus ring, which is 14 units wide', () => {
    expect(labelGap(1)).toBe(18);
    expect(labelGap(0.5)).toBe(11);
    expect(labelGap(0)).toBe(18);
  });

  it('goes under the switch and above every other part (wires hang below terminals)', () => {
    expect(labelEdge('switch')).toBe('below');
    for (const type of ['supply', 'resistor', 'ammeter', 'voltmeter'] as const) expect(labelEdge(type)).toBe('above');
  });
});
