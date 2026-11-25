// Pure rows for the readings table: 2-decimal text and the V ÷ I column. No React, no student-facing words.
import type { Reading } from '../model/types';
import { ratioOf } from './readings';

/** Shown in the V ÷ I column when the current is 0. A glyph, not a sentence, so it needs no language key. */
export const NO_VALUE = '–';

/** A reading to 2 decimals (the meters' `decimals`); never "-0.00". */
export function formatReading(value: number): string {
  const text = value.toFixed(2);
  return text === '-0.00' ? '0.00' : text;
}

export interface ReadingRow {
  id: string;
  voltage: string;
  current: string;
  /** Present only for experiments that show the V ÷ I column; NO_VALUE when the current is 0. */
  ratio: string | undefined;
}

/** One row per reading in the order given (oldest first, so the newest ends up at the bottom). */
export function readingRows(readings: readonly Reading[], withRatio: boolean): ReadingRow[] {
  return readings.map((reading) => {
    const ratio = ratioOf(reading.voltmeter, reading.ammeter);
    return {
      id: reading.id,
      voltage: formatReading(reading.voltmeter),
      current: formatReading(reading.ammeter),
      ratio: withRatio ? (ratio === undefined ? NO_VALUE : formatReading(ratio)) : undefined,
    };
  });
}
