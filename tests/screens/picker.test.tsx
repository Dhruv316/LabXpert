import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { abandonAttempt, finishAttempt, startAttempt } from '../../src/db/attempts';
import { loginUser } from '../../src/db/users';
import { t } from '../../src/i18n';
import type { ExperimentId } from '../../src/model/types';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  await disposeTestDbs();
  resetAppState();
});

let nextId = 0;

async function seedAttempt(
  db: LabXpertDB,
  userId: string,
  experimentId: ExperimentId,
  outcome: 'in_progress' | 'done' | 'abandoned',
) {
  nextId += 1;
  const id = `attempt-${nextId}`;
  await startAttempt(db, { id, userId, experimentId, kind: 'experiment', startedAt: 1000 + nextId });
  if (outcome === 'done') await finishAttempt(db, id, 2000 + nextId);
  // Without this the attempt stayed in progress and the chip rightly said "resume".
  if (outcome === 'abandoned') await abandonAttempt(db, id, 2000 + nextId);
  return id;
}

function card(experimentId: ExperimentId) {
  const title = experimentId === 'ohms-law' ? t('exp.ohms-law.title') : t('exp.series-parallel.title');
  return within(screen.getByRole('article', { name: title }));
}

async function openPicker(db: LabXpertDB) {
  renderAppAt(db, '#/');
  await screen.findByRole('heading', { level: 1, name: t('picker.title') });
}

describe('Picker screen', () => {
  it('greets the learner and shows one card per experiment with title and summary', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await openPicker(db);
    expect(screen.getByText(t('picker.hello', { name: 'Asha' }))).toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(card('ohms-law').getByText(t('exp.ohms-law.summary'))).toBeTruthy();
    expect(card('series-parallel').getByText(t('exp.series-parallel.summary'))).toBeTruthy();
    expect(screen.getByRole('link', { name: t('picker.progress') }).getAttribute('href')).toBe('#/progress');
  });

  it('shows the right chip and the open button for each status', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await seedAttempt(db, 'asha', 'series-parallel', 'done');
    await openPicker(db);
    // Ohm's Law: nothing yet. Series and parallel: one finished attempt.
    expect((await card('ohms-law').findByText(t('picker.status.not_started'))).closest('[data-tone]')?.getAttribute('data-tone')).toBe('neutral');
    expect((await card('series-parallel').findByText(t('picker.status.done'))).closest('[data-tone]')?.getAttribute('data-tone')).toBe('ok');
    expect(card('ohms-law').getByRole('button', { name: t('picker.open') })).toBeTruthy();
    expect(card('series-parallel').getByRole('button', { name: t('picker.open') })).toBeTruthy();
  });

  it('shows in progress for an open attempt, and in progress wins over done', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await seedAttempt(db, 'asha', 'ohms-law', 'in_progress');
    await seedAttempt(db, 'asha', 'series-parallel', 'done');
    await seedAttempt(db, 'asha', 'series-parallel', 'in_progress');
    await openPicker(db);
    const ohms = await card('ohms-law').findByText(t('picker.status.in_progress'));
    expect(ohms.closest('[data-tone]')?.getAttribute('data-tone')).toBe('progress');
    expect(await card('series-parallel').findByText(t('picker.status.in_progress'))).toBeTruthy();
  });

  it('counts an abandoned attempt as nothing', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await seedAttempt(db, 'asha', 'ohms-law', 'abandoned');
    await openPicker(db);
    expect(await card('ohms-law').findByText(t('picker.status.not_started'))).toBeTruthy();
  });

  it('Start creates exactly one attempt and opens the bench, even on a double press', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await openPicker(db);
    const button = card('ohms-law').getByRole('button', { name: t('picker.open') });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(window.location.hash).toBe('#/experiment/ohms-law'));
    const rows = await db.attempts.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: 'asha',
      experimentId: 'ohms-law',
      kind: 'experiment',
      status: 'in_progress',
    });
  });

  it('Resume opens the bench and does not create a new attempt', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    const existing = await seedAttempt(db, 'asha', 'series-parallel', 'in_progress');
    await openPicker(db);
    const button = await card('series-parallel').findByRole('button', { name: t('picker.open') });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(window.location.hash).toBe('#/experiment/series-parallel'));
    const rows = await db.attempts.toArray();
    expect(rows.map((row) => row.id)).toEqual([existing]);
  });

  it('opening a finished experiment starts a new attempt and keeps the finished one', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    const finished = await seedAttempt(db, 'asha', 'ohms-law', 'done');
    await openPicker(db);
    const button = await card('ohms-law').findByRole('button', { name: t('picker.open') });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(window.location.hash).toBe('#/experiment/ohms-law'));
    const rows = await db.attempts.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === finished)?.status).toBe('completed');
    expect(rows.filter((row) => row.status === 'in_progress')).toHaveLength(1);
  });

  it('shows each learner only their own statuses', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await seedUser(db, 'Ravi');
    await seedAttempt(db, 'asha', 'ohms-law', 'in_progress');
    await seedAttempt(db, 'ravi', 'series-parallel', 'done');

    // Ravi logged in last, so he is the active learner.
    await openPicker(db);
    expect(await card('ohms-law').findByText(t('picker.status.not_started'))).toBeTruthy();
    expect(await card('series-parallel').findByText(t('picker.status.done'))).toBeTruthy();
    expect(screen.queryByText(t('picker.status.in_progress'))).toBeNull();

    cleanup();
    resetAppState();
    await loginUser(db, 'Asha', 5000);
    await openPicker(db);
    expect(await card('ohms-law').findByText(t('picker.status.in_progress'))).toBeTruthy();
    expect(await card('series-parallel').findByText(t('picker.status.not_started'))).toBeTruthy();
    expect(screen.queryByText(t('picker.status.done'))).toBeNull();
  });
});
