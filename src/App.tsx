import { useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { MotionScope } from './components/ui/motion';
import { ToastProvider } from './components/ui/Toast';
import { getDb, type LabXpertDB } from './db/database';
import { t } from './i18n';
import { DbProvider, useAppStore, useBoot, useOnlineSync } from './state';
import { StorageUnavailableScreen } from './ui/screens/StorageUnavailableScreen';
import { ErrorBoundary } from './ui/shell/ErrorBoundary';

function AppRoot({ db }: { db: LabXpertDB }) {
  const status = useBoot(db);
  const reduceMotion = useAppStore((state) => state.reduceMotion);
  const language = useAppStore((state) => state.language);
  useOnlineSync();

  // The page's own language and title follow the app's language; index.html holds no text.
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t('app.name');
  }, [language]);

  // The stored setting goes in; the hook adds the OS preference (the setting wins when on).
  return (
    <MotionScope reduce={reduceMotion}>
      {status === 'unavailable' && <StorageUnavailableScreen />}
      {status === 'ready' && (
        // A new key remounts the screens, so every t() call is made again in the new language.
        <ToastProvider key={language}>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </ToastProvider>
      )}
    </MotionScope>
  );
}

/** `db` is for tests; the app uses the shared database. */
export default function App({ db }: { db?: LabXpertDB }) {
  const database = db ?? getDb();
  return (
    <ErrorBoundary>
      <DbProvider db={database}>
        <AppRoot db={database} />
      </DbProvider>
    </ErrorBoundary>
  );
}
