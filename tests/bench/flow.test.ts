import { describe, expect, it } from 'vitest';
import { wireFlow, wireFlowFromLive } from '../../src/bench/flow';
import { liveState } from '../../src/bench/live';
import { terminalCurrents } from '../../src/engine/solver';
import type { Circuit, CircuitComponent, ResistorComponent, TerminalRef } from '../../src/model/types';
import { ohmsLaw } from './helpers';

type WirePair = [TerminalRef, TerminalRef];

/** Wires get ids w1, w2, ... in the order given, like wires drawn one after another. */
function build(parts: CircuitComponent[], wires: WirePair[]): Circuit {
  return { components: parts, wires: wires.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })) };
}

const supply = (voltage = 6): CircuitComponent => ({ id: 'S', type: 'supply', x: 0, y: 0, voltage });
const sw = (closed = true): CircuitComponent => ({ id: 'SW', type: 'switch', x: 0, y: 0, closed });
const r = (ohms = 10): ResistorComponent => ({ id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms });
const r1: ResistorComponent = { id: 'R1', type: 'resistor', x: 0, y: 0, role: 'R1', ohms: 10 };
const r2: ResistorComponent = { id: 'R2', type: 'resistor', x: 0, y: 0, role: 'R2', ohms: 20 };
const ammeter: CircuitComponent = { id: 'A', type: 'ammeter', x: 0, y: 0 };
const voltmeter: CircuitComponent = { id: 'V', type: 'voltmeter', x: 0, y: 0 };

/** One word per wire: "S.pos>SW.a" for current from S.pos to SW.a, or "still". Keyed by wire id. */
function arrows(circuit: Circuit): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, current] of wireFlow(circuit, ohmsLaw)) out[id] = current.flowing ? `${current.from}>${current.to}` : 'still';
  return out;
}

const amps = (circuit: Circuit, wireId: string): number => {
  const current = wireFlow(circuit, ohmsLaw).get(wireId);
  if (current === undefined || !current.flowing) throw new Error(`${wireId} is not flowing`);
  return current.amps;
};

// Ohm's Law loop, as a student wires it: S -> SW -> A -> R -> S, voltmeter across R.
const ohmsLoop: WirePair[] = [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg']];
const acrossR: WirePair[] = [['V.pos', 'R.a'], ['V.neg', 'R.b']];
const ohmsParts = (voltage = 6, closed = true): CircuitComponent[] => [supply(voltage), sw(closed), r(), ammeter, voltmeter];
const ohms = (voltage = 6, closed = true): Circuit => build(ohmsParts(voltage, closed), [...ohmsLoop, ...acrossR]);

// Series: S -> SW -> R1 -> A -> R2 -> S, voltmeter across both.
const seriesLoop: WirePair[] = [
  ['S.pos', 'SW.a'], ['SW.b', 'R1.a'], ['R1.b', 'A.pos'], ['A.neg', 'R2.a'], ['R2.b', 'S.neg'],
];
const seriesParts: CircuitComponent[] = [supply(), sw(), r1, r2, ammeter, voltmeter];

// Parallel: ammeter in the main path, both resistors between the same two points.
const parallelLoop: WirePair[] = [
  ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['R1.a', 'R2.a'], ['R1.b', 'S.neg'], ['R2.b', 'S.neg'],
];
const parallel = (extra: WirePair[] = []): Circuit => build(seriesParts, [...parallelLoop, ...extra]);

describe('Ohm’s Law loop', () => {
  // By hand: 6 V / 10 ohm = 0.6 A, round the whole loop; the voltmeter draws nothing.
  it('flows from the supply + round to the supply −, and the voltmeter wires carry nothing', () => {
    expect(arrows(ohms())).toEqual({
      w1: 'S.pos>SW.a',
      w2: 'SW.b>A.pos',
      w3: 'A.neg>R.a',
      w4: 'R.b>S.neg',
      w5: 'still',
      w6: 'still',
    });
  });

  it('carries the same 0.6 A in all four main-loop wires', () => {
    for (const id of ['w1', 'w2', 'w3', 'w4']) expect(amps(ohms(), id)).toBeCloseTo(0.6, 4);
  });

  it('gives the same directions however the voltmeter is wired in', () => {
    const reversedVoltmeter = build(ohmsParts(), [...ohmsLoop, ['V.pos', 'R.b'], ['V.neg', 'R.a']]);
    expect(arrows(reversedVoltmeter)).toMatchObject({
      w1: 'S.pos>SW.a', w2: 'SW.b>A.pos', w3: 'A.neg>R.a', w4: 'R.b>S.neg', w5: 'still', w6: 'still',
    });
  });

  it('does not depend on which end of a wire was drawn first', () => {
    const flipped = build(ohmsParts(), [...ohmsLoop, ...acrossR].map(([from, to]): WirePair => [to, from]));
    expect(arrows(flipped)).toEqual(arrows(ohms()));
  });

  it('does not depend on the order the wires were drawn in', () => {
    const wires = [...ohmsLoop, ...acrossR].reverse();
    const shuffled = build(ohmsParts(), wires);
    // Ids follow the order, so compare by the terminals each wire joins.
    const byPair = (circuit: Circuit): string[] =>
      [...wireFlow(circuit, ohmsLaw).values()].map((c) => (c.flowing ? `${c.from}>${c.to}` : 'still')).sort();
    expect(byPair(shuffled)).toEqual(byPair(ohms()));
  });

  it('keeps the directions and scales the current with the supply: 12 V gives 1.2 A', () => {
    expect(arrows(ohms(12))).toEqual(arrows(ohms(6)));
    expect(amps(ohms(12), 'w1')).toBeCloseTo(1.2, 4);
  });
});

describe('a part wired the other way round', () => {
  it('a reversed ammeter (pos and neg swapped) does not change the direction of current', () => {
    // Wires go SW.b to A.neg and A.pos to R.a. The meter will read negative; the current does not turn round.
    const reversed = build(ohmsParts(), [['S.pos', 'SW.a'], ['SW.b', 'A.neg'], ['A.pos', 'R.a'], ['R.b', 'S.neg'], ...acrossR]);
    expect(liveState(reversed, ohmsLaw).readings.ammeter).toBeLessThan(0);
    expect(arrows(reversed)).toEqual({
      w1: 'S.pos>SW.a',
      w2: 'SW.b>A.neg',
      w3: 'A.pos>R.a',
      w4: 'R.b>S.neg',
      w5: 'still',
      w6: 'still',
    });
  });

  it('a reversed voltmeter does not change the direction of current and still carries none', () => {
    const reversed = build(ohmsParts(), [...ohmsLoop, ['V.pos', 'R.b'], ['V.neg', 'R.a']]);
    expect(liveState(reversed, ohmsLaw).readings.voltmeter).toBeLessThan(0);
    const base = arrows(ohms());
    const now = arrows(reversed);
    for (const id of ['w1', 'w2', 'w3', 'w4']) expect(now[id]).toBe(base[id]);
    expect(now.w5).toBe('still');
    expect(now.w6).toBe('still');
  });

  it('a switch or resistor wired backwards still shows current from + round to −', () => {
    // SW.b meets S.pos, so the current crosses the switch from b to a; R is entered at b.
    const backwards = build(ohmsParts(), [['S.pos', 'SW.b'], ['SW.a', 'A.pos'], ['A.neg', 'R.b'], ['R.a', 'S.neg']]);
    expect(arrows(backwards)).toEqual({
      w1: 'S.pos>SW.b',
      w2: 'SW.a>A.pos',
      w3: 'A.neg>R.b',
      w4: 'R.a>S.neg',
    });
  });
});

describe('two resistors in series', () => {
  // By hand: 6 V / (10 + 20) ohm = 0.2 A everywhere.
  it('all the main-loop wires flow one way round', () => {
    const circuit = build(seriesParts, [...seriesLoop, ['V.pos', 'R1.a'], ['V.neg', 'R2.b']]);
    expect(arrows(circuit)).toEqual({
      w1: 'S.pos>SW.a',
      w2: 'SW.b>R1.a',
      w3: 'R1.b>A.pos',
      w4: 'A.neg>R2.a',
      w5: 'R2.b>S.neg',
      w6: 'still',
      w7: 'still',
    });
    for (const id of ['w1', 'w2', 'w3', 'w4', 'w5']) expect(amps(circuit, id)).toBeCloseTo(0.2, 4);
  });
});

describe('two resistors in parallel', () => {
  // By hand at 6 V: R1 10 ohm takes 0.6 A, R2 20 ohm takes 0.3 A, the supply gives 0.9 A.
  const circuit = parallel();

  it('the branch wires flow and split: 0.9 A in the trunk, 0.6 A and 0.3 A in the branches', () => {
    expect(arrows(circuit)).toEqual({
      w1: 'S.pos>SW.a',
      w2: 'SW.b>A.pos',
      w3: 'A.neg>R1.a',
      w4: 'R1.a>R2.a', // the wire that carries R2's share along
      w5: 'R1.b>S.neg',
      w6: 'R2.b>S.neg',
    });
    expect(amps(circuit, 'w1')).toBeCloseTo(0.9, 4);
    expect(amps(circuit, 'w3')).toBeCloseTo(0.9, 4);
    expect(amps(circuit, 'w4')).toBeCloseTo(0.3, 4);
    expect(amps(circuit, 'w5')).toBeCloseTo(0.6, 4);
    expect(amps(circuit, 'w6')).toBeCloseTo(0.3, 4);
  });

  it('the branches add up to the trunk where the wires meet', () => {
    expect(amps(circuit, 'w5') + amps(circuit, 'w6')).toBeCloseTo(amps(circuit, 'w1'), 4);
  });

  it('every flowing wire agrees with the supply’s + to −', () => {
    const flow = wireFlow(circuit, ohmsLaw);
    let leavingPos = 0;
    let enteringNeg = 0;
    for (const current of flow.values()) {
      if (!current.flowing) continue;
      // Nothing is driven back into + or out of −.
      expect(current.to).not.toBe('S.pos');
      expect(current.from).not.toBe('S.neg');
      if (current.from === 'S.pos') leavingPos += current.amps;
      if (current.to === 'S.neg') enteringNeg += current.amps;
    }
    expect(leavingPos).toBeCloseTo(0.9, 4);
    expect(enteringNeg).toBeCloseTo(0.9, 4);
  });

  it('three wires meeting at one terminal: the voltmeter wire carries nothing, the two branches carry their own', () => {
    // S.neg now has three wires: R1.b, R2.b and the voltmeter's V.neg.
    const junction = parallel([['V.pos', 'R1.a'], ['V.neg', 'S.neg']]);
    expect(arrows(junction)).toEqual({
      w1: 'S.pos>SW.a',
      w2: 'SW.b>A.pos',
      w3: 'A.neg>R1.a',
      w4: 'R1.a>R2.a',
      w5: 'R1.b>S.neg',
      w6: 'R2.b>S.neg',
      w7: 'still',
      w8: 'still',
    });
  });

  it('three terminals joined at A.neg, all carrying current: a trunk that splits in two', () => {
    // A.neg is wired straight to R1.a and to R2.a, so three terminals meet there and the trunk splits in two.
    const star = build(seriesParts, [
      ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['A.neg', 'R2.a'], ['R1.b', 'S.neg'], ['R2.b', 'S.neg'],
    ]);
    expect(arrows(star)).toEqual({
      w1: 'S.pos>SW.a',
      w2: 'SW.b>A.pos',
      w3: 'A.neg>R1.a',
      w4: 'A.neg>R2.a',
      w5: 'R1.b>S.neg',
      w6: 'R2.b>S.neg',
    });
    expect(amps(star, 'w3')).toBeCloseTo(0.6, 4);
    expect(amps(star, 'w4')).toBeCloseTo(0.3, 4);
  });
});

describe('wires that join terminals already on the same node', () => {
  it('a wire that closes a loop of wires carries no current, and the others are unchanged', () => {
    // V.neg is already on S.neg's node through R.b, so this extra wire joins two terminals that share a node.
    const redundant = build(ohmsParts(), [...ohmsLoop, ...acrossR, ['V.neg', 'S.neg']]);
    expect(arrows(redundant)).toEqual({ ...arrows(ohms()), w7: 'still' });
  });

  it('a duplicate of a flowing wire, drawn later, carries no current', () => {
    const duplicate = build(ohmsParts(), [...ohmsLoop, ['SW.b', 'A.pos']]);
    expect(arrows(duplicate)).toEqual({ w1: 'S.pos>SW.a', w2: 'SW.b>A.pos', w3: 'A.neg>R.a', w4: 'R.b>S.neg', w5: 'still' });
  });

  it('the wire drawn last gives way, and the current is still shared correctly', () => {
    // R1.b, R2.b and S.neg are on one node. Drawing the R1.b-R2.b wire first moves R2's current through it.
    const first = parallel([['R1.b', 'R2.b']]); // closes the loop last
    expect(arrows(first)).toMatchObject({ w5: 'R1.b>S.neg', w6: 'R2.b>S.neg', w7: 'still' });

    const early = build(seriesParts, [
      ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['R1.a', 'R2.a'],
      ['R1.b', 'R2.b'], ['R1.b', 'S.neg'], ['R2.b', 'S.neg'],
    ]);
    // By hand: R2's 0.3 A goes R2.b to R1.b, then 0.6 + 0.3 = 0.9 A goes on to S.neg; the last wire is idle.
    expect(arrows(early)).toMatchObject({ w5: 'R2.b>R1.b', w6: 'R1.b>S.neg', w7: 'still' });
    expect(amps(early, 'w5')).toBeCloseTo(0.3, 4);
    expect(amps(early, 'w6')).toBeCloseTo(0.9, 4);
  });
});

describe('wires that bypass or miss a part', () => {
  it('a wire across a resistor takes all the current', () => {
    // R1 shorted: 6 V / 20 ohm (R2 only) = 0.3 A, and it runs through the wire from R1.a to R1.b.
    const shorted = build(seriesParts, [...seriesLoop, ['R1.a', 'R1.b']]);
    expect(arrows(shorted)).toMatchObject({ w2: 'SW.b>R1.a', w3: 'R1.b>A.pos', w6: 'R1.a>R1.b' });
    expect(amps(shorted, 'w6')).toBeCloseTo(0.3, 4);
  });

  it('a wire to a part that is connected at one end only carries nothing', () => {
    // R2 hangs from R1.a with its other end free: no current can go in.
    const dangling = build(seriesParts, [['S.pos', 'SW.a'], ['SW.b', 'R1.a'], ['R1.b', 'S.neg'], ['R1.a', 'R2.a']]);
    expect(arrows(dangling)).toEqual({ w1: 'S.pos>SW.a', w2: 'SW.b>R1.a', w3: 'R1.b>S.neg', w4: 'still' });
  });

  it('a wire that names a terminal not on the bench is still', () => {
    const stray = build(ohmsParts(), [...ohmsLoop, ['R.a', 'X.a']]);
    expect(arrows(stray)).toMatchObject({ w1: 'S.pos>SW.a', w5: 'still' });
  });
});

describe('nothing flows', () => {
  const allStill = (circuit: Circuit): void => {
    const flow = wireFlow(circuit, ohmsLaw);
    expect(flow.size).toBe(circuit.wires.length);
    for (const current of flow.values()) expect(current).toEqual({ flowing: false });
  };

  it('with the switch open', () => allStill(ohms(6, false)));
  it('with the supply at 0 V', () => allStill(ohms(0)));

  it('with an incomplete circuit (one loop wire missing)', () => {
    allStill(build(ohmsParts(), [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ...acrossR]));
  });

  it('with an overload (a wire straight across the supply)', () => {
    allStill(build(ohmsParts(), [...ohmsLoop, ['S.pos', 'S.neg']]));
  });

  it('with an overload through the closed switch and the ammeter', () => {
    allStill(build(ohmsParts(), [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'S.neg']]));
  });

  it('with no supply on the bench, and with an empty bench', () => {
    allStill(build([sw(), r(), ammeter], [['SW.b', 'A.pos'], ['A.neg', 'R.a']]));
    expect(wireFlow({ components: [], wires: [] }, ohmsLaw).size).toBe(0);
  });

  it('asks liveState, so the answer follows its flowing flag', () => {
    const circuit = ohms();
    expect([...wireFlowFromLive(circuit, { flowing: false }).values()].every((c) => !c.flowing)).toBe(true);
    expect(wireFlowFromLive(circuit, { flowing: true }).get('w1')).toMatchObject({ flowing: true, from: 'S.pos', to: 'SW.a' });
  });
});

describe('wireFlow', () => {
  it('lists every wire, in circuit order', () => {
    expect([...wireFlow(ohms(), ohmsLaw).keys()]).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w6']);
  });

  it('gives the same answer whether it solves the live state itself or is handed it', () => {
    const circuit = parallel();
    expect(wireFlowFromLive(circuit, liveState(circuit, ohmsLaw))).toEqual(wireFlow(circuit, ohmsLaw));
  });

  it('does not change the circuit it is given', () => {
    const circuit = parallel();
    const before = JSON.stringify(circuit);
    wireFlow(circuit, ohmsLaw);
    expect(JSON.stringify(circuit)).toBe(before);
  });
});

describe('terminalCurrents (the solver’s read-only helper)', () => {
  it('pushes 0.6 A out of S.pos and draws it in at R.a, and says nothing about the voltmeter', () => {
    const currents = terminalCurrents(ohms());
    expect(currents?.get('S.pos')).toBeCloseTo(0.6, 4);
    expect(currents?.get('S.neg')).toBeCloseTo(-0.6, 4);
    expect(currents?.get('R.a')).toBeCloseTo(-0.6, 4);
    expect(currents?.get('R.b')).toBeCloseTo(0.6, 4);
    expect(currents?.has('V.pos')).toBe(false);
  });

  it('is undefined when there is nothing to solve', () => {
    expect(terminalCurrents(ohms(6, false))).toBeUndefined();
    expect(terminalCurrents(build(ohmsParts(), [...ohmsLoop, ['S.pos', 'S.neg']]))).toBeUndefined();
    expect(terminalCurrents({ components: [r()], wires: [] })).toBeUndefined();
  });

  it('leaves the solver’s own result alone', () => {
    const circuit = ohms();
    const live = liveState(circuit, ohmsLaw);
    terminalCurrents(circuit);
    expect(liveState(circuit, ohmsLaw)).toEqual(live);
  });
});
