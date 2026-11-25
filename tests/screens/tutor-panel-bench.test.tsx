import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import { flushBenchWrites, useBenchStore, useTutorStore } from '../../src/state';

// The panel on the real bench screen: a real checkpoint, the real collapsed default, the real tab order.

function resetStores() {
  resetAppState();
  useTutorStore.setState(useTutorStore.getInitialState(), true);
}
beforeEach(resetStores);
afterEach(async () => {
  cleanup();
  await flushBenchWrites();
  await disposeTestDbs();
  resetStores();
});

const store = () => useBenchStore.getState();
const panel = () => screen.getByRole('complementary', { name: t('bench.panelTitle') });

async function openWithSwitch(db: LabXpertDB) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: t('exp.ohms-law.title') });
  await store().place('supply', { x: 100, y: 100 });
  await store().place('switch', { x: 400, y: 100 });
  await waitFor(() => expect(document.querySelector('[data-part-id="SW"]')).not.toBeNull());
}

describe('tutor panel on the bench screen', () => {
  it('starts with the instructions for the first task, collapsed in a 1024 px window', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: t('exp.ohms-law.title') });
    expect(panel().getAttribute('data-collapsed')).toBe('true');
    fireEvent.click(within(panel()).getByRole('button', { name: t('bench.showPanel') }));
    expect(within(panel()).getByText(t('bench.panelEmpty'))).toBeTruthy();
    expect(panel().querySelectorAll('ol li')).toHaveLength(6);
  });

  it('a real checkpoint with a mistake reopens the collapsed panel, shows the error and says its title', async () => {
    const db = await makeTestDb();
    await openWithSwitch(db);
    expect(panel().getAttribute('data-collapsed')).toBe('true');
    // A supply and a switch with no wires: closing the switch finds an open circuit.
    fireEvent.keyDown(document.querySelector('[data-part-id="SW"]') as Element, { key: 'Enter' });
    await waitFor(() => expect(panel().getAttribute('data-collapsed')).toBe('false'));
    const title = t('OPEN_CIRCUIT.gap').title;
    expect(within(panel()).getByRole('heading', { level: 3, name: title })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('live-region').textContent?.trim()).toBe(title));
  });

  it('the panel is the last stop in the tab order', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: t('exp.ohms-law.title') });
    fireEvent.click(within(panel()).getByRole('button', { name: t('bench.showPanel') }));
    const stops = Array.from(document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]')).filter(
      (element) => element.getAttribute('tabindex') !== '-1' && !element.hasAttribute('disabled'),
    );
    expect(stops.at(-1)?.closest('aside')).toBe(panel());
  });
});
