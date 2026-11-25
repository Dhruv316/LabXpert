import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from './helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { t } from '../../src/i18n';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  await disposeTestDbs();
  resetAppState();
});

// One row per route in UI_SCREENS.md. The title is each screen's own text from t().
const ROUTES: Array<[string, () => string]> = [
  ['#/', () => t('picker.title')],
  ['#/experiment/ohms-law', () => t('exp.ohms-law.title')],
  ['#/experiment/series-parallel', () => t('exp.series-parallel.title')],
  // The result route looks the attempt up, so an id that does not exist shows the not-found screen (the Result tests cover real ones).
  ['#/result/any-attempt', () => t('error.notFoundTitle')],
  // An extension task applies without any past mistake, so it opens the practice bench (Part 14B); its banner holds the task title as the page's h1.
  ['#/practice/extension-ohms-law', () => t('practiceTasks.extension-ohms-law.title')],
  ['#/progress', () => t('progress.title')],
];

describe('routes', () => {
  it.each(ROUTES)('%s opens its screen, inside the top bar', async (hash, title) => {
    const db = await makeTestDb();
    await seedUser(db);
    renderAppAt(db, hash);
    expect(await screen.findByRole('heading', { level: 1, name: title() })).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('/login opens the login placeholder without the top bar', async () => {
    const db = await makeTestDb();
    renderAppAt(db, '#/login');
    expect(await screen.findByRole('heading', { name: t('login.title') })).toBeTruthy();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it.each(ROUTES.map(([hash]) => hash))('%s needs a user', async (hash) => {
    const db = await makeTestDb();
    renderAppAt(db, hash);
    expect(await screen.findByRole('heading', { name: t('login.title') })).toBeTruthy();
    expect(window.location.hash).toBe('#/login');
  });

  it('the Gallery is reachable at /gallery in dev and tests, without a user', async () => {
    const db = await makeTestDb();
    renderAppAt(db, '#/gallery');
    // The Gallery is lazy loaded, so the first render can take a while on a slow machine: wait for it, not for a fixed time.
    expect(await screen.findByRole('heading', { level: 1, name: t('app.name') }, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: t('login.title') })).toBeNull();
  }, 15000);
});
