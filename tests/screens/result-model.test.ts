import { describe, expect, it } from 'vitest';
import { t, UnknownTextKeyError } from '../../src/i18n';
import type { AttemptError } from '../../src/db/history';
import { confirmationRows, mistakeCards } from '../../src/ui/screens/result-model';
import { ohmsLaw, seriesParallel } from '../bench/helpers';

const titleOf = (key: 'OK_POLARITY' | 'OK_CIRCUIT_COMPLETE' | 'OK_ANSWER') => t(key).title;

function error(code: AttemptError['code'], feedbackKey: string, count: number): AttemptError {
  return { code, feedbackKey, count, firstSeenAt: 1 };
}

describe('confirmationRows', () => {
  it('gives one row per distinct confirmation, with its feedback title, in the order given', () => {
    const rows = confirmationRows(
      [
        { code: 'OK_POLARITY', taskIds: ['main'] },
        { code: 'OK_CIRCUIT_COMPLETE', taskIds: ['main'] },
      ],
      ohmsLaw,
    );
    expect(rows.map((row) => row.title)).toEqual([titleOf('OK_POLARITY'), titleOf('OK_CIRCUIT_COMPLETE')]);
  });

  it('is empty when there are no confirmations', () => {
    expect(confirmationRows([], ohmsLaw)).toEqual([]);
  });

  it('picks the series or parallel wording of OK_TOPOLOGY from the task that logged it', () => {
    const series = confirmationRows([{ code: 'OK_TOPOLOGY', taskIds: ['series'] }], seriesParallel);
    const parallel = confirmationRows([{ code: 'OK_TOPOLOGY', taskIds: ['parallel'] }], seriesParallel);
    expect(series.map((row) => row.title)).toEqual([t('OK_TOPOLOGY.series').title]);
    expect(parallel.map((row) => row.title)).toEqual([t('OK_TOPOLOGY.parallel').title]);
  });

  it('shows both wordings when both tasks confirmed it, and each wording once', () => {
    const rows = confirmationRows([{ code: 'OK_TOPOLOGY', taskIds: ['series', 'parallel', 'series'] }], seriesParallel);
    expect(rows.map((row) => row.title)).toEqual([t('OK_TOPOLOGY.series').title, t('OK_TOPOLOGY.parallel').title]);
  });

  it('fails like t() for a code it cannot explain, never showing a code', () => {
    expect(() => confirmationRows([{ code: 'OK_NOT_A_CODE', taskIds: ['main'] }], ohmsLaw)).toThrow(UnknownTextKeyError);
    // OK_TOPOLOGY needs a series or parallel task to pick its wording; a single-resistor task has none.
    expect(() => confirmationRows([{ code: 'OK_TOPOLOGY', taskIds: ['main'] }], ohmsLaw)).toThrow(UnknownTextKeyError);
    expect(() => confirmationRows([{ code: 'OK_TOPOLOGY', taskIds: [] }], seriesParallel)).toThrow(UnknownTextKeyError);
  });
});

describe('mistakeCards', () => {
  it('gives each error its feedback title and one-line fix, keeping the order of the data', () => {
    const cards = mistakeCards([
      error('AMMETER_PARALLEL', 'AMMETER_PARALLEL', 2),
      error('OPEN_CIRCUIT', 'OPEN_CIRCUIT.gap', 1),
    ]);
    expect(cards.map((card) => card.title)).toEqual([t('AMMETER_PARALLEL').title, t('OPEN_CIRCUIT.gap').title]);
    expect(cards.map((card) => card.fix)).toEqual([t('AMMETER_PARALLEL').fix, t('OPEN_CIRCUIT.gap').fix]);
  });

  it('writes the count in the singular for 1 and the plural otherwise', () => {
    const cards = mistakeCards([
      error('OPEN_CIRCUIT', 'OPEN_CIRCUIT.gap', 1),
      error('WRONG_POLARITY', 'WRONG_POLARITY', 2),
      error('SHORT_CIRCUIT', 'SHORT_CIRCUIT', 3),
    ]);
    expect(cards.map((card) => card.countText)).toEqual([
      t('result.mistakeCount', { count: 1 }),
      t('result.mistakeCountPlural', { count: 2 }),
      t('result.mistakeCountPlural', { count: 3 }),
    ]);
    expect(cards[0]?.countText).toBe('1 time');
    expect(cards[2]?.countText).toBe('3 times');
  });

  it('works for errors whose longer explanation needs values the saved records do not hold', () => {
    const cards = mistakeCards([
      error('MISSING_COMPONENT', 'MISSING_COMPONENT', 1),
      error('MISSING_READING', 'MISSING_READING', 1),
    ]);
    expect(cards.map((card) => card.title)).toEqual([
      t('MISSING_COMPONENT', { types: '' }).title,
      t('MISSING_READING', { have: 0, need: 0 }).title,
    ]);
    for (const card of cards) {
      expect(card.title).not.toMatch(/[{}]/);
      expect(card.fix).not.toMatch(/[{}]/);
    }
  });

  it('is empty when there are no errors, and fails like t() for a key the language file lacks', () => {
    expect(mistakeCards([])).toEqual([]);
    expect(() => mistakeCards([error('OPEN_CIRCUIT', 'OPEN_CIRCUIT.x', 1)])).toThrow(UnknownTextKeyError);
  });
});
