import { create } from 'zustand';
import { DEFAULT_LANGUAGE, setActiveLanguage, type Language } from '../i18n';
import type { UserRecord } from '../model/types';

export interface AppState {
  /** The learner who is logged in. Undefined until the session loads and again after Log out. */
  user: UserRecord | undefined;
  language: Language;
  /** The in-app setting only. The OS preference is added by the motion hook (MotionScope). */
  reduceMotion: boolean;
  online: boolean;
  hydrate: (session: { user: UserRecord | undefined; reduceMotion: boolean }) => void;
  setUser: (user: UserRecord | undefined) => void;
  setLanguage: (language: Language) => void;
  setReduceMotion: (value: boolean) => void;
  setOnline: (value: boolean) => void;
}

function browserIsOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/**
 * Session-level state only. Nothing here is persisted by the store itself: the user and the
 * reduce-motion setting are written through the db repositories (see session.ts).
 */
export const useAppStore = create<AppState>()((set) => ({
  user: undefined,
  language: DEFAULT_LANGUAGE,
  reduceMotion: false,
  online: browserIsOnline(),
  hydrate: ({ user, reduceMotion }) => set({ user, reduceMotion }),
  setUser: (user) => set({ user }),
  setLanguage: (language) => set({ language }),
  setReduceMotion: (reduceMotion) => set({ reduceMotion }),
  setOnline: (online) => set({ online }),
}));

// Every change to the store, including a full reset, keeps t() on the language the store holds.
useAppStore.subscribe((state) => setActiveLanguage(state.language));
