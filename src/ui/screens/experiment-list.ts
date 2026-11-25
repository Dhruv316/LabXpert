import type { ExperimentConfig } from '../../model/types';

const modules = import.meta.glob<ExperimentConfig>('../../spec/experiments/*.json', {
  eager: true,
  import: 'default',
});

/** Every experiment in `spec/experiments/`, in file-name order. A new experiment is just a new file. */
export const EXPERIMENTS: readonly ExperimentConfig[] = Object.entries(modules)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([, config]) => config);
