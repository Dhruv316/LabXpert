import type { FeedbackEntry, FeedbackFile } from '../model/types';
import feedbackEn from '../spec/feedback.en.json';
import uiEn from '../spec/ui-strings.en.json';
import type { Language, UiStrings } from './types';

export const DEFAULT_LANGUAGE: Language = 'en';

export interface Bundle {
  /** Flat map: keys may contain dots and are matched whole. */
  feedback: FeedbackFile;
  /** Nested tree: keys are dot-joined paths. */
  ui: UiStrings;
}

const OWL_MOODS: readonly FeedbackEntry['owl'][] = ['happy', 'thinking', 'celebrating'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toEntry(key: string, raw: unknown): FeedbackEntry {
  if (!isRecord(raw)) throw new Error(`Feedback entry is not an object: ${key}`);
  const { title, explain, fix, owl } = raw;
  if (typeof title !== 'string' || typeof explain !== 'string') {
    throw new Error(`Feedback entry needs title and explain: ${key}`);
  }
  if (fix !== undefined && typeof fix !== 'string') {
    throw new Error(`Feedback entry has a non-text fix: ${key}`);
  }
  const mood = OWL_MOODS.find((m) => m === owl);
  if (mood === undefined) throw new Error(`Feedback entry has an unknown owl mood: ${key}`);
  return fix === undefined ? { title, explain, owl: mood } : { title, explain, fix, owl: mood };
}

/** Checks the file's shape once at load, so FeedbackEntry is true at run time and not just in types. */
function parseFeedback(raw: Record<string, unknown>): FeedbackFile {
  const file: FeedbackFile = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === '_note') continue;
    file[key] = toEntry(key, value);
  }
  return file;
}

function stripNote<T extends { _note: string }>(file: T): Omit<T, '_note'> {
  const { _note: _ignored, ...rest } = file;
  return rest;
}

/** The one way a pair of language files becomes a Bundle, so every language is checked the same way. */
export function makeBundle(feedback: Record<string, unknown>, ui: typeof uiEn): Bundle {
  return { feedback: parseFeedback(feedback), ui: stripNote(ui) };
}

/** One entry per loaded language. A new language is one new entry plus its two files. */
export const BUNDLES: Readonly<Record<Language, Bundle>> = {
  en: makeBundle(feedbackEn, uiEn),
};
