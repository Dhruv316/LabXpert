import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { AnswerSubmission } from '../../src/model/types';
import { flushBenchWrites, usePracticeStore, useReadingsStore, useTaskStore, useTutorStore, type CalcAnswerResult } from '../../src/state';
import { AnnounceContext } from '../../src/ui/bench/announcer';
import { CalcCard } from '../../src/ui/bench/CalcCard';
import { practiceTask } from '../bench/practice-helpers';

// The calculation practice screen (Part 14C): a card per resistor pair, checked with checkEquivalentResistance.

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
});

const TASK = 'practice-equivalent-resistance';
const EXTENSION = 'extension-series-parallel';
const PAIRS = practiceTask(TASK).calcPairs ?? [];

/** Logs Asha in and opens the calculation route; the practice task needs an unresolved mistake, the extension does not. */
async function openCalc(db: LabXpertDB, taskId = TASK) {
  await seedUser(db, 'Asha');
  if (taskId === TASK) {
    await db.errorProfile.put({ userId: 'asha', experimentId: 'series-parallel', code: 'EQUIVALENT_R_WRONG', count: 2, lastSeenAt: 500 });
  }
  renderAppAt(db, `#/practice/${taskId}`);
  await waitFor(() => expect(document.querySelectorAll('[data-calc-card]').length).toBeGreaterThan(0));
  await flushBenchWrites();
}

const card = (index: number): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[data-calc-card="${index}"]`);
  if (found === null) throw new Error(`no card ${index}`);
  return found;
};
const field = (index: number) => within(card(index)).getByLabelText(t('practice.calcAnswer')) as HTMLInputElement;
const checkButton = (index: number) => within(card(index)).getByRole('button', { name: t('bench.check') });
const isDone = (index: number) => card(index).getAttribute('data-done') === 'true';
const progressText = () => document.querySelector('[data-practice-progress]')?.textContent ?? '';
const dialog = () => screen.getByRole('dialog');

function typeAnswer(index: number, text: string) {
  fireEvent.change(field(index), { target: { value: text } });
}

async function answerCorrectly(index: number, text: string) {
  typeAnswer(index, text);
  fireEvent.click(checkButton(index));
  await waitFor(() => expect(isDone(index)).toBe(true));
  await flushBenchWrites();
}

async function answerWrongly(index: number, text: string) {
  typeAnswer(index, text);
  fireEvent.click(checkButton(index));
  await within(card(index)).findByText(t('practice.calcWrong'));
  await flushBenchWrites();
}

/** The correct typed answers of the practice task: 15 + 30, 20 ‖ 30 and 10 ‖ 15. */
const RIGHT = ['45', '12', '6'];

async function completeAll() {
  for (const [index, text] of RIGHT.entries()) await answerCorrectly(index, text);
  await screen.findByRole('dialog');
}

describe('the cards', () => {
  it('shows a card per pair, in order, each with its own drawing type, values and accessible name', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    expect(document.querySelectorAll('[data-calc-card]')).toHaveLength(PAIRS.length);
    PAIRS.forEach((pair, index) => {
      const name = t(pair.topology === 'series' ? 'practice.calcSeries' : 'practice.calcParallel', { r1: pair.r1, r2: pair.r2 });
      const picture = within(card(index)).getByRole('img', { name });
      expect(picture.getAttribute('data-drawing')).toBe(pair.topology);
      const resistors = Array.from(picture.querySelectorAll('[data-calc-resistor]'));
      expect(resistors).toHaveLength(2);
      expect(resistors.map((r) => r.textContent?.trim())).toEqual([t('bench.resistanceValue', { ohms: pair.r1 }), t('bench.resistanceValue', { ohms: pair.r2 })]);
      // The real resistor art: colour bands are rects inside each resistor.
      for (const resistor of resistors) expect(resistor.querySelectorAll('rect').length).toBeGreaterThan(3);
      expect(within(card(index)).getByText(t('practice.calcPrompt'))).toBeTruthy();
    });
  });

  it('draws series end to end and parallel stacked', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    const positions = (index: number) =>
      Array.from(card(index).querySelectorAll('[data-calc-resistor] g[transform]')).map((node) => {
        const match = /translate\(([\d.]+) ([\d.]+)\)/.exec(node.getAttribute('transform') ?? '');
        return { x: Number(match?.[1]), y: Number(match?.[2]) };
      });
    const [a, b] = positions(0);
    expect(a?.y).toBe(b?.y);
    expect(b?.x).toBeGreaterThan(a?.x ?? 0);
    const [c, d] = positions(1);
    expect(c?.x).toBe(d?.x);
    expect(d?.y).toBeGreaterThan(c?.y ?? 0);
  });

  it('gives every field an always-visible label, a number keyboard hint and 48 px controls', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    for (let index = 0; index < PAIRS.length; index += 1) {
      const input = field(index);
      expect(card(index).querySelector(`label[for="${input.id}"]`)?.textContent).toBe(t('practice.calcAnswer'));
      expect(input.getAttribute('inputmode')).toBe('decimal');
      expect(input.getAttribute('step')).toBe('any');
      expect(input.className).toContain('h-12');
      expect(checkButton(index).className).toContain('min-h-[48px]');
    }
  });

  it('puts Leave practice first, then each card’s field and Check in order, with no positive tabindex', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    const banner = document.querySelector('[data-practice-banner]') as HTMLElement;
    const sequence: HTMLElement[] = [within(banner).getByRole('button', { name: t('practice.exit') })];
    for (let index = 0; index < PAIRS.length; index += 1) sequence.push(field(index), checkButton(index));
    for (let i = 1; i < sequence.length; i += 1) {
      const before = sequence[i - 1] as HTMLElement;
      const after = sequence[i] as HTMLElement;
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(document.querySelectorAll('[data-calc-card] [tabindex]:not([tabindex="0"]):not([tabindex="-1"]), [data-practice-banner] [tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveLength(0);
  });

  it('has no animation class on the cards, so Reduce motion has nothing to switch off', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    expect(document.querySelector('[data-calc-card] [class*="animate-"]')).toBeNull();
  });
});

describe('banner and progress', () => {
  it('shows the topic of the triggering mistake, the title and the goal, and a progress of 0 of 3', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    const banner = document.querySelector('[data-practice-banner]') as HTMLElement;
    expect(within(banner).getByText(t('practice.bannerPicked', { topic: t('errorTopics.EQUIVALENT_R_WRONG') }))).toBeTruthy();
    expect(within(banner).getByRole('heading', { level: 1 }).textContent).toBe(t('practiceTasks.practice-equivalent-resistance.title'));
    expect(within(document.querySelector('[data-practice-goal]') as HTMLElement).getByText(t('practiceTasks.practice-equivalent-resistance.goal'))).toBeTruthy();
    expect(progressText()).toContain(t('practice.progress', { have: 0, need: PAIRS.length }));
  });

  it('an extension task shows the extension line and no topic', async () => {
    const db = await makeTestDb();
    await openCalc(db, EXTENSION);
    expect(screen.getByText(t('practice.bannerExtension'))).toBeTruthy();
    expect(screen.queryByText(/Ollie picked this/)).toBeNull();
    expect(document.querySelectorAll('[data-calc-card]')).toHaveLength(practiceTask(EXTENSION).calcPairs?.length ?? 0);
  });

  it('progress counts the correct cards, and a wrong answer does not move it', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await answerWrongly(0, '40');
    expect(progressText()).toContain(t('practice.progress', { have: 0, need: 3 }));
    await answerCorrectly(0, '45');
    await waitFor(() => expect(progressText()).toContain(t('practice.progress', { have: 1, need: 3 })));
    await answerCorrectly(1, '12');
    await waitFor(() => expect(progressText()).toContain(t('practice.progress', { have: 2, need: 3 })));
  });
});

describe('checking an answer', () => {
  it('an empty entry shows "type a number" in the field’s error state and saves nothing', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    fireEvent.click(checkButton(0));
    expect(within(card(0)).getByText(t('bench.answerNeedNumber'))).toBeTruthy();
    expect(field(0).getAttribute('aria-invalid')).toBe('true');
    expect(card(0).querySelector('[data-calc-result]')).toBeNull();
    await flushBenchWrites();
    expect(await db.answers.count()).toBe(0);
    expect((await db.events.toArray()).filter((e) => e.actionType === 'SUBMIT_ANSWER')).toHaveLength(0);
    expect(usePracticeStore.getState().calcDone).toEqual([]);
  });

  it('a non-numeric entry shows the same error and saves nothing', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    for (const text of ['abc', 'e']) {
      typeAnswer(0, text);
      fireEvent.click(checkButton(0));
      expect(within(card(0)).getByText(t('bench.answerNeedNumber'))).toBeTruthy();
      expect(field(0).getAttribute('aria-invalid')).toBe('true');
    }
    await flushBenchWrites();
    expect(await db.answers.count()).toBe(0);
  });

  it('the error goes away when a number is typed, and other cards are untouched', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    fireEvent.click(checkButton(0));
    expect(within(card(0)).getByText(t('bench.answerNeedNumber'))).toBeTruthy();
    expect(within(card(1)).queryByText(t('bench.answerNeedNumber'))).toBeNull();
    typeAnswer(0, '4');
    expect(within(card(0)).queryByText(t('bench.answerNeedNumber'))).toBeNull();
    expect(field(0).getAttribute('aria-invalid')).toBeNull();
  });

  it('a wrong answer says so with an icon, keeps what was typed and can be tried again as often as needed', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await answerWrongly(0, '40');
    const verdict = card(0).querySelector('[data-calc-result="wrong"]') as HTMLElement;
    expect(verdict.textContent).toBe(t('practice.calcWrong'));
    expect(verdict.querySelector('svg')).not.toBeNull();
    expect(field(0).value).toBe('40');
    expect(isDone(0)).toBe(false);
    expect(checkButton(0).hasAttribute('disabled')).toBe(false);

    await answerWrongly(0, '50');
    expect(field(0).value).toBe('50');
    await answerCorrectly(0, '45');
    expect(card(0).querySelector('[data-calc-result="wrong"]')).toBeNull();
  });

  it('a correct answer says so with a check icon and locks the card', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await answerCorrectly(0, '45');
    const verdict = card(0).querySelector('[data-calc-result="correct"]') as HTMLElement;
    expect(verdict.textContent).toBe(t('practice.calcCorrect'));
    expect(verdict.querySelector('svg')).not.toBeNull();
    expect(field(0).readOnly).toBe(true);
    expect(field(0).getAttribute('aria-readonly')).toBe('true');
    expect(field(0).value).toBe('45');
    expect(checkButton(0).hasAttribute('disabled')).toBe(true);

    // Pressing Check or changing the text on a locked card does nothing: no second answer is saved.
    fireEvent.click(checkButton(0));
    typeAnswer(0, '99');
    expect(field(0).value).toBe('45');
    await flushBenchWrites();
    expect(await db.answers.count()).toBe(1);
    // The other cards stay open.
    expect(isDone(1)).toBe(false);
    expect(field(1).readOnly).toBe(false);
  });

  it('moves focus to the next open card after a correct answer', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await answerCorrectly(0, '45');
    await waitFor(() => expect(document.activeElement).toBe(field(1)));
  });

  it('accepts an answer exactly 2% off and rejects one just over', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    // 20 ‖ 30 is 12: 12.24 is exactly 2% over, 12.25 is just beyond it.
    await answerWrongly(1, '12.25');
    await answerCorrectly(1, '12.24');
    const saved = (await db.answers.toArray()).sort((a, b) => a.typed - b.typed);
    expect(saved.map((a) => [a.typed, a.correct])).toEqual([
      [12.24, true],
      [12.25, false],
    ]);
  });

  it('never shows the expected value, before or after a wrong answer', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    const expectedShown = () => /(?<![\d.])(?:45|12|6)(?![\d.])/.test(document.body.textContent ?? '');
    expect(expectedShown()).toBe(false);
    await answerWrongly(0, '40');
    await answerWrongly(1, '11');
    await answerWrongly(2, '7');
    expect(expectedShown()).toBe(false);
  });
});

describe('saving', () => {
  it('saves every submission for the practice attempt with its flag and logs SUBMIT_ANSWER', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    const attempt = (await db.attempts.toArray())[0];
    await answerWrongly(0, '40');
    await answerCorrectly(0, '45');
    await answerCorrectly(1, '12');

    const answers = (await db.answers.toArray()).sort((a, b) => a.typed - b.typed);
    expect(answers).toHaveLength(3);
    expect(answers.map((a) => [a.typed, a.expected, a.correct])).toEqual([
      [12, 12, true],
      [40, 45, false],
      [45, 45, true],
    ]);
    for (const answer of answers) {
      expect(answer.attemptId).toBe(attempt?.id);
      expect(answer.taskId).toBe(TASK);
    }
    const events = (await db.events.toArray()).filter((e) => e.actionType === 'SUBMIT_ANSWER');
    expect(events).toHaveLength(3);
    expect(events.map((e) => `${String(e.after?.pairIndex)}:${String(e.after?.correct)}`).sort()).toEqual(['0:false', '0:true', '1:true']);
    for (const event of events) expect(event.attemptId).toBe(attempt?.id);
  });
});

describe('completion', () => {
  it('completes once when all cards are correct, shows the overlay with the clean text and resets the topic', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await answerWrongly(0, '40'); // a wrong try on the way does not make the run unclean: no bench error can occur here
    await completeAll();

    expect(within(dialog()).getByText(t('practice.doneClean'))).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: t('result.back') })).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: t('picker.progress') })).toBeTruthy();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    const attempt = (await db.attempts.toArray())[0];
    expect(attempt?.status).toBe('completed');
    const records = await db.practiceRecords.toArray();
    expect(records).toHaveLength(1);
    expect(records[0]?.clean).toBe(true);
    expect(records[0]?.completedAt).toBeDefined();
    expect(usePracticeStore.getState().completion).toEqual({ clean: true, resetCode: 'EQUIVALENT_R_WRONG' });
    expect((await db.errorProfile.get(['asha', 'series-parallel', 'EQUIVALENT_R_WRONG']))?.count).toBe(0);
  });

  it('an extension task completes clean and leaves the mistake list alone', async () => {
    const db = await makeTestDb();
    await seedUser(db, 'Asha');
    await db.errorProfile.put({ userId: 'asha', experimentId: 'series-parallel', code: 'WRONG_TOPOLOGY', count: 2, lastSeenAt: 500 });
    renderAppAt(db, `#/practice/${EXTENSION}`);
    await waitFor(() => expect(document.querySelectorAll('[data-calc-card]').length).toBeGreaterThan(0));
    const answers = ['25', '10', '15'];
    for (const [index, text] of answers.entries()) await answerCorrectly(index, text);
    await screen.findByRole('dialog');
    expect(within(dialog()).getByText(t('practice.doneClean'))).toBeTruthy();
    expect(usePracticeStore.getState().completion).toEqual({ clean: true, resetCode: null });
    expect((await db.errorProfile.get(['asha', 'series-parallel', 'WRONG_TOPOLOGY']))?.count).toBe(2);
  });

  it('My progress closes the practice and navigates; the attempt stays completed', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await completeAll();
    fireEvent.click(within(dialog()).getByRole('button', { name: t('picker.progress') }));
    await waitFor(() => expect(window.location.hash).toBe('#/progress'));
    expect((await db.attempts.toArray())[0]?.status).toBe('completed');
    expect(usePracticeStore.getState().current).toBeUndefined();
  });

  it('Back to experiments goes to the picker', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await completeAll();
    fireEvent.click(within(dialog()).getByRole('button', { name: t('result.back') }));
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(await screen.findByRole('heading', { name: t('picker.title') })).toBeTruthy();
  });
});

describe('leaving and resuming', () => {
  it('Leave practice abandons the attempt and returns to the picker with no confirmation', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await answerCorrectly(0, '45');
    fireEvent.click(screen.getByRole('button', { name: t('practice.exit') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('heading', { name: t('picker.title') })).toBeTruthy();
    expect(window.location.hash).toBe('#/');
    const attempts = await db.attempts.toArray();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.status).toBe('abandoned');
    expect(usePracticeStore.getState().current).toBeUndefined();
  });

  it('a reload in the middle resumes the same attempt with the answered cards shown as done', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await answerWrongly(1, '10');
    await answerCorrectly(0, '45');
    const attemptId = (await db.attempts.toArray())[0]?.id;
    cleanup();
    resetStores();

    renderAppAt(db, `#/practice/${TASK}`);
    await waitFor(() => expect(document.querySelectorAll('[data-calc-card]').length).toBe(PAIRS.length));
    await waitFor(() => expect(isDone(0)).toBe(true));
    expect(field(0).value).toBe('45');
    expect(card(0).querySelector('[data-calc-result="correct"]')?.textContent).toBe(t('practice.calcCorrect'));
    expect(checkButton(0).hasAttribute('disabled')).toBe(true);
    expect(isDone(1)).toBe(false);
    expect(isDone(2)).toBe(false);
    expect(progressText()).toContain(t('practice.progress', { have: 1, need: 3 }));
    expect(screen.queryByRole('dialog')).toBeNull();

    const attempts = await db.attempts.toArray();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ id: attemptId, status: 'in_progress' });
    // Finishing the rest after the reload still completes the same attempt.
    await answerCorrectly(1, '12');
    await answerCorrectly(2, '6');
    await screen.findByRole('dialog');
    expect((await db.practiceRecords.toArray())).toHaveLength(1);
  });
});

describe('text', () => {
  it('shows no rule code, text key, raw id or unfilled placeholder on the screen or in the overlay', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    const check = () => {
      const text = document.body.textContent ?? '';
      expect(text).not.toMatch(/\b[A-Z]{2,}(?:_[A-Z]+)+\b/);
      for (const bad of ['practiceTasks.', 'errorTopics.', 'practice.', 'bench.', TASK, '{r1}', '{r2}', '{have}', '{need}', '{topic}']) {
        expect(text).not.toContain(bad);
      }
    };
    check();
    fireEvent.click(checkButton(0));
    check();
    await answerWrongly(0, '40');
    check();
    await completeAll();
    check();
  });
});

describe('CalcCard announcements', () => {
  const answer: AnswerSubmission = { id: 'a', attemptId: 'x', taskId: TASK, typed: 1, expected: 1, correct: true, timestamp: 1 };
  const pair = PAIRS[0] ?? { topology: 'series' as const, r1: 15, r2: 30, answer: 45 };

  function renderCard(result: 'correct' | 'wrong' | 'invalid') {
    const announce = vi.fn();
    const onCorrect = vi.fn();
    const outcome: CalcAnswerResult = result === 'invalid' ? { status: 'invalid' } : { status: result, answer };
    const submitCalcAnswer = vi.fn<(index: number, value: number) => Promise<CalcAnswerResult>>(() => Promise.resolve(outcome));
    usePracticeStore.setState({ submitCalcAnswer });
    render(
      <AnnounceContext.Provider value={announce}>
        <CalcCard index={0} pair={pair} done={false} answeredText="" registerInput={() => undefined} onCorrect={onCorrect} />
      </AnnounceContext.Provider>,
    );
    const input = screen.getByLabelText(t('practice.calcAnswer'));
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: t('bench.check') }));
    return { announce, onCorrect, submitCalcAnswer };
  }

  it('says "Correct" politely and tells the screen when the answer was right', async () => {
    const { announce, onCorrect, submitCalcAnswer } = renderCard('correct');
    await waitFor(() => expect(announce).toHaveBeenCalledWith(t('practice.calcCorrect')));
    expect(submitCalcAnswer).toHaveBeenCalledWith(0, 45);
    expect(onCorrect).toHaveBeenCalledWith(0);
  });

  it('says the retry line when the answer was wrong, and does not tell the screen', async () => {
    const { announce, onCorrect } = renderCard('wrong');
    await waitFor(() => expect(announce).toHaveBeenCalledWith(t('practice.calcWrong')));
    expect(onCorrect).not.toHaveBeenCalled();
  });

  it('says nothing when the number could not be used', async () => {
    const { announce, onCorrect, submitCalcAnswer } = renderCard('invalid');
    await waitFor(() => expect(submitCalcAnswer).toHaveBeenCalled());
    await flushBenchWrites();
    expect(announce).not.toHaveBeenCalled();
    expect(onCorrect).not.toHaveBeenCalled();
  });
});
