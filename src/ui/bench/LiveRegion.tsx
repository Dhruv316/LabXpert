import { useCallback, useState, type ReactNode } from 'react';
import { AnnounceContext } from './announcer';

export interface LiveRegionProps {
  message: string;
  /** Changes with every announcement so the same sentence twice in a row is still read out. */
  version: number;
}

// A screen reader stays quiet when the region's text does not change. Alternating a trailing
// no-break space makes a repeated sentence a change without touching the words.
const REPEAT_MARK = '\u00a0';

/** One visually hidden, polite live region for the whole bench (DESIGN.md §11). */
export function LiveRegion({ message, version }: LiveRegionProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" data-testid="live-region" className="sr-only">
      {message === '' ? '' : message + (version % 2 === 1 ? REPEAT_MARK : '')}
    </div>
  );
}

/** Holds the one live region and hands `announce` to everything below it (see useAnnounce). */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ message: '', version: 0 });
  const announce = useCallback((text: string) => {
    setState((s) => ({ message: text, version: s.version + 1 }));
  }, []);
  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <LiveRegion message={state.message} version={state.version} />
    </AnnounceContext.Provider>
  );
}
