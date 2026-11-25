// Stepping the supply with the stepper buttons and the arrow keys. Pure: the store does the saving.
import { snapSupplyVoltage, type ValueRules } from './values';

/** The stepper and the arrow keys move the supply by 1 V (UI_SCREENS §3), whatever the experiment's finer step is. */
export const SUPPLY_STEP_VOLTS = 1;

export type SupplyRules = ValueRules['supply'];

export type StepDirection = 1 | -1;

/** The voltage one press away, kept on the experiment's grid and inside its range. */
export function stepSupplyVoltage(volts: number, direction: StepDirection, rules: SupplyRules): number {
  return snapSupplyVoltage(volts + direction * SUPPLY_STEP_VOLTS, rules);
}

/** False at the minimum and at the highest setting the grid allows, where a press would change nothing. */
export function canStepSupply(volts: number, direction: StepDirection, rules: SupplyRules): boolean {
  return stepSupplyVoltage(volts, direction, rules) !== volts;
}
