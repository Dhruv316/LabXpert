import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import errorCodes from '../../src/spec/error-codes.json';
import kitStrings from '../../kit/spec/ui-strings.en.json?raw';
import srcStrings from '../../src/spec/ui-strings.en.json?raw';
import type { LabXpertDB } from '../../src/db/database';
import { abandonAttempt, finishAttempt, startAttempt } from '../../src/db/attempts';
import { completePractice, startPractice } from '../../src/db/practice-records';
import { appendReading } from '../../src/db/readings';
import { loginUser } from '../../src/db/users';
import { t } from '../../src/i18n';
import type { ErrorCode, ExperimentId } from '../../src/model/types';
import { PRACTICE_TASKS } from '../../src/ui/screens/practice-list';
import { textForKey } from '../../src/ui/screens/progress-model';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  await disposeTestDbs();
  resetAppState();
});

const DAY = Date.UTC(2026, 10, 20, 12);
const dateText = (time: number) => new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(time);

async function seedAttempt(
  db: LabXpertDB,
  o: {
    id: string;
    userId?: string;
    experimentId?: ExperimentId;
    kind?: 'experiment' | 'practice';
    end?: 'done' | 'abandoned' | 'open';
    finishedAt?: number;
    codes?: ErrorCode[];
  },
) {
  const userId = o.userId ?? 'asha';
  const experimentId = o.experimentId ?? 'ohms-law';
  await startAttempt(db, { id: o.id, userId, experimentId, kind: o.kind ?? 'experiment', startedAt: 1 });
  const end = o.end ?? 'done';
  if (end === 'done') await finishAttempt(db, o.id, o.finishedAt ?? 100);
  if (end === 'abandoned') await abandonAttempt(db, o.id, o.finishedAt ?? 100);
  let n = 0;
  for (const code of o.codes ?? []) {
    n += 1;
    await db.errorOccurrences.add({
      id: `${o.id}-occ-${n}`,
      attemptId: o.id,
      userId,
      experimentId,
      code,
      feedbackKey: `${code}.x`,
      checkpoint: 'RECORD_READING',
      circuitSignature: `sig-${n}`,
      timestamp: n,
    });
  }
}

async function seedProfile(
  db: LabXpertDB,
  code: ErrorCode,
  count: number,
  lastSeenAt: number,
  o: { userId?: string; experimentId?: ExperimentId } = {},
) {
  await db.errorProfile.put({
    userId: o.userId ?? 'asha',
    experimentId: o.experimentId ?? 'ohms-law',
    code,
    count,
    lastSeenAt,
  });
}

async function seedPractice(db: LabXpertDB, id: string, taskId: string, completedAt: number | undefined, clean?: boolean, userId = 'asha') {
  await db.practiceRecords.add({
    id,
    userId,
    practiceTaskId: taskId,
    attemptId: `${id}-attempt`,
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(clean === undefined ? {} : { clean }),
  });
}

async function openProgress(db: LabXpertDB) {
  renderAppAt(db, '#/progress');
  await screen.findByRole('heading', { level: 1, name: t('progress.title') });
  // Loading is over once the practice section shows either its list or its empty text.
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
}

const section = (name: string) => within(screen.getByRole('region', { name }));
const experimentRow = (title: string) => within(screen.getByRole('heading', { level: 3, name: title }).closest('li') as HTMLElement);
const topicRowsNow = () => section(t('progress.topics')).queryAllByRole('listitem');
const topicRow = (topic: string) => within(screen.getByRole('heading', { level: 3, name: topic }).closest('li') as HTMLElement);

const OHM = () => t('exp.ohms-law.title');
const SERIES = () => t('exp.series-parallel.title');

describe('My progress: empty and loading', () => {
  it('shows all three empty states and no best result for a new student', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await openProgress(db);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(t('progress.topicsEmpty'))).toBeTruthy();
    expect(screen.getByText(t('progress.practiceEmpty'))).toBeTruthy();
    expect(screen.queryByText(/Best result/)).toBeNull();
    expect(experimentRow(OHM()).getByText(t('picker.status.not_started'))).toBeTruthy();
    expect(experimentRow(SERIES()).getByText(t('picker.status.not_started'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('progress.startPractice') })).toBeNull();
  });

  it('finishes loading: the page stops being busy and the lists replace the placeholders', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    renderAppAt(db, '#/progress');
    const main = await screen.findByRole('main');
    await waitFor(() => expect(main.getAttribute('aria-busy')).toBe('false'));
    expect(screen.getByText(t('progress.topicsEmpty'))).toBeTruthy();
  });
});

describe('My progress: experiments', () => {
  it('shows the status chip and the best result: fewest distinct codes, ties to the most recent, practice ignored', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await seedAttempt(db, { id: 'o1', codes: ['OPEN_CIRCUIT', 'SHORT_CIRCUIT', 'WRONG_POLARITY'], finishedAt: 100 });
    await seedAttempt(db, { id: 'o2', codes: ['OPEN_CIRCUIT'], finishedAt: 200 });
    // A clean practice attempt must not become the best result.
    await seedAttempt(db, { id: 'p1', kind: 'practice', finishedAt: 300 });
    // Series and parallel: two finished attempts with the same number of kinds, and one still in progress.
    await seedAttempt(db, { id: 's1', experimentId: 'series-parallel', codes: ['OPEN_CIRCUIT', 'SHORT_CIRCUIT'], finishedAt: 100 });
    await seedAttempt(db, { id: 's2', experimentId: 'series-parallel', codes: ['WRONG_POLARITY', 'MISSING_READING'], finishedAt: 400 });
    await seedAttempt(db, { id: 's3', experimentId: 'series-parallel', end: 'open', codes: ['OPEN_CIRCUIT'] });
    await openProgress(db);

    const ohm = experimentRow(OHM());
    expect(ohm.getByText(t('progress.bestResultOne'))).toBeTruthy();
    const ohmChip = ohm.getByText(t('picker.status.done')).closest('[data-tone]');
    expect(ohmChip?.getAttribute('data-tone')).toBe('ok');

    const series = experimentRow(SERIES());
    expect(series.getByText(t('progress.bestResultMany', { count: 2 }))).toBeTruthy();
    expect(series.getByText(t('picker.status.in_progress')).closest('[data-tone]')?.getAttribute('data-tone')).toBe('progress');
  });

  it('says "no mistakes" for a clean finished attempt and shows no best result without a finished attempt', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await seedAttempt(db, { id: 'clean' });
    await seedAttempt(db, { id: 'open', experimentId: 'series-parallel', end: 'open', codes: ['OPEN_CIRCUIT'] });
    await seedAttempt(db, { id: 'gone', experimentId: 'series-parallel', end: 'abandoned' });
    await openProgress(db);
    expect(experimentRow(OHM()).getByText(t('progress.bestResultNone'))).toBeTruthy();
    expect(experimentRow(SERIES()).queryByText(/Best result/)).toBeNull();
  });
});

describe('My progress: topics to practise', () => {
  it('lists only codes above 0, most seen first, ties to the most recent, with singular and plural counts', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await seedProfile(db, 'OPEN_CIRCUIT', 1, 50);
    await seedProfile(db, 'WRONG_POLARITY', 3, 10);
    await seedProfile(db, 'VOLTMETER_SERIES', 1, 90);
    await seedProfile(db, 'MISSING_READING', 0, 99);
    await openProgress(db);

    const headings = section(t('progress.topics'))
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([t('errorTopics.WRONG_POLARITY'), t('errorTopics.VOLTMETER_SERIES'), t('errorTopics.OPEN_CIRCUIT')]);
    expect(topicRow(t('errorTopics.WRONG_POLARITY')).getByText(t('result.mistakeCountPlural', { count: 3 }))).toBeTruthy();
    expect(topicRow(t('errorTopics.OPEN_CIRCUIT')).getByText(t('result.mistakeCount', { count: 1 }))).toBeTruthy();
    expect(screen.queryByText(t('errorTopics.MISSING_READING'))).toBeNull();
    expect(screen.queryByText(t('progress.topicsEmpty'))).toBeNull();
  });

  it('adds up one code seen in two experiments into a single row', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await seedProfile(db, 'OPEN_CIRCUIT', 1, 10, { experimentId: 'ohms-law' });
    await seedProfile(db, 'OPEN_CIRCUIT', 2, 20, { experimentId: 'series-parallel' });
    await openProgress(db);
    expect(topicRowsNow()).toHaveLength(1);
    expect(topicRow(t('errorTopics.OPEN_CIRCUIT')).getByText(t('result.mistakeCountPlural', { count: 3 }))).toBeTruthy();
  });

  it('Start practice goes to the task for that code, and always to the same task', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await seedProfile(db, 'WRONG_POLARITY', 2, 10);
    await seedProfile(db, 'WRONG_TOPOLOGY', 1, 20, { experimentId: 'series-parallel' });

    const goFrom = async (topic: string) => {
      await openProgress(db);
      fireEvent.click(topicRow(topic).getByRole('button', { name: t('progress.startPractice') }));
      await waitFor(() => expect(window.location.hash).not.toBe('#/progress'));
      const hash = window.location.hash;
      cleanup();
      resetAppState();
      return hash;
    };

    const polarity = PRACTICE_TASKS.find((task) => task.forCodes.includes('WRONG_POLARITY'));
    const topology = PRACTICE_TASKS.find((task) => task.forCodes.includes('WRONG_TOPOLOGY'));
    expect(polarity).toBeDefined();
    expect(topology).toBeDefined();
    const first = await goFrom(t('errorTopics.WRONG_POLARITY'));
    expect(first).toBe(`#/practice/${polarity?.id}`);
    expect(await goFrom(t('errorTopics.WRONG_POLARITY'))).toBe(first);
    expect(await goFrom(t('errorTopics.WRONG_TOPOLOGY'))).toBe(`#/practice/${topology?.id}`);
  });

  it('drops a code that a clean practice run reset', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await seedProfile(db, 'OPEN_CIRCUIT', 2, 20);
    await seedProfile(db, 'VOLTMETER_SERIES', 1, 10);
    const task = PRACTICE_TASKS.find((candidate) => candidate.id === 'practice-fix-open-circuit');
    if (task === undefined) throw new Error('missing task');
    await startPractice(db, {
      recordId: 'rec',
      attemptId: 'pa',
      userId: 'asha',
      experimentId: 'ohms-law',
      practiceTaskId: task.id,
      forCode: 'OPEN_CIRCUIT',
      startedAt: 5,
    });
    // The task is done once one reading is recorded; no error was saved in this attempt, so the run is clean.
    await appendReading(db, { id: 'rd', attemptId: 'pa', taskId: 'x', supplyVoltage: 4, voltmeter: 4, ammeter: 0.4, timestamp: 6 });

    await openProgress(db);
    expect(screen.getByText(t('errorTopics.OPEN_CIRCUIT'))).toBeTruthy();
    cleanup();
    resetAppState();

    const done = await completePractice(db, { attemptId: 'pa', task, topologyOkReadingIds: [], completedAt: DAY });
    expect(done).toMatchObject({ completed: true, clean: true, resetCode: 'OPEN_CIRCUIT' });
    await openProgress(db);
    expect(screen.queryByText(t('errorTopics.OPEN_CIRCUIT'))).toBeNull();
    expect(screen.getByText(t('errorTopics.VOLTMETER_SERIES'))).toBeTruthy();
    // The finished run now shows in the practice list as a clean run.
    expect(section(t('progress.practiceDone')).getByText(t('progress.practiceClean'))).toBeTruthy();
  });
});

describe('My progress: practice completed', () => {
  it('lists completed runs newest first with title, a formatted date and clean or not clean, each with an icon', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    const older = PRACTICE_TASKS[0];
    const newer = PRACTICE_TASKS[1];
    if (older === undefined || newer === undefined) throw new Error('missing tasks');
    await seedPractice(db, 'r-old', older.id, DAY, true);
    await seedPractice(db, 'r-new', newer.id, DAY + 3 * 86_400_000, false);
    // Unfinished practice is not listed.
    await seedPractice(db, 'r-open', PRACTICE_TASKS[2]?.id ?? older.id, undefined);
    await openProgress(db);

    const rows = section(t('progress.practiceDone')).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const first = within(rows[0] as HTMLElement);
    const second = within(rows[1] as HTMLElement);
    expect(first.getByRole('heading', { level: 3 }).textContent).toBe(textForKey(newer.titleKey));
    expect(first.getByText(dateText(DAY + 3 * 86_400_000))).toBeTruthy();
    expect(first.getByText(t('progress.practiceNotClean'))).toBeTruthy();
    expect(second.getByRole('heading', { level: 3 }).textContent).toBe(textForKey(older.titleKey));
    expect(second.getByText(dateText(DAY))).toBeTruthy();
    expect(second.getByText(t('progress.practiceClean'))).toBeTruthy();
    // An icon beside the words, never colour or text alone.
    for (const row of rows) expect(row.querySelector('svg')).not.toBeNull();
    expect(screen.queryByText(t('progress.practiceEmpty'))).toBeNull();
  });
});

describe('My progress: privacy, wording and navigation', () => {
  it('two learners see only their own data', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Ben');
    await seedProfile(db, 'VOLTMETER_SERIES', 2, 10, { userId: 'ben' });
    await seedAttempt(db, { id: 'b1', userId: 'ben', codes: ['OPEN_CIRCUIT', 'SHORT_CIRCUIT'] });
    await seedPractice(db, 'rb', PRACTICE_TASKS[0]?.id ?? '', DAY, true, 'ben');
    await seedUser(db, 'Asha');
    await seedProfile(db, 'WRONG_POLARITY', 1, 10);
    await seedAttempt(db, { id: 'a1', codes: ['OPEN_CIRCUIT'] });

    await openProgress(db);
    expect(screen.getByText(t('errorTopics.WRONG_POLARITY'))).toBeTruthy();
    expect(screen.queryByText(t('errorTopics.VOLTMETER_SERIES'))).toBeNull();
    expect(screen.getByText(t('progress.bestResultOne'))).toBeTruthy();
    expect(screen.queryByText(t('progress.bestResultMany', { count: 2 }))).toBeNull();
    expect(screen.getByText(t('progress.practiceEmpty'))).toBeTruthy();

    cleanup();
    resetAppState();
    await loginUser(db, 'Ben', 5000);
    await openProgress(db);
    expect(screen.getByText(t('errorTopics.VOLTMETER_SERIES'))).toBeTruthy();
    expect(screen.queryByText(t('errorTopics.WRONG_POLARITY'))).toBeNull();
    expect(screen.getByText(t('progress.bestResultMany', { count: 2 }))).toBeTruthy();
    expect(screen.queryByText(t('progress.practiceEmpty'))).toBeNull();
  });

  it('never shows a rule code, a feedback key or a raw id', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await seedProfile(db, 'AMMETER_PARALLEL', 2, 10);
    await seedProfile(db, 'WRONG_TOPOLOGY', 1, 20, { experimentId: 'series-parallel' });
    await seedAttempt(db, { id: 'attempt-xyz', codes: ['OPEN_CIRCUIT'] });
    await seedPractice(db, 'record-xyz', 'practice-fix-open-circuit', DAY, false);
    await openProgress(db);

    const text = document.body.textContent ?? '';
    const codes = errorCodes.errors.map((entry) => entry.code);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(text).not.toContain(code);
    expect(text).not.toContain('OPEN_CIRCUIT.');
    expect(text).not.toContain('practice-fix-open-circuit');
    expect(text).not.toContain('ohms-law');
    expect(text).not.toContain('attempt-xyz');
    expect(text).not.toContain('record-xyz');
  });

  it('Back to experiments goes to the picker, and the picker link comes here', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await openProgress(db);
    fireEvent.click(screen.getByRole('button', { name: t('result.back') }));
    await screen.findByRole('heading', { level: 1, name: t('picker.title') });
    expect(window.location.hash).toBe('#/');
    fireEvent.click(screen.getByRole('link', { name: t('picker.progress') }));
    await screen.findByRole('heading', { level: 1, name: t('progress.title') });
  });
});

describe('ui-strings approved keys (Part 13B)', () => {
  const APPROVED = {
    bestResultNone: 'Best result: no mistakes',
    bestResultOne: 'Best result: 1 kind of mistake',
    bestResultMany: 'Best result: {count} kinds of mistakes',
    practiceClean: 'Clean run',
    practiceNotClean: 'Some mistakes came back',
  };

  it('both copies are identical and hold the 5 keys under progress, exactly as written', () => {
    expect(srcStrings).toBe(kitStrings);
    for (const raw of [kitStrings, srcStrings]) {
      const progress = (JSON.parse(raw) as { progress: Record<string, string> }).progress;
      for (const [key, text] of Object.entries(APPROVED)) expect(progress[key]).toBe(text);
    }
  });
});
