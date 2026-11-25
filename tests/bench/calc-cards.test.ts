import { describe, expect, it } from 'vitest';
import { answeredText, calcDrawing } from '../../src/bench/calc-cards';
import type { AnswerSubmission } from '../../src/model/types';
import { practiceTask } from './practice-helpers';

const series = { topology: 'series', r1: 15, r2: 30 } as const;
const parallel = { topology: 'parallel', r1: 20, r2: 30 } as const;

describe('calcDrawing', () => {
  it('series: the two resistors sit side by side on one line, R1 then R2, joined by a wire between them', () => {
    const drawing = calcDrawing(series);
    const [first, second] = drawing.resistors;
    expect(drawing.topology).toBe('series');
    expect(first?.y).toBe(second?.y);
    expect(second?.x).toBeGreaterThan((first?.x ?? 0) + 160);
    expect(drawing.resistors.map((r) => r.ohms)).toEqual([15, 30]);
    expect(drawing.joints).toHaveLength(0);
    // Lead in, the wire between the resistors, lead out; all level.
    expect(drawing.wires).toHaveLength(3);
    for (const [from, to] of drawing.wires) expect(from.y).toBe(to.y);
  });

  it('parallel: the resistors are stacked at the same x, joined by a bus at each end with a dot where the lead meets it', () => {
    const drawing = calcDrawing(parallel);
    const [top, bottom] = drawing.resistors;
    expect(drawing.topology).toBe('parallel');
    expect(top?.x).toBe(bottom?.x);
    expect(bottom?.y).toBeGreaterThan((top?.y ?? 0) + 72);
    expect(drawing.resistors.map((r) => r.ohms)).toEqual([20, 30]);
    expect(drawing.joints).toHaveLength(2);
    const vertical = drawing.wires.filter(([from, to]) => from.x === to.x);
    expect(vertical).toHaveLength(2);
    // The left bus is left of the resistors and the right bus is right of them.
    const xs = vertical.map(([from]) => from.x).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(top?.x ?? 0);
    expect(xs[1]).toBeGreaterThan((top?.x ?? 0) + 160);
  });

  it('keeps every wire, resistor and label inside the drawing, in units that are screen pixels', () => {
    for (const pair of [series, parallel]) {
      const drawing = calcDrawing(pair);
      for (const [from, to] of drawing.wires) {
        for (const point of [from, to]) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(drawing.width);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(drawing.height);
        }
      }
      for (const resistor of drawing.resistors) {
        expect(resistor.x + 200 * drawing.scale).toBeLessThanOrEqual(drawing.width);
        expect(resistor.labelY).toBeLessThan(drawing.height);
      }
    }
  });

  it('draws every pair of both calculation tasks', () => {
    for (const id of ['practice-equivalent-resistance', 'extension-series-parallel']) {
      for (const pair of practiceTask(id).calcPairs ?? []) {
        const drawing = calcDrawing(pair);
        expect(drawing.topology).toBe(pair.topology);
        expect(drawing.resistors.map((r) => r.ohms)).toEqual([pair.r1, pair.r2]);
      }
    }
  });
});

function submission(typed: number, expected: number, correct: boolean): AnswerSubmission {
  return { id: `a-${typed}`, attemptId: 'x', taskId: 't', typed, expected, correct, timestamp: 1 };
}

describe('answeredText', () => {
  const pair = { topology: 'parallel', r1: 20, r2: 30, answer: 12 } as const;

  it('is the typed text of the correct answer with this pair’s formula value', () => {
    expect(answeredText(pair, [submission(5, 12, false), submission(11.9, 12, true)])).toBe('11.9');
  });

  it('ignores wrong answers and answers for other pairs, and is empty when nothing matches', () => {
    expect(answeredText(pair, [submission(5, 12, false)])).toBe('');
    expect(answeredText(pair, [submission(45, 45, true)])).toBe('');
    expect(answeredText(pair, [])).toBe('');
  });

  it('uses the latest correct answer when there is more than one', () => {
    expect(answeredText(pair, [submission(12, 12, true), submission(12.1, 12, true)])).toBe('12.1');
  });
});
