import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config';
import tokens from '../../src/spec/design-tokens.json';

// Static rules from DESIGN.md §2, §3 and §13 item 1, checked over the source of every component.
const sources = import.meta.glob(['../../src/ui/**/*.{ts,tsx}', '../../src/components/**/*.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const entries = Object.entries(sources);

/** Lines that are not comments, so a hex value quoted in a comment does not count. */
function codeLines(source: string): string[] {
  return source.split('\n').filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line));
}

describe('Component source rules', () => {
  it('finds the components to check', () => {
    expect(entries.length).toBeGreaterThan(40);
  });

  it('uses no raw colour values: hex, rgb(), rgba(), hsl()', () => {
    const found = entries.flatMap(([path, source]) =>
      codeLines(source)
        .filter((line) => /#[0-9A-Fa-f]{3,8}\b|\brgba?\(|\bhsla?\(/.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    );
    expect(found).toEqual([]);
  });

  it('uses no colour from Tailwind\'s default palette (only the project tokens)', () => {
    const palette = /\b(?:bg|text|border|stroke|fill|ring|outline|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|amber|yellow|lime|green|emerald|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black)-\d{2,3}\b/;
    const found = entries.flatMap(([path, source]) => codeLines(source).filter((line) => palette.test(line)).map((line) => `${path}: ${line.trim()}`));
    expect(found).toEqual([]);
  });

  it('sets no text below 14 px (no text-xs, no pixel sizes under 14)', () => {
    const tiny = /\btext-xs\b|\btext-\[(?:[0-9]|1[0-3])(?:\.\d+)?px\]/;
    const found = entries.flatMap(([path, source]) => codeLines(source).filter((line) => tiny.test(line)).map((line) => `${path}: ${line.trim()}`));
    expect(found).toEqual([]);
  });

  it('uses no font family other than the two token families (no font-sans, font-serif, font-mono)', () => {
    const other = /\bfont-(?:sans|serif|mono)\b|font-family\s*:/;
    const found = entries.flatMap(([path, source]) => codeLines(source).filter((line) => other.test(line)).map((line) => `${path}: ${line.trim()}`));
    expect(found).toEqual([]);
  });

  it('every rounded-* class is a radius token (small, control, card, panel, pill) or a full circle', () => {
    const radii = (config.theme?.extend?.borderRadius ?? {}) as Record<string, string>;
    // The theme has every radius token, with the pixel value the token file gives.
    for (const [name, px] of Object.entries(tokens.radius)) expect(radii[name]).toBe(`${px}px`);
    const used = new Set(entries.flatMap(([, source]) => codeLines(source).flatMap((line) => Array.from(line.matchAll(/\brounded-([a-z]+)\b/g), (match) => match[1]))));
    const unknown = Array.from(used).filter((name): name is string => name !== undefined && name !== 'full' && radii[name] === undefined);
    expect(unknown).toEqual([]);
  });
});
