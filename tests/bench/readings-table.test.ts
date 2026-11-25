import { describe, expect, it } from 'vitest';
import { formatReading, NO_VALUE, readingRows } from '../../src/bench/readings-table';
import type { Reading } from '../../src/model/types';

function reading(id: string, voltmeter: number, ammeter: number): Reading {
  return { id, attemptId: 'a1', taskId: 'main', supplyVoltage: voltmeter, voltmeter, ammeter, timestamp: 1000 };
}

describe('formatReading', () => {
  it('always shows 2 decimals', () => {
    expect(formatReading(2)).toBe('2.00');
    expect(formatReading(0.2)).toBe('0.20');
    expect(formatReading(12.5)).toBe('12.50');
  });

  it('never shows a negative zero', () => {
    expect(formatReading(-0)).toBe('0.00');
    expect(formatReading(-0.001)).toBe('0.00');
  });
});

describe('readingRows', () => {
  const readings = [reading('r1', 2, 0.2), reading('r2', 4, 0.4)];

  it('keeps the order given, so the newest reading is the last row', () => {
    expect(readingRows(readings, true).map((row) => row.id)).toEqual(['r1', 'r2']);
  });

  it('gives voltage, current and V ÷ I to 2 decimals', () => {
    expect(readingRows(readings, true)[1]).toEqual({ id: 'r2', voltage: '4.00', current: '0.40', ratio: '10.00' });
  });

  it('shows a dash for the ratio when the current is 0', () => {
    expect(readingRows([reading('r3', 3, 0)], true)[0]?.ratio).toBe(NO_VALUE);
  });

  it('has no ratio at all when the column is not shown', () => {
    expect(readingRows(readings, false).every((row) => row.ratio === undefined)).toBe(true);
  });

  it('is empty for no readings', () => {
    expect(readingRows([], true)).toEqual([]);
  });
});
