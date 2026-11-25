import { describe, expect, it } from 'vitest';
import { findCopiedTexts, findHardCodedText, looksLikeClassList, looksLikeText } from './hardcoded-text';

/** The texts a scan of `source` reports, in order, so a case reads as "this code, these findings". */
const found = (source: string) => findHardCodedText(source).map((finding) => finding.text);

describe('looksLikeText', () => {
  it('says yes to sentences, capitalised words, sentence ends and non-Latin letters', () => {
    for (const text of ['Connect the ammeter', 'Done', 'Try again.', 'नमस्ते', 'Check wires!']) expect(looksLikeText(text), text).toBe(true);
  });

  it('says no to codes, keys, numbers, symbols and class lists', () => {
    for (const text of ['OPEN_CIRCUIT', 'picker.title', 'pointerdown', '12.5', '—', ': ', 'flex items-center gap-2', 'hover:bg-teal-tint']) {
      expect(looksLikeText(text), text).toBe(false);
    }
  });

  it('knows a class list from two words of text', () => {
    expect(looksLikeClassList('rounded-card bg-mat p-4')).toBe(true);
    expect(looksLikeClassList('flex gap-2')).toBe(true);
    expect(looksLikeClassList('Check the wire')).toBe(false);
  });
});

describe('findHardCodedText: what it reports', () => {
  it('reports text between tags', () => {
    expect(found('const A = () => <p>Connect the ammeter</p>;')).toEqual(['Connect the ammeter']);
  });

  it('reports a literal in the attributes a screen reader or a tooltip shows', () => {
    const source = 'const A = () => <input aria-label="close" title="Hint" placeholder="Type here" alt="x" />;';
    expect(found(source)).toEqual(['close', 'Hint', 'Type here', 'x']);
  });

  it('reports spoken text written as an expression or a template', () => {
    expect(found("const A = () => <img alt={'Owl'} aria-label={`Close ${name}`} />;")).toEqual(['Owl', 'Close']);
  });

  it('reports text in plain code, in both branches of a choice, and in an object', () => {
    expect(found("const a = 'Connect the ammeter first';")).toEqual(['Connect the ammeter first']);
    expect(found("const b = ok ? 'Yes' : 'No';")).toEqual(['Yes', 'No']);
    expect(found("const c = { label: 'go' };")).toEqual(['go']);
  });

  it('reports Devanagari', () => {
    expect(found("const d = 'नमस्ते';")).toEqual(['नमस्ते']);
  });

  it('gives the line and where it was found', () => {
    const [finding] = findHardCodedText('const x = 1;\nconst A = () => <p title="Hint" />;');
    expect(finding).toEqual({ line: 2, text: 'Hint', where: 'title' });
  });
});

describe('findHardCodedText: what it lets through', () => {
  const clean = [
    '<div className="flex gap-2 text-ink" data-testid="Bench panel" role="button" id="main" />',
    "const a = t('picker.title');",
    "const b = cn('rounded-card bg-mat', open && 'shadow-lift');",
    "const c = status === 'Done';",
    "import x from 'react-router-dom';",
    "type S = 'Not started' | 'Done';",
    "el.addEventListener('pointerdown', go);",
    '<svg viewBox="0 0 24 24"><path d="M0 0 L5 5" /></svg>',
    "const k = 'OPEN_CIRCUIT.gap';",
    "const A = () => <p>{' '}</p>;",
    "const A = () => <Icon label={t('common.close')} />;",
    'const A = () => <p aria-label={`${t(\'common.close\')}: ${n}`} />;',
    "const m = { 'Done': 1 };",
    "const n = lookup['Not started'];",
    'const A = () => <p>— · 12</p>;',
    "const e = new Error('Unknown thing here');",
  ];
  it.each(clean)('%s', (source) => {
    expect(found(source)).toEqual([]);
  });
});

describe('findCopiedTexts', () => {
  const texts = new Set(['Choose an experiment']);
  it('finds a text pasted from the language file, whatever the position', () => {
    expect(findCopiedTexts("const t1 = 'Choose an experiment';", texts)).toHaveLength(1);
    expect(findCopiedTexts('const A = () => <h1>Choose an experiment</h1>;', texts)).toHaveLength(1);
  });

  it('ignores other literals', () => {
    expect(findCopiedTexts("const t1 = 'Choose';", texts)).toEqual([]);
  });
});
