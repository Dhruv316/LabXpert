import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { checkpointRecord, err, evaluate } from '../db/helpers';
import errorCodes from '../../src/spec/error-codes.json';
import tokens from '../../src/spec/design-tokens.json';
import resultSource from '../../src/ui/screens/ResultScreen.tsx?raw';
import progressSource from '../../src/ui/screens/ProgressScreen.tsx?raw';
import progressModelSource from '../../src/ui/screens/progress-model.ts?raw';
import type { LabXpertDB } from '../../src/db/database';
import { finishAttempt, startAttempt } from '../../src/db/attempts';
import { appendEvent } from '../../src/db/events';
import { BUNDLES } from '../../src/i18n/bundles';
import { t } from '../../src/i18n';
import type { ErrorCode, ExperimentId, PracticeRecord } from '../../src/model/types';
import { PRACTICE_TASKS } from '../../src/ui/screens/practice-list';
import { practiceRows } from '../../src/ui/screens/progress-model';
import { expectNoLeaks } from '../helpers/leaks';

// Part 15B-2: the DESIGN.md §13 checks for Result and My progress that a test can make without a
// browser (class contracts, structure, text safety), plus the long-content and leak checks.

beforeEach(() => {
  resetAppState();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await disposeTestDbs();
  resetAppState();
});

const DAY = Date.UTC(2026, 10, 20, 12);
const LONG = 'w'.repeat(120);
const classOf = (element: Element | null | undefined) => element?.getAttribute('class') ?? '';

const ERROR_CODES = errorCodes.errors.map((entry) => entry.code as ErrorCode);
const feedbackKeyFor = (code: ErrorCode): string =>
  errorCodes.errors.find((entry) => entry.code === code)?.feedbackKeys[0] ?? code;

/** Elements a keyboard can stop on, in page order. */
const tabStops = (root: Element) =>
  Array.from(root.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')).filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('tabindex') !== '-1',
  );

function expectNoPositiveTabindex() {
  for (const element of Array.from(document.querySelectorAll('[tabindex]'))) {
    expect(Number(element.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
  }
}

// ---- Source rules shared by both screens ----

describe.each([
  ['ResultScreen', resultSource],
  ['ProgressScreen', progressSource],
])('%s: source rules', (_name, source) => {
  it('uses no raw colour values and no colours outside the tokens', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
    expect(source).not.toMatch(
      /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|divide|shadow)-(?:slate|gray|zinc|neutral|stone|red|amber|yellow|lime|green|emerald|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black)(?:-\d+)?\b/,
    );
    expect(source).not.toMatch(/\b(?:orange|teal)-\d{2,3}\b/);
  });

  it('uses only the token radii, and the token fonts', () => {
    const radii = source.match(/\brounded-[a-z0-9-]+/g) ?? [];
    for (const radius of radii) expect(['rounded-small', 'rounded-control', 'rounded-card', 'rounded-panel']).toContain(radius);
    expect(source).not.toMatch(/\bfont-(?:sans|serif|mono)\b/);
  });

  it('sets no text below 14 px, no all-caps and no tracked-out labels', () => {
    expect(source).not.toMatch(/\btext-xs\b/);
    for (const match of source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) expect(Number(match[1])).toBeGreaterThanOrEqual(14);
    expect(source).not.toMatch(/\b(?:uppercase|tracking-[a-z]+)\b/);
  });

  it('has no fixed pixel widths, no clipped or one-line text, and no sideways scrolling', () => {
    expect(source).not.toMatch(/\b(?:min-|max-)?w-\[\d+px\]/);
    expect(source).not.toMatch(/\b(?:truncate|whitespace-nowrap|overflow-hidden|overflow-x-\w+|overflow-scroll)\b/);
  });

  it('keeps body text at 16/26 and wraps long words', () => {
    expect(source).toContain("const BODY = 'text-base leading-[1.625rem]'");
    expect(source).toContain("const WRAP = 'min-w-0 break-words'");
    expect(source).not.toMatch(/\bleading-6\b/);
  });

  it('keeps no data in browser storage and no any', () => {
    expect(source).not.toMatch(/localStorage|sessionStorage/);
    expect(source).not.toMatch(/:\s*any\b|\bas any\b|<any>/);
  });
});

describe('Contrast: the pairs these two screens use, with the real tokens', () => {
  const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((start) => channel(parseInt(hex.slice(start, start + 2), 16) / 255));
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  }
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
  };
  const c = tokens.colors;

  it.each([
    ['ink on cream (page text)', c.ink, c.cream],
    ['ink on mat (cards and rows)', c.ink, c.mat],
    ['ink on okTint (went-well rows, done chip)', c.ink, c.okTint],
    ['ink on tealTint (fix box, in-progress chip)', c.ink, c.tealTint],
    ['ink on orange (primary button)', c.ink, c.orange],
    ['white on tealDeep (secondary button)', c.white, c.tealDeep],
  ])('text: %s is at least 4.5:1', (_name, foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['ok check on okTint', c.ok, c.okTint],
    ['error alert on mat', c.error, c.mat],
    ['tealDeep wrench on tealTint', c.tealDeep, c.tealTint],
    ['inkSoft icon on mat (neutral chip)', c.inkSoft, c.mat],
  ])('icon: %s is at least 3:1', (_name, foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(3);
  });
});

// ---- Result ----

interface SeedOptions {
  id: string;
  errors?: { code: ErrorCode; times: number }[];
  confirmationCodes?: string[];
}

async function seedAttempt(db: LabXpertDB, o: SeedOptions) {
  const experimentId: ExperimentId = 'ohms-law';
  await startAttempt(db, { id: o.id, userId: 'asha', experimentId, kind: 'experiment', startedAt: 1 });
  let time = 100;
  for (const error of o.errors ?? []) {
    for (let i = 0; i < error.times; i += 1) {
      time += 10;
      // A new circuit signature each time, so the same error is saved again and counted.
      await evaluate(db, {
        attemptId: o.id,
        results: [err(error.code, feedbackKeyFor(error.code))],
        signature: `${error.code}-${i}`,
        timestamp: time,
      });
    }
  }
  if (o.confirmationCodes !== undefined && o.confirmationCodes.length > 0) {
    time += 10;
    await appendEvent(db, checkpointRecord(o.id, `${o.id}-cp`, time, 'main', o.confirmationCodes, [], experimentId));
  }
  await finishAttempt(db, o.id, time + 10);
}

async function openResult(db: LabXpertDB, attemptId: string) {
  await seedUser(db, 'Asha');
  const view = renderAppAt(db, `#/result/${attemptId}`);
  const heading = await screen.findByRole('heading', { level: 1, name: t('result.title') });
  return { view, heading };
}

const SINGLE_KEY_CONFIRMATIONS = errorCodes.ok.filter((entry) => entry.feedbackKeys.length === 1).map((entry) => entry.code);
const mistakesRegion = () => screen.getByRole('region', { name: t('result.mistakesTitle') });
const wentWellRegion = () => screen.getByRole('region', { name: t('result.wentWell') });

describe('Result: leak checks in several states', () => {
  it('shows no words and nothing internal while loading', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'rich', errors: [{ code: 'OPEN_CIRCUIT', times: 1 }] });
    await seedUser(db, 'Asha');
    vi.spyOn(db.attempts, 'get').mockImplementation(
      () => new Promise(() => undefined) as ReturnType<typeof db.attempts.get>,
    );
    const view = renderAppAt(db, '#/result/rich');
    await waitFor(() => expect(document.querySelector('main[aria-busy="true"]')).not.toBeNull());
    expect(document.querySelector('main[aria-busy="true"]')?.textContent).toBe('');
    expectNoLeaks(view.container);
  });

  it('shows nothing internal when empty (no mistakes, nothing confirmed), loaded, and with many items', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'empty' });
    const empty = await openResult(db, 'empty');
    expect(screen.getByText(t('result.noMistakes'))).toBeTruthy();
    expectNoLeaks(empty.view.container);
    empty.view.unmount();

    resetAppState();
    await seedAttempt(db, {
      id: 'loaded',
      errors: [{ code: 'OPEN_CIRCUIT', times: 1 }, { code: 'AMMETER_PARALLEL', times: 2 }],
      confirmationCodes: ['OK_CIRCUIT_COMPLETE', 'OK_POLARITY'],
    });
    const loaded = await openResult(db, 'loaded');
    expectNoLeaks(loaded.view.container);
    loaded.view.unmount();

    resetAppState();
    await seedAttempt(db, {
      id: 'many',
      errors: ERROR_CODES.map((code, index) => ({ code, times: (index % 3) + 1 })),
      confirmationCodes: SINGLE_KEY_CONFIRMATIONS,
    });
    const many = await openResult(db, 'many');
    expect(within(mistakesRegion()).getAllByRole('listitem')).toHaveLength(ERROR_CODES.length);
    expect(within(wentWellRegion()).getAllByRole('listitem')).toHaveLength(SINGLE_KEY_CONFIRMATIONS.length);
    expectNoLeaks(many.view.container);
  });

  it('shows nothing internal on the error screen when the read fails', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'rich' });
    await seedUser(db, 'Asha');
    vi.spyOn(db.attempts, 'get').mockRejectedValue(new Error('secret disk failure'));
    const view = renderAppAt(db, '#/result/rich');
    await screen.findByRole('heading', { name: t('error.title') });
    expectNoLeaks(view.container);
  });
});

describe('Result: long and many items', () => {
  it('wraps a very long title and fix inside the card and keeps both buttons', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'long', errors: [{ code: 'AMMETER_PARALLEL', times: 1 }] });
    const key = 'AMMETER_PARALLEL';
    const original = BUNDLES.en.feedback[key];
    if (original === undefined) throw new Error('missing feedback entry');
    BUNDLES.en.feedback[key] = { ...original, title: LONG, fix: LONG };
    try {
      const { view } = await openResult(db, 'long');
      const card = within(mistakesRegion()).getAllByRole('listitem')[0] as HTMLElement;
      const heading = within(card).getByRole('heading', { level: 3 });
      expect(heading.textContent).toBe(LONG);
      for (const piece of within(card).getAllByText(LONG)) {
        expect(classOf(piece)).toContain('break-words');
        expect(classOf(piece)).toContain('min-w-0');
      }
      expect(classOf(card)).toContain('min-w-0');
      const main = screen.getByRole('main');
      expect(classOf(main)).toMatch(/max-w-4xl/);
      expect(classOf(main)).not.toMatch(/overflow/);
      for (const name of [t('result.practice'), t('result.back')]) {
        expect(classOf(screen.getByRole('button', { name }))).toContain('min-h-[48px]');
      }
      expectNoLeaks(view.container);
    } finally {
      BUNDLES.en.feedback[key] = original;
    }
  });

  it('shows every mistake card with a count and a fix, in one column below 1100 px and two above', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'many', errors: ERROR_CODES.map((code) => ({ code, times: 1 })) });
    await openResult(db, 'many');
    const list = within(mistakesRegion()).getAllByRole('listitem')[0]?.parentElement;
    expect(classOf(list)).toContain('grid-cols-1');
    expect(classOf(list)).toContain('min-[1100px]:grid-cols-2');
    expect(classOf(list)).not.toMatch(/overflow|max-h-/);
    for (const card of within(mistakesRegion()).getAllByRole('listitem')) {
      expect(within(card).getByText(t('result.mistakeCount', { count: 1 }))).toBeTruthy();
      expect(card.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Result: structure, tab order, targets and cues', () => {
  const rich: SeedOptions = {
    id: 'rich',
    errors: [{ code: 'OPEN_CIRCUIT', times: 1 }, { code: 'AMMETER_PARALLEL', times: 2 }],
    confirmationCodes: ['OK_CIRCUIT_COMPLETE', 'OK_POLARITY'],
  };

  it('puts the sections in the spec order: title, what went well, mistakes, buttons', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, rich);
    const { heading } = await openResult(db, 'rich');
    const order = [
      heading,
      wentWellRegion(),
      mistakesRegion(),
      screen.getByRole('button', { name: t('result.practice') }),
      screen.getByRole('button', { name: t('result.back') }),
    ];
    for (let i = 1; i < order.length; i += 1) {
      const before = order[i - 1] as Element;
      const after = order[i] as Element;
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('has exactly two tab stops in the page, practice then back, and the heading is focusable by script only', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, rich);
    const { heading } = await openResult(db, 'rich');
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(tabStops(screen.getByRole('main')).map((stop) => stop.textContent?.trim())).toEqual([
      t('result.practice'),
      t('result.back'),
    ]);
    expectNoPositiveTabindex();
  });

  it('gives every row, card and button an icon beside its words, a focus ring, and a 48 px target', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, rich);
    const { heading } = await openResult(db, 'rich');
    for (const row of within(wentWellRegion()).getAllByRole('listitem')) expect(row.querySelector('svg')).not.toBeNull();
    for (const card of within(mistakesRegion()).getAllByRole('listitem')) {
      expect(card.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
    }
    for (const name of [t('result.practice'), t('result.back')]) {
      const button = screen.getByRole('button', { name });
      expect(button.querySelector('svg')).not.toBeNull();
      expect(classOf(button)).toContain('min-h-[48px]');
      expect(classOf(button)).toContain('focus-visible:outline-teal');
    }
    expect(classOf(heading)).toContain('focus-visible:outline-teal');
  });

  it('shows the clean line with a check icon, and the went-well rows only when there are some', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, { id: 'clean' });
    await openResult(db, 'clean');
    expect(screen.getByText(t('result.noMistakes')).closest('p')?.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('region', { name: t('result.wentWell') })).toBeNull();
  });

  it('uses the heading font and the type scale: h1 32/40, h2 24/32, h3 20/28', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, rich);
    await openResult(db, 'rich');
    for (const heading of screen.getAllByRole('heading')) expect(classOf(heading)).toContain('font-heading');
    expect(classOf(screen.getByRole('heading', { level: 1 }))).toContain('text-[2rem]');
    expect(classOf(screen.getByRole('heading', { level: 1 }))).toContain('leading-10');
    for (const heading of screen.getAllByRole('heading', { level: 2 })) {
      expect(classOf(heading)).toContain('text-2xl');
      expect(classOf(heading)).toContain('leading-8');
    }
    for (const heading of screen.getAllByRole('heading', { level: 3 })) {
      expect(classOf(heading)).toContain('text-xl');
      expect(classOf(heading)).toContain('leading-7');
    }
  });

  it('puts Ollie celebrating at 160 px, hidden from assistive tech because the heading says it', async () => {
    const db = await makeTestDb();
    await seedAttempt(db, rich);
    await openResult(db, 'rich');
    const owl = screen.getByRole('main').querySelector('[data-mood]');
    expect(owl?.getAttribute('data-mood')).toBe('celebrating');
    const svg = owl?.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('160');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('has no bounce when the operating system asks for reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const db = await makeTestDb();
    await seedAttempt(db, rich);
    await openResult(db, 'rich');
    await waitFor(() => expect(document.documentElement.dataset.reduceMotion).toBe('true'));
    expect(classOf(screen.getByRole('main').querySelector('[data-mood]'))).not.toContain('animate-owl-bounce');
  });

  it('has no animation of its own except the guarded arrival bounce', () => {
    expect(resultSource).toContain("reduced ? undefined : 'animate-owl-bounce'");
    expect(resultSource.match(/animate-[a-z-]+/g) ?? []).toEqual(['animate-owl-bounce']);
    expect(progressSource).not.toMatch(/animate-|transition|duration-/);
  });
});

// ---- My progress ----

const profileExperiment = (code: ErrorCode): ExperimentId =>
  PRACTICE_TASKS.find((task) => task.forCodes.includes(code))?.appliesToExperiments[0] ?? 'ohms-law';

async function seedManyProgress(db: LabXpertDB, topics: number, runs: number) {
  await startAttempt(db, { id: 'done-1', userId: 'asha', experimentId: 'ohms-law', kind: 'experiment', startedAt: 1 });
  await finishAttempt(db, 'done-1', 50);
  await startAttempt(db, { id: 'open-1', userId: 'asha', experimentId: 'series-parallel', kind: 'experiment', startedAt: 2 });
  for (const [index, code] of ERROR_CODES.slice(0, topics).entries()) {
    await db.errorProfile.put({
      userId: 'asha',
      experimentId: profileExperiment(code),
      code,
      count: (index % 3) + 1,
      lastSeenAt: index + 1,
    });
  }
  for (let i = 0; i < runs; i += 1) {
    const task = PRACTICE_TASKS[i % PRACTICE_TASKS.length];
    if (task === undefined) throw new Error('missing practice task');
    await db.practiceRecords.add({
      id: `run-${i}`,
      userId: 'asha',
      practiceTaskId: task.id,
      attemptId: `run-${i}-attempt`,
      completedAt: DAY + i * 86_400_000,
      clean: i % 2 === 0,
    });
  }
}

async function openProgress(db: LabXpertDB) {
  await seedUser(db, 'Asha');
  const view = renderAppAt(db, '#/progress');
  await screen.findByRole('heading', { level: 1, name: t('progress.title') });
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
  return view;
}

function stallProfile(db: LabXpertDB, outcome: 'pending' | 'fail') {
  const toArray = () =>
    outcome === 'pending' ? new Promise<never>(() => undefined) : Promise.reject(new Error('secret disk failure'));
  vi.spyOn(db.errorProfile, 'where').mockImplementation(
    (() => ({ equals: () => ({ toArray }) })) as unknown as typeof db.errorProfile.where,
  );
}

const section = (name: string) => within(screen.getByRole('region', { name }));

describe('My progress: leak checks in several states', () => {
  it('shows nothing internal when empty, with every empty text and an icon on each status chip', async () => {
    const db = await makeTestDb();
    const view = await openProgress(db);
    expect(screen.getByText(t('progress.topicsEmpty'))).toBeTruthy();
    expect(screen.getByText(t('progress.practiceEmpty'))).toBeTruthy();
    for (const chip of Array.from(view.container.querySelectorAll('[data-tone]'))) expect(chip.querySelector('svg')).not.toBeNull();
    expectNoLeaks(view.container);
  });

  it('shows nothing internal while loading', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    stallProfile(db, 'pending');
    const view = renderAppAt(db, '#/progress');
    await screen.findByRole('heading', { level: 1, name: t('progress.title') });
    expect(document.querySelector('main[aria-busy="true"]')).not.toBeNull();
    expectNoLeaks(view.container);
  });

  it('shows nothing internal on the error screen when a read fails', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    stallProfile(db, 'fail');
    const view = renderAppAt(db, '#/progress');
    await screen.findByRole('heading', { name: t('error.title') });
    expectNoLeaks(view.container);
  });

  it('shows nothing internal when loaded with every kind of row and each chip has an icon', async () => {
    const db = await makeTestDb();
    await seedManyProgress(db, 3, 3);
    const view = await openProgress(db);
    const chips = Array.from(view.container.querySelectorAll('[data-tone]'));
    expect(chips.length).toBeGreaterThanOrEqual(5);
    for (const chip of chips) expect(chip.querySelector('svg')).not.toBeNull();
    expectNoLeaks(view.container);
  });
});

describe('My progress: many and long items', () => {
  it('lists every topic and every practice run, newest first, with nothing clipped and both ends reachable', async () => {
    const db = await makeTestDb();
    await seedManyProgress(db, ERROR_CODES.length, 40);
    const view = await openProgress(db);
    expect(section(t('progress.topics')).getAllByRole('listitem')).toHaveLength(ERROR_CODES.length);
    const rows = section(t('progress.practiceDone')).getAllByRole('listitem');
    expect(rows).toHaveLength(40);
    const dateOf = (row: HTMLElement) => row.querySelector('p')?.textContent;
    const format = (time: number) => new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(time);
    expect(dateOf(rows[0] as HTMLElement)).toBe(format(DAY + 39 * 86_400_000));
    expect(dateOf(rows[39] as HTMLElement)).toBe(format(DAY));
    for (const element of Array.from(screen.getByRole('main').querySelectorAll('ul, li'))) {
      expect(classOf(element)).not.toMatch(/overflow|max-h-|\bh-\d|truncate|whitespace-nowrap/);
    }
    expect(screen.getByRole('button', { name: t('result.back') })).toBeTruthy();
    expectNoLeaks(view.container);
  });

  it('wraps a very long task title and topic name, and keeps the button and chip on the row', async () => {
    const db = await makeTestDb();
    await seedManyProgress(db, 1, 1);
    const taskTitles = BUNDLES.en.ui.practiceTasks;
    const titleBefore = taskTitles['practice-fix-open-circuit'].title;
    const topicBefore = BUNDLES.en.ui.errorTopics.OPEN_CIRCUIT;
    taskTitles['practice-fix-open-circuit'].title = LONG;
    BUNDLES.en.ui.errorTopics.OPEN_CIRCUIT = LONG;
    try {
      const view = await openProgress(db);
      const long = screen.getAllByRole('heading', { level: 3, name: LONG });
      expect(long.length).toBeGreaterThanOrEqual(1);
      for (const heading of long) {
        expect(classOf(heading)).toContain('break-words');
        expect(classOf(heading)).toContain('min-w-0');
        const row = heading.closest('li') as HTMLElement;
        expect(classOf(row)).toContain('flex-wrap');
        expect(row.querySelector('button, [data-tone]')).not.toBeNull();
      }
      expect(classOf(screen.getByRole('main'))).not.toMatch(/overflow/);
      expectNoLeaks(view.container);
    } finally {
      taskTitles['practice-fix-open-circuit'].title = titleBefore;
      BUNDLES.en.ui.errorTopics.OPEN_CIRCUIT = topicBefore;
    }
  });
});

describe('My progress: structure, tab order, targets and dates', () => {
  it('has one h1, three h2 sections in the spec order, then the back button', async () => {
    const db = await makeTestDb();
    await seedManyProgress(db, 2, 2);
    await openProgress(db);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      t('progress.experiments'),
      t('progress.topics'),
      t('progress.practiceDone'),
    ]);
    for (const heading of screen.getAllByRole('heading')) expect(classOf(heading)).toContain('font-heading');
    const last = screen.getByRole('region', { name: t('progress.practiceDone') });
    const back = screen.getByRole('button', { name: t('result.back') });
    expect(last.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('tabs through the Start practice buttons in list order, then Back, with nothing else', async () => {
    const db = await makeTestDb();
    await seedManyProgress(db, 3, 2);
    await openProgress(db);
    const names = tabStops(screen.getByRole('main')).map((stop) => stop.textContent?.trim());
    expect(names).toEqual([
      t('progress.startPractice'),
      t('progress.startPractice'),
      t('progress.startPractice'),
      t('result.back'),
    ]);
    expectNoPositiveTabindex();
  });

  it('gives every button a 48 px target and a focus ring, and ties each Start practice to its topic', async () => {
    const db = await makeTestDb();
    await seedManyProgress(db, 3, 1);
    await openProgress(db);
    const buttons = screen.getAllByRole('button', { name: t('progress.startPractice') });
    expect(buttons).toHaveLength(3);
    for (const button of [...buttons, screen.getByRole('button', { name: t('result.back') })]) {
      expect(classOf(button)).toContain('min-h-[48px]');
      expect(classOf(button)).toContain('focus-visible:outline-teal');
    }
    for (const button of buttons) {
      const target = document.getElementById(button.getAttribute('aria-describedby') ?? '');
      expect(target?.tagName).toBe('H3');
    }
  });

  it('formats dates with Intl.DateTimeFormat for the app language and has no fixed format anywhere', () => {
    const task = PRACTICE_TASKS[0];
    if (task === undefined) throw new Error('missing practice task');
    const record: PracticeRecord = {
      id: 'r',
      userId: 'asha',
      practiceTaskId: task.id,
      attemptId: 'r-attempt',
      completedAt: DAY,
      clean: true,
    };
    expect(practiceRows([record], PRACTICE_TASKS, 'en')[0]?.date).toBe(
      new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(DAY),
    );
    expect(progressModelSource).toContain('new Intl.DateTimeFormat(language');
    expect(progressModelSource).not.toMatch(/toLocale(?:Date|Time)?String|getFullYear|getMonth|getDate\(|padStart|YYYY|DD\/MM/);
    expect(progressSource).toContain('state.language');
    expect(progressSource).toContain('practiceRows(data.practice, PRACTICE_TASKS, language)');
  });

  it('keeps the layout rules for 1024 × 640, 1366 × 768 and 125% text: one centred column, rem type, wrapping rows', () => {
    for (const source of [resultSource, progressSource]) {
      expect(source).toContain('mx-auto');
      expect(source).toContain('max-w-4xl');
      expect(source).toContain('w-full');
      expect(source).toContain('min-w-0');
      expect(source).toContain('text-[2rem]');
    }
    expect(progressSource).toContain('flex-wrap');
    expect(resultSource).toContain('flex-wrap');
  });
});
