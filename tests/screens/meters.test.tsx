import { disposeTestDbs, makeTestDb, renderAppAt, resetAppState, seedUser } from '../app/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { LabXpertDB } from '../../src/db/database';
import { t } from '../../src/i18n';
import type { Circuit, CircuitComponent, TerminalRef } from '../../src/model/types';
import tokens from '../../src/spec/design-tokens.json';
import { flushBenchWrites, useBenchStore } from '../../src/state';
import { BENCH_VIEW } from '../../src/bench/catalog';
import { labelBoxHeight } from '../../src/bench/labels';
import { TERMINAL_OFFSETS } from '../../src/bench/wires';

beforeEach(resetAppState);
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
  await flushBenchWrites();
  await disposeTestDbs();
  resetAppState();
});

const TITLE = t('exp.ohms-law.title');
const MINUS = '\u2212';
const NOT_NEGATIVE_ZERO = /[-\u2212]0\.00/;

function partEl(id: string): SVGGElement {
  const found = document.querySelector<SVGGElement>(`[data-part-id="${id}"]`);
  if (found === null) throw new Error(`no part ${id}`);
  return found;
}
function chipOf(id: string): Element {
  const found = document.querySelector(`[data-part-chip="${id}"]`);
  if (found === null) throw new Error(`no label for ${id}`);
  return found;
}
const needle = (id: string): SVGGElement => {
  const found = partEl(id).querySelector<SVGGElement>('[data-needle]');
  if (found === null) throw new Error(`no needle on ${id}`);
  return found;
};
const digits = (id: string): string => chipOf(id).textContent ?? '';
const description = (id: string): string => partEl(id).querySelector('desc')?.textContent ?? '';
const amps = (value: string) => t('bench.meterAmps', { value });
const volts = (value: string) => t('bench.meterVolts', { value });
const reading = (meter: 'ammeter' | 'voltmeter', value: string) =>
  t('bench.meterReading', { meter: t(`components.${meter}`), value: meter === 'ammeter' ? amps(value) : volts(value) });
const raise = () => screen.getByRole<HTMLButtonElement>('button', { name: t('bench.supplyUp') });

// Supply, switch, resistor (10 ohm), ammeter and voltmeter. By hand: 6 V / 10 ohm = 0.6 A, and the resistor drops all 6 V.
function parts(options: { volts?: number; closed?: boolean } = {}): CircuitComponent[] {
  return [
    { id: 'S', type: 'supply', x: 40, y: 40, voltage: options.volts ?? 6 },
    { id: 'SW', type: 'switch', x: 300, y: 40, closed: options.closed ?? true },
    { id: 'R', type: 'resistor', x: 500, y: 40, role: 'R', ohms: 10 },
    { id: 'A', type: 'ammeter', x: 700, y: 40 },
    { id: 'V', type: 'voltmeter', x: 900, y: 40 },
  ];
}
const LOOP: [TerminalRef, TerminalRef][] = [
  ['S.pos', 'SW.a'], ['SW.b', 'A.pos'], ['A.neg', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.a'], ['V.neg', 'R.b'],
];
const REVERSED: [TerminalRef, TerminalRef][] = [
  ['S.pos', 'SW.a'], ['SW.b', 'A.neg'], ['A.pos', 'R.a'], ['R.b', 'S.neg'], ['V.pos', 'R.b'], ['V.neg', 'R.a'],
];
const circuitOf = (components: CircuitComponent[], wires: [TerminalRef, TerminalRef][]): Circuit => ({
  components,
  wires: wires.map(([from, to], index) => ({ id: `w${index + 1}`, from, to })),
});

/** Opens the bench, then puts the circuit on it (the bench is open, so both meters draw for the first time here). */
async function openWith(db: LabXpertDB, circuit: Circuit) {
  await seedUser(db, 'Asha');
  renderAppAt(db, '#/experiment/ohms-law');
  await screen.findByRole('group', { name: TITLE });
  useBenchStore.setState({ circuit });
  await waitFor(() => expect(document.querySelector('[data-part-id="V"]')).not.toBeNull());
}

function pretendReducedMotion() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('Live meters: the numbers', () => {
  it('a closed series loop shows 0.60 A and 6.00 V', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), LOOP));
    expect(digits('A')).toBe(amps('0.60'));
    expect(digits('V')).toBe(volts('6.00'));
  });

  it('changing the supply changes both: 8 V gives 0.80 A and 8.00 V', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), LOOP));
    fireEvent.click(raise());
    await waitFor(() => expect(digits('A')).toBe(amps('0.70')));
    fireEvent.click(raise());
    await waitFor(() => expect(digits('A')).toBe(amps('0.80')));
    expect(digits('V')).toBe(volts('8.00'));
  });

  it('an open switch shows 0.00 on both', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts({ closed: false }), LOOP));
    expect(digits('A')).toBe(amps('0.00'));
    expect(digits('V')).toBe(volts('0.00'));
  });

  it('an unconnected meter shows 0.00 while the connected one keeps reading', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), LOOP.slice(0, 4)));
    expect(digits('A')).toBe(amps('0.60'));
    expect(digits('V')).toBe(volts('0.00'));
  });

  it('meters on a bench with no wires at all show 0.00', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), []));
    expect(digits('A')).toBe(amps('0.00'));
    expect(digits('V')).toBe(volts('0.00'));
  });

  it('a reversed meter shows a negative value and its needle stops at the clamp', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), REVERSED));
    expect(digits('A')).toBe(amps(`${MINUS}0.60`));
    expect(digits('V')).toBe(volts(`${MINUS}6.00`));
    // -60 + 120 * (-0.6 / 3) = -84 and -60 + 120 * (-6 / 15) = -108, both stopped at -75
    expect(needle('A').getAttribute('data-needle-angle')).toBe('-75');
    expect(needle('V').getAttribute('data-needle-angle')).toBe('-75');
  });

  it('never shows -0.00: a reversed circuit at 0 V reads plain 0.00', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts({ volts: 0 }), REVERSED));
    expect(digits('A')).toBe(amps('0.00'));
    expect(digits('V')).toBe(volts('0.00'));
    expect(document.body.textContent ?? '').not.toMatch(NOT_NEGATIVE_ZERO);
  });
});

describe('Live meters: the needles', () => {
  it('the needle angle follows the reading', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), LOOP));
    // -60 + 120 * 0.6 / 3 = -36 and -60 + 120 * 6 / 15 = -12
    expect(needle('A').getAttribute('data-needle-angle')).toBe('-36');
    expect(needle('A').style.transform).toBe('rotate(-36deg)');
    expect(needle('V').getAttribute('data-needle-angle')).toBe('-12');
    fireEvent.click(raise());
    await waitFor(() => expect(needle('A').getAttribute('data-needle-angle')).toBe('-32'));
    expect(needle('V').getAttribute('data-needle-angle')).toBe('-4');
  });

  it('rests at the zero mark (-60) when nothing flows', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts({ closed: false }), LOOP));
    expect(needle('A').getAttribute('data-needle-angle')).toBe('-60');
    expect(needle('V').getAttribute('data-needle-angle')).toBe('-60');
  });

  it('does not animate on first draw, then swings in the needle duration with the easing token', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), LOOP));
    expect(needle('A').style.transition).toBe('none');
    expect(needle('V').style.transition).toBe('none');
    fireEvent.click(raise());
    await waitFor(() => expect(needle('A').getAttribute('data-needle-angle')).toBe('-32'));
    expect(needle('A').style.transition).toContain(`${tokens.motion.needle}ms`);
    expect(needle('A').style.transition).toContain(tokens.motion.easing);
  });

  it('jumps to the value with the OS Reduce motion preference on', async () => {
    const db = await makeTestDb();
    pretendReducedMotion();
    await openWith(db, circuitOf(parts(), LOOP));
    fireEvent.click(raise());
    await waitFor(() => expect(needle('A').getAttribute('data-needle-angle')).toBe('-32'));
    expect(needle('A').style.transition).toBe('none');
    expect(needle('V').style.transition).toBe('none');
  });

  it('jumps to the value with the app’s Reduce motion switch on', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), LOOP));
    fireEvent.click(screen.getByRole('switch', { name: t('common.reduceMotion') }));
    await waitFor(() => expect(document.documentElement.dataset.reduceMotion).toBe('true'));
    fireEvent.click(raise());
    await waitFor(() => expect(needle('A').getAttribute('data-needle-angle')).toBe('-32'));
    expect(needle('A').style.transition).toBe('none');
  });
});

describe('Live meters: text for assistive tech', () => {
  it('each meter is described as "name: value unit" from the strings', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), LOOP));
    expect(description('A')).toBe(reading('ammeter', '0.60'));
    expect(description('V')).toBe(reading('voltmeter', '6.00'));
    for (const id of ['A', 'V']) {
      const part = partEl(id);
      const target = part.querySelector('desc');
      expect(part.getAttribute('aria-describedby')).toBe(target?.getAttribute('id'));
    }
  });

  it('keeps each part’s name, hides the drawn digits, and is not a live region', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), LOOP));
    expect(screen.getByRole('button', { name: t('components.ammeter') })).toBe(partEl('A'));
    expect(screen.getByRole('button', { name: t('components.voltmeter') })).toBe(partEl('V'));
    expect(chipOf('A').closest('[aria-hidden="true"]')).not.toBeNull();
    for (const id of ['A', 'V']) expect(partEl(id).closest('[aria-live]')).toBeNull();
  });

  it('does not announce a change in the reading', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), LOOP));
    fireEvent.click(raise());
    await waitFor(() => expect(digits('A')).toBe(amps('0.70')));
    const spoken = (screen.getByTestId('live-region').textContent ?? '').replace(/\u00a0/g, '');
    expect(spoken).not.toContain(t('components.ammeter'));
    expect(spoken).not.toContain('0.70');
  });

  it('follows the reading in its text, and a reversed meter says its minus sign', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), REVERSED));
    expect(description('A')).toBe(reading('ammeter', `${MINUS}0.60`));
    expect(description('V')).toBe(reading('voltmeter', `${MINUS}6.00`));
  });
});

describe('Live meters: layout and reload', () => {
  // The test bench has no measured size, so the scene is drawn 1:1 (1100 × 676 px). A meter label needs 18 px of
  // gap plus its box above the meter's top edge, so the meters sit low enough on the mat for that to fit.
  const LOW = 200;
  const lowMeters = (): CircuitComponent[] =>
    parts().map((part) => (part.type === 'ammeter' || part.type === 'voltmeter' ? { ...part, y: LOW } : part));

  /** Whether the label's box clears every terminal's press circle of this meter (layer px, scene at 1:1). */
  function clearOfTerminals(id: string, type: 'ammeter' | 'voltmeter', top: number): boolean {
    const chip = chipOf(id) as HTMLElement;
    const fontPx = Number.parseFloat(chip.style.fontSize);
    const height = labelBoxHeight(fontPx);
    const box = chip.style.top !== ''
      ? { top: Number.parseFloat(chip.style.top), bottom: Number.parseFloat(chip.style.top) + height }
      : { top: BENCH_VIEW.height - Number.parseFloat(chip.style.bottom) - height, bottom: BENCH_VIEW.height - Number.parseFloat(chip.style.bottom) };
    return Object.values(TERMINAL_OFFSETS[type]).every((terminal) => {
      if (terminal === undefined) return true;
      const centre = top + terminal.y;
      return box.bottom <= centre - tokens.terminal.hitRadius || box.top >= centre + tokens.terminal.hitRadius;
    });
  }

  it('the digits are a label above the meter, never inside its picture, so they cannot sit on the posts', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(lowMeters(), LOOP));
    for (const [id, type] of [['A', 'ammeter'], ['V', 'voltmeter']] as const) {
      const chip = chipOf(id) as HTMLElement;
      expect(chip.getAttribute('data-edge')).toBe('above');
      expect(partEl(id).contains(chip)).toBe(false);
      expect(Number.parseFloat(chip.style.fontSize)).toBeGreaterThanOrEqual(14);
      expect(clearOfTerminals(id, type, LOW)).toBe(true);
    }
  });

  it('a meter near the top edge has no room above, so its digits go below the meter, still clear of its posts', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), LOOP)); // meters at y = 40: less than the label needs above
    for (const [id, type] of [['A', 'ammeter'], ['V', 'voltmeter']] as const) {
      const chip = chipOf(id) as HTMLElement;
      expect(chip.getAttribute('data-edge')).toBe('below');
      expect(partEl(id).contains(chip)).toBe(false);
      expect(Number.parseFloat(chip.style.fontSize)).toBeGreaterThanOrEqual(14);
      expect(clearOfTerminals(id, type, 40)).toBe(true);
    }
  });

  it('shows the right values and needle after a reload, with nothing animating', async () => {
    const db = await makeTestDb();
    await openWith(db, circuitOf(parts(), LOOP));
    // A supply change saves the whole circuit, so the loop survives the reload.
    fireEvent.click(raise());
    await waitFor(() => expect(digits('A')).toBe(amps('0.70')));
    await flushBenchWrites();
    cleanup();
    resetAppState();
    renderAppAt(db, '#/experiment/ohms-law');
    await screen.findByRole('group', { name: TITLE });
    await waitFor(() => expect(document.querySelector('[data-part-id="V"]')).not.toBeNull());
    expect(digits('A')).toBe(amps('0.70'));
    expect(digits('V')).toBe(volts('7.00'));
    expect(needle('A').getAttribute('data-needle-angle')).toBe('-32');
    expect(needle('V').getAttribute('data-needle-angle')).toBe('-4');
    expect(needle('A').style.transition).toBe('none');
    expect(needle('V').style.transition).toBe('none');
    expect(document.body.textContent ?? '').not.toMatch(NOT_NEGATIVE_ZERO);
  });
});
