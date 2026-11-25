import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { listEvents } from '../../src/db/events';
import { t } from '../../src/i18n';
import { flushBenchWrites, useBenchStore, useTutorStore } from '../../src/state';

beforeEach(() => {
  resetAppState();
  useTutorStore.setState(useTutorStore.getInitialState(), true);
});
afterEach(async () => {
  cleanup();
  await flushBenchWrites();
  await disposeTestDbs();
  resetAppState();
  useTutorStore.setState(useTutorStore.getInitialState(), true);
});

const store = () => useBenchStore.getState();
const TITLE = t('exp.ohms-law.title');

function partEl(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-part-id="${id}"]`);
  if (found === null) throw new Error(`no part ${id}`);
  return found;
}

function isClosed(): boolean | undefined {
  const part = store().circuit.components.find((c) => c.type === 'switch');
  return part?.type === 'switch' ? part.closed : undefined;
}

async function openWithSwitch(db: LabXpertDB) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
  await store().place('supply', { x: 100, y: 100 });
  await store().place('switch', { x: 400, y: 100 });
  await waitFor(() => expect(document.querySelector('[data-part-id="SW"]')).not.toBeNull());
}

async function checkpointTargets(db: LabXpertDB): Promise<unknown[]> {
  const events = await listEvents(db, store().session?.attemptId ?? '');
  return events.filter((e) => e.actionType === 'CHECKPOINT').map((e) => e.targetId);
}

describe('closing the switch on the bench runs SWITCH_CLOSE', () => {
  it('by click: once on closing, nothing on opening', async () => {
    const db = await makeTestDb();
    await openWithSwitch(db);
    const press = (el: Element) => {
      fireEvent.pointerDown(el, { button: 0, pointerId: 1, clientX: 450, clientY: 130 });
      fireEvent.pointerUp(el, { pointerId: 1, clientX: 450, clientY: 130 });
    };
    press(partEl('SW'));
    await waitFor(() => expect(isClosed()).toBe(true));
    await flushBenchWrites();
    expect(await checkpointTargets(db)).toEqual(['SWITCH_CLOSE']);
    press(partEl('SW'));
    await waitFor(() => expect(isClosed()).toBe(false));
    await flushBenchWrites();
    expect(await checkpointTargets(db)).toEqual(['SWITCH_CLOSE']);
  });

  it('by Enter and by Space, once each', async () => {
    const db = await makeTestDb();
    await openWithSwitch(db);
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(isClosed()).toBe(true));
    fireEvent.keyDown(partEl('SW'), { key: ' ' });
    await waitFor(() => expect(isClosed()).toBe(false));
    fireEvent.keyDown(partEl('SW'), { key: ' ' });
    await waitFor(() => expect(isClosed()).toBe(true));
    await flushBenchWrites();
    expect(await checkpointTargets(db)).toEqual(['SWITCH_CLOSE', 'SWITCH_CLOSE']);
  });

  it('puts the result in the tutor state (a supply and a switch with no wires leave the loop open)', async () => {
    const db = await makeTestDb();
    await openWithSwitch(db);
    fireEvent.keyDown(partEl('SW'), { key: 'Enter' });
    await waitFor(() => expect(useTutorStore.getState().status).toBe('results'));
    expect(useTutorStore.getState().errors.map((r) => r.code)).toEqual(['OPEN_CIRCUIT']);
  });
});
