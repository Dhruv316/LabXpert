import { describe, expect, expectTypeOf, it } from 'vitest';
import type { FeedbackEntry } from '../../src/model/types';
import feedbackEn from '../../src/spec/feedback.en.json';
import uiEn from '../../src/spec/ui-strings.en.json';
import {
  MissingParamError,
  UnknownTextKeyError,
  fillPlaceholders,
  isFeedbackKey,
  isUiKey,
  t,
  type FeedbackKey,
} from '../../src/i18n';

describe('t(): flat feedback keys', () => {
  it('returns the FeedbackEntry for a key that contains a dot', () => {
    const entry = t('OPEN_CIRCUIT.gap');
    expect(entry).toEqual(feedbackEn['OPEN_CIRCUIT.gap']);
    expectTypeOf(entry).toEqualTypeOf<FeedbackEntry>();
  });

  it('returns the FeedbackEntry for a key without a dot, and omits fix when the file has none', () => {
    expect(t('SHORT_CIRCUIT')).toEqual(feedbackEn.SHORT_CIRCUIT);
    expect('fix' in t('OK_ANSWER')).toBe(false);
  });
});

describe('t(): nested UI paths', () => {
  it('returns a string for a nested path', () => {
    const title = t('exp.ohms-law.title');
    expect(title).toBe(uiEn.exp['ohms-law'].title);
    expectTypeOf(title).toEqualTypeOf<string>();
  });

  it('works for a one-level path', () => {
    expect(t('app.name')).toBe(uiEn.app.name);
  });
});

describe('t(): placeholders', () => {
  it('fills have and need in a feedback entry', () => {
    const entry = t('MISSING_READING', { have: 2, need: 5 });
    expect(entry.explain).toBe(
      feedbackEn.MISSING_READING.explain.replace('{need}', '5').replace('{have}', '2'),
    );
    expect(entry.explain).not.toMatch(/[{}]/);
    expect(entry.title).toBe(feedbackEn.MISSING_READING.title);
  });

  it('fills a string value in a UI string', () => {
    expect(t('picker.hello', { name: 'Asha' })).toBe(uiEn.picker.hello.replace('{name}', 'Asha'));
  });

  it('fills every occurrence of a repeated placeholder', () => {
    expect(fillPlaceholders('{a} then {b} then {a}', { a: 'x', b: 7 })).toBe('x then 7 then x');
  });

  it('ignores params the text does not use', () => {
    expect(t('app.name', { unused: 1 })).toBe(uiEn.app.name);
  });

  it('throws when a placeholder has no value', () => {
    expect(() => t('MISSING_READING', { have: 2 })).toThrow(MissingParamError);
    expect(() => t('picker.hello')).toThrow(MissingParamError);
  });
});

describe('t(): unknown keys', () => {
  // Keys that arrive as plain strings must be narrowed; these casts simulate a bad runtime key.
  const bad = (key: string) => key as FeedbackKey;

  it('throws UnknownTextKeyError and names the key', () => {
    expect(() => t(bad('NOT_A_KEY'))).toThrow(UnknownTextKeyError);
    expect(() => t(bad('NOT_A_KEY'))).toThrow('NOT_A_KEY');
  });

  it('rejects a branch of the UI tree, the note field and inherited object properties', () => {
    for (const key of ['exp.ohms-law', 'exp', '_note', 'constructor', '__proto__', 'app.name.extra', '']) {
      expect(() => t(bad(key))).toThrow(UnknownTextKeyError);
    }
  });

  it('lets callers narrow a plain string first', () => {
    const fromRule: string = 'OPEN_CIRCUIT.gap';
    expect(isFeedbackKey(fromRule)).toBe(true);
    expect(isFeedbackKey('exp.ohms-law.title')).toBe(false);
    expect(isUiKey('exp.ohms-law.title')).toBe(true);
    expect(isUiKey('OPEN_CIRCUIT.gap')).toBe(false);
    expect(isFeedbackKey('NOT_A_KEY')).toBe(false);
    expect(isUiKey('exp.ohms-law')).toBe(false);
  });
});

describe('t(): language parameter', () => {
  it('defaults to en and accepts en explicitly', () => {
    expect(t('app.name', undefined, 'en')).toBe(t('app.name'));
  });
});
