import { describe, expect, it } from 'vitest';
import errorCodes from '../../src/spec/error-codes.json';
import feedbackEn from '../../src/spec/feedback.en.json';
import uiEn from '../../src/spec/ui-strings.en.json';
import kitTypes from '../../kit/spec/types.ts?raw';
import modelTypes from '../../src/model/types.ts?raw';

function uiPaths(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    if (prefix === '' && key === '_note') return [];
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof value === 'object' && value !== null ? uiPaths(value, path) : [path];
  });
}

describe('spec integrity', () => {
  it('every feedbackKey in error-codes.json exists in feedback.en.json', () => {
    const keys = [...errorCodes.errors, ...errorCodes.ok].flatMap((entry) => entry.feedbackKeys);
    expect(keys.length).toBeGreaterThan(0);
    const missing = keys.filter((key) => !Object.hasOwn(feedbackEn, key));
    expect(missing).toEqual([]);
  });

  it('src/model/types.ts is identical to the kit spec/types.ts', () => {
    expect(modelTypes).toBe(kitTypes);
  });

  it('no feedback key doubles as a UI path, so t() can tell the two apart', () => {
    const clashes = uiPaths(uiEn).filter((path) => Object.hasOwn(feedbackEn, path));
    expect(clashes).toEqual([]);
  });
});
