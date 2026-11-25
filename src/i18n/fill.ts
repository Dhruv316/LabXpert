import { MissingParamError } from './errors';
import type { Params } from './types';

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Replaces every {name} with params[name], repeats included. A missing value
 * throws rather than leaving "{name}" on a student's screen. Extra params are ignored.
 */
export function fillPlaceholders(text: string, params: Params): string {
  return text.replace(PLACEHOLDER, (_match, name: string) => {
    if (!Object.hasOwn(params, name)) throw new MissingParamError(name);
    return String(params[name]);
  });
}
