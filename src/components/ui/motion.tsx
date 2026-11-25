import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const OS_QUERY = '(prefers-reduced-motion: reduce)';

function readOsPreference(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(OS_QUERY).matches;
}

/**
 * True when motion should be removed: the in-app setting OR the operating system asks for it.
 * The app root passes the stored setting (from the store, which reads the settings repository).
 */
export function useReducedMotion(userSetting: boolean): boolean {
  const [osPrefers, setOsPrefers] = useState(readOsPreference);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(OS_QUERY);
    const update = () => setOsPrefers(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return userSetting || osPrefers;
}

const MotionContext = createContext(false);

/** Components that animate in JS (not CSS) read the resolved value here. */
export function useMotionReduced(): boolean {
  return useContext(MotionContext);
}

/**
 * Provides the resolved value and mirrors it on <html data-reduce-motion>, which the CSS in
 * index.css uses to cut animations and transitions. It sits on <html> so portals (dialogs) are covered.
 */
export function MotionScope({ reduce, children }: { reduce: boolean; children: ReactNode }) {
  const resolved = useReducedMotion(reduce);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(resolved);
    return () => {
      delete document.documentElement.dataset.reduceMotion;
    };
  }, [resolved]);

  return <MotionContext.Provider value={resolved}>{children}</MotionContext.Provider>;
}
