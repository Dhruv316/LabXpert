// Import order matters: tests/db/setup loads fake-indexeddb before Dexie is first imported.
import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { evaluate, err } from '../db/helpers';
import { englishTexts } from '../helpers/hardcoded-text';
import { expectNoLeaks, readableText } from '../helpers/leaks';
import { flattenKeys } from '../helpers/text-keys';
import feedbackEn from '../../src/spec/feedback.en.json';
import uiEn from '../../src/spec/ui-strings.en.json';
import feedbackXx from './fixtures/xx/feedback.xx.json';
import uiXx from './fixtures/xx/ui-strings.xx.json';
import { finishAttempt, startAttempt } from '../../src/db/attempts';
import { BUNDLES, makeBundle, type Bundle } from '../../src/i18n/bundles';
import type { FeedbackEntry } from '../../src/model/types';
import { t, type FeedbackKey, type Language, type Params, type UiKey } from '../../src/i18n';
import { flushBenchWrites, useAppStore, useBenchStore, useTutorStore } from '../../src/state';

// "Can a second language be added without touching a screen?" A test-only fake language (every English
// text with «xx» in front, files in tests/i18n/fixtures/xx/) goes through the same loader as English,
// is chosen through the store, and the screens must speak it. The fake is registered here and removed
// after each test; nothing in src/ knows it exists.

/** Not a real Language value, on purpose: the registry below is how a language gets loaded. */
const XX = 'xx' as unknown as Language;
const MARK = '«xx» ';
const registry: Record<string, Bundle> = BUNDLES;
const ENGLISH = englishTexts(uiEn, feedbackEn);

const ux = (key: UiKey, params?: Params): string => t(key, params, XX);
const fx = (key: FeedbackKey, params?: Params): FeedbackEntry => t(key, params, XX);

function resetAll() {
  resetAppState();
  useTutorStore.setState(useTutorStore.getInitialState(), true);
  delete registry['xx'];
}
beforeEach(() => {
  resetAll();
  registry['xx'] = makeBundle(feedbackXx, uiXx);
});
afterEach(async () => {
  cleanup();
  await flushBenchWrites();
  await disposeTestDbs();
  resetAll();
});

function switchToXx() {
  act(() => useAppStore.getState().setLanguage(XX));
}

/** The screen says nothing in English: no line a student can read or hear equals a text of the English files. */
function expectNoEnglish() {
  const lines = readableText(document.body).split('\n').map((line) => line.trim());
  expect(lines.filter((line) => ENGLISH.has(line))).toEqual([]);
}

describe('The fake language file', () => {
  const placeholders = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();

  it('has exactly the keys of the English files, with the same placeholders', () => {
    const xx = registry['xx'];
    expect(xx).toBeDefined();
    expect(flattenKeys(uiXx).sort()).toEqual(flattenKeys(uiEn).sort());
    expect(flattenKeys(uiEn).length).toBeGreaterThan(150);
    for (const key of flattenKeys(uiEn)) expect(placeholders(lookupRaw(uiXx, key)), key).toEqual(placeholders(lookupRaw(uiEn, key)));

    const english = BUNDLES.en.feedback;
    const fake = xx?.feedback ?? {};
    expect(Object.keys(fake).sort()).toEqual(Object.keys(english).sort());
    for (const [key, entry] of Object.entries(english)) {
      const other = fake[key];
      expect(other?.owl, key).toBe(entry.owl);
      expect(other?.fix === undefined, key).toBe(entry.fix === undefined);
      expect(placeholders(other?.title ?? ''), key).toEqual(placeholders(entry.title));
      expect(placeholders(other?.explain ?? ''), key).toEqual(placeholders(entry.explain));
      expect(placeholders(other?.fix ?? ''), key).toEqual(placeholders(entry.fix ?? ''));
    }
  });

  it('loads through the same loader as English and answers when t() is asked for it by name', () => {
    expect(ux('picker.title')).toBe(`${MARK}${t('picker.title')}`);
    const english = t('OPEN_CIRCUIT.gap');
    expect(fx('OPEN_CIRCUIT.gap')).toEqual({
      owl: english.owl,
      title: `${MARK}${english.title}`,
      explain: `${MARK}${english.explain}`,
      fix: `${MARK}${english.fix ?? ''}`,
    });
    expect(ux('picker.hello', { name: 'Asha' })).toBe(`${MARK}${t('picker.hello', { name: 'Asha' })}`);
  });

  it('is not part of the build: the shipped registry holds English only, and no source file points at the fixtures', () => {
    delete registry['xx'];
    expect(Object.keys(BUNDLES)).toEqual(['en']);
    const sources = import.meta.glob('../../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const pointing = Object.entries(sources).filter(([, source]) => /fixtures|\.xx\.json/.test(source)).map(([path]) => path);
    expect(pointing).toEqual([]);
  });
});

/** The string at a dotted path of a nested file. */
function lookupRaw(tree: unknown, key: string): string {
  let node: unknown = tree;
  for (const segment of key.split('.')) node = typeof node === 'object' && node !== null ? Reflect.get(node, segment) : undefined;
  return typeof node === 'string' ? node : '';
}

describe('Screens speak the second language after a switch through the store', () => {
  it('the language selector still keeps Hindi and Marathi disabled, with "Coming soon"', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    renderAppAt(db, '#/');
    const select = await screen.findByRole('combobox', { name: t('common.language') });
    for (const value of ['hi', 'mr']) {
      const option = select.querySelector<HTMLOptionElement>(`option[value="${value}"]`);
      expect(option?.disabled, value).toBe(true);
      expect(option?.textContent, value).toContain(t('common.comingSoon'));
    }
    expect(select.querySelector<HTMLOptionElement>('option[value="en"]')?.disabled).toBe(false);
  });

  it('login', async () => {
    const db = await makeTestDb();
    renderAppAt(db, '#/login');
    await screen.findByLabelText(t('login.userId'));
    switchToXx();
    expect(await screen.findByLabelText(ux('login.userId'))).toBeTruthy();
    expect(screen.getByLabelText(ux('login.password'))).toBeTruthy();
    expect(screen.getByRole('button', { name: ux('login.submit') })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ux('login.submit') }));
    expect(await screen.findByText(ux('login.needBoth'))).toBeTruthy();
    expectNoEnglish();
    expectNoLeaks(document.body);
    expect(document.documentElement.lang).toBe('xx');
    expect(document.title).toBe(ux('app.name'));
  });

  it('picker', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    renderAppAt(db, '#/');
    await screen.findByRole('heading', { level: 1, name: t('picker.title') });
    switchToXx();
    expect(await screen.findByRole('heading', { level: 1, name: ux('picker.title') })).toBeTruthy();
    expect(screen.getByText(ux('picker.hello', { name: 'Asha' }))).toBeTruthy();
    expect(screen.getAllByText(ux('exp.ohms-law.title')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(ux('picker.status.not_started')).length).toBeGreaterThan(0);
    expectNoEnglish();
    expectNoLeaks(document.body);
  });

  it('result', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await startAttempt(db, { id: 'a1', userId: 'asha', experimentId: 'ohms-law', kind: 'experiment', startedAt: 1 });
    await evaluate(db, { attemptId: 'a1', results: [err('OPEN_CIRCUIT', 'OPEN_CIRCUIT.gap')], signature: 'sig-1', timestamp: 10 });
    await finishAttempt(db, 'a1', 20);
    renderAppAt(db, '#/result/a1');
    await screen.findByRole('heading', { level: 1, name: t('result.title') });
    switchToXx();
    expect(await screen.findByRole('heading', { level: 1, name: ux('result.title') })).toBeTruthy();
    const mistakes = within(screen.getByRole('region', { name: ux('result.mistakesTitle') }));
    expect(mistakes.getByRole('heading', { level: 3, name: fx('OPEN_CIRCUIT.gap').title })).toBeTruthy();
    expect(mistakes.getByText(fx('OPEN_CIRCUIT.gap').fix ?? '')).toBeTruthy();
    expect(mistakes.getByText(ux('result.mistakeCount', { count: 1 }))).toBeTruthy();
    expectNoEnglish();
    expectNoLeaks(document.body);
  });

  it('progress', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await db.errorProfile.put({ userId: 'asha', experimentId: 'ohms-law', code: 'WRONG_POLARITY', count: 3, lastSeenAt: 10 });
    await db.errorProfile.put({ userId: 'asha', experimentId: 'ohms-law', code: 'OPEN_CIRCUIT', count: 1, lastSeenAt: 50 });
    renderAppAt(db, '#/progress');
    await screen.findByRole('heading', { level: 1, name: t('progress.title') });
    switchToXx();
    expect(await screen.findByRole('heading', { level: 1, name: ux('progress.title') })).toBeTruthy();
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    const topics = within(screen.getByRole('region', { name: ux('progress.topics') }));
    expect(topics.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([ux('errorTopics.WRONG_POLARITY'), ux('errorTopics.OPEN_CIRCUIT')]);
    expect(topics.getByText(ux('result.mistakeCountPlural', { count: 3 }))).toBeTruthy();
    expectNoEnglish();
    expectNoLeaks(document.body);
  });

  it('bench: the tutor panel shows the instructions and a checkpoint error in the second language', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    // Switched before the bench opens: a bench starts its attempt and clears the circuit when it mounts.
    switchToXx();
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: ux('exp.ohms-law.title') });

    const panel = () => screen.getByRole('complementary', { name: ux('bench.panelTitle') });
    fireEvent.click(within(panel()).getByRole('button', { name: ux('bench.showPanel') }));
    expect(within(panel()).getByText(ux('bench.panelEmpty'))).toBeTruthy();
    expect(panel().querySelectorAll('ol li')).toHaveLength(6);

    const store = useBenchStore.getState();
    await store.place('supply', { x: 100, y: 100 });
    await store.place('switch', { x: 400, y: 100 });
    await waitFor(() => expect(document.querySelector('[data-part-id="SW"]')).not.toBeNull());
    fireEvent.keyDown(document.querySelector('[data-part-id="SW"]') as Element, { key: 'Enter' });

    const title = fx('OPEN_CIRCUIT.gap').title;
    expect(await within(panel()).findByRole('heading', { level: 3, name: title })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('live-region').textContent?.trim()).toBe(title));
    expect(within(panel()).getByText(fx('OPEN_CIRCUIT.gap').fix ?? '')).toBeTruthy();
    expectNoEnglish();
    expectNoLeaks(document.body);
  });
});
