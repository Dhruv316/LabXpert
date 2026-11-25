import { describe, expect, it } from 'vitest';
import kitStrings from '../../kit/spec/ui-strings.en.json?raw';
import srcStrings from '../../src/spec/ui-strings.en.json?raw';

// The 12 wiring keys the user approved in Part 9, word for word.
const WIRING_KEYS = {
  terminalLabel: '{part}, {terminal} terminal',
  terminalPos: 'positive',
  terminalNeg: 'negative',
  terminalA: 'left',
  terminalB: 'right',
  wireLabel: 'Wire from {from} to {to}',
  wireStarted: 'Wire started at {terminal}. Choose another terminal, or press Escape to cancel.',
  wireConnected: 'Wire connected: {from} to {to}.',
  wireCancelled: 'Wire cancelled.',
  wireRemoved: 'Wire removed.',
  wireDuplicate: 'Those terminals are already joined by a wire.',
  wireSameTerminal: 'A wire needs two different terminals.',
};

// The four keys the user approved in Part 10B-1, word for word.
const SUPPLY_KEYS = {
  supplyDown: 'Lower the voltage by 1 V',
  supplyUp: 'Raise the voltage by 1 V',
  supplyValue: '{volts} V',
  supplyAnnounce: 'Supply voltage {volts} V.',
};

// The three keys the user approved in Part 10B-2, word for word.
const RESISTOR_KEYS = {
  resistanceValue: '{ohms} Ω',
  resistanceAnnounce: 'Resistance {ohms} Ω.',
  valueLocked: 'This value is fixed for this task.',
};

// The three keys the user approved in Part 10C-1, word for word.
const METER_KEYS = {
  meterAmps: '{value} A',
  meterVolts: '{value} V',
  meterReading: '{meter}: {value}',
};

// The two keys the user approved in Part 11B, word for word.
const TUTOR_KEYS = {
  alsoCheck: 'Also check',
  mistakeWaiting: 'A mistake is waiting',
};

// The key the user approved in Part 12C, word for word.
const ANSWER_KEYS = {
  answerNeedNumber: 'Type a number first.',
};

// The key the user approved in Part 14B and the two approved in Part 14C, word for word.
const PRACTICE_KEYS = {
  progress: 'Progress: {have} of {need}',
  calcSeries: 'Two resistors in series: {r1} Ω and {r2} Ω',
  calcParallel: 'Two resistors in parallel: {r1} Ω and {r2} Ω',
};

describe('ui-strings.en.json copies', () => {
  it('kit/spec and src/spec are identical', () => {
    expect(srcStrings).toBe(kitStrings);
  });

  it('both copies hold the 12 approved wiring keys under bench, exactly as written', () => {
    for (const raw of [kitStrings, srcStrings]) {
      const bench = (JSON.parse(raw) as { bench: Record<string, string> }).bench;
      for (const [key, text] of Object.entries(WIRING_KEYS)) expect(bench[key]).toBe(text);
    }
  });

  it('both copies hold the 4 approved supply keys under bench, exactly as written', () => {
    for (const raw of [kitStrings, srcStrings]) {
      const bench = (JSON.parse(raw) as { bench: Record<string, string> }).bench;
      for (const [key, text] of Object.entries(SUPPLY_KEYS)) expect(bench[key]).toBe(text);
    }
  });

  it('the switch reuses the existing keys: no new switch key was added', () => {
    const bench = (JSON.parse(srcStrings) as { bench: Record<string, string> }).bench;
    expect(Object.keys(bench).filter((key) => key.startsWith('switch')).sort()).toEqual(['switchClosed', 'switchOpen']);
  });

  it('both copies hold the 3 approved resistor keys under bench, exactly as written, and keep bench.resistance', () => {
    for (const raw of [kitStrings, srcStrings]) {
      const bench = (JSON.parse(raw) as { bench: Record<string, string> }).bench;
      for (const [key, text] of Object.entries(RESISTOR_KEYS)) expect(bench[key]).toBe(text);
      expect(bench.resistance).toBe('Resistance');
    }
  });

  it('both copies hold the 3 approved meter keys under bench, exactly as written', () => {
    for (const raw of [kitStrings, srcStrings]) {
      const bench = (JSON.parse(raw) as { bench: Record<string, string> }).bench;
      for (const [key, text] of Object.entries(METER_KEYS)) expect(bench[key]).toBe(text);
    }
  });

  it('both copies hold the 2 approved tutor keys under bench, exactly as written', () => {
    for (const raw of [kitStrings, srcStrings]) {
      const bench = (JSON.parse(raw) as { bench: Record<string, string> }).bench;
      for (const [key, text] of Object.entries(TUTOR_KEYS)) expect(bench[key]).toBe(text);
    }
  });

  it('both copies hold the approved answer key under bench, exactly as written', () => {
    for (const raw of [kitStrings, srcStrings]) {
      const bench = (JSON.parse(raw) as { bench: Record<string, string> }).bench;
      for (const [key, text] of Object.entries(ANSWER_KEYS)) expect(bench[key]).toBe(text);
    }
  });

  it('both copies hold the approved practice keys (progress, calcSeries, calcParallel), exactly as written, and the other practice keys are unchanged', () => {
    for (const raw of [kitStrings, srcStrings]) {
      const practice = (JSON.parse(raw) as { practice: Record<string, string> }).practice;
      for (const [key, text] of Object.entries(PRACTICE_KEYS)) expect(practice[key]).toBe(text);
      expect(Object.keys(practice)).toEqual([
        'bannerPicked', 'bannerExtension', 'goalLabel', 'done', 'doneClean', 'doneNotClean',
        'calcPrompt', 'calcAnswer', 'calcCorrect', 'calcWrong', 'calcSeries', 'calcParallel', 'exit', 'progress',
      ]);
    }
  });
});
