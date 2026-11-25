import { Wifi, WifiOff } from 'lucide-react';
import { Chip } from '../../components/ui';
import { t } from '../../i18n';
import { useAppStore } from '../../state';

/** Icon and words, so the state is never colour alone. Offline changes nothing else (UI_SCREENS). */
export function OnlineIndicator() {
  const online = useAppStore((state) => state.online);
  return (
    <Chip
      role="status"
      tone={online ? 'ok' : 'neutral'}
      icon={online ? Wifi : WifiOff}
      className="max-w-[18rem]"
    >
      {online ? t('common.online') : t('common.offline')}
    </Chip>
  );
}
