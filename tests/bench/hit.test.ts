import { describe, expect, it } from 'vitest';
import { hitTest, distanceToWire, type HitTarget } from '../../src/bench/hit';
import { WIRE_HIT_MIN_PX, terminalHitRadius, wireHitHalfWidth } from '../../src/bench/targets';
import { allTerminals, terminalPosition, wireGeometry } from '../../src/bench/wires';
import type { Circuit, TerminalRef } from '../../src/model/types';
import tokens from '../../src/spec/design-tokens.json';

const VISIBLE_HALF = tokens.wire.outlineWidth / 2;

// The supply's posts are S.pos (190,154) and S.neg (90,154); the resistor at y 116 puts R.a at (712,154) and R.b at (888,154),
// so a wire S.pos to R.a is level end to end. Its lowest point is then straight below its middle, and the lead is
// flat there, so a point k below the middle is exactly k from the wire.
const supplyAt = { id: 'S', type: 'supply', x: 40, y: 40, voltage: 6 } as const;
const resistorAt = { id: 'R', type: 'resistor', x: 700, y: 116, role: 'R', ohms: 10 } as const;

const oneWire: Circuit = { components: [supplyAt, resistorAt], wires: [{ id: 'w1', from: 'S.pos', to: 'R.a' }] };

function posOf(circuit: Circuit, ref: TerminalRef) {
  const at = terminalPosition(circuit, ref);
  if (at === undefined) throw new Error(`no terminal ${ref}`);
  return at;
}

/** The lowest point of the level wire S.pos to R.a. */
const wireMid = () => wireGeometry(posOf(oneWire, 'S.pos'), posOf(oneWire, 'R.a')).mid;

const below = (px: number, scale: number) => ({ x: wireMid().x, y: wireMid().y + px / scale });

const kinds = (order: readonly HitTarget[]) => order.map((hit) => hit.kind);

describe('hitTest: priority order', () => {
  it('a terminal beats the part under it and the wire that ends on it', () => {
    const at = posOf(oneWire, 'S.pos');
    const result = hitTest(oneWire, at, 1);
    expect(result.target).toEqual({ kind: 'terminal', ref: 'S.pos' });
    // Everything underneath is still listed, in priority order: terminal, then part, then wire.
    expect(result.order).toEqual([
      { kind: 'terminal', ref: 'S.pos' },
      { kind: 'part', id: 'S' },
      { kind: 'wire', id: 'w1' },
    ]);
  });

  it('a part beats a wire that runs over its body', () => {
    // 25 units along the wire from S.pos: still inside the supply's picture, outside both press circles, and right on the lead.
    const point = { x: 215, y: 166.9 };
    const result = hitTest(oneWire, point, 1);
    expect(result.target).toEqual({ kind: 'part', id: 'S' });
    expect(kinds(result.order)).toEqual(['part', 'wire']);
  });

  it('a wire is hit only where no terminal and no part is', () => {
    expect(hitTest(oneWire, wireMid(), 1).target).toEqual({ kind: 'wire', id: 'w1' });
  });

  it('empty mat hits nothing', () => {
    const result = hitTest(oneWire, { x: 900, y: 600 }, 0.6);
    expect(result.target).toBeUndefined();
    expect(result.order).toEqual([]);
  });

  it('a part drawn later is on top: the switch lies over the part it overlaps', () => {
    const overlap: Circuit = {
      components: [
        { id: 'SW', type: 'switch', x: 100, y: 100, closed: false },
        { id: 'R', type: 'resistor', x: 120, y: 100, role: 'R', ohms: 10 },
      ],
      wires: [],
    };
    // Far from every post, inside both pictures.
    expect(kinds(hitTest(overlap, { x: 200, y: 160 }, 1).order)).toEqual(['part', 'part']);
    expect(hitTest(overlap, { x: 200, y: 160 }, 1).order).toEqual([
      { kind: 'part', id: 'SW' },
      { kind: 'part', id: 'R' },
    ]);
  });
});

describe('hitTest: the wire click band', () => {
  it('is at least 32 screen px across, at any bench scale', () => {
    expect(WIRE_HIT_MIN_PX).toBe(32);
    for (const scale of [0.3, 0.46, 0.5, 0.6, 0.8, 1, 1.5]) {
      expect(wireHitHalfWidth(scale) * 2 * scale).toBeGreaterThanOrEqual(WIRE_HIT_MIN_PX - 1e-9);
    }
  });

  it('hits within 15 screen px of the wire, at several bench scales', () => {
    for (const scale of [0.3, 0.46, 0.5, 0.6, 0.8, 1, 1.5, 2]) {
      expect(hitTest(oneWire, below(15, scale), scale).target).toEqual({ kind: 'wire', id: 'w1' });
    }
  });

  it('hits nothing just beyond the band', () => {
    for (const scale of [0.3, 0.46, 0.5, 0.6, 0.8, 1, 1.5, 2]) {
      // The band is 32 px across, or the old 22 design units where that is wider on a large bench.
      const halfPx = Math.max(WIRE_HIT_MIN_PX / 2, (22 / 2) * scale);
      expect(hitTest(oneWire, below(halfPx + 2, scale), scale).target).toBeUndefined();
    }
  });

  it('is 16 px each side at the 1024 × 640 and 1366 × 768 bench scales', () => {
    // Scales from benchLayout: about 0.46 to 0.5 and 0.599.
    for (const scale of [0.5, 0.599]) {
      expect(hitTest(oneWire, below(15.5, scale), scale).target?.kind).toBe('wire');
      expect(hitTest(oneWire, below(16.5, scale), scale).target).toBeUndefined();
    }
  });

  it('measures from the curve, not from the straight line between the posts', () => {
    // The lead sags 94 units; a point on the straight chord, well above the lead, is far from it.
    const chord = { x: wireMid().x, y: 154 };
    expect(hitTest(oneWire, chord, 0.5).target).toBeUndefined();
  });

  it('a wire that starts and ends at the same place is a point, not an error', () => {
    const point = { x: 10, y: 10 };
    expect(distanceToWire({ x: 13, y: 14 }, point, point)).toBe(5);
  });

  it('distanceToWire is 0 on the posts and on the middle', () => {
    const from = posOf(oneWire, 'S.pos');
    const to = posOf(oneWire, 'R.a');
    expect(distanceToWire(from, from, to)).toBeLessThan(1e-9);
    expect(distanceToWire(to, from, to)).toBeLessThan(1e-9);
    expect(distanceToWire(wireMid(), from, to)).toBeLessThan(0.1);
  });
});

describe('hitTest: nearest terminal', () => {
  // The ammeter's + post is 10 design units from the supply's + post.
  const crowded: Circuit = {
    components: [
      { id: 'S', type: 'supply', x: 0, y: 0, voltage: 6 },
      { id: 'A', type: 'ammeter', x: 120, y: -20 },
    ],
    wires: [],
  };

  it('where two press circles overlap, the nearest post wins', () => {
    expect(hitTest(crowded, { x: 153, y: 114 }, 0.5).target).toEqual({ kind: 'terminal', ref: 'S.pos' });
    expect(hitTest(crowded, { x: 157, y: 114 }, 0.5).target).toEqual({ kind: 'terminal', ref: 'A.pos' });
    // Both are listed, nearest first.
    expect(hitTest(crowded, { x: 157, y: 114 }, 0.5).order.slice(0, 2)).toEqual([
      { kind: 'terminal', ref: 'A.pos' },
      { kind: 'terminal', ref: 'S.pos' },
    ]);
  });

  it('the strip between the two posts of a meter always goes to the nearer post, never to the meter body', () => {
    // 80 design units apart: 44 px or less on screen at a bench scale of 0.55 or less. There the two circles meet in the
    // middle, so the whole strip belongs to a post (above 0.55 the posts are 44 px apart or more and each keeps a full circle).
    const meter: Circuit = { components: [{ id: 'A', type: 'ammeter', x: 200, y: 200 }], wires: [] };
    for (const scale of [0.4, 0.46, 0.5, 0.55]) {
      const pos = posOf(meter, 'A.pos');
      const neg = posOf(meter, 'A.neg');
      for (let x = pos.x; x <= neg.x; x += 1) {
        const target = hitTest(meter, { x, y: pos.y }, scale).target;
        expect(target?.kind).toBe('terminal');
        const nearer = Math.abs(x - pos.x) <= Math.abs(x - neg.x) ? 'A.pos' : 'A.neg';
        expect(target).toEqual({ kind: 'terminal', ref: nearer });
      }
    }
  });

  it('uses the same circle the screen draws, so a press just outside it goes to the part', () => {
    const lone: Circuit = { components: [supplyAt], wires: [] };
    const scale = 0.5;
    const all = allTerminals(lone);
    const pos = all.find((terminal) => terminal.ref === 'S.pos');
    if (pos === undefined) throw new Error('no S.pos');
    const radius = terminalHitRadius(pos, all, scale);
    // 44 screen px across at scale 0.5.
    expect(radius * 2 * scale).toBe(44);
    expect(hitTest(lone, { x: pos.x - radius + 1, y: pos.y }, scale).target).toEqual({ kind: 'terminal', ref: 'S.pos' });
    expect(hitTest(lone, { x: pos.x - radius - 1, y: pos.y }, scale).target).toEqual({ kind: 'part', id: 'S' });
  });
});

describe('hitTest: overlapping wires', () => {
  // Both leave S.pos and run level to the right, so for a stretch they lie on top of each other.
  const twoWires = (order: readonly ['w1' | 'w2', 'w1' | 'w2']): Circuit => ({
    components: [supplyAt, resistorAt],
    wires: order.map((id) => ({ id, from: 'S.pos' as const, to: id === 'w1' ? ('R.a' as const) : ('R.b' as const) })),
  });
  const shared = { x: 260, y: 187.3 };

  it('the wire drawn last (the topmost) is picked, every time', () => {
    const circuit = twoWires(['w1', 'w2']);
    // Both are within the width of the drawn lead here, so they truly overlap.
    const a = posOf(circuit, 'S.pos');
    expect(distanceToWire(shared, a, posOf(circuit, 'R.a'))).toBeLessThanOrEqual(VISIBLE_HALF);
    expect(distanceToWire(shared, a, posOf(circuit, 'R.b'))).toBeLessThanOrEqual(VISIBLE_HALF);
    for (let i = 0; i < 3; i += 1) {
      const result = hitTest(circuit, shared, 0.5);
      expect(result.target).toEqual({ kind: 'wire', id: 'w2' });
      expect(result.order).toEqual([
        { kind: 'wire', id: 'w2' },
        { kind: 'wire', id: 'w1' },
      ]);
    }
  });

  it('topmost means drawn last: swapping the order swaps the answer', () => {
    expect(hitTest(twoWires(['w2', 'w1']), shared, 0.5).target).toEqual({ kind: 'wire', id: 'w1' });
  });

  it('a wire the press is on beats a later wire that only has the press in its band', () => {
    // w1 level from S.pos to R.a; w3 later, from S.neg to R.b, runs lower: its band reaches w1's middle, its lead does not.
    const circuit: Circuit = {
      components: [supplyAt, resistorAt],
      wires: [
        { id: 'w1', from: 'S.pos', to: 'R.a' },
        { id: 'w3', from: 'S.neg', to: 'R.b' },
      ],
    };
    const scale = 0.4;
    const onW1 = wireMid();
    const w3 = distanceToWire(onW1, posOf(circuit, 'S.neg'), posOf(circuit, 'R.b'));
    expect(w3).toBeGreaterThan(VISIBLE_HALF);
    expect(w3).toBeLessThanOrEqual(wireHitHalfWidth(scale));
    expect(hitTest(circuit, onW1, scale).order).toEqual([
      { kind: 'wire', id: 'w1' },
      { kind: 'wire', id: 'w3' },
    ]);
  });

  it('with only band overlap, the topmost of the wires in the band is picked', () => {
    const circuit = twoWires(['w1', 'w2']);
    const result = hitTest(circuit, { x: shared.x, y: shared.y + 28 }, 0.5);
    expect(result.target).toEqual({ kind: 'wire', id: 'w2' });
  });
});
