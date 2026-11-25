import { describe, expect, it } from 'vitest';
import {
  bestFitLineEnds,
  bestFitSlope,
  calculatedEquivalent,
  canRecordReading,
  currentTaskFromEvents,
  graphAxes,
  observedResistance,
  ratioOf,
  readingPoints,
  readingsForTask,
  showsBestFitLine,
  supplyVoltage,
  toGraphXY,
} from '../../src/bench/readings';
import type { ActionEvent, Circuit, Reading } from '../../src/model/types';
import { ohmsLaw, seriesParallel } from './helpers';

function reading(id: string, taskId: string, ammeter: number, voltmeter: number): Reading {
  return { id, attemptId: 'a1', taskId, supplyVoltage: voltmeter, voltmeter, ammeter, timestamp: 1 };
}

const task = (id: string) => {
  const found = seriesParallel.tasks.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no task ${id}`);
  return found;
};

function resistors(r1: number, r2: number): Circuit {
  return {
    components: [
      { id: 'R1', type: 'resistor', x: 0, y: 0, role: 'R1', ohms: r1 },
      { id: 'R2', type: 'resistor', x: 0, y: 0, role: 'R2', ohms: r2 },
    ],
    wires: [],
  };
}

describe('readings by task and the ratio', () => {
  it('keeps only the readings of the task asked for, in order', () => {
    const all = [reading('r1', 'series', 0.1, 3), reading('r2', 'parallel', 0.2, 2), reading('r3', 'series', 0.2, 6)];
    expect(readingsForTask(all, 'series').map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(readingsForTask(all, 'parallel').map((r) => r.id)).toEqual(['r2']);
    expect(readingsForTask(all, 'none')).toEqual([]);
  });

  it('divides voltage by current, and gives nothing when the current is 0', () => {
    expect(ratioOf(6, 0.6)).toBeCloseTo(10, 10);
    expect(ratioOf(0, 0.5)).toBe(0);
    expect(ratioOf(6, 0)).toBeUndefined();
  });

  it('turns readings into points with current on X', () => {
    expect(readingPoints([reading('r1', 'main', 0.2, 2)])).toEqual([{ current: 0.2, voltage: 2 }]);
  });
});

describe('best-fit line', () => {
  const points = [
    { current: 0.2, voltage: 2 },
    { current: 0.4, voltage: 4 },
    { current: 0.6, voltage: 6 },
  ];

  it('is 10 for (0.2, 2), (0.4, 4), (0.6, 6)', () => {
    expect(bestFitSlope(points)).toBeCloseTo(10, 10);
  });

  it('needs two points and a non-zero denominator', () => {
    expect(bestFitSlope([])).toBeUndefined();
    expect(bestFitSlope([{ current: 0.2, voltage: 2 }])).toBeUndefined();
    expect(bestFitSlope([{ current: 0, voltage: 0 }, { current: 0, voltage: 0 }])).toBeUndefined();
  });

  it('is a least-squares line, not a join of the end points', () => {
    // Σ(I·V) = 0.2*3 + 0.4*4 = 2.2; Σ(I²) = 0.04 + 0.16 = 0.2; slope 11.
    expect(bestFitSlope([{ current: 0.2, voltage: 3 }, { current: 0.4, voltage: 4 }])).toBeCloseTo(11, 10);
  });

  it('ends inside the axes, on the top edge for a steep line and the right edge for a shallow one', () => {
    const axes = graphAxes(ohmsLaw);
    const steep = bestFitLineEnds(10, axes);
    expect(steep?.[0]).toEqual({ current: 0, voltage: 0 });
    expect(steep?.[1].voltage).toBe(15);
    expect(steep?.[1].current).toBeCloseTo(1.5, 10);
    const shallow = bestFitLineEnds(2, axes);
    expect(shallow?.[1]).toEqual({ current: 3, voltage: 6 });
    for (const slope of [0, 0.5, 2, 5, 10, 40]) {
      for (const end of bestFitLineEnds(slope, axes) ?? []) {
        expect(end.current).toBeGreaterThanOrEqual(0);
        expect(end.current).toBeLessThanOrEqual(axes.xMax + 1e-9);
        expect(end.voltage).toBeGreaterThanOrEqual(0);
        expect(end.voltage).toBeLessThanOrEqual(axes.yMax + 1e-9);
      }
    }
    expect(bestFitLineEnds(-1, axes)).toBeUndefined();
  });

  it('is shown only for Ohm\'s Law', () => {
    expect(showsBestFitLine('ohms-law')).toBe(true);
    expect(showsBestFitLine('series-parallel')).toBe(false);
  });
});

describe('graph axes', () => {
  it('follow the meter ranges of each experiment', () => {
    const ohms = graphAxes(ohmsLaw);
    expect([ohms.xMax, ohms.yMax]).toEqual([ohmsLaw.meterRanges.ammeter, ohmsLaw.meterRanges.voltmeter]);
    expect(ohms.xTicks).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
    expect(ohms.yTicks).toEqual([0, 5, 10, 15]);
    const series = graphAxes(seriesParallel);
    expect([series.xMax, series.yMax]).toEqual([6, 15]);
    expect(series.xTicks).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('puts the origin bottom left and the far corner top right', () => {
    const axes = graphAxes(ohmsLaw);
    const size = { width: 300, height: 150 };
    expect(toGraphXY({ current: 0, voltage: 0 }, axes, size)).toEqual({ x: 0, y: 150 });
    expect(toGraphXY({ current: 3, voltage: 15 }, axes, size)).toEqual({ x: 300, y: 0 });
    expect(toGraphXY({ current: 1.5, voltage: 7.5 }, axes, size)).toEqual({ x: 150, y: 75 });
  });
});

describe('observed and calculated resistance', () => {
  it('observed is V ÷ I of the last reading, to 2 decimals', () => {
    expect(observedResistance(reading('r', 'series', 0.4, 12))).toBe(30);
    expect(observedResistance(reading('r', 'parallel', 1.8, 12))).toBe(6.67);
    expect(observedResistance(reading('r', 'series', 0, 0))).toBeUndefined();
    expect(observedResistance(undefined)).toBeUndefined();
  });

  it('calculated is 30 for 10 Ω and 20 Ω in series and 6.67 in parallel', () => {
    expect(calculatedEquivalent(resistors(10, 20), task('series'))).toBeCloseTo(30, 10);
    expect(calculatedEquivalent(resistors(10, 20), task('parallel'))).toBeCloseTo(6.67, 2);
  });

  it('has no value for a single-resistor task or a missing resistor', () => {
    const single = ohmsLaw.tasks[0];
    if (single === undefined) throw new Error('no task');
    expect(calculatedEquivalent(resistors(10, 20), single)).toBeUndefined();
    expect(calculatedEquivalent({ components: [], wires: [] }, task('series'))).toBeUndefined();
  });
});

describe('the supply gate', () => {
  const withSupply = (voltage: number): Circuit => ({ components: [{ id: 'S', type: 'supply', x: 0, y: 0, voltage }], wires: [] });

  it('blocks recording at 0 V only', () => {
    expect(canRecordReading(withSupply(0))).toBe(false);
    expect(canRecordReading(withSupply(1))).toBe(true);
    expect(supplyVoltage(withSupply(4))).toBe(4);
  });

  it('stays open with no supply, so the check can report it missing', () => {
    expect(supplyVoltage({ components: [], wires: [] })).toBeUndefined();
    expect(canRecordReading({ components: [], wires: [] })).toBe(true);
  });
});

describe('the current task from events', () => {
  const next = (id: string, target: string | undefined): ActionEvent => ({
    id,
    userId: 'u',
    attemptId: 'a1',
    experimentId: 'series-parallel',
    actionType: 'NEXT_TASK',
    targetId: target,
    timestamp: 1,
  });
  const other: ActionEvent = { ...next('x', undefined), actionType: 'PLACE_COMPONENT' };

  it('is the first task with no NEXT_TASK event', () => {
    expect(currentTaskFromEvents(seriesParallel, [])).toBe('series');
    expect(currentTaskFromEvents(seriesParallel, [other])).toBe('series');
  });

  it('is the target of the latest NEXT_TASK event', () => {
    expect(currentTaskFromEvents(seriesParallel, [next('e1', 'parallel'), other])).toBe('parallel');
    expect(currentTaskFromEvents(seriesParallel, [next('e1', 'parallel'), next('e2', 'series')])).toBe('series');
  });

  it('ignores a target that is not a task of the experiment', () => {
    expect(currentTaskFromEvents(seriesParallel, [next('e1', 'nope')])).toBe('series');
    expect(currentTaskFromEvents(seriesParallel, [next('e1', 'parallel'), next('e2', undefined)])).toBe('parallel');
  });
});
