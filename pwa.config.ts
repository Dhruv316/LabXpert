import type { VitePWA } from 'vite-plugin-pwa';
import tokens from './src/spec/design-tokens.json';
import uiStrings from './src/spec/ui-strings.en.json';

// Kept apart from vite.config.ts so tests can read it. Text comes from the ui-strings file and
// colours from the design tokens, so nothing is written twice.
type PwaOptions = NonNullable<Parameters<typeof VitePWA>[0]>;
type PwaManifest = Exclude<PwaOptions['manifest'], false | undefined>;
type PwaWorkbox = NonNullable<PwaOptions['workbox']>;

// A type alias, not an interface, so it also fits a plain string-keyed icon record.
export type PwaIcon = {
  src: string;
  sizes: string;
  type: 'image/png';
  purpose: 'any' | 'maskable';
};

/** Paths are relative to `public/` and, with the relative base, to the manifest. */
export const PWA_ICONS: readonly PwaIcon[] = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

export const pwaManifest: PwaManifest = {
  name: uiStrings.app.name,
  short_name: uiStrings.app.name,
  description: uiStrings.app.tagline,
  display: 'standalone',
  // Relative, so the app installs from any folder or sub-path. The HashRouter keeps every route
  // after the `#`, so one start page is enough.
  start_url: './',
  scope: './',
  theme_color: tokens.colors.cream,
  background_color: tokens.colors.cream,
  icons: [...PWA_ICONS],
};

/** Everything the built app needs offline: code, styles, the page, fonts, art and any JSON. */
export const PRECACHE_PATTERN = '**/*.{js,css,html,woff2,woff,svg,png,json,ico,webmanifest}';

// No `runtimeCaching`: the app makes no network calls, so there is nothing to cache at run time
// and no external origin is ever stored.
export const pwaWorkbox: PwaWorkbox = {
  globPatterns: [PRECACHE_PATTERN],
  navigateFallback: 'index.html',
  cleanupOutdatedCaches: true,
  // The whole app, specs included, is one bundle; the default 2 MiB limit would silently leave
  // it out of the precache.
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
};

export const pwaOptions: PwaOptions = {
  registerType: 'autoUpdate',
  // The worker is registered by hand in `src/pwa-register.ts`, called from `src/main.tsx`.
  injectRegister: false,
  manifest: pwaManifest,
  workbox: pwaWorkbox,
  // `npm run dev` never runs a service worker.
  devOptions: { enabled: false },
};
