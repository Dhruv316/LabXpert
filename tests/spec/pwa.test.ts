// @vitest-environment node
import { describe, expect, it } from 'vitest';
import tokens from '../../src/spec/design-tokens.json';
import uiStrings from '../../src/spec/ui-strings.en.json';
import indexHtml from '../../index.html?raw';
import { PWA_ICONS, pwaManifest, pwaOptions, pwaWorkbox } from '../../pwa.config';

// The project has no Node type package, so the file system is reached through the one built-in
// module this test needs, with only the call it uses described.
interface NodeFs {
  readFileSync(path: URL): Uint8Array;
}
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): NodeFs } }).process.getBuiltinModule('node:fs');

const sources = import.meta.glob('../../src/**/*.{ts,tsx,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** PNG: 8 signature bytes, then the IHDR chunk (4 length + 4 type), then width and height. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = fs.readFileSync(new URL(`../../public/${file}`, import.meta.url));
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect(Array.from(bytes.slice(0, 8))).toEqual(signature);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** The extensions inside the `{...}` of a glob such as `**\/*.{js,css}`. */
function extensions(patterns: readonly string[]): string[] {
  return patterns.flatMap((pattern) => {
    const braces = /\{([^}]+)\}/.exec(pattern);
    return braces === null ? [] : (braces[1] ?? '').split(',');
  });
}

describe('PWA manifest', () => {
  it('takes its name, short name and description from the ui-strings file', () => {
    expect(pwaManifest.name).toBe(uiStrings.app.name);
    expect(pwaManifest.short_name).toBe(uiStrings.app.name);
    expect(pwaManifest.description).toBe(uiStrings.app.tagline);
  });

  it('opens as a standalone app from a relative start page that works with the HashRouter', () => {
    expect(pwaManifest.display).toBe('standalone');
    expect(pwaManifest.start_url).toBe('./');
    expect(pwaManifest.scope).toBe('./');
  });

  it('takes its theme and background colours from the design tokens', () => {
    expect(pwaManifest.theme_color).toBe(tokens.colors.cream);
    expect(pwaManifest.background_color).toBe(tokens.colors.cream);
  });

  it('declares a 192 icon, a 512 icon and a maskable 512 icon', () => {
    expect(pwaManifest.icons).toEqual([...PWA_ICONS]);
    const wanted = [
      ['192x192', 'any'],
      ['512x512', 'any'],
      ['512x512', 'maskable'],
    ];
    expect(PWA_ICONS.map((icon) => [icon.sizes, icon.purpose])).toEqual(wanted);
  });

  it.each(PWA_ICONS)('the icon file $src exists and is really $sizes', (icon) => {
    const { width, height } = pngSize(icon.src);
    expect(`${width}x${height}`).toBe(icon.sizes);
  });
});

describe('Workbox precache', () => {
  it('precaches code, styles, the page, fonts, art and JSON', () => {
    const found = extensions(pwaWorkbox.globPatterns ?? []);
    for (const wanted of ['woff2', 'woff', 'svg', 'png', 'json', 'html', 'js', 'css']) {
      expect(found).toContain(wanted);
    }
  });

  it('falls back to index.html and cleans old caches', () => {
    expect(pwaWorkbox.navigateFallback).toBe('index.html');
    expect(pwaWorkbox.cleanupOutdatedCaches).toBe(true);
  });

  it('has no runtime caching at all, so no external origin is ever cached', () => {
    expect(pwaWorkbox.runtimeCaching ?? []).toEqual([]);
  });

  it('updates by itself and stays off in npm run dev', () => {
    expect(pwaOptions.registerType).toBe('autoUpdate');
    expect(pwaOptions.devOptions?.enabled).toBe(false);
  });
});

describe('No network at run time', () => {
  // The only text found that looks like a URL: the SVG namespace, which is a name, not a request.
  const ALLOWED = ['http://www.w3.org/2000/svg'];
  const FORBIDDEN: readonly RegExp[] = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /https?:\/\//];

  /** Source without comments (a link in a comment is documentation) and without the allowed items. */
  function code(source: string): string {
    const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, '');
    const withoutLines = withoutBlocks
      .split('\n')
      .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
      .join('\n');
    return ALLOWED.reduce((text, item) => text.split(item).join(''), withoutLines);
  }

  it('finds the source to scan', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
  });

  it('has no fetch, XMLHttpRequest, WebSocket, sendBeacon or external URL in src', () => {
    const hits = Object.entries(sources).flatMap(([path, source]) =>
      FORBIDDEN.filter((pattern) => pattern.test(code(source))).map((pattern) => `${path}: ${String(pattern)}`),
    );
    expect(hits).toEqual([]);
  });

  it('has no external URL in index.html', () => {
    expect(/https?:\/\//.test(code(indexHtml.replace(/<!--[\s\S]*?-->/g, '')))).toBe(false);
  });
});
