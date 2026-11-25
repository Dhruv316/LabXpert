import { Wifi, WifiOff } from 'lucide-react';
import { Chip } from '../../components/ui';
import { t } from '../../i18n';
import { useAppStore } from '../../state';

/** Icon and words, so the state is never colour alone. Offline changes nothing else (UI_SCREENS). Words wrap, never clip, when the bar is tight. */
export function OnlineIndicator({ wrap = false }: { wrap?: boolean }) {
  const online = useAppStore((state) => state.online);
  return (
    <Chip
      role="status"
      tone={online ? 'ok' : 'neutral'}
      icon={online ? Wifi : WifiOff}
      className={wrap ? 'shrink-0 text-center leading-tight' : 'shrink-0 whitespace-nowrap'}
    >
      {online ? t('common.online') : t('common.offline')}
    </Chip>
  );
}
