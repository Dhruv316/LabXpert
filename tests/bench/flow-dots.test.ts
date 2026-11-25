import { describe, expect, it } from 'vitest';
import { wireFlow } from '../../src/bench/flow';
import { FLOW_DOT_RING, FLOW_DOT_SIZE, FLOW_DOT_SPACING, FLOW_DOTS_LOOP_SECONDS, FLOW_DOTS_SPEED, flowDotsFor } from '../../src/bench/flow-dots';
import type { Circuit, CircuitComponent, TerminalRef } from '../../src/model/types';
import tokens from '../../src/spec/design-tokens.json';
import { ohmsLaw } from './helpers';

type WirePair = [TerminalRef, TerminalRef];

const parts = (voltage = 6, closed = true): CircuitComponent[] => [
  { id: 'S', type: 'supply', x: 0, y: 0, voltage },
  { id: 'SW', type: 'switch', x: 0, y: 0, closed },
  { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 10 },
  { id: 'A', type: 'ammeter', x: 0, y: 0 },
  { id: 'V', type: 'voltmeter', x: 0, y: 0 },
];
const LOOP: WirePair[] = [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b']];

const build = (wires: WirePair[], voltage = 6, closed = true): Circuit => ({
  components: parts(voltage, closed),
  wires: wires.map(([from, to], index) => ({ id: `w${index + 1}`, from, to })),
});

const dotsOf = (circuit: Circuit) => flowDotsFor(circuit, wireFlow(circuit, ohmsLaw));

describe('flowDotsFor', () => {
  it('puts dots on the four loop wires, running the way each wire is drawn, and none on the voltmeter wires', () => {
    expect(dotsOf(build(LOOP))).toEqual([
      { wireId: 'w1', direction: 'forward' },
      { wireId: 'w2', direction: 'forward' },
      { wireId: 'w3', direction: 'forward' },
      { wireId: 'w4', direction: 'forward' },
    ]);
  });

  it('reverses the direction of a wire that was drawn from the other end', () => {
    const wires: WirePair[] = [['SW.a', 'S.pos'], ['SW.b', 'A.pos'], ['R.a', 'A.neg'], ['R.b', 'S.neg']];
    expect(dotsOf(build(wires)).map((dots) => `${dots.wireId}:${dots.direction}`)).toEqual([
      'w1:reverse',
      'w2:forward',
      'w3:reverse',
      'w4:forward',
    ]);
  });

  it('gives no dots when the switch is open, on a short circuit, or at 0 V', () => {
    expect(dotsOf(build(LOOP, 6, false))).toEqual([]);
    expect(dotsOf(build([...LOOP, ['S.pos', 'S.neg']]))).toEqual([]);
    expect(dotsOf(build(LOOP, 0))).toEqual([]);
  });

  it('gives no dots when the loop is incomplete', () => {
    expect(dotsOf(build(LOOP.slice(0, 3)))).toEqual([]);
  });

  it('gives no dots on a wire that closes a loop, as the flow rule says it carries nothing', () => {
    const doubled = dotsOf(build([...LOOP.slice(0, 4), ['SW.a', 'S.pos']]));
    expect(doubled.map((dots) => dots.wireId)).toEqual(['w1', 'w2', 'w3', 'w4']);
  });
});

describe('dot look and speed', () => {
  it('moves at the token speed, one spacing per loop', () => {
    expect(FLOW_DOTS_SPEED).toBe(tokens.motion.flowDotsPxPerSec);
    expect(FLOW_DOTS_LOOP_SECONDS * FLOW_DOTS_SPEED).toBeCloseTo(FLOW_DOT_SPACING, 10);
  });

  it('keeps the dot and its ring inside the wire outline, and wider than the teal fill', () => {
    const ringed = FLOW_DOT_SIZE + FLOW_DOT_RING * 2;
    expect(ringed).toBeLessThanOrEqual(tokens.wire.outlineWidth);
    expect(ringed).toBeGreaterThan(tokens.wire.fillWidth);
    expect(FLOW_DOT_SPACING).toBeGreaterThan(ringed);
  });
});
