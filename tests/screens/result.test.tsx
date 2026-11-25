import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { checkpointRecord, err, evaluate } from '../db/helpers';
import errorCodes from '../../src/spec/error-codes.json';
import type { LabXpertDB } from '../../src/db/database';
import { finishAttempt, startAttempt } from '../../src/db/attempts';
import { appendEvent } from '../../src/db/events';
import { setSetting, SETTING_KEYS } from '../../src/db/settings';
import { suggestPractice } from '../../src/db/suggest';
import { loginUser } from '../../src/db/users';
import { t } from '../../src/i18n';
import type { ErrorCode, ExperimentId } from '../../src/model/types';
import { flushBenchWrites } from '../../src/state';
import { PRACTICE_TASKS } from '../../src/ui/screens/practice-list';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await disposeTestDbs();
  resetAppState();
});

interface SeedError {
  code: ErrorCode;
  key: string;
  times: number;
}
interface SeedConfirmation {
  taskId: string;
  codes: string[];
}
interface Seed {
  id: string;
  userId?: string;
  experimentId?: ExperimentId;
  kind?: 'experiment' | 'practice';
  status?: 'in_progress' | 'completed';
  errors?: SeedError[];
  confirmations?: SeedConfirmation[];
}

/** An attempt with the records the bench would have saved: error occurrences and `CHECKPOINT` events. */
async function seedAttempt(db: LabXpertDB, seed: Seed) {
  const userId = seed.userId ?? 'asha';
  const experimentId = seed.experimentId ?? 'ohms-law';
  await startAttempt(db, { id: seed.id, userId, experimentId, kind: seed.kind ?? 'experiment', startedAt: 1 });
  let time = 100;
  for (const error of seed.errors ?? []) {
    for (let i = 0; i < error.times; i += 1) {
      time += 10;
      // A new circuit signature each time, so the same error is saved again and counted.
      await evaluate(db, { attemptId: seed.id, results: [err(error.code, error.key)], signature: `${error.code}-${i}`, timestamp: time });
    }
  }
  for (const confirmation of seed.confirmations ?? []) {
    time += 10;
    await appendEvent(db, checkpointRecord(seed.id, `${seed.id}-cp-${time}`, time, confirmation.taskId, confirmation.codes, [], experimentId, userId));
  }
  if ((seed.status ?? 'completed') === 'completed') await finishAttempt(db, seed.id, time + 10);
}

const RICH: Seed = {
  id: 'rich',
  errors: [
    { code: 'OPEN_CIRCUIT', key: 'OPEN_CIRCUIT.gap', times: 1 },
    { code: 'AMMETER_PARALLEL', key: 'AMMETER_PARALLEL', times: 2 },
  ],
  confirmations: [
    { taskId: 'main', codes: ['OK_CIRCUIT_COMPLETE', 'OK_POLARITY'] },
    { taskId: 'main', codes: ['OK_POLARITY', 'OK_AMMETER_SERIES'] },
  ],
};

async function openResult(db: LabXpertDB, attemptId: string, name = 'Asha') {
  await seedUser(db, name);
  renderAppAt(db, `#/result/${attemptId}`);
  return screen.findByRole('heading', { level: 1, name: t('result.title') });
}

/** The screen's own owl; the top bar has a small one of its own. */
const ownOllie = () => screen.getByRole('main').querySelector('[data-mood]');
const mistakesSection = () => within(screen.getByRole('region', { name: t('result.mistakesTitle') }));
const wentWellSection = () => within(screen.getByRole('region', { name: t('result.wentWell') }));

describe('Result screen: content', () => {
  it('shows the title, what went well, and each mistake with its title, count and fix', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, RICH);
    await openResult(db, 'rich');

    const wellTitles = wentWellSection().getAllByRole('listitem').map((item) => item.textContent);
    expect(wellTitles).toEqual([t('OK_CIRCUIT_COMPLETE').title, t('OK_POLARITY').title, t('OK_AMMETER_SERIES').title]);

    const cards = mistakesSection().getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    // The order the data returns: the order each error was first seen.
    expect(within(cards[0]!).getByRole('heading', { level: 3 }).textContent).toBe(t('OPEN_CIRCUIT.gap').title);
    expect(within(cards[0]!).getByText(t('result.mistakeCount', { count: 1 }))).toBeTruthy();
    expect(within(cards[0]!).getByText(t('OPEN_CIRCUIT.gap').fix ?? '')).toBeTruthy();
    expect(within(cards[1]!).getByRole('heading', { level: 3 }).textContent).toBe(t('AMMETER_PARALLEL').title);
    expect(within(cards[1]!).getByText(t('result.mistakeCountPlural', { count: 2 }))).toBeTruthy();
    expect(within(cards[1]!).getByText(t('AMMETER_PARALLEL').fix ?? '')).toBeTruthy();
  });

  it('shows the no-mistakes line and the confirmations for a clean attempt', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'clean', confirmations: [{ taskId: 'main', codes: ['OK_CIRCUIT_COMPLETE'] }] });
    await openResult(db, 'clean');
    expect(mistakesSection().getByText(t('result.noMistakes'))).toBeTruthy();
    expect(mistakesSection().queryAllByRole('listitem')).toHaveLength(0);
    expect(wentWellSection().getByText(t('OK_CIRCUIT_COMPLETE').title)).toBeTruthy();
  });

  it('hides What went well when no confirmation was ever logged', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'bare', errors: [{ code: 'WRONG_POLARITY', key: 'WRONG_POLARITY', times: 1 }] });
    await openResult(db, 'bare');
    expect(screen.queryByRole('region', { name: t('result.wentWell') })).toBeNull();
    expect(screen.queryByRole('heading', { name: t('result.wentWell') })).toBeNull();
    expect(mistakesSection().getByText(t('WRONG_POLARITY').title)).toBeTruthy();
  });

  it('shows one card for an error seen three times, with "3 times"', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'again', errors: [{ code: 'OPEN_CIRCUIT', key: 'OPEN_CIRCUIT.gap', times: 3 }] });
    await openResult(db, 'again');
    expect(mistakesSection().getAllByRole('listitem')).toHaveLength(1);
    expect(mistakesSection().getByText('3 times')).toBeTruthy();
  });

  it('shows the series and the parallel wording when both topology tasks were confirmed', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, {
      id: 'sp',
      experimentId: 'series-parallel',
      confirmations: [
        { taskId: 'series', codes: ['OK_TOPOLOGY'] },
        { taskId: 'parallel', codes: ['OK_TOPOLOGY'] },
      ],
    });
    await openResult(db, 'sp');
    const titles = wentWellSection().getAllByRole('listitem').map((item) => item.textContent);
    expect(titles).toEqual([t('OK_TOPOLOGY.series').title, t('OK_TOPOLOGY.parallel').title]);
  });

  it('never shows a rule code or a feedback key', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, RICH);
    await openResult(db, 'rich');
    const shown = document.body.textContent ?? '';
    const codes = [...errorCodes.errors.map((e) => e.code), ...errorCodes.ok.map((o) => o.code)];
    const keys = [...errorCodes.errors.flatMap((e) => e.feedbackKeys), ...errorCodes.ok.flatMap((o) => o.feedbackKeys)];
    for (const raw of [...codes, ...keys]) expect(shown).not.toContain(raw);
    expect(shown).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
  });

  it('has one h1, the two sections as h2 and both buttons', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, RICH);
    await openResult(db, 'rich');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([t('result.wentWell'), t('result.mistakesTitle')]);
    expect(screen.getByRole('button', { name: t('result.practice') })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('result.back') })).toBeTruthy();
  });
});

describe('Result screen: Ollie, focus and announcement', () => {
  it('shows Ollie celebrating with the single arrival bounce', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, RICH);
    await openResult(db, 'rich');
    const owl = ownOllie();
    expect(owl?.getAttribute('data-mood')).toBe('celebrating');
    expect(owl?.className).toContain('animate-owl-bounce');
  });

  it('has no bounce at all with Reduce motion', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, RICH);
    await setSetting(db, SETTING_KEYS.reduceMotion, true);
    await openResult(db, 'rich');
    const owl = ownOllie();
    expect(owl?.getAttribute('data-mood')).toBe('celebrating');
    expect(owl?.className).not.toContain('animate-owl-bounce');
  });

  it('moves focus to the heading and says the title through the polite live region', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, RICH);
    const heading = await openResult(db, 'rich');
    await waitFor(() => expect(document.activeElement).toBe(heading));
    const region = screen.getByTestId('live-region');
    expect(region.getAttribute('aria-live')).toBe('polite');
    await waitFor(() => expect(region.textContent).toContain(t('result.title')));
  });
});

describe('Result screen: buttons', () => {
  it('Try a practice task opens the task suggested for this learner and experiment', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, {
      id: 'r1',
      errors: [
        { code: 'OPEN_CIRCUIT', key: 'OPEN_CIRCUIT.gap', times: 2 },
        { code: 'WRONG_POLARITY', key: 'WRONG_POLARITY', times: 1 },
      ],
    });
    const expected = (await suggestPractice(db, 'asha', 'ohms-law', PRACTICE_TASKS))?.task.id;
    expect(expected).toBe('practice-fix-open-circuit');
    await openResult(db, 'r1');
    fireEvent.click(screen.getByRole('button', { name: t('result.practice') }));
    await waitFor(() => expect(window.location.hash).toBe(`#/practice/${expected}`));
  });

  it('suggests the same task for the same profile every time', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'r1', errors: [{ code: 'WRONG_POLARITY', key: 'WRONG_POLARITY', times: 2 }] });
    const reached: string[] = [];
    for (let visit = 0; visit < 2; visit += 1) {
      await openResult(db, 'r1');
      fireEvent.click(screen.getByRole('button', { name: t('result.practice') }));
      await waitFor(() => expect(window.location.hash).toMatch(/^#\/practice\//));
      reached.push(window.location.hash);
      cleanup();
      resetAppState();
    }
    expect(reached[0]).toBe('#/practice/practice-meter-polarity');
    expect(reached[1]).toBe(reached[0]);
  });

  it('gives the extension task when the profile has no mistakes', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'clean' });
    await openResult(db, 'clean');
    fireEvent.click(screen.getByRole('button', { name: t('result.practice') }));
    await waitFor(() => expect(window.location.hash).toBe('#/practice/extension-ohms-law'));
  });

  it('suggests for this attempt\'s experiment, not another one', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'sp', experimentId: 'series-parallel' });
    await openResult(db, 'sp');
    fireEvent.click(screen.getByRole('button', { name: t('result.practice') }));
    await waitFor(() => expect(window.location.hash).toBe('#/practice/extension-series-parallel'));
  });

  it('Back to experiments goes to the picker', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, RICH);
    await openResult(db, 'rich');
    fireEvent.click(screen.getByRole('button', { name: t('result.back') }));
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(await screen.findByRole('heading', { level: 1, name: t('picker.title') })).toBeTruthy();
  });
});

describe('Result screen: who may see what', () => {
  const cases: Array<[string, (db: LabXpertDB) => Promise<string>]> = [
    ['an id that does not exist', () => Promise.resolve('no-such-attempt')],
    [
      'another learner\'s finished attempt',
      async (db) => {
        await seedAttempt(db, { id: 'theirs', userId: 'ravi', errors: [{ code: 'OPEN_CIRCUIT', key: 'OPEN_CIRCUIT.gap', times: 1 }] });
        return 'theirs';
      },
    ],
    [
      'a practice attempt',
      async (db) => {
        await seedAttempt(db, { id: 'practice-run', kind: 'practice' });
        return 'practice-run';
      },
    ],
  ];

  it.each(cases)('shows the not-found screen for %s', async (_name, prepare) => {
    const db = await makeTestDb();
    const id = await prepare(db);
    await seedUser(db, 'Asha');
    renderAppAt(db, `#/result/${id}`);
    expect(await screen.findByRole('heading', { level: 1, name: t('error.notFoundTitle') })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: t('result.title') })).toBeNull();
    expect(screen.queryByText(t('result.mistakesTitle'))).toBeNull();
  });

  it('sends an attempt that is still in progress back to its bench', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'open', status: 'in_progress' });
    await seedUser(db, 'Asha');
    renderAppAt(db, '#/result/open');
    await waitFor(() => expect(window.location.hash).toBe('#/experiment/ohms-law'));
    await screen.findByRole('group', { name: t('exp.ohms-law.title') });
    await flushBenchWrites();
    expect(screen.queryByRole('heading', { name: t('result.title') })).toBeNull();
  });

  it('shows each learner only their own results', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'asha-run', userId: 'asha', errors: [{ code: 'OPEN_CIRCUIT', key: 'OPEN_CIRCUIT.gap', times: 1 }] });
    await seedAttempt(db, { id: 'ben-run', userId: 'ben', errors: [{ code: 'WRONG_POLARITY', key: 'WRONG_POLARITY', times: 2 }] });

    // Ben is signed in: his result opens, Asha's does not.
    await loginUser(db, 'Asha', 1000);
    await loginUser(db, 'Ben', 2000);
    renderAppAt(db, '#/result/ben-run');
    await screen.findByRole('heading', { level: 1, name: t('result.title') });
    expect(mistakesSection().getByText(t('WRONG_POLARITY').title)).toBeTruthy();
    expect(screen.queryByText(t('OPEN_CIRCUIT.gap').title)).toBeNull();
    cleanup();
    resetAppState();
    renderAppAt(db, '#/result/asha-run');
    expect(await screen.findByRole('heading', { level: 1, name: t('error.notFoundTitle') })).toBeTruthy();
    cleanup();
    resetAppState();

    // Asha signs in: the other way round.
    await loginUser(db, 'Asha', 3000);
    renderAppAt(db, '#/result/asha-run');
    await screen.findByRole('heading', { level: 1, name: t('result.title') });
    expect(mistakesSection().getByText(t('OPEN_CIRCUIT.gap').title)).toBeTruthy();
    expect(screen.queryByText(t('WRONG_POLARITY').title)).toBeNull();
    cleanup();
    resetAppState();
    renderAppAt(db, '#/result/ben-run');
    expect(await screen.findByRole('heading', { level: 1, name: t('error.notFoundTitle') })).toBeTruthy();
  });

  it('hands a failed read to the error boundary, with no raw error text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = await makeTestDb();
    await seedAttempt(db, RICH);
    await seedUser(db, 'Asha');
    vi.spyOn(db.attempts, 'get').mockRejectedValue(new Error('secret disk failure'));
    renderAppAt(db, '#/result/rich');
    expect(await screen.findByRole('heading', { name: t('error.title') })).toBeTruthy();
    expect(document.body.textContent).not.toContain('secret');
  });
});
