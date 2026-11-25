import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/engine/evaluate';
import errorCodes from '../../src/spec/error-codes.json';
import type { Checkpoint, ExperimentConfig, RuleResult, TerminalRef } from '../../src/model/types';
import { buildCircuit, loadExperiment } from './load-cases';

type Parts = Parameters<typeof buildCircuit>[0]['components'];
type Part = Parts[number];
type Wires = [TerminalRef, TerminalRef][];

const ohms = loadExperiment('ohms-law');
const seriesParallel = loadExperiment('series-parallel');

const supply: Part = { id: 'S', type: 'supply', voltage: 6 };
const closedSwitch: Part = { id: 'SW', type: 'switch', closed: true };
const openSwitch: Part = { id: 'SW', type: 'switch', closed: false };
const resistor: Part = { id: 'R', type: 'resistor', role: 'R', ohms: 10 };
const ammeter: Part = { id: 'A', type: 'ammeter' };
const voltmeter: Part = { id: 'V', type: 'voltmeter' };
const full: Part[] = [supply, closedSwitch, resistor, ammeter, voltmeter];

// The plain loop S -> SW -> R -> S, which every hazard test builds on.
const loop: Wires = [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg']];

function run(
  parts: Part[],
  wires: Wires,
  checkpoint: Checkpoint = 'SWITCH_CLOSE',
  experiment: ExperimentConfig = ohms,
  taskId = 'main',
): RuleResult[] {
  return evaluate({
    experiment,
    taskId,
    circuit: buildCircuit({ components: parts, wires }),
    checkpoint,
    readings: [],
    answers: [],
  });
}

const codes = (results: RuleResult[]): string[] => results.map((result) => result.code).sort();
const keys = (results: RuleResult[]): string[] => results.map((result) => result.feedbackKey).sort();

describe('stage 0: missing parts', () => {
  it('reports every missing type once, with empty affected', () => {
    const results = run([supply, closedSwitch, resistor], loop, 'RECORD_READING');
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      code: 'MISSING_COMPONENT',
      severity: 'error',
      stage: 'state',
      checkpoint: 'RECORD_READING',
      feedbackKey: 'MISSING_COMPONENT',
      affected: { componentIds: [], wireIds: [], terminals: [] },
      params: { types: ['ammeter', 'voltmeter'] },
    });
  });

  it('counts: one resistor is too few for series-parallel', () => {
    const results = run(full, loop, 'RECORD_READING', seriesParallel, 'series');
    expect(results[0]?.params).toEqual({ types: ['resistor'] });
  });

  it('no supply: SWITCH_CLOSE returns [], RECORD_READING reports it as missing', () => {
    const parts = [closedSwitch, resistor, ammeter, voltmeter];
    expect(run(parts, [], 'SWITCH_CLOSE')).toEqual([]);
    expect(run(parts, [], 'RECORD_READING')[0]?.params).toEqual({ types: ['supply'] });
  });

  it('does not run at SWITCH_CLOSE: the half-built circuit goes on to Stage 3', () => {
    expect(codes(run([supply, closedSwitch, resistor], loop, 'SWITCH_CLOSE'))).toEqual(['OK_CIRCUIT_COMPLETE']);
  });

  it('wins over hazards: a short with a part missing reports only MISSING_COMPONENT', () => {
    const results = run([supply, closedSwitch, resistor], [['S.pos', 'S.neg']], 'RECORD_READING');
    expect(codes(results)).toEqual(['MISSING_COMPONENT']);
  });

  it('ANSWER_SUBMIT needs only R1 and R2, and checks nothing else', () => {
    const r1: Part = { id: 'R1', type: 'resistor', role: 'R1', ohms: 10 };
    const r2: Part = { id: 'R2', type: 'resistor', role: 'R2', ohms: 20 };
    const answer = (parts: Part[], wires: Wires): RuleResult[] => run(parts, wires, 'ANSWER_SUBMIT', seriesParallel, 'series');
    expect(answer([r1], [])[0]?.params).toEqual({ types: ['resistor'] });
    expect(answer([r1, r2], [])).toEqual([]);
    // A short on the bench is not a Stage 1 matter at this checkpoint.
    expect(answer([supply, r1, r2], [['S.pos', 'S.neg']])).toEqual([]);
  });
});

describe('stage 1a: AMMETER_PARALLEL', () => {
  it('flags an ammeter with both terminals on one node', () => {
    const results = run([supply, closedSwitch, resistor, ammeter], [...loop, ['A.pos', 'A.neg']]);
    expect(keys(results)).toEqual(['AMMETER_PARALLEL']);
    expect(results[0]?.affected.componentIds).toEqual(['A']);
  });

  it('flags an ammeter across a resistor, and the short it causes is suppressed', () => {
    const results = run([supply, closedSwitch, resistor, ammeter], [...loop, ['A.pos', 'R.a'], ['A.neg', 'R.b']]);
    expect(codes(results)).toEqual(['AMMETER_PARALLEL']);
    expect(results[0]?.affected.componentIds).toEqual(['A', 'R']);
  });

  it('flags an ammeter across the supply, and the short it causes is suppressed', () => {
    const results = run([supply, closedSwitch, resistor, ammeter], [...loop, ['A.pos', 'S.pos'], ['A.neg', 'S.neg']]);
    expect(codes(results)).toEqual(['AMMETER_PARALLEL']);
    expect(results[0]?.affected.componentIds).toEqual(['A', 'S']);
  });

  it('ignores an ammeter across a switch: Stage 1 is silent, Stage 3 says it carries only part of the current', () => {
    const results = run([supply, closedSwitch, resistor, ammeter], [...loop, ['A.pos', 'SW.a'], ['A.neg', 'SW.b']]);
    expect(codes(results)).toEqual(['AMMETER_NOT_IN_SERIES', 'OK_CIRCUIT_COMPLETE', 'OK_POLARITY']);
  });
});

describe('stage 1b: SHORT_CIRCUIT', () => {
  it('flags wires across the supply', () => {
    const results = run([supply, resistor], [['S.pos', 'R.a'], ['R.a', 'S.neg']]);
    expect(codes(results)).toEqual(['SHORT_CIRCUIT']);
    expect(results[0]?.affected.componentIds).toEqual(['S']);
  });

  it('flags a short through a closed switch, naming the switch', () => {
    const results = run([supply, closedSwitch], [['S.pos', 'SW.a'], ['SW.b', 'S.neg']]);
    expect(codes(results)).toEqual(['SHORT_CIRCUIT']);
    expect(results[0]?.affected.componentIds).toEqual(['S', 'SW']);
  });

  it('does not flag a path through an open switch', () => {
    const results = run([supply, openSwitch], [['S.pos', 'SW.a'], ['SW.b', 'S.neg']]);
    expect(codes(results)).not.toContain('SHORT_CIRCUIT');
  });

  it('flags a short made only through an ammeter that is not in parallel', () => {
    const results = run([supply, closedSwitch, ammeter], [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'S.neg']]);
    expect(codes(results)).toEqual(['SHORT_CIRCUIT']);
    expect(results[0]?.affected.componentIds).toEqual(['S', 'SW', 'A']);
  });

  it('returns AMMETER_PARALLEL and SHORT_CIRCUIT together when the short needs no ammeter', () => {
    const wires: Wires = [...loop, ['S.pos', 'S.neg'], ['A.pos', 'R.a'], ['A.neg', 'R.b']];
    expect(codes(run([supply, closedSwitch, resistor, ammeter], wires))).toEqual(['AMMETER_PARALLEL', 'SHORT_CIRCUIT']);
  });
});

describe('stage 2: completeness', () => {
  it('open switch: OPEN_CIRCUIT.switch_open naming every open switch', () => {
    const open = run([supply, openSwitch, resistor, ammeter, voltmeter], loop, 'RECORD_READING');
    expect(keys(open)).toEqual(['OPEN_CIRCUIT.switch_open']);
    expect(open[0]?.affected.componentIds).toEqual(['SW']);
  });

  it('a switch that is open but not the cause still reports a gap', () => {
    const results = run([supply, openSwitch, resistor], [['S.pos', 'SW.a'], ['R.b', 'S.neg']]);
    expect(keys(results)).toEqual(['OPEN_CIRCUIT.gap']);
  });

  it('unwired parts: OPEN_CIRCUIT.gap with empty affected', () => {
    const results = run([supply, closedSwitch], []);
    expect(keys(results)).toEqual(['OPEN_CIRCUIT.gap']);
    expect(results[0]?.affected).toEqual({ componentIds: [], wireIds: [], terminals: [] });
  });

  it('voltmeter breaking the loop: VOLTMETER_SERIES naming the voltmeter', () => {
    const wires: Wires = [['S.pos', 'SW.a'], ['SW.b', 'V.pos'], ['V.neg', 'R.a'], ['R.b', 'S.neg']];
    const results = run([supply, closedSwitch, resistor, voltmeter], wires);
    expect(keys(results)).toEqual(['VOLTMETER_SERIES']);
    expect(results[0]?.affected.componentIds).toEqual(['V']);
  });

  it('voltmeter in series plus an open switch reports the voltmeter first (spec order)', () => {
    const wires: Wires = [['S.pos', 'SW.a'], ['SW.b', 'V.pos'], ['V.neg', 'R.a'], ['R.b', 'S.neg']];
    expect(keys(run([supply, openSwitch, resistor, voltmeter], wires))).toEqual(['VOLTMETER_SERIES']);
  });

  it('a voltmeter wired across the resistor does not count as series', () => {
    const wires: Wires = [...loop, ['V.pos', 'R.a'], ['V.neg', 'R.b']];
    expect(keys(run([supply, closedSwitch, resistor, voltmeter], wires))).toEqual([
      'OK_CIRCUIT_COMPLETE',
      'OK_POLARITY',
      'OK_VOLTMETER_ACROSS',
    ]);
  });
});

describe('stop at the first stage that reports errors', () => {
  it('hazards hide completeness errors', () => {
    // The ammeter is shorted on itself, and nothing else is wired, so Stage 2 would say "gap".
    const results = run([supply, ammeter], [['A.pos', 'A.neg']]);
    expect(codes(results)).toEqual(['AMMETER_PARALLEL']);
  });

  it('a hazard-free circuit with a gap reports only the gap', () => {
    const results = run([supply, closedSwitch, resistor, ammeter], [['S.pos', 'SW.a'], ['SW.b', 'R.a']]);
    expect(keys(results)).toEqual(['OPEN_CIRCUIT.gap']);
  });

  it('a circuit that passes stages 0 to 2 goes on to Stage 3 (unwired voltmeter flagged)', () => {
    const withAmmeter: Wires = [['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg']];
    expect(codes(run(full, withAmmeter, 'RECORD_READING'))).toEqual([
      'OK_AMMETER_SERIES',
      'OK_CIRCUIT_COMPLETE',
      'VOLTMETER_WRONG_PLACE',
    ]);
  });

  it('FINISH runs the finish check only, never the state stages (this bench has no wires at all)', () => {
    expect(codes(run(full, [], 'FINISH'))).toEqual(['MISSING_READING']);
  });
});

describe('activeRules filtering', () => {
  const gap = (experiment: ExperimentConfig): RuleResult[] => run([supply, closedSwitch], [], 'SWITCH_CLOSE', experiment);

  it('drops a code the experiment does not list', () => {
    expect(gap(ohms)).toHaveLength(1);
    const without = { ...ohms, activeRules: ohms.activeRules.filter((code) => code !== 'OPEN_CIRCUIT') };
    expect(gap(without)).toEqual([]);
  });

  it('filters the final list: a dropped hazard does not let a later stage speak', () => {
    const wires: Wires = [['A.pos', 'A.neg']];
    const without = { ...ohms, activeRules: ohms.activeRules.filter((code) => code !== 'AMMETER_PARALLEL') };
    expect(run([supply, ammeter], wires, 'SWITCH_CLOSE', ohms)).toHaveLength(1);
    expect(run([supply, ammeter], wires, 'SWITCH_CLOSE', without)).toEqual([]);
  });
});

describe('result shape', () => {
  const samples: RuleResult[] = [
    ...run([supply, closedSwitch], []),
    ...run([supply, openSwitch, resistor], loop),
    ...run([supply, closedSwitch], [['S.pos', 'SW.a'], ['SW.b', 'S.neg']]),
    ...run([supply, resistor, ammeter], [['A.pos', 'R.a'], ['A.neg', 'R.b']]),
    ...run([supply, closedSwitch, resistor, voltmeter], [['S.pos', 'SW.a'], ['SW.b', 'V.pos'], ['V.neg', 'R.a'], ['R.b', 'S.neg']]),
    ...run([supply], [], 'RECORD_READING'),
  ];

  it('covers every stage 0 to 2 code', () => {
    expect(new Set(samples.map((result) => result.code))).toEqual(
      new Set(['OPEN_CIRCUIT', 'SHORT_CIRCUIT', 'AMMETER_PARALLEL', 'VOLTMETER_SERIES', 'MISSING_COMPONENT']),
    );
  });

  it('uses feedback keys registered for the code in error-codes.json', () => {
    for (const result of samples) {
      const entry = errorCodes.errors.find((error) => error.code === result.code);
      expect(entry?.feedbackKeys).toContain(result.feedbackKey);
      expect(result.severity).toBe('error');
      expect(result.stage).toBe('state');
      expect(result.affected.wireIds).toEqual([]);
      expect(result.affected.terminals).toEqual([]);
    }
  });

  it('does not change its input', () => {
    const circuit = buildCircuit({ components: full, wires: loop });
    const before = JSON.stringify(circuit);
    evaluate({ experiment: ohms, taskId: 'main', circuit, checkpoint: 'RECORD_READING', readings: [], answers: [] });
    expect(JSON.stringify(circuit)).toBe(before);
  });
});
