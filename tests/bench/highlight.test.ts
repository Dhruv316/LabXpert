import { describe, expect, it } from 'vitest';
import { PART_SIZE } from '../../src/bench/catalog';
import { NO_HIGHLIGHT } from '../../src/bench/checkpoint';
import { OUTLINE_PAD, partMarks, visibleHighlight } from '../../src/bench/highlight';
import type { Circuit } from '../../src/model/types';

const CIRCUIT: Circuit = {
  components: [
    { id: 'S', type: 'supply', x: 40, y: 50, voltage: 6 },
    { id: 'SW', type: 'switch', x: 300, y: 60, closed: true },
  ],
  wires: [{ id: 'w1', from: 'S.pos', to: 'SW.a' }],
};

describe('visibleHighlight', () => {
  it('keeps the ids that are on the bench and drops the ones that are gone', () => {
    const visible = visibleHighlight(CIRCUIT, { componentIds: ['S', 'GONE'], wireIds: ['w1', 'w9'] });
    expect([...visible.componentIds]).toEqual(['S']);
    expect([...visible.wireIds]).toEqual(['w1']);
  });

  it('is empty for no highlight', () => {
    const visible = visibleHighlight(CIRCUIT, NO_HIGHLIGHT);
    expect(visible.componentIds.size).toBe(0);
    expect(visible.wireIds.size).toBe(0);
  });
});

describe('partMarks', () => {
  it('gives the part’s current position and its catalogue size, only for the flagged ones', () => {
    expect(partMarks(CIRCUIT, new Set(['SW']))).toEqual([{ id: 'SW', x: 300, y: 60, ...PART_SIZE.switch }]);
  });

  it('follows a part that moved', () => {
    const moved: Circuit = { ...CIRCUIT, components: CIRCUIT.components.map((c) => (c.id === 'S' ? { ...c, x: 90 } : c)) };
    expect(partMarks(moved, new Set(['S']))[0]).toMatchObject({ x: 90, y: 50 });
  });

  it('stands off the box far enough to show beside the selected outline (8) and the focus ring (14)', () => {
    expect(OUTLINE_PAD).toBeGreaterThan(8);
    expect(OUTLINE_PAD).toBeLessThan(14);
  });
});
