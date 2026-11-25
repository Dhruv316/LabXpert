import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { t } from '../../src/i18n';
import { useAppStore } from '../../src/state';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  await disposeTestDbs();
  resetAppState();
});

const SECRET = 'correct-horse-battery-staple';

async function openLogin() {
  const db = await makeTestDb();
  renderAppAt(db, '#/login');
  const userId = await screen.findByLabelText<HTMLInputElement>(t('login.userId'));
  const password = screen.getByLabelText<HTMLInputElement>(t('login.password'));
  const submit = screen.getByRole('button', { name: t('login.submit') });
  return { db, userId, password, submit };
}

function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe('Login screen', () => {
  it('shows the error and does not log in when both fields are empty', async () => {
    const { db, userId, submit } = await openLogin();
    fireEvent.click(submit);
    expect(await screen.findByText(t('login.needBoth'))).toBeTruthy();
    expect(userId.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(userId);
    expect(await db.users.count()).toBe(0);
    expect(useAppStore.getState().user).toBeUndefined();
    expect(window.location.hash).toBe('#/login');
  });

  it('focuses the password field when only the password is empty', async () => {
    const { db, userId, password, submit } = await openLogin();
    type(userId, 'asha');
    fireEvent.click(submit);
    expect(await screen.findByText(t('login.needBoth'))).toBeTruthy();
    expect(document.activeElement).toBe(password);
    expect(await db.users.count()).toBe(0);
  });

  it('treats an ID of only spaces as empty', async () => {
    const { db, userId, password, submit } = await openLogin();
    type(userId, '   ');
    type(password, SECRET);
    fireEvent.click(submit);
    expect(await screen.findByText(t('login.needBoth'))).toBeTruthy();
    expect(document.activeElement).toBe(userId);
    expect(await db.users.count()).toBe(0);
  });

  it('submits the form (what Enter in a field does) with the same checks', async () => {
    const { db, userId, password } = await openLogin();
    type(userId, 'Asha');
    type(password, SECRET);
    const form = userId.closest('form');
    if (form === null) throw new Error('The login fields are not in a form');
    fireEvent.submit(form);
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(await db.users.count()).toBe(1);
  });

  it('logs in with any non-empty ID and password, keeps the typed name and goes to the picker', async () => {
    const { db, userId, password, submit } = await openLogin();
    type(userId, ' Asha ');
    type(password, SECRET);
    fireEvent.click(submit);
    expect(await screen.findByRole('heading', { level: 1, name: t('picker.title') })).toBeTruthy();
    expect(window.location.hash).toBe('#/');
    const user = useAppStore.getState().user;
    expect(user?.userId).toBe('asha');
    expect(user?.displayName).toBe('Asha');
    expect((await db.users.get('asha'))?.displayName).toBe('Asha');
    expect((await db.settings.get('activeUserId'))?.value).toBe('asha');
  });

  it('never saves the password in the db, the store or browser storage', async () => {
    const { db, userId, password, submit } = await openLogin();
    type(userId, 'asha');
    type(password, SECRET);
    fireEvent.click(submit);
    await screen.findByRole('heading', { level: 1, name: t('picker.title') });
    const rows = await Promise.all(db.tables.map((table) => table.toArray()));
    expect(JSON.stringify(rows)).not.toContain(SECRET);
    expect(JSON.stringify(useAppStore.getState())).not.toContain(SECRET);
    expect(window.localStorage?.length ?? 0).toBe(0);
    expect(window.sessionStorage?.length ?? 0).toBe(0);
  });

  it('wipes the password field as soon as it is submitted', async () => {
    const { userId, password, submit } = await openLogin();
    type(userId, 'asha');
    type(password, SECRET);
    fireEvent.click(submit);
    expect(password.value).toBe('');
  });

  it('sends a logged-in learner from /login straight to the picker', async () => {
    const db = await makeTestDb();
    await seedUser(db);
    renderAppAt(db, '#/login');
    expect(await screen.findByRole('heading', { level: 1, name: t('picker.title') })).toBeTruthy();
    expect(window.location.hash).toBe('#/');
    expect(screen.queryByLabelText(t('login.password'))).toBeNull();
  });
});
