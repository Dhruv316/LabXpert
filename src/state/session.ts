import { useEffect, useState } from 'react';
import { checkDatabase } from '../db/availability';
import type { LabXpertDB } from '../db/database';
import { getBooleanSetting, setSetting, SETTING_KEYS } from '../db/settings';
import { getActiveUser, logoutUser } from '../db/users';
import { useAppStore } from './app-store';

/** Reads what the shell needs at start-up. The user is the active one, so Log out really ends the session. */
export async function loadSession(db: LabXpertDB) {
  const [user, reduceMotion] = await Promise.all([
    getActiveUser(db),
    getBooleanSetting(db, SETTING_KEYS.reduceMotion, false),
  ]);
  return { user, reduceMotion };
}

/** Updates the screen first so the switch feels instant, then stores it; a failed write rolls back. */
export async function changeReduceMotion(db: LabXpertDB, value: boolean): Promise<void> {
  const { reduceMotion: previous, setReduceMotion } = useAppStore.getState();
  setReduceMotion(value);
  try {
    await setSetting(db, SETTING_KEYS.reduceMotion, value);
  } catch {
    setReduceMotion(previous);
  }
}

/** Forgets the active user in the db, then in the store, which sends guarded routes back to login. */
export async function endSession(db: LabXpertDB): Promise<void> {
  await logoutUser(db);
  useAppStore.getState().setUser(undefined);
}

export type BootStatus = 'checking' | 'unavailable' | 'ready';

/**
 * Opens the database once and loads the session. Any failure while doing so counts as "storage
 * unavailable": there is deliberately no fallback storage (UI_SCREENS, Global behaviour).
 */
export function useBoot(db: LabXpertDB): BootStatus {
  const [status, setStatus] = useState<BootStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const availability = await checkDatabase(db);
        if (!availability.ok) {
          if (!cancelled) setStatus('unavailable');
          return;
        }
        const session = await loadSession(db);
        if (cancelled) return;
        useAppStore.getState().hydrate(session);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [db]);

  return status;
}

/** Keeps `online` in step with the browser's online and offline events. Call once at the app root. */
export function useOnlineSync(): void {
  useEffect(() => {
    const { setOnline } = useAppStore.getState();
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
}
