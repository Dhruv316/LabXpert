import ts from 'typescript';

/**
 * Finds string literals in a .tsx source that look like text a student could read.
 * Used by tests/spec/hardcoded-text.test.ts. Student text must come from t(); see CLAUDE.md rule 3.
 */

export interface TextFinding {
  line: number;
  /** The literal, as written. */
  text: string;
  /** Where it sits: the attribute name, the call, or "child text". */
  where: string;
}

/** JSX attributes that carry code, styling or geometry, never words a student reads. */
export const NON_TEXT_ATTRIBUTES: ReadonlySet<string> = new Set([
  'className', 'id', 'key', 'role', 'type', 'name', 'htmlFor', 'href', 'to', 'd', 'viewBox', 'fill', 'stroke',
  'points', 'transform', 'xmlns', 'style', 'autoComplete', 'inputMode', 'pattern', 'tabIndex', 'target', 'rel',
  'preserveAspectRatio', 'strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'textAnchor', 'dominantBaseline',
  'aria-live', 'aria-haspopup', 'aria-orientation', 'aria-current', 'aria-checked', 'aria-pressed', 'aria-expanded',
  'aria-hidden', 'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-atomic', 'aria-relevant', 'aria-modal',
  'aria-disabled', 'aria-invalid', 'aria-selected', 'aria-busy', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow',
  'aria-activedescendant', 'aria-errormessage', 'aria-owns', 'aria-sort', 'aria-multiline', 'aria-readonly',
  'aria-required', 'aria-autocomplete', 'aria-level', 'aria-posinset', 'aria-setsize', 'aria-colcount', 'aria-rowcount',
  'cursor', 'width', 'height', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'x2', 'y1', 'y2', 'opacity', 'src',
  'strokeWidth', 'fontFamily', 'fontWeight', 'fontSize', 'clipPath', 'mask', 'filter', 'markerEnd', 'markerStart',
]);

/** data-* attributes are hooks for tests and styles; the one that CSS prints (the Gallery's) is checked in the sweep test. */
function isNonTextAttribute(name: string): boolean {
  return NON_TEXT_ATTRIBUTES.has(name) || name.startsWith('data-');
}

/** Attributes read out by a screen reader or shown as a tooltip or hint: any wording in them is student text. */
export const SPOKEN_ATTRIBUTES: ReadonlySet<string> = new Set([
  'aria-label', 'aria-description', 'aria-valuetext', 'aria-roledescription', 'title', 'placeholder', 'alt', 'label',
]);

/** Calls whose string arguments are keys, selectors, class names or event names. */
export const NON_TEXT_CALLEES: ReadonlySet<string> = new Set([
  't', 'isUiKey', 'isFeedbackKey', 'cn', 'querySelector', 'querySelectorAll', 'getAttribute', 'setAttribute',
  'removeAttribute', 'hasAttribute', 'addEventListener', 'removeEventListener', 'closest', 'matches', 'getElementById',
  'hasOwn', 'startsWith', 'endsWith', 'matchMedia', 'dispatchEvent', 'setPointerCapture', 'releasePointerCapture',
  'hasPointerCapture', 'getItem', 'Error', 'TypeError', 'RangeError', 'URL', 'RegExp', 'Intl',
]);

const COMPARISONS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

/** Single Tailwind utilities that carry no hyphen, colon or digit. */
const BARE_UTILITIES: ReadonlySet<string> = new Set([
  'flex', 'grid', 'block', 'inline', 'hidden', 'relative', 'absolute', 'fixed', 'sticky', 'static', 'truncate', 'italic',
  'underline', 'uppercase', 'lowercase', 'capitalize', 'border', 'rounded', 'shadow', 'outline', 'ring', 'contents',
  'transition', 'container', 'overflow-hidden', 'sr-only', 'invisible', 'visible', 'isolate', 'grow', 'shrink',
]);

/** A list of CSS class names: every word has a hyphen, colon, bracket or digit, or is a bare utility. */
export function looksLikeClassList(text: string): boolean {
  const words = text.trim().split(/\s+/);
  return words.every((word) => /^[a-z0-9:[\]/.%!#()_,-]+$/.test(word) && (BARE_UTILITIES.has(word) || /[-:[\]\d]/.test(word)));
}

/** Plain words with a capital or sentence punctuation, or more than one word, or non-Latin letters. */
export function looksLikeText(raw: string): boolean {
  const text = raw.trim();
  if (!/\p{L}/u.test(text) || looksLikeClassList(text)) return false;
  if (/[^\x00-\x7F]/.test(text) && /\p{L}/u.test(text.replace(/[\x00-\x7F]/g, ''))) return true;
  const words = text.split(/\s+/);
  if (words.length >= 2) return words.filter((word) => /^[A-Za-z][A-Za-z'’-]*[.,!?:;]?$/.test(word)).length >= 2;
  return /^[A-Z][a-z]+[.,!?:;]?$/.test(text) || /[a-z][.!?]$/.test(text);
}

function calleeName(call: ts.CallExpression | ts.NewExpression): string {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return '';
}

/** Why this literal is not student text, or undefined when it needs a look. */
function contextOf(node: ts.Node): { skip: boolean; where: string } {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isLiteralTypeNode(parent)) {
    return { skip: true, where: 'module or type' };
  }
  if (ts.isPropertyAssignment(parent) && parent.name === node) return { skip: true, where: 'key' };
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    const name = parent.name.getText().replace(/^['"]|['"]$/g, '');
    return { skip: isNonTextAttribute(name), where: name };
  }
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) return { skip: true, where: 'key' };
  if (ts.isCaseClause(parent) || ts.isEnumMember(parent)) return { skip: true, where: 'code' };
  if (ts.isBinaryExpression(parent) && COMPARISONS.has(parent.operatorToken.kind)) return { skip: true, where: 'comparison' };
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) {
    const name = calleeName(parent);
    if (NON_TEXT_CALLEES.has(name)) return { skip: true, where: `${name}()` };
    return { skip: false, where: `${name}()` };
  }
  // A literal inside ${...} is judged by whatever owns the template.
  if (ts.isTemplateSpan(parent)) return contextOf(parent.parent);
  if (ts.isJsxAttribute(parent)) {
    const name = parent.name.getText();
    return { skip: isNonTextAttribute(name), where: name };
  }
  if (ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent)) {
    const name = parent.parent.name.getText();
    return { skip: isNonTextAttribute(name), where: name };
  }
  if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isConditionalExpression(parent) || ts.isBinaryExpression(parent)) {
    return contextOf(parent);
  }
  return { skip: false, where: 'expression' };
}

/** Every literal in `source` that looks like student-facing text and is not in a code position. */
export function findHardCodedText(source: string, fileName = 'file.tsx'): TextFinding[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const found: TextFinding[] = [];
  const add = (node: ts.Node, text: string, where: string) =>
    found.push({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, text: text.trim(), where });

  const check = (node: ts.Node, text: string) => {
    const context = contextOf(node);
    const spoken = SPOKEN_ATTRIBUTES.has(context.where);
    if (context.skip) return;
    if (spoken ? /\p{L}/u.test(text) : looksLikeText(text)) add(node, text, context.where);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node, node.text);
    else if (ts.isTemplateExpression(node)) {
      for (const part of [node.head, ...node.templateSpans.map((span) => span.literal)]) check(node, part.text);
    } else if (ts.isJsxText(node)) {
      if (/\p{L}/u.test(node.text)) add(node, node.text, 'child text');
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Every text the English language files hold, whole, so a copy of one pasted into a component can be found. */
export function englishTexts(ui: unknown, feedback: Record<string, unknown>): Set<string> {
  const texts = new Set<string>();
  const add = (value: unknown): void => {
    // A single lowercase word ("switch", "happy") is as likely a part type or an owl mood as a text; the other rules cover it.
    if (typeof value === 'string') {
      if (looksLikeText(value)) texts.add(value.trim());
    } else if (typeof value === 'object' && value !== null) Object.values(value).forEach(add);
  };
  add(ui);
  for (const [key, entry] of Object.entries(feedback)) {
    if (key === '_note' || typeof entry !== 'object' || entry === null) continue;
    for (const [field, value] of Object.entries(entry)) if (field !== 'owl') add(value);
  }
  return texts;
}

/** Literals that are word for word a text from the English files, wherever they sit in the file. */
export function findCopiedTexts(source: string, texts: ReadonlySet<string>, fileName = 'file.tsx'): TextFinding[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const found: TextFinding[] = [];
  const visit = (node: ts.Node): void => {
    const text = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node) ? node.text.trim() : undefined;
    if (text !== undefined && texts.has(text)) {
      found.push({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, text, where: 'copy of a language-file text' });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
