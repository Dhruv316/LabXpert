import { registerSW } from 'virtual:pwa-register';

/**
 * Starts the service worker so the app opens with no network after the first visit.
 * Offline support is an extra: if registration fails (a blocked worker, private mode, an old
 * browser) the app just stays online-only, so nothing here may throw.
 */
export function registerOffline(): void {
  try {
    registerSW({ immediate: true, onRegisterError: () => undefined });
  } catch {
    // Online-only is fine.
  }
}
