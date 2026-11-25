import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from './helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LabXpertDB } from '../../src/db/database';
import { MissingParamError, t, UnknownTextKeyError, type UiKey } from '../../src/i18n';
import { ErrorBoundary } from '../../src/ui/shell/ErrorBoundary';

beforeEach(() => {
  resetAppState();
  // React logs every caught render error; the boundary under test makes that expected.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await disposeTestDbs();
  resetAppState();
});

function Thrower({ error }: { error: Error }): null {
  throw error;
}

function owlMood(container: HTMLElement): string | null {
  return container.querySelector('[data-mood]')?.getAttribute('data-mood') ?? null;
}

describe('error boundary', () => {
  const CASES: Array<[string, () => Error]> = [
    ['UnknownTextKeyError', () => new UnknownTextKeyError('secret.key')],
    ['MissingParamError', () => new MissingParamError('secretParam')],
    ['any other error', () => new Error('secret details')],
  ];

  it.each(CASES)('shows the friendly screen for %s and no raw text', (_name, make) => {
    const { container } = render(
      <ErrorBoundary>
        <Thrower error={make()} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: t('error.title') })).toBeTruthy();
    expect(screen.getByText(t('error.body'))).toBeTruthy();
    expect(screen.getByRole('button', { name: t('error.backToStart') })).toBeTruthy();
    expect(owlMood(container)).toBe('thinking');

    const shown = document.body.textContent ?? '';
    for (const raw of ['secret', 'Unknown text key', 'Missing value', 'UnknownTextKeyError']) {
      expect(shown).not.toContain(raw);
    }
  });

  it('catches the errors t() really throws while rendering', () => {
    const BadKey = () => <p>{t('no.such.key' as unknown as UiKey)}</p>;
    const NoParam = () => <p>{t('picker.hello')}</p>;
    for (const Broken of [BadKey, NoParam]) {
      const view = render(
        <ErrorBoundary>
          <Broken />
        </ErrorBoundary>,
      );
      expect(screen.getByRole('heading', { name: t('error.title') })).toBeTruthy();
      view.unmount();
    }
  });

  it('Back to start goes to the start and tries the app again', () => {
    let broken = true;
    function Sometimes() {
      if (broken) throw new UnknownTextKeyError('x');
      return <p data-testid="recovered" />;
    }
    window.location.hash = '#/progress';
    render(
      <ErrorBoundary>
        <Sometimes />
      </ErrorBoundary>,
    );
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: t('error.backToStart') }));
    expect(window.location.hash).toBe('#/');
    expect(screen.getByTestId('recovered')).toBeTruthy();
  });
});

describe('storage unavailable', () => {
  it('shows the full-page message when the database fails to open', async () => {
    const db = new LabXpertDB('labxpert-fails-to-open');
    vi.spyOn(db, 'open').mockRejectedValue(new Error('blocked by browser'));
    const { container } = renderAppAt(db, '#/');

    expect(await screen.findByRole('heading', { name: t('storage.title') })).toBeTruthy();
    expect(screen.getByText(t('storage.body'))).toBeTruthy();
    expect(owlMood(container)).toBe('thinking');
    // Full page, and it stops: no top bar, no screens, no button, no raw reason.
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).not.toContain('blocked by browser');
    expect(window.location.hash).toBe('#/');
  });

  it('shows it when IndexedDB does not exist at all', async () => {
    const db = await makeTestDb();
    await seedUser(db);
    vi.stubGlobal('indexedDB', undefined);
    renderAppAt(db, '#/');
    expect(await screen.findByRole('heading', { name: t('storage.title') })).toBeTruthy();
    expect(screen.queryByRole('banner')).toBeNull();
  });
});

describe('not found', () => {
  it('shows for an unknown route, with a way back, when logged out', async () => {
    const db = await makeTestDb();
    const { container } = renderAppAt(db, '#/no/such/page');
    expect(await screen.findByRole('heading', { name: t('error.notFoundTitle') })).toBeTruthy();
    expect(screen.getByText(t('error.notFoundBody'))).toBeTruthy();
    expect(owlMood(container)).toBe('thinking');

    fireEvent.click(screen.getByRole('button', { name: t('error.backToStart') }));
    // No user, so the start is the login screen.
    expect(await screen.findByRole('heading', { name: t('login.title') })).toBeTruthy();
  });

  it.each(['#/experiment/not-an-experiment', '#/practice/not-a-task'])(
    'shows inside the shell for an unknown id (%s)',
    async (hash) => {
      const db = await makeTestDb();
      await seedUser(db);
      renderAppAt(db, hash);
      expect(await screen.findByRole('heading', { name: t('error.notFoundTitle') })).toBeTruthy();
      expect(screen.getByRole('banner')).toBeTruthy();
    },
  );
});
