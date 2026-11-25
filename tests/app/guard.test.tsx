import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from './helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { logoutUser } from '../../src/db/users';
import { t } from '../../src/i18n';
import { useAppStore } from '../../src/state';
import { RequireUser } from '../../src/ui/shell/RequireUser';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  await disposeTestDbs();
  resetAppState();
});

function guarded() {
  return (
    <MemoryRouter initialEntries={['/inside']}>
      <Routes>
        <Route path="/login" element={<p data-testid="login-page" />} />
        <Route element={<RequireUser />}>
          <Route path="/inside" element={<p data-testid="inside-page" />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireUser guard', () => {
  it('redirects to login when there is no user', () => {
    render(guarded());
    expect(screen.queryByTestId('inside-page')).toBeNull();
    expect(screen.getByTestId('login-page')).toBeTruthy();
  });

  it('lets a logged-in user through', () => {
    useAppStore.getState().setUser({ userId: 'asha', displayName: 'Asha', lastLoginAt: 1 });
    render(guarded());
    expect(screen.getByTestId('inside-page')).toBeTruthy();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  it('sends the user to login as soon as the store loses them', () => {
    useAppStore.getState().setUser({ userId: 'asha', displayName: 'Asha', lastLoginAt: 1 });
    render(guarded());
    act(() => useAppStore.getState().setUser(undefined));
    expect(screen.getByTestId('login-page')).toBeTruthy();
  });
});

describe('session from the database', () => {
  it('lets the remembered user in', async () => {
    const db = await makeTestDb();
    await seedUser(db);
    renderAppAt(db, '#/progress');
    expect(await screen.findByRole('heading', { name: t('progress.title') })).toBeTruthy();
    expect(window.location.hash).toBe('#/progress');
  });

  it('redirects to login after logoutUser, even though the user record still exists', async () => {
    const db = await makeTestDb();
    await seedUser(db);
    await logoutUser(db);
    // getLastLoggedInUser would still find Asha here; getActiveUser must not.
    expect(await db.users.count()).toBe(1);
    renderAppAt(db, '#/');
    expect(await screen.findByRole('heading', { name: t('login.title') })).toBeTruthy();
    expect(window.location.hash).toBe('#/login');
  });

  it('Log out in the top bar ends the session and lands on login', async () => {
    const db = await makeTestDb();
    await seedUser(db);
    renderAppAt(db, '#/');
    fireEvent.click(await screen.findByRole('button', { name: t('common.logout') }));
    expect(await screen.findByRole('heading', { name: t('login.title') })).toBeTruthy();
    expect(window.location.hash).toBe('#/login');
    expect(await db.settings.get('activeUserId')).toBeUndefined();
  });
});
