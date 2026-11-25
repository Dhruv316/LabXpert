import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { ErrorCode, ExperimentId } from '../../src/model/types';
import {
  flushBenchWrites,
  useBenchStore,
  usePracticeStore,
  useReadingsStore,
  useTaskStore,
  useTutorStore,
} from '../../src/state';
import { Button, Dialog } from '../../src/components/ui';
import { calcName } from '../../src/ui/bench/CalcDrawing';
import { practiceTask } from '../bench/practice-helpers';
import { expectNoLeaks } from '../helpers/leaks';
import bannerSource from '../../src/ui/bench/PracticeBanner.tsx?raw';
import progressSource from '../../src/ui/bench/PracticeProgress.tsx?raw';
import overlaySource from '../../src/ui/bench/CompletionOverlay.tsx?raw';
import calcCardSource from '../../src/ui/bench/CalcCard.tsx?raw';
import calcDrawingSource from '../../src/ui/bench/CalcDrawing.tsx?raw';
import calcScreenSource from '../../src/ui/screens/PracticeCalculation.tsx?raw';
import practiceScreenSource from '../../src/ui/screens/PracticeScreen.tsx?raw';
import dialogSource from '../../src/components/ui/Dialog.tsx?raw';

// Part 15B-3a: the DESIGN.md §13 checks for the practice screens (bench practice, calculation practice and the
// completion overlay) that a test can make without a browser: class contracts, structure, focus, and leak checks.

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
  vi.restoreAllMocks();
});

// ---- Source rules for every file a practice screen is made of ----

describe.each([
  ['PracticeBanner', bannerSource],
  ['PracticeProgress', progressSource],
  ['CompletionOverlay', overlaySource],
  ['CalcCard', calcCardSource],
  ['CalcDrawing', calcDrawingSource],
  ['PracticeCalculation', calcScreenSource],
  ['PracticeScreen', practiceScreenSource],
  ['Dialog', dialogSource],
])('%s: source rules', (_name, source) => {
  it('is really loaded', () => {
    expect(source.length).toBeGreaterThan(100);
  });

  it('uses no raw colour values and no colours outside the tokens', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
    expect(source).not.toMatch(
      /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|divide|shadow)-(?:slate|gray|zinc|neutral|stone|red|amber|yellow|lime|green|emerald|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black)(?:-\d+)?\b/,
    );
    expect(source).not.toMatch(/\b(?:orange|teal)-\d{2,3}\b/);
  });

  it('uses only the token radii, and the token fonts', () => {
    const radii = source.match(/\brounded-[a-z0-9-]+/g) ?? [];
    for (const radius of radii) expect(['rounded-small', 'rounded-control', 'rounded-card', 'rounded-panel']).toContain(radius);
    expect(source).not.toMatch(/\bfont-(?:sans|serif|mono)\b/);
  });

  it('sets no text below 14 px, no all-caps and no tracked-out labels', () => {
    expect(source).not.toMatch(/\btext-xs\b/);
    for (const match of source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) expect(Number(match[1])).toBeGreaterThanOrEqual(14);
    expect(source).not.toMatch(/\b(?:uppercase|tracking-[a-z]+)\b/);
  });

  it('keeps type on the design scale and sizes in rem, so 125% text scales the lines too', () => {
    // 18 px is not a step of DESIGN.md §3 (14, 16, 20, 24, 32, 40).
    expect(source).not.toMatch(/\btext-lg\b/);
    expect(source).not.toMatch(/\bleading-\[\d+px\]/);
    expect(source).not.toMatch(/\bmin-h-\[\d+px\]/);
  });

  it('keeps no data in browser storage and no any', () => {
    expect(source).not.toMatch(/localStorage|sessionStorage/);
    expect(source).not.toMatch(/:\s*any\b|\bas any\b|<any>/);
  });
});

describe('Fixes in this pass: class contracts', () => {
  it('the banner title and the card prompt are h3 on the scale: 20/28', () => {
    expect(bannerSource).toMatch(/font-heading text-xl font-semibold leading-7/);
    expect(calcCardSource).toMatch(/font-heading text-xl font-medium leading-7/);
  });

  it('the Check button sits level with its input: label line 26 px plus the 4 px gap, in rem', () => {
    expect(calcCardSource).toContain('mt-[1.875rem]');
    expect(calcCardSource).not.toContain('mt-7');
    // The verdict row reserves one 26 px line, so the card does not jump when a verdict appears.
    expect(calcCardSource).toContain('min-h-[1.625rem]');
  });

  it('the completion text is 16/26 in rem', () => {
    expect(overlaySource).toContain('text-base leading-[1.625rem]');
  });

  it('the dialog panel scrolls inside the window instead of running off a short one', () => {
    expect(dialogSource).toContain('max-h-full');
    expect(dialogSource).toContain('overflow-y-auto');
  });
});

describe('Layout rules for 1024 × 640, 1366 × 768 and 125% text', () => {
  it('the banner wraps instead of overflowing, and its text can shrink', () => {
    expect(bannerSource).toContain('flex-wrap');
    expect(bannerSource).toContain('min-w-0');
    expect(bannerSource).toContain('shrink-0');
  });

  it('the calculation page is one centred column that wraps its rows, with no fixed pixel widths', () => {
    expect(calcScreenSource).toContain('mx-auto');
    expect(calcScreenSource).toContain('max-w-5xl');
    expect(calcCardSource).toContain('flex-wrap');
    expect(calcCardSource).not.toMatch(/\b(?:min-|max-)?w-\[\d+px\]/);
    expect(calcScreenSource + calcCardSource + bannerSource).not.toMatch(/\boverflow-x-\w+|\boverflow-scroll\b/);
  });
});

describe('Contrast: the pairs the practice screens use, with the real tokens', () => {
  const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((start) => channel(parseInt(hex.slice(start, start + 2), 16) / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };
  const colour = {
    ink: '#3A2A1A',
    inkSoft: '#6B5644',
    cream: '#FFF6E5',
    mat: '#FDEBC8',
    tealTint: '#BFEDE8',
    error: '#C0392B',
    ok: '#2E7D4F',
    white: '#FFFFFF',
    tealDeep: '#0F7A74',
  };

  it('keeps text at 4.5:1 or better', () => {
    // Banner title, topic line (inkSoft), goal box, progress text, card prompt and verdict, field error text.
    expect(ratio(colour.ink, colour.cream)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(colour.inkSoft, colour.cream)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(colour.ink, colour.tealTint)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(colour.ink, colour.mat)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(colour.error, colour.mat)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(colour.white, colour.tealDeep)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the state icons at 3:1 or better against the card', () => {
    expect(ratio(colour.ok, colour.mat)).toBeGreaterThanOrEqual(3);
    expect(ratio(colour.error, colour.mat)).toBeGreaterThanOrEqual(3);
  });
});

// ---- The dialog under the completion overlay: focus ----

describe('Dialog focus (the completion overlay is one with no way to dismiss it)', () => {
  const actions = (
    <>
      <Button>First</Button>
      <Button variant="quiet">Second</Button>
    </>
  );

  it('a press on the backdrop does not take focus out of the dialog, and does not dismiss one without onClose', () => {
    render(
      <Dialog open title="Done" closeLabel="Close" actions={actions}>
        Body
      </Dialog>,
    );
    const first = screen.getByRole('button', { name: 'First' });
    expect(document.activeElement).toBe(first);
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    // fireEvent returns false when the press's default action (moving focus to the page) was cancelled.
    expect(fireEvent.mouseDown(backdrop)).toBe(false);
    expect(document.activeElement).toBe(first);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('focus that lands outside is pulled back in, so Tab never reaches the page behind', () => {
    render(
      <>
        <button type="button">Behind</button>
        <Dialog open title="Done" closeLabel="Close" actions={actions}>
          Body
        </Dialog>
      </>,
    );
    screen.getByRole('button', { name: 'Behind' }).focus();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
  });

  it('gives focus back to the control that was focused before it opened', () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Sure?" closeLabel="Close" actions={actions}>
            Body
          </Dialog>
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('stops listening for focus once it is closed', () => {
    const { rerender } = render(
      <>
        <button type="button">Behind</button>
        <Dialog open title="Done" closeLabel="Close" actions={actions}>
          Body
        </Dialog>
      </>,
    );
    rerender(
      <>
        <button type="button">Behind</button>
        <Dialog open={false} title="Done" closeLabel="Close" actions={actions}>
          Body
        </Dialog>
      </>,
    );
    const behind = screen.getByRole('button', { name: 'Behind' });
    behind.focus();
    expect(document.activeElement).toBe(behind);
  });
});

// ---- Practice bench: leak checks in several states ----

const bench = () => useBenchStore.getState();
const OPEN_TASK = 'practice-fix-open-circuit';

async function openBenchPractice(db: LabXpertDB) {
  const experimentId: ExperimentId = 'ohms-law';
  const code: ErrorCode = 'OPEN_CIRCUIT';
  await seedUser(db, 'Asha');
  await db.errorProfile.put({ userId: 'asha', experimentId, code, count: 2, lastSeenAt: 500 });
  renderAppAt(db, `#/practice/${OPEN_TASK}`);
  await screen.findByRole('heading', { level: 1 });
  await waitFor(() => expect(bench().session?.kind).toBe('practice'));
  await flushBenchWrites();
}

async function fixOpenCircuit() {
  expect(bench().startWire('R.b', 'click')).toBe(true);
  expect(await bench().finishWire('S.neg')).toBe('connected');
}

async function powerOn(volts: number) {
  expect(await bench().toggleSwitch('SW')).toBe(true);
  expect(await bench().setSupplyVoltage('S', volts)).toBe('changed');
}

const recordNow = () => useReadingsStore.getState().recordReading();

describe('Practice bench: leak checks in several states', () => {
  it('shows nothing internal when starting', async () => {
    const db = await makeTestDb();
    await openBenchPractice(db);
    expectNoLeaks(document.body);
  });

  it('shows nothing internal while running (wire fixed, power on, nothing recorded yet)', async () => {
    const db = await makeTestDb();
    await openBenchPractice(db);
    await fixOpenCircuit();
    await powerOn(6);
    await flushBenchWrites();
    expect(screen.queryByRole('dialog')).toBeNull();
    expectNoLeaks(document.body);
  });

  it('shows nothing internal after a wrong answer: a reading refused for the open circuit, with the tutor panel open', async () => {
    const db = await makeTestDb();
    await openBenchPractice(db);
    await powerOn(6);
    expect((await recordNow()).status).toBe('blocked');
    await flushBenchWrites();
    expect(screen.queryByRole('dialog')).toBeNull();
    expectNoLeaks(document.body);
  });

  it('shows nothing internal when complete and clean', async () => {
    const db = await makeTestDb();
    await openBenchPractice(db);
    await fixOpenCircuit();
    await powerOn(6);
    expect((await recordNow()).status).toBe('recorded');
    await flushBenchWrites();
    const overlay = await screen.findByRole('dialog');
    expect(within(overlay).getByText(t('practice.doneClean'))).toBeTruthy();
    expectNoLeaks(document.body);
  });

  it('shows nothing internal when complete and not clean', async () => {
    const db = await makeTestDb();
    await openBenchPractice(db);
    await powerOn(6);
    expect((await recordNow()).status).toBe('blocked');
    await fixOpenCircuit();
    expect((await recordNow()).status).toBe('recorded');
    await flushBenchWrites();
    const overlay = await screen.findByRole('dialog');
    expect(within(overlay).getByText(t('practice.doneNotClean'))).toBeTruthy();
    expectNoLeaks(document.body);
  });

  it('keeps focus in the overlay when the backdrop is pressed, and Tab and Escape still do nothing to it', async () => {
    const db = await makeTestDb();
    await openBenchPractice(db);
    await fixOpenCircuit();
    await powerOn(6);
    expect((await recordNow()).status).toBe('recorded');
    await flushBenchWrites();
    const overlay = await screen.findByRole('dialog');
    const back = within(overlay).getByRole('button', { name: t('result.back') });
    await waitFor(() => expect(document.activeElement).toBe(back));

    expect(fireEvent.mouseDown(overlay.parentElement as HTMLElement)).toBe(false);
    expect(document.activeElement).toBe(back);

    // Focus that is sent to the page behind comes straight back.
    screen.getByRole('button', { name: t('practice.exit') }).focus();
    expect(overlay.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(overlay, { key: 'Escape' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

describe('Practice bench: structure', () => {
  it('names the banner by its title, has one h1 and puts Leave practice in it', async () => {
    const db = await makeTestDb();
    await openBenchPractice(db);
    const banner = document.querySelector('[data-practice-banner]') as HTMLElement;
    expect(banner.getAttribute('aria-labelledby')).toBe('practice-title');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(banner).getByRole('button', { name: t('practice.exit') })).toBeTruthy();
  });

  it('gives the progress text an accessible name that says the same as the words', async () => {
    const db = await makeTestDb();
    await openBenchPractice(db);
    const progress = document.querySelector('[data-practice-progress]') as HTMLElement;
    expect(progress.getAttribute('role')).toBe('progressbar');
    expect(progress.getAttribute('aria-label')).toBe(progress.textContent);
    expect(progress.getAttribute('aria-valuetext')).toBe(progress.textContent);
  });

  it('has no positive tabindex anywhere on the screen', async () => {
    const db = await makeTestDb();
    await openBenchPractice(db);
    for (const element of Array.from(document.querySelectorAll('[tabindex]'))) {
      expect(Number(element.getAttribute('tabindex'))).toBeLessThanOrEqual(0);
    }
  });

  it('sets Ollie happy in the banner, hidden from assistive tech because the title says it', async () => {
    const db = await makeTestDb();
    await openBenchPractice(db);
    const banner = document.querySelector('[data-practice-banner]') as HTMLElement;
    const owl = banner.querySelector('[data-mood]') as HTMLElement;
    expect(owl.getAttribute('data-mood')).toBe('happy');
    expect(owl.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

// ---- Calculation practice: cards, states and leak checks ----

const CALC_TASK = 'practice-equivalent-resistance';
const CALC_PAIRS = practiceTask(CALC_TASK).calcPairs ?? [];

async function openCalc(db: LabXpertDB) {
  await seedUser(db, 'Asha');
  await db.errorProfile.put({ userId: 'asha', experimentId: 'series-parallel', code: 'EQUIVALENT_R_WRONG', count: 2, lastSeenAt: 500 });
  renderAppAt(db, `#/practice/${CALC_TASK}`);
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

async function answer(index: number, text: string, expected: 'correct' | 'wrong') {
  fireEvent.change(field(index), { target: { value: text } });
  fireEvent.click(checkButton(index));
  if (expected === 'correct') await waitFor(() => expect(isDone(index)).toBe(true));
  else await within(card(index)).findByText(t('practice.calcWrong'));
  await flushBenchWrites();
}

/** The correct typed answers of the practice task: 15 + 30, 20 ‖ 30 and 10 ‖ 15. */
const RIGHT = ['45', '12', '6'];

describe('Calculation practice: cards', () => {
  it('names every card by its drawing, so the same field label is told apart', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    expect(CALC_PAIRS.length).toBe(RIGHT.length);
    for (const [index, pair] of CALC_PAIRS.entries()) {
      const group = card(index);
      expect(group.getAttribute('role')).toBe('group');
      expect(group.getAttribute('aria-label')).toBe(calcName(pair));
      expect(within(screen.getByRole('group', { name: calcName(pair) })).getByLabelText(t('practice.calcAnswer'))).toBeTruthy();
    }
  });

  it('ties the field to the verdict: nothing before an answer, the retry line after a wrong one, "correct" after a right one', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    // Before any answer the field is described by its own error region only (it has no hint).
    const before = (field(0).getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(before).toHaveLength(1);

    await answer(0, '40', 'wrong');
    const wrong = card(0).querySelector('[data-calc-result="wrong"]') as HTMLElement;
    expect(wrong.id).not.toBe('');
    expect((field(0).getAttribute('aria-describedby') ?? '').split(' ')).toContain(wrong.id);

    await answer(0, '45', 'correct');
    const right = card(0).querySelector('[data-calc-result="correct"]') as HTMLElement;
    expect((field(0).getAttribute('aria-describedby') ?? '').split(' ')).toContain(right.id);
    // The Field's own error region stays in the list the whole time.
    for (const id of before) expect((field(0).getAttribute('aria-describedby') ?? '').split(' ')).toContain(id);
  });

  it('drops the link again when a wrong answer is edited', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await answer(1, '99', 'wrong');
    const wrong = card(1).querySelector('[data-calc-result="wrong"]') as HTMLElement;
    fireEvent.change(field(1), { target: { value: '12' } });
    expect(card(1).querySelector('[data-calc-result]')).toBeNull();
    expect((field(1).getAttribute('aria-describedby') ?? '').split(' ')).not.toContain(wrong.id);
  });

  it('every state has an icon beside its words, and the verdict never relies on the card edge colour', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await answer(0, '40', 'wrong');
    await answer(1, '12', 'correct');
    for (const state of ['wrong', 'correct'] as const) {
      const verdict = document.querySelector(`[data-calc-result="${state}"]`) as HTMLElement;
      expect(verdict.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect((verdict.textContent ?? '').length).toBeGreaterThan(0);
    }
    // The empty-entry error carries an icon too (Field).
    fireEvent.change(field(2), { target: { value: '' } });
    fireEvent.click(checkButton(2));
    expect(within(card(2)).getByText(t('bench.answerNeedNumber')).parentElement?.querySelector('svg')).not.toBeNull();
  });

  it('keeps every card control and Leave practice at 48 px, and gives Leave practice the 3 px focus ring', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    for (const control of Array.from(document.querySelectorAll<HTMLElement>('[data-calc-card] button, [data-calc-card] input'))) {
      const className = control.getAttribute('class') ?? '';
      expect(className).toMatch(/\bh-12\b|\bmin-h-\[48px\]/);
    }
    const leave = screen.getByRole('button', { name: t('practice.exit') });
    expect(leave.getAttribute('class')).toMatch(/\bmin-h-\[48px\]/);
    expect(leave.getAttribute('class')).toContain('focus-visible:outline-[3px]');
  });
});

describe('Calculation practice: leak checks in several states', () => {
  it('shows nothing internal when starting', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    expectNoLeaks(document.body);
  });

  it('shows nothing internal with the "type a number" error and after a wrong answer', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    fireEvent.click(checkButton(0));
    expect(within(card(0)).getByText(t('bench.answerNeedNumber'))).toBeTruthy();
    expectNoLeaks(document.body);
    await answer(0, '40', 'wrong');
    expectNoLeaks(document.body);
  });

  it('shows nothing internal half way (one card done, one wrong)', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    await answer(0, '45', 'correct');
    await answer(1, '5', 'wrong');
    expectNoLeaks(document.body);
  });

  it('shows nothing internal when done, with the overlay open', async () => {
    const db = await makeTestDb();
    await openCalc(db);
    for (const [index, text] of RIGHT.entries()) await answer(index, text, 'correct');
    const overlay = await screen.findByRole('dialog');
    expect(within(overlay).getByText(t('practice.doneClean'))).toBeTruthy();
    expectNoLeaks(document.body);
  });
});
