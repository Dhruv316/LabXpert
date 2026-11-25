import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { t } from '../../i18n';
import { MessageScreen } from '../shell/MessageScreen';

export function NotFoundScreen() {
  const navigate = useNavigate();
  return (
    <MessageScreen
      title={t('error.notFoundTitle')}
      body={t('error.notFoundBody')}
      action={<Button onClick={() => navigate('/')}>{t('error.backToStart')}</Button>}
    />
  );
}
