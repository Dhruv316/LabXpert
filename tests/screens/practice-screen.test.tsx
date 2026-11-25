import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { ErrorCode, ExperimentId } from '../../src/model/types';
import { flushBenchWrites, useBenchStore, usePracticeStore, useReadingsStore, useTaskStore, useTutorStore } from '../../src/state';

// The practice bench on the real screen: banner, bench, progress, completion overlay, Leave practice and reload.

function resetStores() {
  resetAppState();
  useTutorStore.setState(useTutorStore.getInitialState(), true);
  useReadingsStore.setState(useReadingsStore.getInitialState(), true);
  useTaskStore.setState(useTaskStore.getInitialState(), true);
  usePracticeStore.setState(usePracticeStore.getInitialState(), true);
}

beforeEach(resetStores);
afterEach(async () => {
  cleanup();
  await flushBenchWrites();
  await disposeTestDbs();
  resetStores();
  Reflect.deleteProperty(window, 'matchMedia');
});

const bench = () => useBenchStore.getState();
const OPEN_TASK = 'practice-fix-open-circuit';

async function seedProfile(db: LabXpertDB, experimentId: ExperimentId, code: ErrorCode, count: number) {
  await db.errorProfile.put({ userId: 'asha', experimentId, code, count, lastSeenAt: 500 });
}

/** Logs Asha in, optionally with an unresolved mistake, and opens the practice route. */
async function openPractice(db: LabXpertDB, taskId: string, profile?: { experimentId: ExperimentId; code: ErrorCode }) {
  await seedUser(db, 'Asha');
  if (profile !== undefined) await seedProfile(db, profile.experimentId, profile.code, 2);
  renderAppAt(db, `#/practice/${taskId}`);
  await screen.findByRole('heading', { level: 1 });
  await waitFor(() => expect(bench().session?.kind).toBe('practice'));
  await flushBenchWrites();
}

const openCircuit = (db: LabXpertDB) => openPractice(db, OPEN_TASK, { experimentId: 'ohms-law', code: 'OPEN_CIRCUIT' });

/** The open-circuit task's fix: the missing wire from R.b to S.neg. */
async function fixOpenCircuit() {
  expect(bench().startWire('R.b', 'click')).toBe(true);
  expect(await bench().finishWire('S.neg')).toBe('connected');
}

async function powerOn(volts: number) {
  expect(await bench().toggleSwitch('SW')).toBe(true);
  expect(await bench().setSupplyVoltage('S', volts)).toBe('changed');
}

const recordNow = () => useReadingsStore.getState().recordReading();
const dialog = () => screen.getByRole('dialog');
const backButton = () => within(dialog()).getByRole('button', { name: t('result.back') });
const progressButton = () => within(dialog()).getByRole('button', { name: t('picker.progress') });

/** The clean completion of the open-circuit task. */
async function completeCleanly() {
  await fixOpenCircuit();
  await powerOn(6);
  expect((await recordNow()).status).toBe('recorded');
  await flushBenchWrites();
  await screen.findByRole('dialog');
}

describe('banner', () => {
  it('shows the topic of the triggering mistake, the task title and the goal in a labelled box', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    const banner = document.querySelector('[data-practice-banner]');
    expect(banner).not.toBeNull();
    expect(within(banner as HTMLElement).getByText(t('practice.bannerPicked', { topic: t('errorTopics.OPEN_CIRCUIT') }))).toBeTruthy();
    expect(within(banner as HTMLElement).getByRole('heading', { level: 1 }).textContent).toBe(t('practiceTasks.practice-fix-open-circuit.title'));
    const goal = document.querySelector('[data-practice-goal]') as HTMLElement;
    expect(within(goal).getByText(t('practice.goalLabel'))).toBeTruthy();
    expect(within(goal).getByText(t('practiceTasks.practice-fix-open-circuit.goal'))).toBeTruthy();
    expect(within(banner as HTMLElement).getByRole('button', { name: t('practice.exit') })).toBeTruthy();
  });

  it('names the topic of the code that triggered this task, not a fixed one', async () => {
    const db = await makeTestDb();
    await openPractice(db, 'practice-meter-polarity', { experimentId: 'ohms-law', code: 'WRONG_POLARITY' });
    expect(screen.getByText(t('practice.bannerPicked', { topic: t('errorTopics.WRONG_POLARITY') }))).toBeTruthy();
  });

  it('an extension task shows the extension line and no topic', async () => {
    const db = await makeTestDb();
    await openPractice(db, 'extension-ohms-law');
    expect(screen.getByText(t('practice.bannerExtension'))).toBeTruthy();
    expect(screen.queryByText(/Ollie picked this/)).toBeNull();
  });

  it('shows the goal as the tutor panel’s starting text, and no steps', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    const panel = screen.getByRole('complementary', { name: t('bench.panelTitle') });
    fireEvent.click(within(panel).getByRole('button', { name: t('bench.showPanel') }));
    expect(within(panel).getByTestId('practice-goal-panel').textContent).toBe(t('practiceTasks.practice-fix-open-circuit.goal'));
    expect(panel.querySelector('ol')).toBeNull();
  });
});

describe('the bench in practice', () => {
  it('keeps the locked parts where they are: they cannot be removed, and Remove is disabled on them', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    const before = bench().circuit;
    expect(before.components.every((part) => part.locked === true)).toBe(true);

    bench().select('R');
    const remove = await screen.findByRole('button', { name: t('bench.deleteSelected') });
    expect(remove.hasAttribute('disabled')).toBe(true);
    await bench().remove('R');
    bench().startDrag('R');
    bench().dragTo('R', 500, 500);
    expect(bench().circuit).toBe(before);
  });

  it('the shelf lists only the task’s parts', async () => {
    const db = await makeTestDb();
    await openPractice(db, 'practice-place-ammeter', { experimentId: 'ohms-law', code: 'AMMETER_PARALLEL' });
    const tiles = Array.from(document.querySelectorAll('[data-shelf-type]')).map((tile) => tile.getAttribute('data-shelf-type'));
    expect(tiles).toEqual(['ammeter']);
  });

  it('a fix-it task has an empty shelf', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    expect(document.querySelectorAll('[data-shelf-type]')).toHaveLength(0);
  });

  it('has no Finish, Next task, answer field or task progress', async () => {
    const db = await makeTestDb();
    await openPractice(db, 'practice-series-then-parallel', { experimentId: 'series-parallel', code: 'WRONG_TOPOLOGY' });
    expect(screen.queryByRole('button', { name: t('bench.finish') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('bench.nextTask') })).toBeNull();
    expect(screen.queryByLabelText(t('bench.equivalentLabel'))).toBeNull();
    expect(screen.queryByRole('button', { name: t('bench.check') })).toBeNull();
    expect(document.querySelector('[data-task-progress]')).toBeNull();
    expect(document.querySelector('[data-dock-footer]')).toBeNull();
    // The bench's own tools are still there.
    expect(screen.getByRole('button', { name: t('bench.record') })).toBeTruthy();
  });
});

describe('progress', () => {
  it('shows "0 of 3" at the start, with text and an accessible name, and updates after a reading', async () => {
    const db = await makeTestDb();
    await openPractice(db, 'practice-three-readings', { experimentId: 'ohms-law', code: 'MISSING_READING' });
    const start = screen.getByRole('progressbar', { name: t('practice.progress', { have: 0, need: 3 }) });
    expect(start.textContent).toContain(t('practice.progress', { have: 0, need: 3 }));
    expect(start.getAttribute('aria-valuetext')).toBe(t('practice.progress', { have: 0, need: 3 }));

    await powerOn(2);
    expect((await recordNow()).status).toBe('recorded');
    await flushBenchWrites();
    const next = await screen.findByRole('progressbar', { name: t('practice.progress', { have: 1, need: 3 }) });
    expect(next.textContent).toContain(t('practice.progress', { have: 1, need: 3 }));
    expect(next.getAttribute('aria-valuenow')).toBe('1');
    expect(next.getAttribute('aria-valuemax')).toBe('3');
    await waitFor(() => expect(screen.getByTestId('live-region').textContent?.trim()).toBe(t('practice.progress', { have: 1, need: 3 })));
  });
});

describe('completion overlay', () => {
  it('appears once on a clean run, with the clean text, the title and the two buttons', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    expect(screen.queryByRole('dialog')).toBeNull();
    await completeCleanly();

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(within(dialog()).getByRole('heading', { name: t('practice.done') })).toBeTruthy();
    expect(within(dialog()).getByText(t('practice.doneClean'))).toBeTruthy();
    expect(within(dialog()).queryByText(t('practice.doneNotClean'))).toBeNull();
    expect(backButton()).toBeTruthy();
    expect(progressButton()).toBeTruthy();
    expect(dialog().querySelector('[data-mood="celebrating"]')).not.toBeNull();

    // Another reading afterwards neither repeats it nor changes it.
    const done = usePracticeStore.getState().completion;
    await recordNow();
    await flushBenchWrites();
    expect(usePracticeStore.getState().completion).toBe(done);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('shows the not-clean text when the same mistake came up again', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    await powerOn(6);
    expect((await recordNow()).status).toBe('blocked'); // still open
    expect(screen.queryByRole('dialog')).toBeNull();
    await fixOpenCircuit();
    expect((await recordNow()).status).toBe('recorded');
    await flushBenchWrites();
    await screen.findByRole('dialog');
    expect(within(dialog()).getByText(t('practice.doneNotClean'))).toBeTruthy();
    expect(within(dialog()).queryByText(t('practice.doneClean'))).toBeNull();
  });

  it('takes focus, keeps it inside on Tab and Shift+Tab, and Escape does not dismiss it', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    await completeCleanly();

    await waitFor(() => expect(document.activeElement).toBe(backButton()));
    fireEvent.keyDown(backButton(), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(progressButton());
    fireEvent.keyDown(progressButton(), { key: 'Tab' });
    expect(document.activeElement).toBe(backButton());

    fireEvent.keyDown(backButton(), { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    // No close button, and a click outside does nothing.
    expect(within(dialog()).queryByRole('button', { name: t('common.close') })).toBeNull();
    const backdrop = dialog().parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('Back to experiments goes to the picker', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    await completeCleanly();
    fireEvent.click(backButton());
    expect(await screen.findByRole('heading', { name: t('picker.title') })).toBeTruthy();
    expect(window.location.hash).toBe('#/');
    expect(screen.queryByRole('dialog')).toBeNull();
    // The finished attempt stays finished.
    expect((await db.attempts.toArray())[0]?.status).toBe('completed');
  });

  it('My progress goes to the progress screen', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    await completeCleanly();
    fireEvent.click(progressButton());
    expect(await screen.findByRole('heading', { name: t('progress.title') })).toBeTruthy();
    expect(window.location.hash).toBe('#/progress');
  });

  it('Ollie bounces once, and not at all with Reduce motion', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    await completeCleanly();
    expect(dialog().querySelector('[data-mood="celebrating"]')?.className).toContain('animate-owl-bounce');
    cleanup();
    resetStores();

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    const other = await makeTestDb();
    await openCircuit(other);
    await completeCleanly();
    expect(dialog().querySelector('[data-mood="celebrating"]')?.className ?? '').not.toContain('animate-owl-bounce');
  });
});

describe('Leave practice', () => {
  it('abandons the attempt and returns to the picker with no confirmation', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    fireEvent.click(screen.getByRole('button', { name: t('practice.exit') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('heading', { name: t('picker.title') })).toBeTruthy();
    expect(window.location.hash).toBe('#/');
    const attempts = await db.attempts.toArray();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe('abandoned');
    expect(usePracticeStore.getState().current).toBeUndefined();
  });

  it('is reachable by keyboard: a real button that comes before the bench controls in the tab order', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    const leave = screen.getByRole('button', { name: t('practice.exit') });
    expect(leave.tagName).toBe('BUTTON');
    expect(leave.getAttribute('tabindex')).not.toBe('-1');
    const undo = screen.getByRole('button', { name: t('bench.undo') });
    expect(leave.compareDocumentPosition(undo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // It sits in the banner, which is part of the page and not hidden from the keyboard.
    expect(leave.closest('[data-practice-banner]')).not.toBeNull();
    leave.focus();
    expect(document.activeElement).toBe(leave);
  });
});

describe('reload', () => {
  it('resumes a run in the middle: banner, circuit, readings and progress are back', async () => {
    const db = await makeTestDb();
    await openPractice(db, 'practice-three-readings', { experimentId: 'ohms-law', code: 'MISSING_READING' });
    await powerOn(2);
    expect((await recordNow()).status).toBe('recorded');
    await flushBenchWrites();
    await screen.findByRole('progressbar', { name: t('practice.progress', { have: 1, need: 3 }) });
    const attemptId = bench().session?.attemptId;

    cleanup();
    resetStores();
    renderAppAt(db, '#/practice/practice-three-readings');
    await screen.findByRole('heading', { level: 1, name: t('practiceTasks.practice-three-readings.title') });
    await screen.findByRole('progressbar', { name: t('practice.progress', { have: 1, need: 3 }) });
    await flushBenchWrites();

    expect(bench().session?.attemptId).toBe(attemptId);
    expect(screen.getByText(t('practice.bannerPicked', { topic: t('errorTopics.MISSING_READING') }))).toBeTruthy();
    expect(bench().circuit.components.find((part) => part.id === 'S')).toMatchObject({ voltage: 2 });
    expect(document.querySelectorAll('[data-reading-row]')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await db.attempts.count()).toBe(1);
  });

  it('does not show the overlay again for a finished run', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    await completeCleanly();

    cleanup();
    resetStores();
    renderAppAt(db, `#/practice/${OPEN_TASK}`);
    // The clean run cleared the topic, so there is nothing left to practise here.
    expect(await screen.findByRole('heading', { name: t('error.notFoundTitle') })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('unknown and other people’s tasks', () => {
  it('an unknown task shows the not-found screen', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    renderAppAt(db, '#/practice/not-a-task');
    expect(await screen.findByRole('heading', { name: t('error.notFoundTitle') })).toBeTruthy();
    expect(await db.attempts.count()).toBe(0);
  });

  it('a task that does not apply to the learner shows the not-found screen and creates nothing', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    renderAppAt(db, `#/practice/${OPEN_TASK}`);
    expect(await screen.findByRole('heading', { name: t('error.notFoundTitle') })).toBeTruthy();
    expect(await db.attempts.count()).toBe(0);
  });

  it('another learner never gets someone else’s attempt: not-found, and the first learner’s run is untouched', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    const attemptId = bench().session?.attemptId;
    cleanup();
    resetStores();

    await seedUser(db, 'Ben'); // Ben becomes the active learner and has no mistakes to practise
    renderAppAt(db, `#/practice/${OPEN_TASK}`);
    expect(await screen.findByRole('heading', { name: t('error.notFoundTitle') })).toBeTruthy();
    expect(document.querySelector('[data-practice-banner]')).toBeNull();
    const attempts = await db.attempts.toArray();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ id: attemptId, userId: 'asha', status: 'in_progress' });
  });
});

describe('text', () => {
  it('shows no rule code, text key or raw id on the screen or in the overlay', async () => {
    const db = await makeTestDb();
    await openCircuit(db);
    const check = () => {
      const text = document.body.textContent ?? '';
      expect(text).not.toMatch(/\b[A-Z]{2,}(?:_[A-Z]+)+\b/);
      expect(text).not.toContain('practiceTasks.');
      expect(text).not.toContain('errorTopics.');
      expect(text).not.toContain('practice.');
      expect(text).not.toContain(OPEN_TASK);
      expect(text).not.toContain('{topic}');
      expect(text).not.toContain('{have}');
    };
    check();
    await completeCleanly();
    check();
  });
});
