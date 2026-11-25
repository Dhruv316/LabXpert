import { wireFlowFromLive, type WireFlow } from '../bench/flow';
import { liveState, type LiveState } from '../bench/live';
import type { Circuit, ExperimentConfig } from '../model/types';
import type { BenchState } from './bench';

// One slot is enough: the bench shows one circuit at a time. Keeping the last answer means every
// component that reads the selector gets the same object, and it is rebuilt only when the circuit
// (or the experiment) is a different object. Moves create new circuits too, which costs one tiny solve.
let cached: { circuit: Circuit; experiment: ExperimentConfig; state: LiveState } | undefined;

/** The live readings for the circuit on the bench; undefined until the bench is open. */
export function selectLive(state: Pick<BenchState, 'circuit' | 'session'>): LiveState | undefined {
  const experiment = state.session?.experiment;
  if (experiment === undefined) return undefined;
  if (cached?.circuit === state.circuit && cached.experiment === experiment) return cached.state;
  const next = liveState(state.circuit, experiment);
  cached = { circuit: state.circuit, experiment, state: next };
  return next;
}

// Same one-slot idea, keyed on the circuit alone: which way current runs depends on nothing else, so a
// selection, a highlight or a new session on the same circuit gives back the very same map.
let cachedFlow: { circuit: Circuit; flow: WireFlow } | undefined;

/** Which wires carry current, and which way, for the circuit on the bench; undefined until the bench is open. */
export function selectWireFlow(state: Pick<BenchState, 'circuit' | 'session'>): WireFlow | undefined {
  const live = selectLive(state);
  if (live === undefined) return undefined;
  if (cachedFlow?.circuit === state.circuit) return cachedFlow.flow;
  const next = wireFlowFromLive(state.circuit, live);
  cachedFlow = { circuit: state.circuit, flow: next };
  return next;
}
