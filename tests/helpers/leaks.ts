import { expect } from 'vitest';
import errorCodes from '../../src/spec/error-codes.json';
import feedbackEn from '../../src/spec/feedback.en.json';
import practiceTasks from '../../src/spec/practice-tasks.json';
import uiEn from '../../src/spec/ui-strings.en.json';

/**
 * Content-safety check (UI_SCREENS, Global behaviour: "Never show an internal code to the student").
 * `expectNoLeaks(container)` fails when the text a student can read, or hear from a screen reader,
 * contains anything meant for the program: a rule code, a feedback or text key, a raw experiment or
 * task id, or the marks of a bug (`[object Object]`, `undefined`, `NaN`).
 */

export type LeakKind = 'rule code' | 'feedback key' | 'text key' | 'raw id' | 'object text' | 'undefined' | 'NaN';

export interface Leak {
  kind: LeakKind;
  /** The offending piece of text, as found. */
  found: string;
}

const experimentFiles = import.meta.glob<{ id: string }>('../../src/spec/experiments/*.json', {
  eager: true,
  import: 'default',
});

const RULE_CODES: readonly string[] = [
  ...errorCodes.errors.map((entry) => entry.code),
  ...errorCodes.ok.map((entry) => entry.code),
];

const RAW_IDS: readonly string[] = [
  ...Object.values(experimentFiles).map((experiment) => experiment.id),
  ...practiceTasks.tasks.map((task) => task.id),
];

/** Every key a student-facing string can be looked up by. Longest first, so `a.b.c` is reported whole. */
function flatten(tree: unknown, prefix: string, into: string[]): void {
  if (typeof tree !== 'object' || tree === null) return;
  for (const [name, value] of Object.entries(tree)) {
    const path = prefix === '' ? name : `${prefix}.${name}`;
    if (typeof value === 'string') into.push(path);
    else flatten(value, path, into);
  }
}

const TEXT_KEYS: readonly string[] = (() => {
  const keys: string[] = [];
  flatten(uiEn, '', keys);
  return keys.filter((key) => !key.startsWith('_')).sort((a, b) => b.length - a.length);
})();

const FEEDBACK_KEYS: readonly string[] = Object.keys(feedbackEn).filter((key) => !key.startsWith('_'));

/** Not preceded or followed by a letter, digit, underscore, dot or hyphen, so only a whole token matches. */
const whole = (source: string) => new RegExp(`(?<![\\w.-])${source}(?![\\w-])`, 'g');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

// Shape rules also catch codes and keys that are not in the specs yet (a typo, a new code).
const CODE_SHAPE = /(?<![\w.-])[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?![\w-])/g;
const FEEDBACK_SHAPE = /(?<![\w.-])[A-Z][A-Z0-9_]*\.[A-Za-z][\w]*(?![\w-])/g;

function collect(text: string, pattern: RegExp, kind: LeakKind, into: Leak[]): void {
  for (const match of text.matchAll(pattern)) into.push({ kind, found: match[0] });
}

/** Everything wrong with a piece of text. Empty means clean. Exported so the helper itself can be tested. */
export function findLeaks(text: string): Leak[] {
  const leaks: Leak[] = [];
  for (const code of RULE_CODES) collect(text, whole(escape(code)), 'rule code', leaks);
  collect(text, CODE_SHAPE, 'rule code', leaks);
  for (const key of FEEDBACK_KEYS) collect(text, whole(escape(key)), 'feedback key', leaks);
  collect(text, FEEDBACK_SHAPE, 'feedback key', leaks);
  for (const key of TEXT_KEYS) collect(text, whole(escape(key)), 'text key', leaks);
  for (const id of RAW_IDS) collect(text, whole(escape(id)), 'raw id', leaks);
  collect(text, /\[object \w+\]/g, 'object text', leaks);
  collect(text, /\bundefined\b/gi, 'undefined', leaks);
  collect(text, /\bNaN\b/g, 'NaN', leaks);

  // A piece of text can match by more than one rule; report each distinct (kind, text) once.
  const seen = new Set<string>();
  return leaks.filter((leak) => {
    const id = `${leak.kind}|${leak.found}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Attributes a screen reader reads out. */
const SPOKEN_ATTRIBUTES = ['aria-label', 'aria-description', 'title', 'alt', 'placeholder'] as const;

/**
 * The visible text of a container, one text node per line (so two neighbouring elements never
 * glue into one word), followed by the spoken attributes of every element inside it.
 */
export function readableText(container: Element): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent !== null && ['SCRIPT', 'STYLE'].includes(parent.tagName)) continue;
    parts.push(node.textContent ?? '');
  }
  for (const element of [container, ...Array.from(container.querySelectorAll('*'))]) {
    for (const name of SPOKEN_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value !== null) parts.push(value);
    }
  }
  return parts.join('\n');
}

/** Fails when anything the student can read in `container` is meant for the program, not for them. */
export function expectNoLeaks(container: Element): void {
  expect(findLeaks(readableText(container))).toEqual([]);
}
