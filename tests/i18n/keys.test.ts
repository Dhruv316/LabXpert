import { describe, expect, it } from 'vitest';
import errorCodes from '../../src/spec/error-codes.json';
import feedbackEn from '../../src/spec/feedback.en.json';
import practiceTasks from '../../src/spec/practice-tasks.json';
import uiEn from '../../src/spec/ui-strings.en.json';
import {
  allJsonStrings,
  analyseKeys,
  flattenKeys,
  scanFile,
  type AllowedCall,
  type KeyInputs,
} from '../helpers/text-keys';

// CLAUDE.md rule 4 and the language files: every key the source asks for exists, and every key in the
// English files is asked for somewhere. Both lists below are short on purpose; each entry says why.

const sourceFiles = import.meta.glob('../../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const sources = Object.fromEntries(Object.entries(sourceFiles).map(([path, source]) => [path.replace('../../', ''), source]));

const experimentFiles = import.meta.glob('../../src/spec/experiments/*.json', { import: 'default', eager: true });
const specStrings = new Set<string>();
for (const value of [errorCodes, practiceTasks, ...Object.values(experimentFiles)]) allJsonStrings(value, specStrings);

const uiKeys = flattenKeys(uiEn);
const feedbackKeys = Object.keys(feedbackEn).filter((key) => key !== '_note');

/** A t() call whose key is only known at run time, with no isUiKey/isFeedbackKey check, and why it is safe. */
const ALLOWED_CALLS: readonly AllowedCall[] = [
  {
    file: 'src/ui/bench/names.ts',
    arg: 'TERMINAL_WORD[name]',
    reason: 'TERMINAL_WORD is a map whose values are typed UiKey, so tsc checks every key in it.',
  },
  {
    file: 'src/ui/shell/LanguageSelect.tsx',
    arg: 'choice.name',
    reason: 'LanguageChoice.name is typed UiKey, so tsc checks every key in CHOICES.',
  },
];

/** Strings that exist in the spec but that no screen uses yet. Not deleted, because spec files are not edited. */
const ALLOWED_UNUSED = [
  { key: 'common.back', reason: 'In the spec, but no screen shows a plain "Back" button; the result screen uses result.back instead.' },
  { key: 'bench.needsOpenSwitchHint', reason: 'In the spec, but the bench never shows a hint about opening the switch before changing wires.' },
] as const;

const inputs: KeyInputs = {
  sources,
  uiKeys,
  feedbackKeys,
  specStrings,
  allowedCalls: ALLOWED_CALLS,
  allowedUnused: ALLOWED_UNUSED,
  loaderDir: 'src/i18n/',
};
const report = analyseKeys(inputs);

describe('Text keys used by the source', () => {
  it('reads the whole source tree and both language files', () => {
    expect(report.counts.files).toBeGreaterThan(150);
    expect(report.counts.literalKeys).toBeGreaterThan(100);
    expect(report.counts.keys).toBe(uiKeys.length + feedbackKeys.length);
    expect(feedbackKeys.length).toBeGreaterThan(20);
    expect(uiKeys.length).toBeGreaterThan(150);
  });

  it('every literal key in a t(), isUiKey() or isFeedbackKey() call exists in a language file', () => {
    expect(report.missing).toEqual([]);
  });

  it('every t() whose key is built or passed in is checked: guarded, typed (allow-list) or a known prefix', () => {
    expect(report.unchecked).toEqual([]);
    expect(report.emptyPrefixes).toEqual([]);
    expect(report.counts.computedCalls).toBeGreaterThan(10);
  });

  it('every key in the English feedback and ui-strings files is used, or is on the short allow-list', () => {
    expect(report.unused).toEqual([]);
  });

  it('keeps both allow-lists honest: no entry is stale, and each has a reason', () => {
    expect(report.staleCalls).toEqual([]);
    expect(report.staleUnused).toEqual([]);
    for (const entry of [...ALLOWED_CALLS, ...ALLOWED_UNUSED]) expect(entry.reason.length).toBeGreaterThan(20);
    expect(ALLOWED_UNUSED.length).toBeLessThanOrEqual(5);
  });
});

describe('The key scan itself', () => {
  const small = (source: string, allowedCalls: readonly AllowedCall[] = []) =>
    analyseKeys({
      sources: { 'src/ui/A.tsx': source },
      uiKeys: ['a.one', 'a.two', 'group.x', 'group.y', 'dead.key'],
      feedbackKeys: ['CODE.gap'],
      specStrings: new Set(),
      allowedCalls,
      allowedUnused: [],
      loaderDir: 'src/i18n/',
    });

  it('reads the literal key, both keys of a choice, and a template prefix', () => {
    const scan = scanFile("t('a.one'); t(ok ? 'a.two' : 'CODE.gap'); t(`group.${n}`);", 'x.ts');
    expect(scan.calls.map((call) => call.keys)).toEqual([['a.one'], ['a.two', 'CODE.gap'], []]);
    expect(scan.calls[2]?.prefix).toBe('group.');
  });

  it('reports a key that is in no file', () => {
    expect(small("t('a.nope');").missing).toEqual(['src/ui/A.tsx:1 a.nope']);
  });

  it('reports a key that nothing uses, and counts a key under a used template prefix as used', () => {
    const result = small("t('a.one'); t('a.two'); t('CODE.gap'); t(`group.${n}`);");
    expect(result.unused).toEqual(['dead.key']);
  });

  it('reports a computed key with no guard, and accepts a guard or an allow-list entry', () => {
    expect(small('t(key);').unchecked).toEqual(['src/ui/A.tsx:1 t(key)']);
    expect(small('if (isUiKey(key)) t(key);').unchecked).toEqual([]);
    expect(small('t(key);', [{ file: 'src/ui/A.tsx', arg: 'key', reason: 'typed' }]).unchecked).toEqual([]);
  });

  it('reports a stale allow-list entry and a template prefix with no keys', () => {
    expect(small("t('a.one');", [{ file: 'src/ui/A.tsx', arg: 'key', reason: 'typed' }]).staleCalls).toEqual(['src/ui/A.tsx key']);
    expect(small('t(`nothing.${n}`);').emptyPrefixes).toEqual(['src/ui/A.tsx:1 nothing.']);
  });
});
