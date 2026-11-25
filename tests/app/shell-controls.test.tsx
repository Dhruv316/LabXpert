import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from './helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { getSetting, setSetting, SETTING_KEYS } from '../../src/db/settings';
import { t } from '../../src/i18n';
import { useAppStore } from '../../src/state';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
  await disposeTestDbs();
  resetAppState();
});

async function openShell(setup?: (db: Awaited<ReturnType<typeof makeTestDb>>) => Promise<void>) {
  const db = await makeTestDb();
  await seedUser(db);
  if (setup !== undefined) await setup(db);
  renderAppAt(db, '#/');
  await screen.findByRole('heading', { name: t('picker.title') });
  return db;
}

describe('top bar', () => {
  it('shows the app name, the user name and Log out', async () => {
    await openShell();
    const bar = screen.getByRole('banner');
    expect(bar.textContent).toContain(t('app.name'));
    expect(bar.textContent).toContain('Asha');
    expect(screen.getByRole('button', { name: t('common.logout') })).toBeTruthy();
  });
});

describe('language selector', () => {
  it('keeps English active and disables Hindi and Marathi, marked Coming soon', async () => {
    await openShell();
    const select = screen.getByLabelText(t('common.language')) as HTMLSelectElement;
    const byValue = (value: string) =>
      Array.from(select.options).find((option) => option.value === value);

    expect(select.value).toBe('en');
    expect(byValue('en')?.disabled).toBe(false);
    for (const value of ['hi', 'mr']) {
      expect(byValue(value)?.disabled).toBe(true);
      expect(byValue(value)?.text).toContain(t('common.comingSoon'));
    }
    expect(byValue('hi')?.text).toContain(t('common.langHindi'));
    expect(byValue('mr')?.text).toContain(t('common.langMarathi'));
    expect(byValue('en')?.text).toBe(t('common.langEnglish'));
  });
});

describe('reduce motion', () => {
  it('starts off, then the switch turns it on, applies it and stores it', async () => {
    const db = await openShell();
    const toggle = screen.getByRole('switch', { name: t('common.reduceMotion') });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(document.documentElement.dataset.reduceMotion).toBe('false');

    fireEvent.click(toggle);

    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    await waitFor(() => expect(document.documentElement.dataset.reduceMotion).toBe('true'));
    await waitFor(async () => expect(await getSetting(db, SETTING_KEYS.reduceMotion)).toBe(true));
  });

  it('turning it off again is stored too', async () => {
    const db = await openShell((d) => setSetting(d, SETTING_KEYS.reduceMotion, true));
    const toggle = screen.getByRole('switch', { name: t('common.reduceMotion') });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
    await waitFor(async () => expect(await getSetting(db, SETTING_KEYS.reduceMotion)).toBe(false));
  });

  it('reads the stored setting at start-up', async () => {
    await openShell((d) => setSetting(d, SETTING_KEYS.reduceMotion, true));
    expect(
      screen.getByRole('switch', { name: t('common.reduceMotion') }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
  });

  it('also applies when only the OS asks for reduced motion', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    await openShell();
    expect(
      screen.getByRole('switch', { name: t('common.reduceMotion') }).getAttribute('aria-checked'),
    ).toBe('false');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
  });
});

describe('offline indicator', () => {
  it('follows the browser online and offline events', async () => {
    await openShell();
    expect(screen.getByText(t('common.online'))).toBeTruthy();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(await screen.findByText(t('common.offline'))).toBeTruthy();
    expect(screen.queryByText(t('common.online'))).toBeNull();
    expect(useAppStore.getState().online).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByText(t('common.online'))).toBeTruthy();
    expect(screen.queryByText(t('common.offline'))).toBeNull();
  });
});
