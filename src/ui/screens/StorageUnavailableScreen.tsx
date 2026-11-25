import { t } from '../../i18n';
import { MessageScreen } from '../shell/MessageScreen';

/** Full page, no way forward: there is no fallback storage (UI_SCREENS, Global behaviour). */
export function StorageUnavailableScreen() {
  return (
    <MessageScreen className="min-h-screen" title={t('storage.title')} body={t('storage.body')} />
  );
}
