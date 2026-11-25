import { useNavigate } from 'react-router-dom';
import { Ollie } from '../../components/Ollie';
import { Button, Dialog, useMotionReduced } from '../../components/ui';
import { t } from '../../i18n';
import { usePracticeStore } from '../../state';
import { useCrash } from '../shell/use-crash';

/**
 * Shown when the practice store has a completion (set once, by 14A). A modal that cannot be dismissed: Esc and a click
 * outside do nothing, so the two buttons are the only way on. Both close the practice (a finished attempt stays
 * finished) and then navigate.
 */
export function CompletionOverlay() {
  const completion = usePracticeStore((state) => state.completion);
  const navigate = useNavigate();
  const crash = useCrash();
  const reduced = useMotionReduced();

  const go = (path: string) => {
    usePracticeStore
      .getState()
      .leavePractice()
      .then(() => navigate(path))
      .catch(crash);
  };

  return (
    <Dialog
      open={completion !== undefined}
      title={t('practice.done')}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button onClick={() => go('/')}>{t('result.back')}</Button>
          <Button variant="quiet" onClick={() => go('/progress')}>
            {t('picker.progress')}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-4">
        {/* One 160 ms bounce on arrival; with Reduce motion there is no class at all. */}
        <Ollie mood="celebrating" size={96} decorative className={reduced ? undefined : 'animate-owl-bounce'} />
        <p className="min-w-0 flex-1 font-body text-base leading-[1.625rem]">
          {completion?.clean === true ? t('practice.doneClean') : t('practice.doneNotClean')}
        </p>
      </div>
    </Dialog>
  );
}
