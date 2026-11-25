import {
  type AmmeterComponent,
  type Circuit,
  type EvaluateInput,
  type RuleResult,
  type TaskConfig,
  type VoltmeterComponent,
} from '../model/types';
import { contractedNodes } from './graph';
import { probeSolve, readingSign } from './solver';
import { stateError, stateOk } from './stage-support';
import {
  classifyTopology,
  contractedIndex,
  nodesOf,
  pairKey,
  resistorsWithRoles,
  type TopologyFinding,
} from './stage3-topology';

/** rules-spec 3b: relative tolerance when comparing the ammeter's current with the supply's. */
const SERIES_TOLERANCE = 1e-6;

function firstMeter<T extends AmmeterComponent | VoltmeterComponent>(circuit: Circuit, type: T['type']): T | undefined {
  return circuit.components.find((component): component is T => component.type === type);
}

/** 3b. All the current must pass through the ammeter; a dangling or one-branch ammeter reads less. */
function ammeterSeries(input: EvaluateInput, ammeterReading: number | null, supplyCurrent: number): RuleResult[] {
  const ammeter = firstMeter<AmmeterComponent>(input.circuit, 'ammeter');
  if (ammeter === undefined || ammeterReading === null) return [];
  const off = Math.abs(Math.abs(ammeterReading) - Math.abs(supplyCurrent)) > SERIES_TOLERANCE * Math.abs(supplyCurrent);
  return off
    ? [stateError(input, 'AMMETER_NOT_IN_SERIES', 'AMMETER_NOT_IN_SERIES', [ammeter.id])]
    : [stateOk(input, 'OK_AMMETER_SERIES')];
}

/** 3c. Only for series and parallel tasks; `single` tasks have no topology check. */
function topologyCheck(input: EvaluateInput, task: TaskConfig, finding: TopologyFinding): RuleResult[] {
  const required = task.requiredTopology;
  if (required === 'single') return [];
  if (finding.found === required) return [stateOk(input, 'OK_TOPOLOGY', `OK_TOPOLOGY.${required}`)];
  const resistors = resistorsWithRoles(input.circuit, ['R1', 'R2']).map((resistor) => resistor.id);
  return [
    stateError(input, 'WRONG_TOPOLOGY', `WRONG_TOPOLOGY.${required}`, resistors, { required, found: finding.found }),
  ];
}

/** The c-node pair the voltmeter has to span, or null when there is nothing to check it against. */
function voltmeterTarget(input: EvaluateInput, task: TaskConfig, finding: TopologyFinding): string[] | null {
  if (task.requiredTopology !== 'single') return finding.target;
  const [resistor] = resistorsWithRoles(input.circuit, task.targetResistorRoles);
  if (resistor === undefined) return null;
  return nodesOf(resistor, contractedIndex(contractedNodes(input.circuit)));
}

/** 3d. An unwired voltmeter always differs from the target, so it is always flagged. */
function voltmeterPlace(input: EvaluateInput, task: TaskConfig, finding: TopologyFinding): RuleResult[] {
  const voltmeter = firstMeter<VoltmeterComponent>(input.circuit, 'voltmeter');
  const target = voltmeterTarget(input, task, finding);
  if (voltmeter === undefined || target === null) return [];
  const spanned = nodesOf(voltmeter, contractedIndex(contractedNodes(input.circuit)));
  const wrong = spanned.length !== 2 || pairKey(spanned) !== pairKey(target);
  return wrong
    ? [stateError(input, 'VOLTMETER_WRONG_PLACE', `VOLTMETER_WRONG_PLACE.${task.voltmeterTarget}`, [voltmeter.id])]
    : [stateOk(input, 'OK_VOLTMETER_ACROSS')];
}

/** 3e. A reading near 0 gives neither WRONG_POLARITY nor OK_POLARITY. */
function polarity(input: EvaluateInput, readings: { id: string; value: number }[]): RuleResult[] {
  const backwards = readings.filter(({ value }) => readingSign(value) < 0).map(({ id }) => id);
  if (backwards.length > 0) {
    return [stateError(input, 'WRONG_POLARITY', 'WRONG_POLARITY', backwards, { componentIds: backwards })];
  }
  const allForwards = readings.length > 0 && readings.every(({ value }) => readingSign(value) > 0);
  return allForwards ? [stateOk(input, 'OK_POLARITY')] : [];
}

/**
 * Stage 3 (rules-spec §D), run only when Stages 1 and 2 found nothing: the probe solve, then 3b to 3e all
 * together, every result returned. OK_CIRCUIT_COMPLETE is always added. With several meters of one type the
 * first is used, as in the solver (DECISIONS.md, Meter lookup).
 */
export function checkMeasurements(input: EvaluateInput): RuleResult[] {
  const { circuit } = input;
  const task = input.experiment.tasks.find((candidate) => candidate.id === input.taskId);
  const probe = probeSolve(circuit);
  const finding = task === undefined ? { found: 'neither' as const, target: null } : classifyTopology(circuit);

  const ammeter = firstMeter<AmmeterComponent>(circuit, 'ammeter');
  const voltmeter = firstMeter<VoltmeterComponent>(circuit, 'voltmeter');
  const readings = [
    ...(ammeter !== undefined && probe.ammeter !== null ? [{ id: ammeter.id, value: probe.ammeter }] : []),
    ...(voltmeter !== undefined && probe.voltmeter !== null ? [{ id: voltmeter.id, value: probe.voltmeter }] : []),
  ];

  return [
    stateOk(input, 'OK_CIRCUIT_COMPLETE'),
    ...ammeterSeries(input, probe.ammeter, probe.supplyCurrent),
    ...(task === undefined ? [] : topologyCheck(input, task, finding)),
    ...(task === undefined ? [] : voltmeterPlace(input, task, finding)),
    ...polarity(input, readings),
  ];
}
