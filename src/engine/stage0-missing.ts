import { TERMINALS_BY_TYPE, type ComponentType, type EvaluateInput, type RuleResult } from '../model/types';
import { stateError } from './stage-support';

function isComponentType(value: string): value is ComponentType {
  return Object.hasOwn(TERMINALS_BY_TYPE, value);
}

function missingComponent(input: EvaluateInput, types: ComponentType[]): RuleResult {
  return stateError(input, 'MISSING_COMPONENT', 'MISSING_COMPONENT', [], { types });
}

/**
 * Stage 0 at RECORD_READING (rules-spec §D): every type in `requiredComponents` must be on the bench
 * in the required number. Missing types are listed once each, in the experiment's own order.
 */
export function checkMissingComponents(input: EvaluateInput): RuleResult[] {
  const missing: ComponentType[] = [];
  for (const [type, needed] of Object.entries(input.experiment.requiredComponents)) {
    if (!isComponentType(type) || needed === undefined) continue;
    const have = input.circuit.components.filter((component) => component.type === type).length;
    if (have < needed) missing.push(type);
  }
  return missing.length > 0 ? [missingComponent(input, missing)] : [];
}

/** Stage 0 at ANSWER_SUBMIT: only the two resistors, roles R1 and R2, are required. */
export function checkMissingForAnswer(input: EvaluateInput): RuleResult[] {
  const roles = new Set<string>();
  for (const component of input.circuit.components) {
    if (component.type === 'resistor') roles.add(component.role);
  }
  return roles.has('R1') && roles.has('R2') ? [] : [missingComponent(input, ['resistor'])];
}
