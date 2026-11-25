import { disposeTestDbs, makeTestDb, renderAppAt } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { listAnswers } from '../../src/db/answers';
import { getAttempt } from '../../src/db/attempts';
import { listEvents } from '../../src/db/events';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { Circuit, TerminalRef } from '../../src/model/types';
import { flushBenchWrites, useBenchStore, useReadingsStore, useTaskStore, useTutorStore } from '../../src/state';
import { liveText, openBench, pageText, putReadings, readingOf, recordAt, resetAll, rowEls, toasts, recordButton } from './dock-helpers';

beforeEach(resetAll);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await flushBenchWrites();
  await disposeTestDbs();
  resetAll();
});

/** S -> SW -> R1 -> A -> R2 -> S with the voltmeter across both resistors. */
function seriesBench(voltage: number, r1 = 10, r2 = 20): Circuit {
  const pairs: [TerminalRef, TerminalRef][] = [
    ['S.pos', 'SW.a'], ['SW.b', 'R1.a'], ['R1.b', 'A.pos'], ['A.neg', 'R2.a'], ['R2.b', 'S.neg'], ['V.pos', 'R1.a'], ['V.neg', 'R2.b'],
  ];
  return {
    components: [
      { id: 'S', type: 'supply', x: 40, y: 40, voltage },
      { id: 'SW', type: 'switch', x: 300, y: 40, closed: true },
      { id: 'R1', type: 'resistor', x: 500, y: 40, role: 'R1', ohms: r1 },
      { id: 'R2', type: 'resistor', x: 700, y: 40, role: 'R2', ohms: r2 },
      { id: 'A', type: 'ammeter', x: 300, y: 220 },
      { id: 'V', type: 'voltmeter', x: 500, y: 220 },
    ],
    wires: pairs.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })),
  };
}

const field = () => screen.getByLabelText(t('bench.equivalentLabel')) as HTMLInputElement;
const queryField = () => screen.queryByLabelText(t('bench.equivalentLabel'));
const checkButton = () => screen.getByRole('button', { name: t('bench.check') });
const nextButton = () => screen.getByRole('button', { name: t('bench.nextTask') });
const finishButton = () => screen.getByRole('button', { name: t('bench.finish') });
const footerText = () => (document.querySelector('[data-dock-footer]')?.textContent ?? '').replace(/\u00a0/g, ' ');
const verdict = (kind: 'correct' | 'wrong') => document.querySelector(`[data-answer-result="${kind}"]`);
const attemptId = () => useBenchStore.getState().session?.attemptId ?? '';
const typeAnswer = (value: string) => fireEvent.change(field(), { target: { value } });

async function openSeries(db: LabXpertDB, r1 = 10, r2 = 20) {
  await openBench(db, 'series-parallel', seriesBench(6, r1, r2));
}

async function recordSeries(voltage: number) {
  const shown = toasts().length;
  useBenchStore.setState({ circuit: seriesBench(voltage) });
  fireEvent.click(recordButton());
  await waitFor(() => expect(toasts()).toHaveLength(shown + 1));
}

async function check(value: string) {
  typeAnswer(value);
  fireEvent.click(checkButton());
}

describe('the equivalent-resistance field', () => {
  it('shows for a task that asks for an answer, with its label and a Check button', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    expect(field().getAttribute('type')).toBe('number');
    expect(checkButton()).toBeTruthy();
  });

  it('is not there for Ohm’s Law', async () => {
    const db = await makeTestDb();
    await openBench(db);
    expect(queryField()).toBeNull();
    expect(screen.queryByRole('button', { name: t('bench.check') })).toBeNull();
    expect(document.querySelector('[data-dock-slot="answer"]')?.childNodes).toHaveLength(0);
  });

  it('is never there in a practice attempt, and neither is the Finish button', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    const session = useBenchStore.getState().session;
    if (session === undefined) throw new Error('bench did not open');
    useBenchStore.setState({ session: { ...session, kind: 'practice' } });
    await waitFor(() => expect(queryField()).toBeNull());
    expect(screen.queryByRole('button', { name: t('bench.nextTask') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('bench.finish') })).toBeNull();
    expect(document.querySelector('[data-dock-footer]')).toBeNull();
  });

  it('shows the message in the error state for an empty entry, and runs nothing', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    fireEvent.click(checkButton());
    const message = await screen.findByText(t('bench.answerNeedNumber'));
    expect(field().getAttribute('aria-invalid')).toBe('true');
    const messageBox = message.closest('[id]');
    expect(messageBox).not.toBeNull();
    expect(field().getAttribute('aria-describedby')?.split(' ')).toContain(messageBox?.id);
    expect(message.closest('p')?.querySelector('svg')).not.toBeNull();
    await flushBenchWrites();
    expect(useReadingsStore.getState().answers).toEqual([]);
    expect(await listAnswers(db, attemptId())).toEqual([]);
    expect(useTutorStore.getState().status).toBe('instructions');
  });

  it('takes the message away once the student types', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    fireEvent.click(checkButton());
    await screen.findByText(t('bench.answerNeedNumber'));
    typeAnswer('3');
    await waitFor(() => expect(screen.queryByText(t('bench.answerNeedNumber'))).toBeNull());
    expect(field().getAttribute('aria-invalid')).toBeNull();
  });

  it('marks a correct answer with a check icon and the confirmation, saves it and says it politely', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    await check('30');
    await waitFor(() => expect(verdict('correct')).not.toBeNull());
    const mark = verdict('correct');
    expect(mark?.textContent).toBe(t('OK_ANSWER').title);
    expect(mark?.querySelector('svg')).not.toBeNull();
    await waitFor(() => expect(liveText()).toBe(t('OK_ANSWER').title));
    expect(useTutorStore.getState().confirmations.map((result) => result.code)).toContain('OK_ANSWER');
    const saved = await listAnswers(db, attemptId());
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ typed: 30, expected: 30, correct: true, taskId: 'series' });
  });

  it('keeps a wrong answer in the box, shows the error feedback in the panel and allows another try', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    useTutorStore.getState().setPanelCollapsed(true);
    await check('31');
    await waitFor(() => expect(verdict('wrong')).not.toBeNull());
    expect(verdict('wrong')?.textContent).toBe(t('EQUIVALENT_R_WRONG.series').title);
    expect(verdict('wrong')?.querySelector('svg')).not.toBeNull();
    expect(field().value).toBe('31');
    expect(useTutorStore.getState().errors.map((result) => result.code)).toEqual(['EQUIVALENT_R_WRONG']);
    await waitFor(() => expect(useTutorStore.getState().panelCollapsed).toBe(false));
    expect(pageText()).toContain(t('EQUIVALENT_R_WRONG.series').explain);

    typeAnswer('30');
    fireEvent.click(checkButton());
    await waitFor(() => expect(verdict('correct')).not.toBeNull());
    expect(verdict('wrong')).toBeNull();
    expect(await listAnswers(db, attemptId())).toHaveLength(2);
  });

  it('accepts exactly 2% off and rejects just over', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    await check('30.61');
    await waitFor(() => expect(verdict('wrong')).not.toBeNull());
    await check('30.6');
    await waitFor(() => expect(verdict('correct')).not.toBeNull());
    const saved = await listAnswers(db, attemptId());
    expect(saved.map((answer) => answer.correct)).toEqual([false, true]);
  });

  it('submits with Enter in the field', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    typeAnswer('30');
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(verdict('correct')).not.toBeNull());
    expect(await listAnswers(db, attemptId())).toHaveLength(1);
  });

  it('keeps the right answer marked after a reload', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    await check('30');
    await waitFor(() => expect(verdict('correct')).not.toBeNull());
    await flushBenchWrites();

    cleanup();
    resetAll();
    renderAppAt(db, '#/experiment/series-parallel');
    await screen.findByRole('group', { name: t('exp.series-parallel.title') });
    await flushBenchWrites();
    await waitFor(() => expect(verdict('correct')).not.toBeNull());
    expect(field().value).toBe('30');
  });
});

describe('calculated vs observed', () => {
  it('uses the last reading V ÷ I and never gives the expected value away', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    // Expected 30 ohms; the readings give 5 ÷ 0.2 = 25 and the student types 31.
    putReadings([readingOf('r1', 'series', 3, 0.1), readingOf('r2', 'series', 5, 0.2)]);
    await check('31');
    await waitFor(() => expect(verdict('wrong')).not.toBeNull());
    const line = document.querySelector('[data-observed]');
    expect(line?.textContent).toBe(t('bench.calculatedVsObserved', { observed: '25.00' }));
    expect(footerText()).not.toContain('30');
    expect(field().value).toBe('31');
  });

  it('follows the newest reading', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    putReadings([readingOf('r1', 'series', 5, 0.2)]);
    await check('31');
    await waitFor(() => expect(document.querySelector('[data-observed]')).not.toBeNull());
    putReadings([readingOf('r1', 'series', 5, 0.2), readingOf('r2', 'series', 6, 0.25)]);
    await waitFor(() => expect(document.querySelector('[data-observed]')?.textContent).toBe(t('bench.calculatedVsObserved', { observed: '24.00' })));
  });

  it('shows nothing before there is a reading and an answer', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    expect(document.querySelector('[data-observed]')).toBeNull();
    // A reading but no answer yet.
    putReadings([readingOf('r1', 'series', 5, 0.2)]);
    expect(document.querySelector('[data-observed]')).toBeNull();
  });

  it('shows nothing for an answer with no reading', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    await check('30');
    await waitFor(() => expect(verdict('correct')).not.toBeNull());
    expect(document.querySelector('[data-observed]')).toBeNull();
  });
});

describe('the Finish and Next task button', () => {
  it('says Next task on the series task and Finish experiment on the last task and on Ohm’s Law', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    expect(nextButton().getAttribute('aria-disabled')).toBeNull();
    expect((nextButton() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: t('bench.finish') })).toBeNull();
    useTaskStore.getState().setTaskId('parallel');
    await waitFor(() => expect(finishButton()).toBeTruthy());
    expect(screen.queryByRole('button', { name: t('bench.nextTask') })).toBeNull();
  });

  it('says Finish experiment for Ohm’s Law', async () => {
    const db = await makeTestDb();
    await openBench(db);
    expect(finishButton()).toBeTruthy();
  });

  it('changes nothing but the panel when the check is not clean', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    useTutorStore.getState().setPanelCollapsed(true);
    const circuit = useBenchStore.getState().circuit;
    const readings = useReadingsStore.getState().readings;
    const answers = useReadingsStore.getState().answers;
    fireEvent.click(nextButton());
    await waitFor(() => expect(useTutorStore.getState().errors.length).toBeGreaterThan(0));
    const codes = useTutorStore.getState().errors.map((result) => result.code);
    expect(codes).toContain('MISSING_READING');
    expect(codes).toContain('MISSING_ANSWER');
    await waitFor(() => expect(useTutorStore.getState().panelCollapsed).toBe(false));
    expect(useBenchStore.getState().circuit).toBe(circuit);
    expect(useReadingsStore.getState().readings).toBe(readings);
    expect(useReadingsStore.getState().answers).toBe(answers);
    expect(useTaskStore.getState().taskId === undefined || useTaskStore.getState().taskId === 'series').toBe(true);
    const events = await listEvents(db, attemptId());
    expect(events.filter((event) => ['FINISH_TASK', 'NEXT_TASK', 'FINISH_ATTEMPT'].includes(event.actionType))).toEqual([]);
    expect(screen.getByRole('button', { name: t('bench.nextTask') })).toBeTruthy();
    const text = pageText();
    expect(text.includes(t('MISSING_ANSWER').title) || text.includes(t('MISSING_READING', { need: 3, have: 0 }).title)).toBe(true);
  });

  it('moves on to the next task and keeps the bench exactly as it is', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    useTutorStore.getState().setPanelCollapsed(false);
    await recordSeries(2);
    await recordSeries(4);
    await recordSeries(6);
    await check('30');
    await waitFor(() => expect(verdict('correct')).not.toBeNull());
    expect(rowEls()).toHaveLength(3);
    expect(document.querySelector('[data-task-progress]')?.textContent).toBe(t('bench.taskProgress', { current: 1, total: 2 }));

    const circuit = useBenchStore.getState().circuit;
    fireEvent.click(nextButton());
    await waitFor(() => expect(useTaskStore.getState().taskId).toBe('parallel'));

    expect(useBenchStore.getState().circuit).toBe(circuit);
    expect(circuit.wires).toHaveLength(7);
    expect(useTutorStore.getState().status).toBe('instructions');
    expect(pageText()).toContain(t('exp.series-parallel.parallel.step1'));
    expect(rowEls()).toHaveLength(0);
    expect(document.querySelector('[data-graph-point]')).toBeNull();
    expect(field().value).toBe('');
    expect(verdict('correct')).toBeNull();
    expect(document.querySelector('[data-task-progress]')?.textContent).toBe(t('bench.taskProgress', { current: 2, total: 2 }));
    await waitFor(() => expect(liveText()).toBe(t('bench.taskProgress', { current: 2, total: 2 })));
    expect(finishButton()).toBeTruthy();
    const events = await listEvents(db, attemptId());
    expect(events.filter((event) => event.actionType === 'NEXT_TASK')).toHaveLength(1);
  });

  it('shows the task progress only for an experiment with more than one task', async () => {
    const db = await makeTestDb();
    await openBench(db);
    expect(document.querySelector('[data-task-progress]')).toBeNull();
    cleanup();
    resetAll();
    await openSeries(db);
    expect(document.querySelector('[data-task-progress]')?.textContent).toBe(t('bench.taskProgress', { current: 1, total: 2 }));
  });

  it('ends the experiment and goes to the result route', async () => {
    const db = await makeTestDb();
    await openBench(db);
    for (const voltage of [1, 2, 3, 4, 5]) await recordAt(voltage);
    fireEvent.click(finishButton());
    await waitFor(() => expect(window.location.hash).toBe(`#/result/${attemptId()}`));
    await waitFor(() => expect(pageText()).toContain(t('result.title')));
    expect((await getAttempt(db, attemptId()))?.status).toBe('completed');
  });

  it('runs one call when the button is pressed twice', async () => {
    const db = await makeTestDb();
    await openBench(db);
    for (const voltage of [1, 2, 3, 4, 5]) await recordAt(voltage);
    const button = finishButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(window.location.hash).toBe(`#/result/${attemptId()}`));
    const events = await listEvents(db, attemptId());
    expect(events.filter((event) => event.actionType === 'FINISH_TASK')).toHaveLength(1);
    expect(events.filter((event) => event.actionType === 'FINISH_ATTEMPT')).toHaveLength(1);
  });
});

describe('what the student reads', () => {
  it('never shows a rule code or a text key', async () => {
    const db = await makeTestDb();
    await openSeries(db);
    await check('31');
    await waitFor(() => expect(verdict('wrong')).not.toBeNull());
    fireEvent.click(nextButton());
    await waitFor(() => expect(useTutorStore.getState().errors.map((result) => result.code)).toContain('MISSING_READING'));
    const text = pageText();
    expect(text).not.toMatch(/EQUIVALENT_R_WRONG|MISSING_READING|MISSING_ANSWER|OK_ANSWER/);
    expect(text).not.toMatch(/\b(bench|common|exp)\.[A-Za-z]+/);
  });
});
