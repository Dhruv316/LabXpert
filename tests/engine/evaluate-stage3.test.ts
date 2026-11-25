import { describe, expect, it } from 'vitest';
import errorCodes from '../../src/spec/error-codes.json';
import {
  acrossBoth, acrossPair, acrossR, ammeter, closedSwitch, errorKeys, ohms, ohmsLoop, ohmsParts, okKeys,
  parallelLoop, r1, r2, resistor, run, runSp, seriesLoop, seriesParallel, seriesParts, supply, voltmeter,
  type Part, type Wires,
} from './helpers';

const COMPLETE = 'OK_CIRCUIT_COMPLETE';
const ohmsGood: Wires = [...ohmsLoop, ...acrossR];

describe('stage 3: a good Ohm circuit', () => {
  it('reports every confirmation and no error', () => {
    const results = run(ohmsParts, ohmsGood);
    expect(errorKeys(results)).toEqual([]);
    expect(okKeys(results)).toEqual([COMPLETE, 'OK_AMMETER_SERIES', 'OK_POLARITY', 'OK_VOLTMETER_ACROSS'].sort());
  });

  it('runs at SWITCH_CLOSE as well, with the same verdict', () => {
    expect(okKeys(run(ohmsParts, ohmsGood, { checkpoint: 'SWITCH_CLOSE' }))).toContain('OK_POLARITY');
  });

  it('does not need the ammeter before or after the resistor in particular', () => {
    const after: Wires = [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'A.pos'], ['A.neg', 'S.neg'], ...acrossR];
    expect(errorKeys(run(ohmsParts, after))).toEqual([]);
  });

  it('a 0 V supply setting never changes the verdict (probe at 1 V)', () => {
    const zero: Part = { id: 'S', type: 'supply', voltage: 0 };
    const results = run([zero, closedSwitch, resistor, ammeter, voltmeter], ohmsGood);
    expect(errorKeys(results)).toEqual([]);
    expect(okKeys(results)).toContain('OK_POLARITY');
  });
});

describe('3b: AMMETER_NOT_IN_SERIES', () => {
  it('flags an ammeter wired at one terminal only (dangling)', () => {
    const dangling: Wires = [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg'], ['A.pos', 'R.a'], ...acrossR];
    const results = run(ohmsParts, dangling);
    expect(errorKeys(results)).toEqual(['AMMETER_NOT_IN_SERIES']);
    expect(results.find((result) => result.code === 'AMMETER_NOT_IN_SERIES')?.affected.componentIds).toEqual(['A']);
    expect(okKeys(results)).not.toContain('OK_AMMETER_SERIES');
  });

  it('flags an ammeter with no wires at all', () => {
    const results = run(ohmsParts, [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg'], ...acrossR]);
    expect(errorKeys(results)).toEqual(['AMMETER_NOT_IN_SERIES']);
  });

  it('flags an ammeter in one branch only', () => {
    const branch: Wires = [
      ['S.pos', 'SW.a'], ['SW.b', 'R1.a'], ['R1.a', 'R2.a'], ['R1.b', 'A.pos'], ['A.neg', 'S.neg'], ['R2.b', 'S.neg'], ...acrossPair,
    ];
    const results = runSp(seriesParts, branch, 'parallel');
    expect(errorKeys(results)).toEqual(['AMMETER_NOT_IN_SERIES']);
    expect(okKeys(results)).toContain('OK_TOPOLOGY.parallel');
  });

  it('accepts an ammeter in the main path of a parallel circuit', () => {
    expect(okKeys(runSp(seriesParts, [...parallelLoop, ...acrossPair], 'parallel'))).toContain('OK_AMMETER_SERIES');
  });

  it('says nothing about an ammeter that is not on the bench yet (SWITCH_CLOSE)', () => {
    const wires: Wires = [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg']];
    const results = run([supply, closedSwitch, resistor], wires, { checkpoint: 'SWITCH_CLOSE' });
    expect(okKeys(results)).toEqual([COMPLETE]);
    expect(errorKeys(results)).toEqual([]);
  });
});

describe('3c: topology', () => {
  it('series task: a series pair gets OK_TOPOLOGY.series', () => {
    expect(okKeys(runSp(seriesParts, [...seriesLoop, ...acrossBoth], 'series'))).toContain('OK_TOPOLOGY.series');
  });

  it('series stays series through a closed switch between the resistors', () => {
    const wires: Wires = [['S.pos', 'R1.a'], ['R1.b', 'SW.a'], ['SW.b', 'R2.a'], ['R2.b', 'S.neg']];
    const results = runSp([supply, closedSwitch, r1, r2], wires, 'series', { checkpoint: 'SWITCH_CLOSE' });
    expect(okKeys(results)).toContain('OK_TOPOLOGY.series');
  });

  it('a voltmeter on the junction does not break a series pair', () => {
    const wires: Wires = [...seriesLoop, ['V.pos', 'R1.b'], ['V.neg', 'R2.b']];
    expect(okKeys(runSp(seriesParts, wires, 'series'))).toContain('OK_TOPOLOGY.series');
  });

  it('parallel task: a parallel pair gets OK_TOPOLOGY.parallel', () => {
    expect(okKeys(runSp(seriesParts, [...parallelLoop, ...acrossPair], 'parallel'))).toContain('OK_TOPOLOGY.parallel');
  });

  it('parallel built for a series task: WRONG_TOPOLOGY.series with required and found', () => {
    const results = runSp(seriesParts, [...parallelLoop, ...acrossPair], 'series');
    expect(errorKeys(results)).toEqual(['WRONG_TOPOLOGY.series']);
    const wrong = results.find((result) => result.code === 'WRONG_TOPOLOGY');
    expect(wrong?.params).toEqual({ required: 'series', found: 'parallel' });
    expect(wrong?.affected.componentIds).toEqual(['R1', 'R2']);
  });

  it('series built for a parallel task: WRONG_TOPOLOGY.parallel', () => {
    const results = runSp(seriesParts, [...seriesLoop, ...acrossBoth], 'parallel');
    expect(errorKeys(results)).toEqual(['WRONG_TOPOLOGY.parallel']);
    expect(results.find((result) => result.code === 'WRONG_TOPOLOGY')?.params).toEqual({ required: 'parallel', found: 'series' });
  });

  it('R2 on the bench but unwired is neither', () => {
    const wires: Wires = [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['R1.b', 'S.neg']];
    const results = runSp(seriesParts, wires, 'series');
    expect(results.find((result) => result.code === 'WRONG_TOPOLOGY')?.params).toEqual({ required: 'series', found: 'neither' });
  });

  it('R2 missing from the bench is neither (no crash)', () => {
    const wires: Wires = [['S.pos', 'SW.a'], ['SW.b', 'R1.a'], ['R1.b', 'S.neg']];
    const results = runSp([supply, closedSwitch, r1], wires, 'series', { checkpoint: 'SWITCH_CLOSE' });
    expect(errorKeys(results)).toEqual(['WRONG_TOPOLOGY.series']);
  });

  it('a resistor with both ends on one c-node is neither', () => {
    const wires: Wires = [['S.pos', 'R1.a'], ['R1.b', 'R2.a'], ['R2.b', 'S.neg'], ['R2.a', 'R2.b']];
    const results = runSp([supply, r1, r2], wires, 'series', { checkpoint: 'SWITCH_CLOSE' });
    expect(results.find((result) => result.code === 'WRONG_TOPOLOGY')?.params).toEqual({ required: 'series', found: 'neither' });
  });

  it('a junction that holds a supply terminal is not series', () => {
    // R1.b, R2.a and S.neg meet: the shared node is the supply terminal, so it is no series junction.
    const wires: Wires = [['S.pos', 'R1.a'], ['R1.b', 'R2.a'], ['R2.a', 'S.neg']];
    const results = runSp([supply, r1, r2], wires, 'series', { checkpoint: 'SWITCH_CLOSE' });
    expect(results.find((result) => result.code === 'WRONG_TOPOLOGY')?.params).toEqual({ required: 'series', found: 'neither' });
  });

  it('a junction that holds a third resistor is not series', () => {
    const third: Part = { id: 'R', type: 'resistor', role: 'R', ohms: 5 };
    const wires: Wires = [['S.pos', 'R1.a'], ['R1.b', 'R2.a'], ['R1.b', 'R.a'], ['R2.b', 'S.neg'], ['R.b', 'S.neg']];
    const results = runSp([supply, r1, r2, third], wires, 'series', { checkpoint: 'SWITCH_CLOSE' });
    expect(results.find((result) => result.code === 'WRONG_TOPOLOGY')?.params).toEqual({ required: 'series', found: 'neither' });
  });

  it('single tasks have no topology check at all', () => {
    const keys = [...errorKeys(run(ohmsParts, ohmsGood)), ...okKeys(run(ohmsParts, ohmsGood))];
    expect(keys.some((key) => key.includes('TOPOLOGY'))).toBe(false);
  });
});

describe('3d: VOLTMETER_WRONG_PLACE', () => {
  const flagged = (wires: Wires, parts: Part[] = ohmsParts): string[] => errorKeys(run(parts, [...ohmsLoop, ...wires]));

  it('single: across the resistor is fine, across the supply is fine too (ammeter and switch are one point)', () => {
    expect(flagged(acrossR)).toEqual([]);
    expect(flagged([['V.pos', 'S.pos'], ['V.neg', 'S.neg']])).toEqual([]);
  });

  it('single: across the ammeter is flagged with the single key', () => {
    const results = run(ohmsParts, [...ohmsLoop, ['V.pos', 'A.pos'], ['V.neg', 'A.neg']]);
    expect(errorKeys(results)).toEqual(['VOLTMETER_WRONG_PLACE.single']);
    expect(results.find((result) => result.code === 'VOLTMETER_WRONG_PLACE')?.affected.componentIds).toEqual(['V']);
    expect(okKeys(results)).not.toContain('OK_VOLTMETER_ACROSS');
  });

  it('single: an unwired voltmeter is always flagged', () => {
    expect(flagged([])).toEqual(['VOLTMETER_WRONG_PLACE.single']);
  });

  it('single: both terminals on one c-node is flagged', () => {
    expect(flagged([['V.pos', 'R.a'], ['V.neg', 'R.a']])).toEqual(['VOLTMETER_WRONG_PLACE.single']);
  });

  it('single: one terminal on the resistor and the other hanging is flagged', () => {
    expect(flagged([['V.pos', 'R.a']])).toEqual(['VOLTMETER_WRONG_PLACE.single']);
  });

  it('combination (series): across both resistors is fine, across R1 only is flagged', () => {
    expect(errorKeys(runSp(seriesParts, [...seriesLoop, ...acrossBoth], 'series'))).toEqual([]);
    const results = runSp(seriesParts, [...seriesLoop, ['V.pos', 'R1.a'], ['V.neg', 'R1.b']], 'series');
    expect(errorKeys(results)).toEqual(['VOLTMETER_WRONG_PLACE.combination']);
  });

  it('combination (parallel): across the shared pair is fine', () => {
    expect(errorKeys(runSp(seriesParts, [...parallelLoop, ...acrossPair], 'parallel'))).toEqual([]);
  });

  it('is skipped when 3c found neither: only WRONG_TOPOLOGY, no VOLTMETER result either way', () => {
    const wires: Wires = [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R1.a'], ['R1.b', 'S.neg']];
    const results = runSp(seriesParts, wires, 'series');
    // The unwired voltmeter would be flagged if 3d ran; only WRONG_TOPOLOGY.series comes back.
    expect(errorKeys(results)).toEqual(['WRONG_TOPOLOGY.series']);
    expect(okKeys(results)).not.toContain('OK_VOLTMETER_ACROSS');
  });

  it('uses the topology that was found, not the required one (parallel built for a series task)', () => {
    expect(okKeys(runSp(seriesParts, [...parallelLoop, ...acrossPair], 'series'))).toContain('OK_VOLTMETER_ACROSS');
  });
});

describe('3e: WRONG_POLARITY', () => {
  const reversedAmmeter: Wires = [['S.pos', 'SW.a'], ['SW.b', 'A.neg'], ['A.pos', 'R.a'], ['R.b', 'S.neg'], ...acrossR];
  const reversedVoltmeter: Wires = [...ohmsLoop, ['V.pos', 'R.b'], ['V.neg', 'R.a']];
  const reversedSupply: Wires = [['S.neg', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.pos'], ...acrossR];

  it('reversed ammeter: one WRONG_POLARITY naming the ammeter, no OK_POLARITY', () => {
    const results = run(ohmsParts, reversedAmmeter);
    expect(errorKeys(results)).toEqual(['WRONG_POLARITY']);
    const wrong = results.find((result) => result.code === 'WRONG_POLARITY');
    expect(wrong?.params).toEqual({ componentIds: ['A'] });
    expect(wrong?.affected.componentIds).toEqual(['A']);
    expect(okKeys(results)).not.toContain('OK_POLARITY');
  });

  it('reversed voltmeter: names the voltmeter only', () => {
    const results = run(ohmsParts, reversedVoltmeter);
    expect(results.find((result) => result.code === 'WRONG_POLARITY')?.params).toEqual({ componentIds: ['V'] });
    expect(okKeys(results)).toContain('OK_AMMETER_SERIES');
  });

  it('both meters backwards (supply reversed): one result naming both', () => {
    const results = run(ohmsParts, reversedSupply);
    expect(results.filter((result) => result.code === 'WRONG_POLARITY')).toHaveLength(1);
    expect(results.find((result) => result.code === 'WRONG_POLARITY')?.params).toEqual({ componentIds: ['A', 'V'] });
  });

  it('a meter reading about 0 gives neither WRONG_POLARITY nor OK_POLARITY', () => {
    // The voltmeter sits across the ammeter, so it reads ~0 while the ammeter reads forwards.
    const results = run(ohmsParts, [...ohmsLoop, ['V.pos', 'A.pos'], ['V.neg', 'A.neg']]);
    expect(errorKeys(results)).toEqual(['VOLTMETER_WRONG_PLACE.single']);
    expect(okKeys(results)).not.toContain('OK_POLARITY');
  });

  it('an unwired voltmeter reads 0: no polarity result either way', () => {
    const results = run(ohmsParts, ohmsLoop);
    expect(okKeys(results)).not.toContain('OK_POLARITY');
    expect(errorKeys(results)).not.toContain('WRONG_POLARITY');
  });

  it('OK_POLARITY needs a meter to confirm: none on the bench, none given', () => {
    const wires: Wires = [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg']];
    expect(okKeys(run([supply, closedSwitch, resistor], wires, { checkpoint: 'SWITCH_CLOSE' }))).toEqual([COMPLETE]);
  });

  it('OK_POLARITY with one meter on the bench reads that meter alone', () => {
    const results = run([supply, closedSwitch, resistor, ammeter], ohmsLoop, { checkpoint: 'SWITCH_CLOSE' });
    expect(okKeys(results)).toEqual([COMPLETE, 'OK_AMMETER_SERIES', 'OK_POLARITY'].sort());
  });
});

describe('3b to 3e are evaluated together', () => {
  it('a dangling ammeter and an unwired voltmeter are both reported', () => {
    const wires: Wires = [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg']];
    expect(errorKeys(run(ohmsParts, wires))).toEqual(['AMMETER_NOT_IN_SERIES', 'VOLTMETER_WRONG_PLACE.single']);
  });

  it('wrong topology, a one-branch ammeter and a reversed voltmeter in one run', () => {
    const wires: Wires = [
      ['S.pos', 'SW.a'], ['SW.b', 'R1.a'], ['R1.a', 'R2.a'], ['R1.b', 'A.pos'], ['A.neg', 'S.neg'], ['R2.b', 'S.neg'],
      ['V.pos', 'R1.b'], ['V.neg', 'R1.a'],
    ];
    const results = runSp(seriesParts, wires, 'series');
    expect(errorKeys(results)).toEqual(['AMMETER_NOT_IN_SERIES', 'WRONG_POLARITY', 'WRONG_TOPOLOGY.series']);
    expect(okKeys(results)).toEqual([COMPLETE, 'OK_VOLTMETER_ACROSS']);
  });

  it('reports AMMETER_NOT_IN_SERIES with WRONG_POLARITY', () => {
    const wires: Wires = [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.b'], ['V.neg', 'R.a']];
    expect(errorKeys(run(ohmsParts, wires))).toEqual(['AMMETER_NOT_IN_SERIES', 'WRONG_POLARITY']);
  });
});

describe('result shape and activeRules', () => {
  const results = [
    ...run(ohmsParts, ohmsGood),
    ...run(ohmsParts, [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg']]),
    ...runSp(seriesParts, [...parallelLoop, ...acrossPair], 'series'),
    ...runSp(seriesParts, [...seriesLoop, ...acrossBoth], 'series'),
    ...run(ohmsParts, [['S.neg', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.pos'], ...acrossR]),
  ];

  it('is a state-stage result for the current checkpoint, with only componentIds filled', () => {
    for (const result of results) {
      expect(result.stage).toBe('state');
      expect(result.checkpoint).toBe('RECORD_READING');
      expect(result.affected.wireIds).toEqual([]);
      expect(result.affected.terminals).toEqual([]);
      if (result.severity === 'ok') expect(result.affected.componentIds).toEqual([]);
    }
  });

  it('uses feedback keys registered in error-codes.json', () => {
    for (const result of results) {
      const registry = result.severity === 'ok' ? errorCodes.ok : errorCodes.errors;
      expect(registry.find((entry) => entry.code === result.code)?.feedbackKeys).toContain(result.feedbackKey);
    }
  });

  it('never filters OK_* by activeRules, even when the list is empty', () => {
    const none = { ...ohms, activeRules: [] };
    const filtered = run(ohmsParts, ohmsGood, { experiment: none });
    expect(okKeys(filtered)).toEqual(okKeys(run(ohmsParts, ohmsGood)));
  });

  it('filters error results by activeRules', () => {
    const wires: Wires = [...ohmsLoop];
    expect(errorKeys(run(ohmsParts, wires))).toEqual(['VOLTMETER_WRONG_PLACE.single']);
    const without = { ...ohms, activeRules: ohms.activeRules.filter((code) => code !== 'VOLTMETER_WRONG_PLACE') };
    expect(errorKeys(run(ohmsParts, wires, { experiment: without }))).toEqual([]);
  });

  it('series-parallel: with an empty activeRules the errors go and every confirmation stays', () => {
    const none = { ...seriesParallel, activeRules: [] };
    const good = runSp(seriesParts, [...seriesLoop, ...acrossBoth], 'series', { experiment: none });
    expect(okKeys(good)).toContain('OK_TOPOLOGY.series');
    const wrong = runSp(seriesParts, [...parallelLoop, ...acrossPair], 'series', { experiment: none });
    expect(errorKeys(wrong)).toEqual([]);
    expect(okKeys(wrong)).toEqual([COMPLETE, 'OK_AMMETER_SERIES', 'OK_POLARITY', 'OK_VOLTMETER_ACROSS'].sort());
  });
});
