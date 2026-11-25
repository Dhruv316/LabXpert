import { describe, expect, it } from 'vitest';
import feedbackEn from '../../src/spec/feedback.en.json';
import uiEn from '../../src/spec/ui-strings.en.json';
import { englishTexts, findCopiedTexts, findHardCodedText, type TextFinding } from '../helpers/hardcoded-text';

// CLAUDE.md rule 3: no student-facing text in a component. Every .tsx under src/ is read as code (not as
// text), so a word in a comment never counts and a word in a string, a tag or an attribute always does.
const sources = import.meta.glob('../../src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.entries(sources).map(([path, source]) => [path.replace('../../', ''), source] as const);

interface Allowed {
  file: string;
  /** The attribute, call or position the literal sits in, as the scanner names it. */
  where: string;
  reason: string;
}

/** Everything the sweep lets through that is not a code position, with the reason. Each entry must still be needed. */
const ALLOWED: readonly Allowed[] = [
  {
    file: 'src/components/ui/Gallery.tsx',
    where: 'caption',
    reason: 'Developer label on the dev-only component gallery. The route exists only when import.meta.env.DEV is true, so no student sees it.',
  },
  {
    file: 'src/components/ui/Gallery.tsx',
    where: 'component',
    reason: 'The component name the gallery shows (Button, Chip ...). Same dev-only page.',
  },
];

/** Literals equal to an English text that are not student text. */
const ALLOWED_COPIES: readonly { file: string; text: string; reason: string }[] = [
  {
    file: 'src/components/ui/Gallery.tsx',
    text: 'Ollie',
    reason: 'The component name "Ollie" used as a data-* hook on the dev-only gallery. It is the owl component, not the app.owlName text.',
  },
];

const describeFinding = (file: string, finding: TextFinding) => `${file}:${finding.line} "${finding.text}" (${finding.where})`;

const isAllowed = (file: string, finding: TextFinding) => ALLOWED.some((entry) => entry.file === file && entry.where === finding.where);

describe('Hard-coded text sweep (.tsx under src/)', () => {
  it('reads the whole tree', () => {
    expect(files.length).toBeGreaterThan(50);
    for (const folder of ['src/ui/bench/', 'src/ui/shell/', 'src/ui/screens/', 'src/components/ui/']) {
      expect(files.some(([path]) => path.startsWith(folder)), folder).toBe(true);
    }
  });

  it('finds no literal that looks like student text, in code, tags, or aria-label, title, placeholder and alt', () => {
    const violations = files.flatMap(([file, source]) =>
      findHardCodedText(source, file)
        .filter((finding) => !isAllowed(file, finding))
        .map((finding) => describeFinding(file, finding)),
    );
    expect(violations).toEqual([]);
  });

  it('finds no literal that is word for word a text from the English language files', () => {
    const texts = englishTexts(uiEn, feedbackEn);
    expect(texts.size).toBeGreaterThan(100);
    const copies = files.flatMap(([file, source]) =>
      findCopiedTexts(source, texts, file)
        .filter((finding) => !ALLOWED_COPIES.some((entry) => entry.file === file && entry.text === finding.text))
        .map((finding) => describeFinding(file, finding)),
    );
    expect(copies).toEqual([]);
  });

  it('keeps every allow-list entry in use, so it cannot hide a later violation', () => {
    for (const entry of ALLOWED) {
      const source = sources[`../../${entry.file}`];
      expect(source, entry.file).toBeDefined();
      const used = findHardCodedText(source ?? '', entry.file).some((finding) => finding.where === entry.where);
      expect(used, `${entry.file} ${entry.where}: ${entry.reason}`).toBe(true);
    }
    const texts = englishTexts(uiEn, feedbackEn);
    for (const entry of ALLOWED_COPIES) {
      const used = findCopiedTexts(sources[`../../${entry.file}`] ?? '', texts, entry.file).some((finding) => finding.text === entry.text);
      expect(used, `${entry.file} "${entry.text}": ${entry.reason}`).toBe(true);
    }
  });
});

describe('Why the allow-list is safe', () => {
  // Read from disk: the ?raw import of a .css file comes back empty under Vitest. The project has no Node type
  // package, so only the calls used here are described (same approach as screens-audit.test.tsx).
  interface DirEntry {
    name: string;
    isDirectory(): boolean;
  }
  interface NodeBuiltins {
    cwd(): string;
    getBuiltinModule(id: 'node:fs'): {
      readFileSync(path: string, encoding: 'utf8'): string;
      readdirSync(path: string, options: { withFileTypes: true }): DirEntry[];
    };
  }
  const node = (globalThis as unknown as { process: NodeBuiltins }).process;
  const fs = node.getBuiltinModule('node:fs');
  const cssFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry: DirEntry) =>
      entry.isDirectory() ? cssFiles(`${dir}/${entry.name}`) : entry.name.endsWith('.css') ? [`${dir}/${entry.name}`] : [],
    );
  const css: Record<string, string> = Object.fromEntries(
    cssFiles(`${node.cwd()}/src`).map((file) => [`../../src/${file.slice(node.cwd().length + 5)}`, fs.readFileSync(file, 'utf8')]),
  );

  it('the gallery is imported only behind import.meta.env.DEV, and by nothing else', () => {
    const routes = sources['../../src/AppRoutes.tsx'] ?? '';
    expect(routes).toMatch(/import\.meta\.env\.DEV\s*\?\s*lazy\(\(\) => import\('\.\/components\/ui\/Gallery'\)\)/);
    const importers = files.filter(([, source]) => /from '[^']*\/Gallery'|import\('[^']*\/Gallery'\)/.test(source)).map(([path]) => path);
    expect(importers).toEqual(['src/AppRoutes.tsx']);
  });

  it('only the gallery style sheet prints an attribute as text, which is why data-* attributes are not scanned', () => {
    const printing = Object.entries(css)
      .filter(([, source]) => /\battr\(/.test(source))
      .map(([path]) => path.replace('../../', ''));
    expect(printing).toEqual(['src/components/ui/gallery.css']);
  });
});
