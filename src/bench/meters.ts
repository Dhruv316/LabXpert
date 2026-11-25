// What an ammeter or voltmeter shows: the number, its text and the needle angle. Pure, so the
// rules about rounding, the minus sign and the needle live here and not in the components.
import type { ExperimentConfig } from '../model/types';
import { needleAngle, type LiveState } from './live';

export type MeterType = 'ammeter' | 'voltmeter';

export function isMeterType(type: string): type is MeterType {
  return type === 'ammeter' || type === 'voltmeter';
}

/** components.json: both meters turn about this point of their SVG (the same point as `#needle`'s rotate). */
export const NEEDLE_PIVOT = '80px 92px';

const TRUE_MINUS = '\u2212';
/**
 * "0.60" for 0.6 at 2 decimals; a true minus sign for a negative value. A value that rounds to zero is
 * never shown with a sign, so "-0.00" cannot appear whatever number comes in.
 */
export function formatMeterNumber(value: number, decimals: number): string {
  const digits = Math.abs(value).toFixed(decimals);
  const isZero = Number(digits) === 0;
  return value < 0 && !isZero ? `${TRUE_MINUS}${digits}` : digits;
}

export interface MeterView {
  /** Rounded to the experiment's decimals: what the digits show and what the needle follows. */
  value: number;
  /** The number as shown, without its unit. */
  number: string;
  /** Needle angle in degrees, clamped. */
  angle: number;
}

/**
 * The view of one meter from the live solve. A meter the solver has no reading for (not on the bench, or a
 * second one of the same kind) shows zero, the same as an open circuit does.
 */
export function meterView(
  live: LiveState,
  experiment: Pick<ExperimentConfig, 'meterRanges'>,
  type: MeterType,
): MeterView {
  const { decimals } = experiment.meterRanges;
  const value = live.rounded[type] ?? 0;
  return {
    value,
    number: formatMeterNumber(value, decimals),
    angle: needleAngle(value, experiment.meterRanges[type]),
  };
}
