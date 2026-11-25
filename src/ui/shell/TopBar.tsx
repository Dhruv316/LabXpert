import { LogOut } from 'lucide-react';
import { useMatch } from 'react-router-dom';
import { Ollie } from '../../components/Ollie';
import { Button } from '../../components/ui';
import { isUiKey, t } from '../../i18n';
import { endSession, useAppStore, useDb } from '../../state';
import { EXPERIMENTS } from '../screens/experiment-list';
import { LanguageSelect } from './LanguageSelect';
import { OnlineIndicator } from './OnlineIndicator';
import { ReduceMotionSwitch } from './ReduceMotionSwitch';

/**
 * 64 px, cream with a 4 px wood bottom edge (UI_SCREENS, top bar). On the bench the experiment
 * title follows the app name; it is the page's h1 there.
 */
export function TopBar() {
  const db = useDb();
  const user = useAppStore((state) => state.user);
  const benchRoute = useMatch('/experiment/:id');
  const experiment = EXPERIMENTS.find((candidate) => candidate.id === benchRoute?.params.id);
  const benchTitle =
    experiment !== undefined && isUiKey(experiment.titleKey) ? t(experiment.titleKey) : undefined;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b-4 border-wood bg-cream px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Ollie mood="happy" size={40} decorative className="shrink-0" />
        <span className="shrink-0 font-heading text-xl font-semibold text-ink">{t('app.name')}</span>
        {benchTitle !== undefined && (
          <h1 className="min-w-0 truncate border-l-2 border-wood pl-3 font-heading text-xl font-medium text-ink">
            {benchTitle}
          </h1>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <OnlineIndicator />
        <ReduceMotionSwitch />
        <LanguageSelect />
        {user !== undefined && (
          <div className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 max-w-[10rem] truncate font-body font-bold text-ink">{user.displayName}</span>
            <Button variant="quiet" icon={LogOut} onClick={() => void endSession(db)}>
              {t('common.logout')}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
