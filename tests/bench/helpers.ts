import ohmsRaw from '../../src/spec/experiments/ohms-law.json';
import seriesRaw from '../../src/spec/experiments/series-parallel.json';
import { placeComponent, EMPTY_CIRCUIT } from '../../src/bench/ops';
import type { Circuit, ComponentType, ExperimentConfig } from '../../src/model/types';

// The JSON's `type` fields are plain strings; the cast is the same one the other test helpers use.
export const ohmsLaw = ohmsRaw as unknown as ExperimentConfig;
export const seriesParallel = seriesRaw as unknown as ExperimentConfig;

/** Places a part and returns the new circuit; fails loudly if the shelf refuses it. */
export function withPart(
  circuit: Circuit,
  rules: ExperimentConfig,
  type: ComponentType,
  x = 100,
  y = 100,
): Circuit {
  const placed = placeComponent(circuit, rules, type, { x, y });
  if (placed === undefined) throw new Error(`could not place ${type}`);
  return placed.circuit;
}

export { EMPTY_CIRCUIT };

/** Counts clocks made so far, so ids from two clocks never repeat (see fixedClock). */
let clocksMade = 0;

/**
 * Predictable ids and times: c1-1, c1-2, ... and 1001, 1002, ... Each call gets its own id
 * prefix. Ids used to restart at e1 for every clock, so two clocks used against one database
 * handed out the same attempt id and the second `add` hit a ConstraintError on the primary key.
 */
export function fixedClock() {
  clocksMade += 1;
  const prefix = `c${clocksMade}`;
  let id = 0;
  let time = 1000;
  return {
    newId: () => {
      id += 1;
      return `${prefix}-${id}`;
    },
    now: () => {
      time += 1;
      return time;
    },
  };
}
