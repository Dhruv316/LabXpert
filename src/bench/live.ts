// What the circuit is doing right now, and the numbers the meters, knob, bands and switch blade need.
// Pure: nothing here reads a clock or touches the DOM, and the solver is not changed.
import { roundReadings, simulate } from '../engine/solver';
import type { Circuit, ExperimentConfig } from '../model/types';
import componentsSpec from '../spec/components.json';

export { resistorBands } from './catalog';

// components.json › supply › dynamicElements › overload-light reads "fill #7A2A22 off, #FF5A4A on (short circuit)".
// The "on" colour is taken from that text, so the colour has one home and is never typed again here.
const OVERLOAD_LIGHT_SPEC: string = componentsSpec.components.supply.dynamicElements['overload-light'];

/** The overload light's lit colour; undefined only if the spec text stops saying it (then the light stays off). */
export const OVERLOAD_LIGHT_ON: string | undefined = /(#[0-9A-Fa-f]{6}) on\b/.exec(OVERLOAD_LIGHT_SPEC)?.[1];

/** Meter readings, signed; null when that meter is not on the bench. */
export interface MeterReadings {
  ammeter: number | null;
  voltmeter: number | null;
}

export interface LiveState {
  overload: boolean;
  complete: boolean;
  supplyCurrent: number;
  /** Straight from the solver, for rules and recorded values. */
  readings: MeterReadings;
  /** What the meters display: rounded to the experiment's decimals. */
  rounded: MeterReadings;
  /** True only for a complete loop, not in overload, with current above zero (drives the flow dots). */
  flowing: boolean;
}

/** Solves the circuit at the supply's real setting (not the probe voltage the rules use). */
export function liveState(circuit: Circuit, experiment: Pick<ExperimentConfig, 'meterRanges'>): LiveState {
  const raw = simulate(circuit);
  const shown = roundReadings(raw, experiment.meterRanges.decimals);
  return {
    overload: raw.overload,
    complete: raw.complete,
    supplyCurrent: raw.supplyCurrent,
    readings: { ammeter: raw.ammeter, voltmeter: raw.voltmeter },
    rounded: { ammeter: shown.ammeter, voltmeter: shown.voltmeter },
    flowing: raw.complete && !raw.overload && raw.supplyCurrent > 0,
  };
}

// components.json › ammeter › needleAngleFormula
const NEEDLE_ZERO = -60;
const NEEDLE_SPAN = 120;
const NEEDLE_MIN = -75;
const NEEDLE_MAX = 60;

/** Needle angle in degrees: 0 reads -60, full scale +60; a reversed meter swings back, stopping at -75. */
export function needleAngle(reading: number, range: number): number {
  const angle = NEEDLE_ZERO + (NEEDLE_SPAN * reading) / range;
  return Math.min(Math.max(angle, NEEDLE_MIN), NEEDLE_MAX);
}

const KNOB_HALF_TURN = 135;

/** Supply knob angle: -135° at `min`, +135° at `max`. */
export function knobAngle(voltage: number, min: number, max: number): number {
  if (max === min) return -KNOB_HALF_TURN;
  const fraction = Math.min(Math.max((voltage - min) / (max - min), 0), 1);
  return -KNOB_HALF_TURN + 2 * KNOB_HALF_TURN * fraction;
}

/** Switch blade angle (components.json › switch › blade). */
export function bladeAngle(closed: boolean): number {
  return closed ? 0 : -25;
}
