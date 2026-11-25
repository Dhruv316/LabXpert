import { LogOut } from 'lucide-react';
import { useMatch } from 'react-router-dom';
import { useMemo } from 'react';
import { Ollie } from '../../components/Ollie';
import { Button } from '../../components/ui';
import { isUiKey, t } from '../../i18n';
import { endSession, useAppStore, useDb } from '../../state';
import { EXPERIMENTS } from '../screens/experiment-list';
import { LanguageSelect } from './LanguageSelect';
import { OnlineIndicator } from './OnlineIndicator';
import { ReduceMotionSwitch } from './ReduceMotionSwitch';
import { topBarLayout } from './topbar-layout';
import { useTopBarMetrics } from './use-topbar-metrics';

const rem = (px: number): string => `${px / 16}rem`;

/**
 * 64 px, cream with a 4 px wood bottom edge (UI_SCREENS, top bar). On the bench the experiment
 * title follows the app name; it is the page's h1 there. How items shrink at narrow widths and large text
 * is decided by `topBarLayout` (pure, tested); the bar wraps onto a second row only as a last resort.
 */
export function TopBar() {
  const db = useDb();
  const user = useAppStore((state) => state.user);
  const benchRoute = useMatch('/experiment/:id');
  const experiment = EXPERIMENTS.find((candidate) => candidate.id === benchRoute?.params.id);
  const benchTitle =
    experiment !== undefined && isUiKey(experiment.titleKey) ? t(experiment.titleKey) : undefined;

  const { viewportWidth, textScale } = useTopBarMetrics();
  const layout = useMemo(
    () =>
      topBarLayout({
        viewportWidth,
        textScale,
        userName: user?.displayName ?? '',
        labels: {
          appName: t('app.name'),
          chip: t('common.online').length >= t('common.offline').length ? t('common.online') : t('common.offline'),
          reduceMotion: t('common.reduceMotion'),
          logout: t('common.logout'),
        },
      }),
    [viewportWidth, textScale, user?.displayName],
  );

  return (
    <header
      data-tier={layout.tier}
      style={{ paddingInline: rem(layout.padX), columnGap: rem(layout.gap) }}
      className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-y-1 border-b-4 border-wood bg-cream"
    >
      <div className="flex min-w-0 flex-1 basis-0 items-center gap-3" style={{ minWidth: rem(layout.leftMinRem * 16) }}>
        <Ollie mood="happy" size={layout.logo} decorative className="shrink-0" />
        <span
          className="shrink-0 whitespace-nowrap font-heading font-semibold text-ink"
          style={{ fontSize: rem(layout.appNamePx) }}
        >
          {t('app.name')}
        </span>
        {benchTitle !== undefined && (
          <h1
            title={benchTitle}
            className="min-w-0 truncate border-l-2 border-wood pl-3 font-heading text-xl font-medium text-ink"
          >
            {benchTitle}
          </h1>
        )}
      </div>
      <div className="flex items-center" style={{ columnGap: rem(layout.gap) }}>
        <OnlineIndicator wrap={layout.wrapLabels} />
        <ReduceMotionSwitch wrap={layout.wrapLabels} />
        <LanguageSelect widthRem={layout.languageRem} padX={layout.controlPadX} />
        {user !== undefined && (
          <div className="flex items-center gap-1">
            {/* The text is the full name; CSS only draws it shorter. A native title shows it on hover: the
                Tooltip component opens upward, which would run off the top of the window from this bar. */}
            <span
              title={layout.accessibleName}
              data-truncated={layout.nameTruncated}
              className="min-w-0 truncate font-body font-bold text-ink"
              style={{ maxWidth: `${layout.nameMaxRem}rem` }}
            >
              {user.displayName}
            </span>
            <Button
              variant="quiet"
              icon={LogOut}
              onClick={() => void endSession(db)}
              className="shrink-0 whitespace-nowrap"
              style={{ paddingInline: rem(layout.controlPadX) }}
            >
              {t('common.logout')}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
