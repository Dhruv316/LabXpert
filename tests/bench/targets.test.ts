import { describe, expect, it } from 'vitest';
import { TARGET_MIN_PX, TRASH_BASE_RADIUS, terminalHitRadius, trashRadius } from '../../src/bench/targets';
import { allTerminals } from '../../src/bench/wires';
import type { Circuit } from '../../src/model/types';
import tokens from '../../src/spec/design-tokens.json';

const HIT = tokens.terminal.hitRadius;

// A supply alone: its two posts are 100 design units apart (components.json), so a circle can grow to 50.
const supplyAlone: Circuit = { components: [{ id: 'S', type: 'supply', x: 0, y: 0, voltage: 6 }], wires: [] };
// An ammeter whose + post sits 10 units from the supply's + post.
const crowded: Circuit = {
  components: [
    { id: 'S', type: 'supply', x: 0, y: 0, voltage: 6 },
    { id: 'A', type: 'ammeter', x: 120, y: -20 },
  ],
  wires: [],
};

function radiusOf(circuit: Circuit, ref: string, scale: number): number {
  const all = allTerminals(circuit);
  const terminal = all.find((candidate) => candidate.ref === ref);
  if (terminal === undefined) throw new Error(`no terminal ${ref}`);
  return terminalHitRadius(terminal, all, scale);
}

describe('Press targets: terminals', () => {
  it('the minimum is 44 screen px', () => {
    expect(TARGET_MIN_PX).toBe(44);
  });

  it('at scale 1 the circle is 44 px across (radius 22), more than the token radius', () => {
    expect(radiusOf(supplyAlone, 'S.pos', 1)).toBe(22);
    expect(22).toBeGreaterThan(HIT);
  });

  it('on a smaller bench it grows so it is still 44 screen px across', () => {
    const radius = radiusOf(supplyAlone, 'S.pos', 0.5);
    expect(radius).toBe(44);
    expect(radius * 2 * 0.5).toBe(TARGET_MIN_PX);
  });

  it('never grows past half the distance to the next post, so neighbours do not overlap', () => {
    expect(radiusOf(supplyAlone, 'S.pos', 0.3)).toBe(50);
    expect(radiusOf(supplyAlone, 'S.neg', 0.3)).toBe(50);
  });

  it('never goes below the token radius, even when posts are very close or the bench is large', () => {
    expect(radiusOf(crowded, 'S.pos', 0.5)).toBe(HIT);
    expect(radiusOf(supplyAlone, 'S.pos', 4)).toBe(HIT);
  });

  it('keeps the token radius until the bench has a size', () => {
    expect(radiusOf(supplyAlone, 'S.pos', 0)).toBe(HIT);
    expect(radiusOf(supplyAlone, 'S.pos', Number.NaN)).toBe(HIT);
  });

  it('a lone terminal can grow to the full size', () => {
    const lone: Circuit = { components: [{ id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 10 }], wires: [] };
    // The resistor's posts are 176 apart, so there is room.
    expect(radiusOf(lone, 'R.a', 0.5)).toBe(44);
  });
});

describe('Press targets: the wire trash button', () => {
  it('keeps its base radius on a large bench', () => {
    expect(trashRadius(2)).toBe(TRASH_BASE_RADIUS);
    expect(trashRadius(0)).toBe(TRASH_BASE_RADIUS);
  });

  it('is 44 screen px across at scale 1 and below', () => {
    expect(trashRadius(1)).toBe(22);
    expect(trashRadius(0.5) * 2 * 0.5).toBe(TARGET_MIN_PX);
    expect(trashRadius(0.25) * 2 * 0.25).toBe(TARGET_MIN_PX);
  });
});
