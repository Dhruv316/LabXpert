// Pure reading maths for the bottom dock: filtering, ratio, best-fit line, graph axes and points,
// observed and calculated resistance. No React, no clock, no student-facing text.
import { checkEquivalentResistance } from '../engine/answer';
import type {
  ActionEvent,
  Circuit,
  ExperimentConfig,
  ExperimentId,
  Reading,
  ResistorComponent,
  TaskConfig,
} from '../model/types';

/** One point on the V-I graph: current on X, voltage on Y. */
export interface GraphPoint {
  current: number;
  voltage: number;
}

export function readingsForTask(readings: readonly Reading[], taskId: string): Reading[] {
  return readings.filter((reading) => reading.taskId === taskId);
}

/** The meters' values as graph points (ammeter is X, voltmeter is Y). */
export function readingPoints(readings: readonly Reading[]): GraphPoint[] {
  return readings.map((reading) => ({ current: reading.ammeter, voltage: reading.voltmeter }));
}

/** V ÷ I; undefined when the current is 0 (the table shows no ratio for that row). */
export function ratioOf(voltage: number, current: number): number | undefined {
  return current === 0 ? undefined : voltage / current;
}

/** Least-squares line through the origin: slope = Σ(I·V) ÷ Σ(I²). Needs 2 or more points and a non-zero denominator. */
export function bestFitSlope(points: readonly GraphPoint[]): number | undefined {
  if (points.length < 2) return undefined;
  const denominator = points.reduce((sum, p) => sum + p.current * p.current, 0);
  if (denominator === 0) return undefined;
  return points.reduce((sum, p) => sum + p.current * p.voltage, 0) / denominator;
}

// The config has no flag for the line (ExperimentConfig has none and spec/ is read-only), so the one
// experiment the UI spec names is listed here.
const BEST_FIT_EXPERIMENTS: readonly ExperimentId[] = ['ohms-law'];

export function showsBestFitLine(experimentId: ExperimentId): boolean {
  return BEST_FIT_EXPERIMENTS.includes(experimentId);
}

/** Ohm's Law shows a V ÷ I column; the same experiments that draw the line show it. */
export const showsRatioColumn = showsBestFitLine;

export interface GraphAxes {
  xMax: number;
  yMax: number;
  xTicks: number[];
  yTicks: number[];
}

const MAX_INTERVALS = 6;
const STEP_MANTISSAS = [1, 2, 5] as const;

/** Tick values from 0 up to `max` in steps of 1, 2 or 5 times a power of ten, with at most 6 intervals. */
function niceTicks(max: number): number[] {
  for (let power = -3; power <= 6; power += 1) {
    for (const mantissa of STEP_MANTISSAS) {
      const step = mantissa * 10 ** power;
      if (max / step <= MAX_INTERVALS + 1e-9) {
        const count = Math.floor(max / step + 1e-9);
        return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 1e6) / 1e6);
      }
    }
  }
  return [0, max];
}

/** X runs 0 to the ammeter range, Y 0 to the voltmeter range (both from the experiment's `meterRanges`). */
export function graphAxes(experiment: Pick<ExperimentConfig, 'meterRanges'>): GraphAxes {
  const { ammeter, voltmeter } = experiment.meterRanges;
  return { xMax: ammeter, yMax: voltmeter, xTicks: niceTicks(ammeter), yTicks: niceTicks(voltmeter) };
}

export interface PlotSize {
  width: number;
  height: number;
}

export interface PlotPoint {
  x: number;
  y: number;
}

/** Maps a reading to the plot area; the origin is bottom left, so Y is flipped. */
export function toGraphXY(point: GraphPoint, axes: GraphAxes, size: PlotSize): PlotPoint {
  return {
    x: (point.current / axes.xMax) * size.width,
    y: size.height - (point.voltage / axes.yMax) * size.height,
  };
}

/** The two ends of the best-fit line in graph units, from the origin to the edge of the axes. Undefined for a negative slope. */
export function bestFitLineEnds(slope: number, axes: GraphAxes): [GraphPoint, GraphPoint] | undefined {
  if (!Number.isFinite(slope) || slope < 0) return undefined;
  const origin: GraphPoint = { current: 0, voltage: 0 };
  if (slope * axes.xMax <= axes.yMax) return [origin, { current: axes.xMax, voltage: slope * axes.xMax }];
  return [origin, { current: axes.yMax / slope, voltage: axes.yMax }];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** V ÷ I of the last reading, rounded to 2 decimals; undefined with no reading or no current. */
export function observedResistance(lastReading: Reading | undefined): number | undefined {
  if (lastReading === undefined) return undefined;
  const ratio = ratioOf(lastReading.voltmeter, lastReading.ammeter);
  return ratio === undefined ? undefined : round2(ratio);
}

function resistorOf(circuit: Circuit, role: 'R1' | 'R2'): number | undefined {
  return circuit.components.find((c): c is ResistorComponent => c.type === 'resistor' && c.role === role)?.ohms;
}

/** What the task's topology should give from R1 and R2 on the bench; undefined for a single-resistor task or a missing resistor. */
export function calculatedEquivalent(circuit: Circuit, task: Pick<TaskConfig, 'requiredTopology'>): number | undefined {
  const r1 = resistorOf(circuit, 'R1');
  const r2 = resistorOf(circuit, 'R2');
  if (task.requiredTopology === 'single' || r1 === undefined || r2 === undefined) return undefined;
  // The typed value is irrelevant here; only the formula's value is wanted.
  return checkEquivalentResistance(task.requiredTopology, r1, r2, 0).expected;
}

/** The supply's setting, or undefined when there is no supply on the bench. */
export function supplyVoltage(circuit: Circuit): number | undefined {
  const supply = circuit.components.find((c) => c.type === 'supply');
  return supply?.type === 'supply' ? supply.voltage : undefined;
}

/**
 * Whether Record reading is enabled: not while the supply is 0 V. With no supply on the bench it stays
 * enabled, so the check can say the supply is missing (rules-spec §D).
 */
export function canRecordReading(circuit: Circuit): boolean {
  return supplyVoltage(circuit) !== 0;
}

/**
 * The task the bench is on: the target of the latest `NEXT_TASK` event (oldest-first list), else the
 * first task. A target that is not one of the experiment's tasks is ignored.
 */
export function currentTaskFromEvents(experiment: Pick<ExperimentConfig, 'id' | 'tasks'>, events: readonly ActionEvent[]): string {
  const first = experiment.tasks[0];
  if (first === undefined) throw new Error(`Experiment has no tasks: ${experiment.id}`);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.actionType !== 'NEXT_TASK') continue;
    const target = event.targetId;
    if (target !== undefined && experiment.tasks.some((task) => task.id === target)) return target;
  }
  return first.id;
}
