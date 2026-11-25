import type { FeedbackEntry } from '../model/types';
import type { Bundle } from './bundles';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Lookup rules, taken from how the two files are laid out:
 * 1. Feedback keys are flat and may contain dots ('OPEN_CIRCUIT.gap'), so the
 *    whole key is matched against the top level of the feedback file.
 * 2. Anything else is a nested path into the UI file ('exp.ohms-law.title'),
 *    split on dots; only a string leaf counts.
 * Own-property checks stop keys like 'constructor' or '__proto__' from matching.
 */
export function lookup(bundle: Bundle, key: string): FeedbackEntry | string | undefined {
  if (Object.hasOwn(bundle.feedback, key)) return bundle.feedback[key];

  let node: unknown = bundle.ui;
  for (const segment of key.split('.')) {
    if (!isRecord(node) || !Object.hasOwn(node, segment)) return undefined;
    node = node[segment];
  }
  return typeof node === 'string' ? node : undefined;
}
