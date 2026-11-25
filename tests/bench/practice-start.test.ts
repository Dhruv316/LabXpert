import { describe, expect, it } from 'vitest';
import { canPlace, resetToStart, shelfStatus } from '../../src/bench/ops';
import { derivePracticeStart, findPracticeTask, practiceExperiment } from '../../src/bench/practice-start';
import type { Circuit, ErrorCode, ErrorProfileEntry, ExperimentId } from '../../src/model/types';
import { ohmsLaw, seriesParallel } from './helpers';
import { practiceTask, practiceTasks } from './practice-helpers';

function entry(experimentId: ExperimentId, code: ErrorCode, count: number, lastSeenAt = 1): ErrorProfileEntry {
  return { userId: 'asha', experimentId, code, count, lastSeenAt };
}

describe('derivePracticeStart', () => {
  const fixOpen = practiceTask('practice-fix-open-circuit');

  it('an extension task belongs to its own experiment and has no code, whatever the hint says', () => {
    const task = practiceTask('extension-series-parallel');
    expect(derivePracticeStart(task, practiceTasks, [], undefined)).toEqual({ experimentId: 'series-parallel' });
    const hint = { experimentId: 'ohms-law', code: 'OPEN_CIRCUIT' } as const;
    expect(derivePracticeStart(task, practiceTasks, [entry('ohms-law', 'OPEN_CIRCUIT', 4)], hint)).toEqual({ experimentId: 'series-parallel' });
  });

  it('an extension task without forExperiment does not apply', () => {
    const rest = { ...practiceTask('extension-ohms-law'), forExperiment: undefined };
    expect(derivePracticeStart(rest, practiceTasks, [], undefined)).toBeUndefined();
  });

  it('uses a hint that names an experiment and a code the task is offered for', () => {
    const hint = { experimentId: 'series-parallel', code: 'OPEN_CIRCUIT' } as const;
    expect(derivePracticeStart(fixOpen, practiceTasks, [], hint)).toEqual({ experimentId: 'series-parallel', forCode: 'OPEN_CIRCUIT' });
  });

  it('ignores a hint for another task’s code, a half hint, and a hint for an experiment the task does not apply to', () => {
    const profile = [entry('ohms-law', 'OPEN_CIRCUIT', 2)];
    const expected = { experimentId: 'ohms-law', forCode: 'OPEN_CIRCUIT' };
    expect(derivePracticeStart(fixOpen, practiceTasks, profile, { experimentId: 'series-parallel', code: 'WRONG_POLARITY' })).toEqual(expected);
    expect(derivePracticeStart(fixOpen, practiceTasks, profile, { experimentId: 'series-parallel' })).toEqual(expected);
    expect(derivePracticeStart(fixOpen, practiceTasks, profile, { code: 'SHORT_CIRCUIT' })).toEqual(expected);
    const topology = practiceTask('practice-series-then-parallel');
    expect(derivePracticeStart(topology, practiceTasks, [], { experimentId: 'ohms-law', code: 'WRONG_TOPOLOGY' })).toBeUndefined();
  });

  it('falls back to the profile: the task’s mistake the learner has most, ties to the most recent', () => {
    const task = practiceTask('practice-place-ammeter');
    const profile = [
      entry('ohms-law', 'AMMETER_PARALLEL', 2, 10),
      entry('ohms-law', 'SHORT_CIRCUIT', 5, 5),
      entry('series-parallel', 'AMMETER_NOT_IN_SERIES', 5, 9),
      entry('ohms-law', 'OPEN_CIRCUIT', 99, 99),
    ];
    expect(derivePracticeStart(task, practiceTasks, profile, undefined)).toEqual({ experimentId: 'series-parallel', forCode: 'AMMETER_NOT_IN_SERIES' });
  });

  it('is the same whatever order the profile comes in', () => {
    const task = practiceTask('practice-place-ammeter');
    const profile = [entry('ohms-law', 'SHORT_CIRCUIT', 3, 5), entry('ohms-law', 'AMMETER_PARALLEL', 3, 5)];
    const a = derivePracticeStart(task, practiceTasks, profile, undefined);
    const b = derivePracticeStart(task, practiceTasks, [...profile].reverse(), undefined);
    expect(a).toEqual(b);
    expect(a?.forCode).toBe('AMMETER_PARALLEL');
  });

  it('does not apply when no unresolved mistake leads to it', () => {
    expect(derivePracticeStart(fixOpen, practiceTasks, [], undefined)).toBeUndefined();
    expect(derivePracticeStart(fixOpen, practiceTasks, [entry('ohms-law', 'OPEN_CIRCUIT', 0)], undefined)).toBeUndefined();
    expect(derivePracticeStart(fixOpen, practiceTasks, [entry('ohms-law', 'WRONG_POLARITY', 4)], undefined)).toBeUndefined();
  });
});

describe('findPracticeTask', () => {
  it('finds a task by id and returns undefined for an unknown one', () => {
    expect(findPracticeTask(practiceTasks, 'practice-fix-open-circuit')?.id).toBe('practice-fix-open-circuit');
    expect(findPracticeTask(practiceTasks, 'nope')).toBeUndefined();
  });
});

describe('practiceExperiment', () => {
  it('has the task’s shelf with its max values, and the bench experiment’s rules', () => {
    const task = practiceTask('practice-place-ammeter');
    const config = practiceExperiment(ohmsLaw, task);
    expect(config.shelf).toEqual([{ type: 'ammeter', max: 1 }]);
    expect(config.id).toBe('ohms-law');
    expect(config.activeRules).toEqual(ohmsLaw.activeRules);
    expect(config.tasks).toEqual(ohmsLaw.tasks);
    expect(config.supply).toEqual(ohmsLaw.supply);
  });

  it('an empty task shelf is an empty shelf', () => {
    expect(practiceExperiment(ohmsLaw, practiceTask('practice-fix-open-circuit')).shelf).toEqual([]);
  });

  it('a shelf entry without roles or defaultOhms takes them from the experiment’s entry', () => {
    const gather = practiceExperiment(ohmsLaw, practiceTask('practice-gather-parts'));
    expect(gather.shelf.map((item) => item.type)).toEqual(['supply', 'switch', 'resistor', 'ammeter', 'voltmeter']);
    expect(gather.shelf.find((item) => item.type === 'resistor')).toEqual({ type: 'resistor', max: 1, roles: ['R'], defaultOhms: 10 });
    expect(gather.shelf.find((item) => item.type === 'supply')).toEqual({ type: 'supply', max: 1 });
  });

  it('does not change the experiment it was given', () => {
    const before = JSON.stringify(seriesParallel);
    practiceExperiment(seriesParallel, practiceTask('practice-series-then-parallel'));
    expect(JSON.stringify(seriesParallel)).toBe(before);
  });
});

describe('shelf counts on a practice bench', () => {
  const prebuilt: Circuit = {
    components: [
      { id: 'A', type: 'ammeter', x: 10, y: 10, locked: true },
      { id: 'S', type: 'supply', x: 50, y: 50, voltage: 0, locked: true },
    ],
    wires: [],
  };
  const rules = practiceExperiment(ohmsLaw, practiceTask('practice-place-ammeter'));

  it('prebuilt (locked) parts do not use up the shelf’s max', () => {
    expect(canPlace(prebuilt, rules, 'ammeter')).toBe(true);
    expect(shelfStatus(prebuilt, rules)).toEqual([{ type: 'ammeter', max: 1, placed: 0, full: false }]);
  });

  it('a part the learner placed does', () => {
    const placed: Circuit = { ...prebuilt, components: [...prebuilt.components, { id: 'A2', type: 'ammeter', x: 90, y: 90 }] };
    expect(canPlace(placed, rules, 'ammeter')).toBe(false);
    expect(shelfStatus(placed, rules)).toEqual([{ type: 'ammeter', max: 1, placed: 1, full: true }]);
  });

  it('a type that is not on the task’s shelf cannot be placed', () => {
    expect(canPlace(prebuilt, rules, 'supply')).toBe(false);
  });
});

describe('resetToStart', () => {
  const start = practiceTask('practice-fix-open-circuit').prebuilt;
  if (start === null) throw new Error('fixture: the task has a prebuilt circuit');

  it('is nothing when the bench already is the starting circuit', () => {
    expect(resetToStart(start, start)).toBeUndefined();
    expect(resetToStart(structuredClone(start), start)).toBeUndefined();
  });

  it('goes back to the starting circuit and names what was removed', () => {
    const edited: Circuit = {
      components: [...start.components, { id: 'S2', type: 'supply', x: 1, y: 1, voltage: 0 }],
      wires: [...start.wires.filter((w) => w.id !== 'w2'), { id: 'w6', from: 'R.b', to: 'S.neg' }],
    };
    const reset = resetToStart(edited, start);
    expect(reset?.circuit).toBe(start);
    expect(reset?.removedComponents.map((c) => c.id)).toEqual(['S2']);
    expect(reset?.removedWires.map((w) => w.id)).toEqual(['w6']);
  });

  it('with an empty start, resets to an empty mat', () => {
    const empty: Circuit = { components: [], wires: [] };
    const reset = resetToStart(start, empty);
    expect(reset?.circuit).toBe(empty);
    expect(reset?.removedComponents).toHaveLength(5);
  });
});
