// What the Result screen shows, worked out from saved records. Pure: no React, no database.
// All words come from the language file through the i18n layer; this file only picks keys.
import errorCodes from '../../spec/error-codes.json';
import type { AttemptConfirmation, AttemptError } from '../../db/history';
import { BUNDLES } from '../../i18n/bundles';
import { fillPlaceholders, getActiveLanguage, isFeedbackKey, t, UnknownTextKeyError } from '../../i18n';
import type { ExperimentConfig } from '../../model/types';

export interface ConfirmationRow {
  /** Identifies the row (React key). Not shown. */
  id: string;
  title: string;
}

export interface MistakeCard {
  /** Identifies the card (React key). Not shown. */
  id: string;
  title: string;
  /** "1 time" or "3 times". */
  countText: string;
  /** The one-line fix, when the feedback entry has one (every error entry does). */
  fix?: string;
}

/** Each confirmation code's feedback keys, from the registry in `spec/error-codes.json`. */
const CONFIRMATION_KEYS: ReadonlyMap<string, readonly string[]> = new Map(
  errorCodes.ok.map((entry): [string, readonly string[]] => [entry.code, entry.feedbackKeys]),
);

/**
 * Title and fix of a feedback entry. `explain` is left alone on purpose: some explanations hold {placeholders}
 * (`MISSING_COMPONENT`, `MISSING_READING`) that need values the saved records do not keep, so `t()` on the whole
 * entry would fail for them. A title or fix that did need a value would throw the same missing-value error as `t()`.
 */
function titleAndFix(key: string): { title: string; fix?: string } {
  if (!isFeedbackKey(key)) throw new UnknownTextKeyError(key);
  const entry = BUNDLES[getActiveLanguage()].feedback[key];
  const title = fillPlaceholders(entry.title, {});
  return entry.fix === undefined ? { title } : { title, fix: fillPlaceholders(entry.fix, {}) };
}

/**
 * The feedback keys that one confirmation code stands for in this attempt. Most codes have a single key.
 * `OK_TOPOLOGY` has one per required topology (`OK_TOPOLOGY.series`), so it follows the tasks that logged it.
 * A code the registry does not know, or a variant that cannot be told, is a data bug and fails like `t()`.
 */
function keysFor(entry: AttemptConfirmation, experiment: ExperimentConfig): string[] {
  const registered = CONFIRMATION_KEYS.get(entry.code);
  if (registered === undefined) throw new UnknownTextKeyError(entry.code);
  const [only] = registered;
  if (registered.length === 1 && only !== undefined) return [only];

  const keys: string[] = [];
  for (const taskId of entry.taskIds) {
    const task = experiment.tasks.find((candidate) => candidate.id === taskId);
    const key = `${entry.code}.${task?.requiredTopology ?? ''}`;
    if (registered.includes(key) && !keys.includes(key)) keys.push(key);
  }
  if (keys.length === 0) throw new UnknownTextKeyError(entry.code);
  return keys;
}

/** "What went well": one row per distinct confirmation wording, in the order first seen. */
export function confirmationRows(
  confirmations: readonly AttemptConfirmation[],
  experiment: ExperimentConfig,
): ConfirmationRow[] {
  const rows: ConfirmationRow[] = [];
  for (const entry of confirmations) {
    for (const key of keysFor(entry, experiment)) {
      if (rows.some((row) => row.id === key)) continue;
      rows.push({ id: key, title: titleAndFix(key).title });
    }
  }
  return rows;
}

/** "Mistakes to remember": one card per distinct error code, in the order the data gives (first seen). */
export function mistakeCards(errors: readonly AttemptError[]): MistakeCard[] {
  return errors.map((error) => {
    const { title, fix } = titleAndFix(error.feedbackKey);
    const countText =
      error.count === 1
        ? t('result.mistakeCount', { count: error.count })
        : t('result.mistakeCountPlural', { count: error.count });
    const card: MistakeCard = { id: error.code, title, countText };
    return fix === undefined ? card : { ...card, fix };
  });
}
