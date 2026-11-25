import type { FeedbackEntry } from '../model/types';
import { BUNDLES, DEFAULT_LANGUAGE } from './bundles';
import { UnknownTextKeyError } from './errors';
import { fillPlaceholders } from './fill';
import { lookup } from './lookup';
import type { FeedbackKey, Language, Params, UiKey } from './types';

export { DEFAULT_LANGUAGE } from './bundles';
export { MissingParamError, UnknownTextKeyError } from './errors';
export { fillPlaceholders } from './fill';
export type { FeedbackKey, Language, Params, UiKey } from './types';

let activeLanguage: Language = DEFAULT_LANGUAGE;

/** The language t() uses when a caller names none. The app store keeps this in step with its `language`. */
export function setActiveLanguage(language: Language): void {
  activeLanguage = language;
}

/** The language t() uses when a caller names none, for code that reads a bundle directly. */
export function getActiveLanguage(): Language {
  return activeLanguage;
}

/** A feedback key returns a FeedbackEntry; a UI path returns a string. The two cannot be mixed up. */
export function t(key: FeedbackKey, params?: Params, lang?: Language): FeedbackEntry;
export function t(key: UiKey, params?: Params, lang?: Language): string;
export function t(
  key: string,
  params: Params = {},
  lang: Language = activeLanguage,
): FeedbackEntry | string {
  const found = lookup(BUNDLES[lang], key);
  if (found === undefined) throw new UnknownTextKeyError(key);
  if (typeof found === 'string') return fillPlaceholders(found, params);

  const filled = {
    title: fillPlaceholders(found.title, params),
    explain: fillPlaceholders(found.explain, params),
    owl: found.owl,
  };
  return found.fix === undefined ? filled : { ...filled, fix: fillPlaceholders(found.fix, params) };
}

/** For keys that arrive as plain strings (e.g. RuleResult.feedbackKey). Narrows so t() can be called. */
export function isFeedbackKey(key: string, lang: Language = activeLanguage): key is FeedbackKey {
  return Object.hasOwn(BUNDLES[lang].feedback, key);
}

export function isUiKey(key: string, lang: Language = activeLanguage): key is UiKey {
  return !isFeedbackKey(key, lang) && typeof lookup(BUNDLES[lang], key) === 'string';
}
