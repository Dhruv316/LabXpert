// Pure value edits for the live parts: switch, supply voltage, resistor value. No React, no clock.
// Like ops.ts, every function returns a new circuit and never changes its input. A change that sets
// the value a part already has returns the same circuit object, so callers can tell "no change".
import type { Circuit, CircuitComponent, ExperimentConfig } from '../model/types';

/** Why a value change was refused. The screen maps these to text later; no sentences live here. */
export type ValueRejection = 'locked' | 'not-allowed' | 'out-of-range';

/** The parts of an experiment that value edits need. */
export type ValueRules = Pick<ExperimentConfig, 'supply' | 'resistorValues'>;

export type ValueResult =
  | { ok: true; circuit: Circuit; before: number; after: number }
  | { ok: false; reason: ValueRejection };

export interface SwitchResult {
  circuit: Circuit;
  closed: boolean;
}

function replacePart(circuit: Circuit, id: string, next: CircuitComponent): Circuit {
  return { ...circuit, components: circuit.components.map((c) => (c.id === id ? next : c)) };
}

/** Flips a switch. Undefined when `id` is not a switch on the bench. */
export function toggleSwitchOp(circuit: Circuit, id: string): SwitchResult | undefined {
  const part = circuit.components.find((c) => c.id === id);
  if (part === undefined || part.type !== 'switch') return undefined;
  const closed = !part.closed;
  return { circuit: replacePart(circuit, id, { ...part, closed }), closed };
}

/**
 * The nearest allowed supply setting: on the experiment's step grid, inside min and max.
 * Rounding is trimmed to 10 decimals so a 0.1 V step never yields 0.30000000000000004.
 */
export function snapSupplyVoltage(volts: number, supply: ValueRules['supply']): number {
  const { min, max, step } = supply;
  const top = min + Math.floor((max - min) / step + 1e-9) * step;
  const steps = Math.round((volts - min) / step);
  const snapped = min + steps * step;
  const clamped = Math.min(Math.max(snapped, min), top);
  return Number(clamped.toFixed(10));
}

/**
 * Sets the supply voltage, clamped to the range and rounded to the step. Only a value that is not a
 * number at all is `out-of-range`. Undefined when `id` is not a supply on the bench.
 */
export function setSupplyVoltageOp(circuit: Circuit, rules: ValueRules, id: string, volts: number): ValueResult | undefined {
  const part = circuit.components.find((c) => c.id === id);
  if (part === undefined || part.type !== 'supply') return undefined;
  if (part.valueLocked === true) return { ok: false, reason: 'locked' };
  if (!Number.isFinite(volts)) return { ok: false, reason: 'out-of-range' };
  const after = snapSupplyVoltage(volts, rules.supply);
  if (after === part.voltage) return { ok: true, circuit, before: part.voltage, after };
  return { ok: true, circuit: replacePart(circuit, id, { ...part, voltage: after }), before: part.voltage, after };
}

/** Sets a resistor to one of the experiment's allowed values. Undefined when `id` is not a resistor on the bench. */
export function setResistorValueOp(circuit: Circuit, rules: ValueRules, id: string, ohms: number): ValueResult | undefined {
  const part = circuit.components.find((c) => c.id === id);
  if (part === undefined || part.type !== 'resistor') return undefined;
  if (part.valueLocked === true) return { ok: false, reason: 'locked' };
  if (!rules.resistorValues.includes(ohms)) return { ok: false, reason: 'not-allowed' };
  if (ohms === part.ohms) return { ok: true, circuit, before: part.ohms, after: ohms };
  return { ok: true, circuit: replacePart(circuit, id, { ...part, ohms }), before: part.ohms, after: ohms };
}
