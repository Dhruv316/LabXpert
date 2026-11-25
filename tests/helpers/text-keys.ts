import ts from 'typescript';

/**
 * Static scan of how the source asks for text. Used by tests/i18n/keys.test.ts.
 * It reads t(), isUiKey() and isFeedbackKey() calls and every string literal in a file.
 */

const KEY_CALLEES: ReadonlySet<string> = new Set(['t', 'isUiKey', 'isFeedbackKey']);

export interface KeyCall {
  callee: string;
  line: number;
  /** The first argument, as written. */
  arg: string;
  /** Every key the argument can be, when it is written out in the source: a literal, or a choice of two. */
  keys: string[];
  /** The fixed start of a template such as `components.${type}`. */
  prefix?: string;
}

export interface FileScan {
  calls: KeyCall[];
  /** Every string literal in the file, whole. */
  strings: Set<string>;
  /** Fixed starts of templates ending in a dot, e.g. `picker.status.`. */
  templateHeads: Set<string>;
  /** The full source, so a guard such as isUiKey(x) can be looked for. */
  source: string;
}

function literalKeys(node: ts.Expression): string[] | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return literalKeys(node.expression);
  if (ts.isConditionalExpression(node)) {
    const whenTrue = literalKeys(node.whenTrue);
    const whenFalse = literalKeys(node.whenFalse);
    return whenTrue !== undefined && whenFalse !== undefined ? [...whenTrue, ...whenFalse] : undefined;
  }
  return undefined;
}

export function scanFile(source: string, fileName: string): FileScan {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const scan: FileScan = { calls: [], strings: new Set(), templateHeads: new Set(), source };

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) scan.strings.add(node.text);
    if (ts.isTemplateExpression(node) && node.head.text.endsWith('.')) scan.templateHeads.add(node.head.text);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && KEY_CALLEES.has(node.expression.text)) {
      const first = node.arguments[0];
      if (first !== undefined) {
        const keys = literalKeys(first);
        const prefix = ts.isTemplateExpression(first) ? first.head.text : undefined;
        scan.calls.push({
          callee: node.expression.text,
          line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
          arg: first.getText(file),
          keys: keys ?? [],
          ...(prefix === undefined ? {} : { prefix }),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return scan;
}

/** Dot-joined path of every string in a nested tree, `_note` left out. */
export function flattenKeys(tree: unknown, prefix = ''): string[] {
  if (typeof tree !== 'object' || tree === null) return [];
  return Object.entries(tree).flatMap(([name, value]) => {
    if (prefix === '' && name === '_note') return [];
    const path = prefix === '' ? name : `${prefix}.${name}`;
    return typeof value === 'string' ? [path] : flattenKeys(value, path);
  });
}

/** Every string anywhere in a JSON value, keys and values both. */
export function allJsonStrings(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') into.add(value);
  else if (typeof value === 'object' && value !== null) {
    for (const [name, child] of Object.entries(value)) {
      into.add(name);
      allJsonStrings(child, into);
    }
  }
  return into;
}

export interface AllowedCall {
  file: string;
  /** The first argument, as written in the source. */
  arg: string;
  reason: string;
}

export interface KeyReport {
  /** A literal key in a t() or guard call that is in neither language file. */
  missing: string[];
  /** A t() call whose key is only known at run time and has no guard, no typed allowance and no known prefix. */
  unchecked: string[];
  /** A template prefix under which no key exists. */
  emptyPrefixes: string[];
  /** Keys in the two files that nothing uses. */
  unused: string[];
  /** Allow-list entries that no longer match anything. */
  staleCalls: string[];
  staleUnused: string[];
  /** How many keys, calls and files were looked at, so a test can tell the scan did not come up empty. */
  counts: { files: number; literalKeys: number; computedCalls: number; keys: number };
}

export interface KeyInputs {
  /** Source files, keyed by repo-relative path such as `src/ui/shell/TopBar.tsx`. */
  sources: Readonly<Record<string, string>>;
  uiKeys: readonly string[];
  feedbackKeys: readonly string[];
  /** Strings from the other spec files (experiments, practice tasks, error codes), which name keys. */
  specStrings: ReadonlySet<string>;
  allowedCalls: readonly AllowedCall[];
  allowedUnused: readonly { key: string; reason: string }[];
  /** Files that define the loader itself; its own calls take a key as a parameter by design. */
  loaderDir: string;
}

const GUARDS = ['isUiKey', 'isFeedbackKey'] as const;

export function analyseKeys(input: KeyInputs): KeyReport {
  const known = new Set([...input.uiKeys, ...input.feedbackKeys]);
  const scans = Object.entries(input.sources).map(([file, source]) => [file, scanFile(source, file)] as const);

  const missing: string[] = [];
  const unchecked: string[] = [];
  const emptyPrefixes: string[] = [];
  const usedLiterals = new Set<string>();
  const matchedAllowances = new Set<string>();
  let computedCalls = 0;

  for (const [file, scan] of scans) {
    for (const call of scan.calls) {
      for (const key of call.keys) {
        usedLiterals.add(key);
        if (!known.has(key)) missing.push(`${file}:${call.line} ${key}`);
      }
      if (call.keys.length > 0 || call.callee !== 't' || file.startsWith(input.loaderDir)) continue;
      computedCalls += 1;

      if (call.prefix !== undefined && call.prefix !== '') {
        const prefix = call.prefix;
        if (![...known].some((key) => key.startsWith(prefix))) emptyPrefixes.push(`${file}:${call.line} ${prefix}`);
        continue;
      }
      const allowed = input.allowedCalls.find((entry) => entry.file === file && entry.arg === call.arg);
      if (allowed !== undefined) {
        matchedAllowances.add(`${allowed.file} ${allowed.arg}`);
        continue;
      }
      // A key checked by isUiKey(x) or isFeedbackKey(x) in the same file is safe: a wrong one throws, never reaches a student.
      if (GUARDS.some((guard) => scan.source.includes(`${guard}(${call.arg}`))) continue;
      unchecked.push(`${file}:${call.line} t(${call.arg})`);
    }
  }

  const prefixes = new Set<string>();
  const strings = new Set<string>(input.specStrings);
  for (const [, scan] of scans) {
    for (const text of scan.strings) {
      strings.add(text);
      if (text.endsWith('.')) prefixes.add(text);
    }
    for (const head of scan.templateHeads) prefixes.add(head);
  }

  const isUsed = (key: string) =>
    usedLiterals.has(key) || strings.has(key) || [...prefixes].some((prefix) => key.startsWith(prefix));
  const allKeys = [...input.uiKeys, ...input.feedbackKeys];
  const allowedUnused = new Set(input.allowedUnused.map((entry) => entry.key));
  const unused = allKeys.filter((key) => !isUsed(key) && !allowedUnused.has(key));

  return {
    missing,
    unchecked,
    emptyPrefixes,
    unused,
    staleCalls: input.allowedCalls.map((entry) => `${entry.file} ${entry.arg}`).filter((id) => !matchedAllowances.has(id)),
    staleUnused: [...allowedUnused].filter((key) => !allKeys.includes(key) || isUsed(key)),
    counts: {
      files: scans.length,
      literalKeys: usedLiterals.size,
      computedCalls,
      keys: allKeys.length,
    },
  };
}
