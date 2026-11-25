import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LabXpertDB } from '../../src/db/database';
import { startAttempt } from '../../src/db/attempts';
import { setSetting, SETTING_KEYS } from '../../src/db/settings';
import { t, UnknownTextKeyError } from '../../src/i18n';
import tokens from '../../src/spec/design-tokens.json';
import App from '../../src/App';
import { DbProvider, useAppStore } from '../../src/state';
import { PickerScreen } from '../../src/ui/screens/PickerScreen';
import { ErrorBoundary } from '../../src/ui/shell/ErrorBoundary';
import { expectNoLeaks } from '../helpers/leaks';

// Part 15B-1: the DESIGN.md §13 checks for Login, Picker, Not found, Storage unavailable and the
// error screen that a test can make without a browser, and the content-safety check on each of them.

beforeEach(() => {
  resetAppState();
  // React logs every error the boundary catches; the boundary tests make that expected.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await disposeTestDbs();
  resetAppState();
});

// The stylesheet is read from disk: a CSS `?raw` import comes back empty under Vitest's CSS handling.
// The project has no Node type package, so only the two built-in calls used here are described.
// The path comes from the working directory (the project root when Vitest runs), because under jsdom
// `import.meta.url` is not a file URL.
interface NodeBuiltins {
  cwd(): string;
  getBuiltinModule(id: 'node:fs'): { readFileSync(path: string, encoding: 'utf8'): string };
}
const node = (globalThis as unknown as { process: NodeBuiltins }).process;
const indexCss = node.getBuiltinModule('node:fs').readFileSync(`${node.cwd()}/src/index.css`, 'utf8');

const classOf = (element: Element) => element.getAttribute('class') ?? '';
const owl = (container: HTMLElement) => container.querySelector('[data-mood]');
const owlWidth = (container: HTMLElement) => owl(container)?.querySelector('svg')?.getAttribute('width');

function Thrower({ message }: { message: string }): null {
  throw new UnknownTextKeyError(message);
}

// ---- Login ----

describe('Login: audit', () => {
  async function openLogin() {
    const db = await makeTestDb();
    const view = renderAppAt(db, '#/login');
    const userId = await screen.findByLabelText<HTMLInputElement>(t('login.userId'));
    const password = screen.getByLabelText<HTMLInputElement>(t('login.password'));
    return { db, view, userId, password };
  }

  it('shows no internal text when empty, with an error on the user ID, and with an error on the password', async () => {
    const { view, userId, password } = await openLogin();
    expectNoLeaks(view.container);

    fireEvent.click(screen.getByRole('button', { name: t('login.submit') }));
    await screen.findByText(t('login.needBoth'));
    expectNoLeaks(view.container);

    fireEvent.change(userId, { target: { value: 'asha' } });
    expect(screen.queryByText(t('login.needBoth'))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('login.submit') }));
    await screen.findByText(t('login.needBoth'));
    expect(document.activeElement).toBe(password);
    expectNoLeaks(view.container);
  });

  it('keeps both labels visible, above the fields, with no placeholder standing in for one', async () => {
    const { userId, password } = await openLogin();
    for (const input of [userId, password]) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      expect(label).not.toBeNull();
      expect(label?.textContent?.trim()).not.toBe('');
      expect(input.hasAttribute('placeholder')).toBe(false);
      // The label comes before the input in the page, so it is drawn above it.
      expect(label?.compareDocumentPosition(input)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });

  it('the error has an icon as well as words, and is tied to its field and announced', async () => {
    const { userId } = await openLogin();
    fireEvent.click(screen.getByRole('button', { name: t('login.submit') }));
    const words = await screen.findByText(t('login.needBoth'));
    expect(words.closest('p')?.querySelector('svg')).not.toBeNull();
    expect(userId.getAttribute('aria-invalid')).toBe('true');
    const described = (userId.getAttribute('aria-describedby') ?? '').split(' ');
    const region = described.map((id) => document.getElementById(id)).find((el) => el?.contains(words));
    expect(region?.getAttribute('aria-live')).toBe('polite');
    // The invalid field also has a different border colour; the icon and words are what make it more than colour.
    expect(classOf(userId)).toContain('border-error');
  });

  it('Enter submits: the button is the form\'s submit button, and submitting logs in', async () => {
    const { db, userId, password } = await openLogin();
    const button = screen.getByRole('button', { name: t('login.submit') });
    const form = screen.getByRole('form', { name: t('login.title') });
    expect(button.getAttribute('type')).toBe('submit');
    expect(button.closest('form')).toBe(form);
    expect(form.contains(userId) && form.contains(password)).toBe(true);
    fireEvent.change(userId, { target: { value: 'Asha' } });
    fireEvent.change(password, { target: { value: 'x' } });
    fireEvent.submit(form);
    await waitFor(async () => expect(await db.users.count()).toBe(1));
  });

  it('puts Ollie happy at 140 px beside the form, and keeps targets and type to the rules', async () => {
    const { view, userId } = await openLogin();
    expect(owl(view.container)?.getAttribute('data-mood')).toBe('happy');
    expect(owlWidth(view.container)).toBe('140');
    expect(classOf(userId)).toContain('h-12');
    expect(classOf(screen.getByRole('button', { name: t('login.submit') }))).toContain('min-h-[48px]');
    expect(classOf(screen.getByText(t('login.note')))).toContain('text-sm');
  });

  it('never keeps the password in the page after a sign-in', async () => {
    const { userId, password, view } = await openLogin();
    fireEvent.change(userId, { target: { value: 'asha' } });
    fireEvent.change(password, { target: { value: 'hunter2-secret' } });
    fireEvent.click(screen.getByRole('button', { name: t('login.submit') }));
    expect(password.value).toBe('');
    await screen.findByRole('heading', { level: 1, name: t('picker.title') });
    expect(view.container.innerHTML).not.toContain('hunter2-secret');
  });
});

// ---- Picker ----

describe('Picker: audit', () => {
  async function openPicker(db: LabXpertDB, name = 'Asha') {
    await seedUser(db, name);
    return renderAppAt(db, '#/');
  }

  it('shows no internal text while loading, when loaded, and with in-progress and not-started statuses', async () => {
    const db = await makeTestDb();
    const user = await seedUser(db, 'Asha');
    await startAttempt(db, { id: 'a1', userId: 'asha', experimentId: 'ohms-law', kind: 'experiment', startedAt: 1 });
    useAppStore.getState().hydrate({ user, reduceMotion: false });
    // Rendered on its own, so the first paint (before the db has answered) can be looked at.
    const view = render(
      <DbProvider db={db}>
        <MemoryRouter>
          <PickerScreen />
        </MemoryRouter>
      </DbProvider>,
    );
    const main = view.container.querySelector('main');
    expect(main?.getAttribute('aria-busy')).toBe('true');
    expect(view.container.querySelectorAll('[data-tone]')).toHaveLength(0);
    for (const button of screen.getAllByRole('button', { name: t('picker.open') })) expect(button.hasAttribute('disabled')).toBe(true);
    expectNoLeaks(view.container);

    await screen.findByText(t('picker.status.in_progress'));
    await screen.findByText(t('picker.status.not_started'));
    expect(main?.getAttribute('aria-busy')).toBe('false');
    expectNoLeaks(view.container);
  });

  it('every status chip has an icon beside its words', async () => {
    const db = await makeTestDb();
    const view = await openPicker(db);
    await screen.findAllByText(t('picker.status.not_started'));
    // Only the page itself: the top bar has its own online chip and its own small Ollie.
    const chips = view.container.querySelectorAll('main [data-tone]');
    expect(chips).toHaveLength(2);
    for (const chip of Array.from(chips)) expect(chip.querySelector('svg')).not.toBeNull();
  });

  it('tab order inside the page is card one, card two, then My progress', async () => {
    const db = await makeTestDb();
    const view = await openPicker(db);
    await screen.findAllByText(t('picker.status.not_started'));
    const main = view.container.querySelector('main');
    const stops = Array.from(main?.querySelectorAll('a[href], button, input, select, textarea, [tabindex]') ?? []);
    expect(stops.map((el) => el.tagName + ':' + (el.textContent ?? '').trim())).toEqual([
      `BUTTON:${t('picker.open')}`,
      `BUTTON:${t('picker.open')}`,
      `A:${t('picker.progress')}`,
    ]);
    const buttons = stops.slice(0, 2);
    expect(screen.getAllByRole('article')[0]?.contains(buttons[0] ?? null)).toBe(true);
    expect(screen.getAllByRole('article')[1]?.contains(buttons[1] ?? null)).toBe(true);
  });

  it('My progress link has hover and pressed states, a focus ring and a 48 px target', async () => {
    const db = await makeTestDb();
    await openPicker(db);
    const link = await screen.findByRole('link', { name: t('picker.progress') });
    const classes = classOf(link);
    expect(classes).toContain('hover:bg-teal-tint');
    expect(classes).toContain('active:translate-y-0.5');
    expect(classes).toContain('focus-visible:outline');
    expect(classes).toContain('min-h-[48px]');
  });

  it('wraps a very long display name instead of making the page wider', async () => {
    const db = await makeTestDb();
    const long = 'a'.repeat(200);
    const view = await openPicker(db, long);
    const greeting = await screen.findByText(t('picker.hello', { name: long }));
    expect(classOf(greeting)).toContain('break-words');
    expectNoLeaks(view.container);
  });

  it('open buttons are 48 px tall and use the heading font', async () => {
    const db = await makeTestDb();
    await openPicker(db);
    await screen.findAllByText(t('picker.status.not_started'));
    for (const button of screen.getAllByRole('button', { name: t('picker.open') })) {
      expect(classOf(button)).toContain('min-h-[48px]');
      expect(classOf(button)).toContain('font-heading');
    }
  });

  it('has no Ollie: the spec places him on the other screens only', async () => {
    const db = await makeTestDb();
    const view = await openPicker(db);
    await screen.findAllByText(t('picker.status.not_started'));
    expect(view.container.querySelector('main [data-mood]')).toBeNull();
  });
});

// ---- Not found, Storage unavailable, error screen ----

describe('Message screens: audit', () => {
  it('Not found (logged out): Ollie thinking at 140 px, friendly text, a way back, focus on the message, nothing internal', async () => {
    const db = await makeTestDb();
    const view = renderAppAt(db, '#/no/such/page');
    const heading = await screen.findByRole('heading', { level: 1, name: t('error.notFoundTitle') });
    expect(owl(view.container)?.getAttribute('data-mood')).toBe('thinking');
    expect(owlWidth(view.container)).toBe('140');
    expect(screen.getByRole('button', { name: t('error.backToStart') })).toBeTruthy();
    expect(document.activeElement).toBe(heading);
    expectNoLeaks(view.container);
  });

  it('Not found inside the app for an unknown experiment or practice task: same, with the top bar and nothing internal', async () => {
    for (const hash of ['#/experiment/bogus-id', '#/practice/bogus-task']) {
      const db = await makeTestDb();
      await seedUser(db);
      const view = renderAppAt(db, hash);
      const heading = await screen.findByRole('heading', { level: 1, name: t('error.notFoundTitle') });
      expect(document.activeElement).toBe(heading);
      expect(screen.getByRole('banner')).toBeTruthy();
      expectNoLeaks(view.container);
      cleanup();
      await disposeTestDbs();
      resetAppState();
    }
  });

  it('Storage unavailable: Ollie thinking, friendly text, focus on the message, no button, nothing internal', async () => {
    const db = new LabXpertDB('labxpert-audit-fails-to-open');
    vi.spyOn(db, 'open').mockRejectedValue(new Error('QuotaExceededError: IDBFactory blocked'));
    const view = render(<App db={db} />);
    const heading = await screen.findByRole('heading', { level: 1, name: t('storage.title') });
    expect(owl(view.container)?.getAttribute('data-mood')).toBe('thinking');
    expect(owlWidth(view.container)).toBe('140');
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByRole('button')).toBeNull();
    expect(view.container.textContent).not.toContain('Quota');
    expectNoLeaks(view.container);
  });

  it('Error screen: never shows an error key or message, gives a way back, takes focus, Ollie thinking', () => {
    for (const message of ['OPEN_CIRCUIT.gap', 'picker.hello', 'AMMETER_PARALLEL', 'ohms-law']) {
      const view = render(
        <ErrorBoundary>
          <Thrower message={message} />
        </ErrorBoundary>,
      );
      const heading = screen.getByRole('heading', { level: 1, name: t('error.title') });
      expect(document.activeElement).toBe(heading);
      expect(screen.getByRole('button', { name: t('error.backToStart') })).toBeTruthy();
      expect(owl(view.container)?.getAttribute('data-mood')).toBe('thinking');
      expect(view.container.textContent).not.toContain(message);
      expectNoLeaks(view.container);
      view.unmount();
    }
  });

  it('the way-back button is at least 48 px and shows a focus ring and a pressed state', async () => {
    const db = await makeTestDb();
    renderAppAt(db, '#/no/such/page');
    const button = await screen.findByRole('button', { name: t('error.backToStart') });
    const classes = classOf(button);
    expect(classes).toContain('min-h-[48px]');
    expect(classes).toContain('focus-visible:outline');
    expect(classes).toContain('active:shadow-press');
  });

  it('the message fits beside Ollie or wraps below him, and the card never forces a wider page', () => {
    const view = render(
      <ErrorBoundary>
        <Thrower message="x" />
      </ErrorBoundary>,
    );
    const card = view.container.querySelector('section');
    expect(classOf(card as Element)).toContain('flex-wrap');
    expect(classOf(view.container.querySelector('p') as Element)).toContain('max-w-[70ch]');
  });
});

// ---- Motion ----

describe('Reduced motion: audit', () => {
  it('the screen-change fade is on by default and gone when the setting is on', async () => {
    const db = await makeTestDb();
    await seedUser(db);
    const first = renderAppAt(db, '#/');
    await screen.findByRole('heading', { level: 1, name: t('picker.title') });
    expect(classOf(screen.getByRole('main').parentElement as Element)).toContain('animate-fade-in');
    first.unmount();

    await setSetting(db, SETTING_KEYS.reduceMotion, true);
    resetAppState();
    renderAppAt(db, '#/');
    await screen.findByRole('heading', { level: 1, name: t('picker.title') });
    await waitFor(() => expect(document.documentElement.dataset.reduceMotion).toBe('true'));
    expect(classOf(screen.getByRole('main').parentElement as Element)).not.toContain('animate-fade-in');
  });

  it('the stylesheet cuts animation and transition time for both the OS setting and the in-app setting', () => {
    // Whitespace and quote style do not matter, so a reformatted stylesheet still passes.
    expect(indexCss.length).toBeGreaterThan(0);
    const css = indexCss.replace(/\s+/g, '').replace(/"/g, "'");
    expect(css).toContain('@media(prefers-reduced-motion:reduce){');
    expect(css).toContain("html[data-reduce-motion='true']*,");
    expect(css).toContain("html[data-reduce-motion='true']*::before");
    // One copy of each rule for the OS setting and one for the in-app setting.
    expect(css.split('animation-duration:0.001ms!important').length - 1).toBeGreaterThanOrEqual(2);
    expect(css.split('transition-duration:0.001ms!important').length - 1).toBeGreaterThanOrEqual(2);
  });
});

// ---- Contrast with the real tokens ----

describe('Contrast: the pairs these screens use', () => {
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
    ['ink on mat (card text)', c.ink, c.mat],
    ['ink on white (bubble, inputs)', c.ink, c.white],
    ['inkSoft on mat (login note)', c.inkSoft, c.mat],
    ['inkSoft on cream (greeting)', c.inkSoft, c.cream],
    ['error on mat (login error text sits on the card)', c.error, c.mat],
    ['ink on orange (primary button)', c.ink, c.orange],
    ['ink on tealTint (link hover)', c.ink, c.tealTint],
    ['ink on okTint (done chip)', c.ink, c.okTint],
    ['ink on mat (neutral chip)', c.ink, c.mat],
    ['ink on tealTint (in-progress chip)', c.ink, c.tealTint],
  ])('%s is at least 4.5:1', (_name, foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
