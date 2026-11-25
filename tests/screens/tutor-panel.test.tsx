import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { buildEvaluateInput, moodOf, NO_HIGHLIGHT, splitResults, type SplitResults } from '../../src/bench/checkpoint';
import { MotionScope } from '../../src/components/ui';
import { evaluate } from '../../src/engine/evaluate';
import { t } from '../../src/i18n';
import type { Checkpoint, Circuit, ExperimentConfig, TerminalRef } from '../../src/model/types';
import { useBenchStore, useTutorStore } from '../../src/state';
import { AnnouncerProvider } from '../../src/ui/bench/LiveRegion';
import { TutorPanel } from '../../src/ui/bench/TutorPanel';
import { feedbackParams } from '../../src/ui/bench/tutor-text';
import { ohmsLaw, seriesParallel } from '../bench/helpers';

function resetStores() {
  useBenchStore.setState(useBenchStore.getInitialState(), true);
  useTutorStore.setState(useTutorStore.getInitialState(), true);
}
beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
});

const tutor = () => useTutorStore.getState();

/** S -> SW -> A -> R -> S with the voltmeter across R. */
const LOOP: [TerminalRef, TerminalRef][] = [
  ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
];

function circuitOf(pairs: [TerminalRef, TerminalRef][], closed = true): Circuit {
  return {
    components: [
      { id: 'S', type: 'supply', x: 0, y: 0, voltage: 6 },
      { id: 'SW', type: 'switch', x: 0, y: 0, closed },
      { id: 'R', type: 'resistor', x: 0, y: 0, role: 'R', ohms: 10 },
      { id: 'A', type: 'ammeter', x: 0, y: 0 },
      { id: 'V', type: 'voltmeter', x: 0, y: 0 },
    ],
    wires: pairs.map(([from, to], i) => ({ id: `w${i + 1}`, from, to })),
  };
}

const GOOD = circuitOf(LOOP, true);
/** The loop with the R.b to S.neg wire missing and the switch closed: one error (the loop is open). */
const ONE_ERROR = circuitOf(LOOP.filter((_, i) => i !== 3), true);
/** Ammeter left out of the loop and the voltmeter reversed: two errors. */
const TWO_ERRORS = circuitOf(
  [['S.pos', 'SW.a'], ['SW.b', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.b'], ['V.neg', 'R.a']],
  true,
);

function resultsFor(circuit: Circuit, checkpoint: Checkpoint = 'SWITCH_CLOSE', experiment: ExperimentConfig = ohmsLaw): SplitResults {
  return splitResults(
    evaluate(buildEvaluateInput({ circuit, experiment, taskId: experiment.tasks[0]?.id ?? '', checkpoint, readings: [], answers: [] })),
  );
}

function show(split: SplitResults, extra: Partial<ReturnType<typeof useTutorStore.getState>> = {}) {
  act(() => {
    useTutorStore.setState({
      status: 'results',
      errors: split.errors,
      confirmations: split.confirmations,
      primaryIndex: 0,
      // `selectError` only moves when it knows which circuit the results belong to.
      checkedCircuit: useBenchStore.getState().circuit,
      mood: moodOf(split.errors[0]),
      ...extra,
    });
  });
}

function renderPanel(options: { collapsed?: boolean; reduce?: boolean; experiment?: ExperimentConfig } = {}) {
  useTutorStore.setState({ panelCollapsed: options.collapsed ?? false });
  const view = render(
    <MotionScope reduce={options.reduce ?? false}>
      <AnnouncerProvider>
        <TutorPanel experiment={options.experiment ?? ohmsLaw} />
      </AnnouncerProvider>
    </MotionScope>,
  );
  return view;
}

const panel = () => screen.getByRole('complementary', { name: t('bench.panelTitle') });
const owl = () => panel().querySelector('[data-mood]');
const live = () => screen.getByTestId('live-region');

describe('fixtures', () => {
  it('give the results the tests below rely on', () => {
    expect(resultsFor(GOOD).errors).toEqual([]);
    expect(resultsFor(GOOD).confirmations.length).toBeGreaterThan(0);
    expect(resultsFor(ONE_ERROR).errors.map((r) => r.code)).toEqual(['OPEN_CIRCUIT']);
    expect(resultsFor(TWO_ERRORS).errors.map((r) => r.code)).toEqual(['AMMETER_NOT_IN_SERIES', 'WRONG_POLARITY']);
    expect(resultsFor(TWO_ERRORS).confirmations.length).toBeGreaterThan(0);
  });
});

describe('instructions state', () => {
  it('shows Ollie happy, the bubble line and the task steps as an ordered list, in order', () => {
    renderPanel();
    expect(owl()?.getAttribute('data-mood')).toBe('happy');
    expect(within(panel()).getByText(t('bench.panelEmpty'))).toBeTruthy();
    const list = panel().querySelector('ol');
    expect(list).not.toBeNull();
    const steps = Array.from(list?.querySelectorAll('li') ?? []).map((li) => li.textContent);
    expect(steps).toEqual([1, 2, 3, 4, 5, 6].map((n) => t(`exp.ohms-law.step${n}` as 'exp.ohms-law.step1')));
  });

  it("shows the experiment's first task for a multi-task experiment, from its own keys", () => {
    renderPanel({ experiment: seriesParallel });
    const steps = Array.from(panel().querySelectorAll('ol li')).map((li) => li.textContent);
    expect(steps).toEqual([1, 2, 3, 4, 5].map((n) => t(`exp.series-parallel.series.step${n}` as 'exp.series-parallel.series.step1')));
  });

  it('shows no results sections and no step list once results have arrived', () => {
    renderPanel();
    show(resultsFor(ONE_ERROR));
    expect(panel().querySelector('ol')).toBeNull();
    expect(within(panel()).queryByText(t('bench.panelEmpty'))).toBeNull();
  });
});

describe('results state', () => {
  it('one error: the title as an h3, the explanation, and the How to fix it box', () => {
    renderPanel();
    show(resultsFor(ONE_ERROR));
    const heading = within(panel()).getByRole('heading', { level: 3, name: t('OPEN_CIRCUIT.gap').title });
    expect(heading).toBeTruthy();
    expect(within(panel()).getByText(t('OPEN_CIRCUIT.gap').explain)).toBeTruthy();
    const box = within(panel()).getByTestId('how-to-fix');
    expect(within(box).getByText(t('bench.howToFix'))).toBeTruthy();
    expect(within(box).getByText(t('OPEN_CIRCUIT.gap').fix ?? '')).toBeTruthy();
    expect(box.className).toContain('bg-teal-tint');
    expect(box.className).toContain('border-teal');
    expect(box.querySelector('svg')).not.toBeNull();
    expect(within(panel()).queryByText(t('bench.alsoCheck'))).toBeNull();
    expect(owl()?.getAttribute('data-mood')).toBe('thinking');
  });

  it('several errors: one large card and one chip for each of the others, each chip with an icon', () => {
    renderPanel();
    const first = resultsFor(TWO_ERRORS);
    const third = resultsFor({ components: [], wires: [] }, 'RECORD_READING');
    show({ errors: [...first.errors, ...third.errors], confirmations: [] });
    expect(within(panel()).getAllByRole('heading', { level: 3, name: t('AMMETER_NOT_IN_SERIES').title })).toHaveLength(1);
    expect(within(panel()).getByRole('heading', { level: 3, name: t('bench.alsoCheck') })).toBeTruthy();
    const chips = Array.from(panel().querySelectorAll<HTMLButtonElement>('button[data-variant="chip"]'));
    expect(chips).toHaveLength(2);
    expect(chips.map((chip) => chip.textContent)).toEqual([t('WRONG_POLARITY').title, t('MISSING_COMPONENT', { types: 'x' }).title]);
    for (const chip of chips) expect(chip.querySelector('svg')).not.toBeNull();
    expect(within(panel()).getAllByTestId('how-to-fix')).toHaveLength(1);
  });

  it('clicking a chip makes that error the large card, and the old one becomes a chip', () => {
    renderPanel();
    show(resultsFor(TWO_ERRORS));
    fireEvent.click(within(panel()).getByRole('button', { name: t('WRONG_POLARITY').title }));
    expect(tutor().primaryIndex).toBe(1);
    expect(within(panel()).getByRole('heading', { level: 3, name: t('WRONG_POLARITY').title })).toBeTruthy();
    expect(within(panel()).getByText(t('WRONG_POLARITY').explain)).toBeTruthy();
    expect(within(panel()).getByRole('button', { name: t('AMMETER_NOT_IN_SERIES').title })).toBeTruthy();
  });

  it('moves focus to the new title when a chip is pressed, so it is not lost with the chip', () => {
    renderPanel();
    show(resultsFor(TWO_ERRORS));
    fireEvent.click(within(panel()).getByRole('button', { name: t('WRONG_POLARITY').title }));
    expect(document.activeElement).toBe(within(panel()).getByRole('heading', { level: 3, name: t('WRONG_POLARITY').title }));
  });

  it('confirmations show as check rows under "Going well", beside the errors or alone', () => {
    renderPanel();
    const split = resultsFor(TWO_ERRORS);
    show(split);
    expect(within(panel()).getByRole('heading', { level: 3, name: t('bench.goodStuff') })).toBeTruthy();
    const rows = within(panel()).getAllByRole('listitem').filter((li) => li.className.includes('bg-ok-tint'));
    expect(rows).toHaveLength(split.confirmations.length);
    for (const row of rows) expect(row.querySelector('svg')).not.toBeNull();
    expect(rows.map((row) => row.textContent)).toEqual(split.confirmations.map((r) => t(r.feedbackKey as 'OK_CIRCUIT_COMPLETE').title));
  });

  it('no errors: Ollie happy and only the confirmations', () => {
    renderPanel();
    show(resultsFor(GOOD));
    expect(owl()?.getAttribute('data-mood')).toBe('happy');
    expect(panel().querySelector('h3[tabindex]')).toBeNull();
    expect(within(panel()).queryByTestId('how-to-fix')).toBeNull();
    expect(within(panel()).queryByText(t('bench.alsoCheck'))).toBeNull();
    expect(within(panel()).getByRole('heading', { level: 3, name: t('bench.goodStuff') })).toBeTruthy();
  });
});

describe('text and params', () => {
  it('MISSING_COMPONENT shows the part names joined with a comma', () => {
    renderPanel();
    const lacking = circuitOf([]);
    show(resultsFor({ components: lacking.components.filter((c) => c.type !== 'ammeter' && c.type !== 'voltmeter'), wires: [] }, 'RECORD_READING'));
    expect(within(panel()).getByText(new RegExp(`${t('components.ammeter')}, ${t('components.voltmeter')}\\.`))).toBeTruthy();
  });

  it('feedbackParams maps part types to their names and leaves out lists that are not part types', () => {
    expect(feedbackParams({ types: ['supply', 'ammeter'] })).toEqual({ types: `${t('components.supply')}, ${t('components.ammeter')}` });
    expect(feedbackParams({ need: 5, have: 2 })).toEqual({ need: 5, have: 2 });
    expect(feedbackParams(undefined)).toEqual({});
    // WRONG_POLARITY carries part ids that no text uses; they must not break the panel.
    expect(feedbackParams({ componentIds: ['V', 'A'] })).toEqual({});
    expect(() => t('MISSING_COMPONENT', feedbackParams({ types: ['toaster'] }))).toThrow();
  });

  it('never shows a rule code, a feedback key, a placeholder or the word undefined', () => {
    renderPanel();
    const leaks = [/undefined/i, /\{\w+\}/, /\b[A-Z]{2,}(?:_[A-Z]+)+\b/, /\b(?:bench|exp|components|errorTopics)\.\w/];
    const check = () => {
      // Join text nodes with a space: list items and paragraphs have no separator in textContent,
      // so "...on the bench." and the next step would otherwise read as "bench.Connect".
      const walker = document.createTreeWalker(panel(), NodeFilter.SHOW_TEXT);
      const parts: string[] = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) parts.push(node.textContent ?? '');
      const text = parts.join(' ');
      for (const pattern of leaks) expect(text).not.toMatch(pattern);
    };
    check();
    show(resultsFor(TWO_ERRORS));
    check();
    show(resultsFor({ components: [], wires: [] }, 'RECORD_READING'));
    check();
    show(resultsFor(GOOD));
    check();
  });
});

describe('collapsed strip', () => {
  it('shows Ollie and the Show tips button, 56 px wide, with no dot when there are no errors', () => {
    renderPanel({ collapsed: true });
    expect(panel().getAttribute('data-collapsed')).toBe('true');
    expect(panel().className).toContain('w-14');
    expect(within(panel()).getByRole('button', { name: t('bench.showPanel') })).toBeTruthy();
    expect(within(panel()).queryByRole('img', { name: t('bench.mistakeWaiting') })).toBeNull();
    show(resultsFor(GOOD), { panelCollapsed: true });
    expect(within(panel()).queryByRole('img', { name: t('bench.mistakeWaiting') })).toBeNull();
  });

  it('shows the dot with its accessible name only while errors remain and the panel is collapsed', () => {
    renderPanel({ collapsed: true });
    // A new mistake reopens the panel, so no dot yet; the student then closes it on purpose.
    show(resultsFor(ONE_ERROR), { panelCollapsed: true });
    expect(within(panel()).queryByRole('img', { name: t('bench.mistakeWaiting') })).toBeNull();
    fireEvent.click(within(panel()).getByRole('button', { name: t('bench.hidePanel') }));
    const dot = within(panel()).getByRole('img', { name: t('bench.mistakeWaiting') });
    expect(dot.querySelector('svg')).not.toBeNull();
    fireEvent.click(within(panel()).getByRole('button', { name: t('bench.showPanel') }));
    expect(within(panel()).queryByRole('img', { name: t('bench.mistakeWaiting') })).toBeNull();
    fireEvent.click(within(panel()).getByRole('button', { name: t('bench.hidePanel') }));
    expect(within(panel()).getByRole('img', { name: t('bench.mistakeWaiting') })).toBeTruthy();
  });

  it('a mistake reopens a collapsed panel; a clean result does not; closing it by hand while errors remain sticks', () => {
    renderPanel({ collapsed: true });
    show(resultsFor(GOOD), { panelCollapsed: true });
    expect(panel().getAttribute('data-collapsed')).toBe('true');
    show(resultsFor(ONE_ERROR), { panelCollapsed: true });
    expect(panel().getAttribute('data-collapsed')).toBe('false');
    fireEvent.click(within(panel()).getByRole('button', { name: t('bench.hidePanel') }));
    expect(panel().getAttribute('data-collapsed')).toBe('true');
    expect(within(panel()).getByRole('img', { name: t('bench.mistakeWaiting') })).toBeTruthy();
  });
});

describe('Ollie', () => {
  it('follows the mood in the store', () => {
    renderPanel();
    expect(owl()?.getAttribute('data-mood')).toBe('happy');
    act(() => useTutorStore.setState({ mood: 'thinking' }));
    expect(owl()?.getAttribute('data-mood')).toBe('thinking');
    act(() => useTutorStore.setState({ mood: 'celebrating' }));
    expect(owl()?.getAttribute('data-mood')).toBe('celebrating');
  });

  it('bounces once when the mood changes, and not at all with Reduce motion', () => {
    const normal = renderPanel();
    expect(owl()?.className).not.toContain('animate-owl-bounce');
    act(() => useTutorStore.setState({ mood: 'thinking' }));
    expect(owl()?.className).toContain('animate-owl-bounce');
    normal.unmount();
    resetStores();

    renderPanel({ reduce: true });
    act(() => useTutorStore.setState({ mood: 'thinking' }));
    expect(owl()?.getAttribute('data-mood')).toBe('thinking');
    expect(owl()?.className).not.toContain('animate-owl-bounce');
  });
});

describe('announcement', () => {
  it("says the primary error's title through the polite live region when results arrive", () => {
    renderPanel();
    expect(live().textContent).toBe('');
    show(resultsFor(TWO_ERRORS));
    expect(live().textContent?.trim()).toBe(t('AMMETER_NOT_IN_SERIES').title);
    expect(live().getAttribute('aria-live')).toBe('polite');
    expect(document.querySelector('[aria-live="assertive"], [role="alert"]')).toBeNull();
  });

  it('says nothing for a clean result, and nothing when the panel mounts on old results', () => {
    renderPanel();
    show(resultsFor(GOOD));
    expect(live().textContent).toBe('');
    cleanup();
    show(resultsFor(ONE_ERROR));
    renderPanel();
    expect(live().textContent).toBe('');
  });
});

describe('Esc', () => {
  const LIT = { componentIds: ['A'], wireIds: ['w2'] };

  it('puts the highlight out and keeps the results', () => {
    renderPanel();
    show(resultsFor(ONE_ERROR), { highlight: LIT });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(tutor().highlight).toEqual(NO_HIGHLIGHT);
    expect(tutor().errors).toHaveLength(1);
    expect(within(panel()).getByRole('heading', { level: 3, name: t('OPEN_CIRCUIT.gap').title })).toBeTruthy();
  });

  it('leaves the highlight alone while a wire is being drawn', () => {
    renderPanel();
    show(resultsFor(ONE_ERROR), { highlight: LIT });
    act(() => useBenchStore.setState({ drawing: { from: 'S.pos', method: 'click', pointer: { x: 0, y: 0 } } }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(tutor().highlight).toEqual(LIT);
  });

  it('leaves the highlight alone while a dialog is open, and ignores other keys', () => {
    renderPanel();
    show(resultsFor(ONE_ERROR), { highlight: LIT });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(tutor().highlight).toEqual(LIT);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(tutor().highlight).toEqual(LIT);
    dialog.remove();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(tutor().highlight).toEqual(NO_HIGHLIGHT);
  });
});

describe('keyboard', () => {
  it('chips work with Enter and with Space', () => {
    renderPanel();
    show(resultsFor(TWO_ERRORS));
    fireEvent.keyDown(within(panel()).getByRole('button', { name: t('WRONG_POLARITY').title }), { key: 'Enter' });
    expect(tutor().primaryIndex).toBe(1);
    const back = within(panel()).getByRole('button', { name: t('AMMETER_NOT_IN_SERIES').title });
    fireEvent.keyDown(back, { key: ' ' });
    fireEvent.keyUp(back, { key: ' ' });
    expect(tutor().primaryIndex).toBe(0);
  });

  it('the toggle works with Enter and Space, and focus lands on the button that replaces it', () => {
    renderPanel();
    const hide = within(panel()).getByRole('button', { name: t('bench.hidePanel') });
    hide.focus();
    fireEvent.keyDown(hide, { key: 'Enter' });
    expect(panel().getAttribute('data-collapsed')).toBe('true');
    const show = within(panel()).getByRole('button', { name: t('bench.showPanel') });
    expect(document.activeElement).toBe(show);
    fireEvent.keyDown(show, { key: ' ' });
    fireEvent.keyUp(show, { key: ' ' });
    expect(panel().getAttribute('data-collapsed')).toBe('false');
    expect(document.activeElement).toBe(within(panel()).getByRole('button', { name: t('bench.hidePanel') }));
  });

  it('a panel that opens by itself does not take focus', () => {
    renderPanel({ collapsed: true });
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    show(resultsFor(ONE_ERROR), { panelCollapsed: true });
    expect(panel().getAttribute('data-collapsed')).toBe('false');
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('every control is a real button with a target of at least 44 px', () => {
    renderPanel();
    show(resultsFor(TWO_ERRORS));
    const buttons = Array.from(panel().querySelectorAll('button'));
    expect(buttons.length).toBe(2);
    for (const button of buttons) {
      expect(button.className).toMatch(/\bh-11\b|min-h-\[44px\]/);
      expect(button.getAttribute('tabindex')).not.toBe('-1');
    }
  });
});
