import { describe, expect, it } from 'vitest';
import { pickBestRun, type FinishedRun } from '../../src/engine/best-result';

const run = (attemptId: string, kinds: number, finishedAt: number): FinishedRun => ({ attemptId, kinds, finishedAt });

describe('pickBestRun', () => {
  it('has no best run when nothing is finished', () => {
    expect(pickBestRun([])).toBeUndefined();
  });

  it('picks the run with the fewest distinct error codes, whatever the order', () => {
    const runs = [run('a', 3, 10), run('b', 1, 5), run('c', 2, 20)];
    expect(pickBestRun(runs)?.attemptId).toBe('b');
    expect(pickBestRun([...runs].reverse())?.attemptId).toBe('b');
  });

  it('counts zero mistakes as the best result', () => {
    expect(pickBestRun([run('a', 1, 30), run('b', 0, 1)])?.attemptId).toBe('b');
  });

  it('gives a tie to the most recent finish', () => {
    const runs = [run('a', 2, 10), run('b', 2, 30), run('c', 2, 20)];
    expect(pickBestRun(runs)?.attemptId).toBe('b');
    expect(pickBestRun([...runs].reverse())?.attemptId).toBe('b');
  });

  it('breaks a full tie by the smaller attempt id, so the order of the input never matters', () => {
    expect(pickBestRun([run('b', 2, 10), run('a', 2, 10)])?.attemptId).toBe('a');
    expect(pickBestRun([run('a', 2, 10), run('b', 2, 10)])?.attemptId).toBe('a');
  });
});
