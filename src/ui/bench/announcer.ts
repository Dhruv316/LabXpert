import { createContext, useContext } from 'react';

/** Sends a sentence to the shared polite live region. Outside a provider it does nothing. */
export type Announce = (text: string) => void;

export const AnnounceContext = createContext<Announce>(() => undefined);

/** Later parts (wire connected, wire cancelled, ...) announce through this same hook. */
export function useAnnounce(): Announce {
  return useContext(AnnounceContext);
}
