import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Ollie } from '../../components/Ollie';
import { Button } from '../../components/ui';
import { t } from '../../i18n';
import { usePracticeStore, type PracticeCurrent } from '../../state';
import { useCrash } from '../shell/use-crash';
import { practiceBannerText, practiceGoal, practiceTitle } from './practice-text';

/**
 * The compact banner above a practice bench (UI_SCREENS §5), one row at 1024 px: Ollie, the title with why it was
 * picked, the goal in a highlighted box, and the quiet Leave practice button. It wraps only on a narrower window.
 */
export function PracticeBanner({ practice }: { practice: PracticeCurrent }) {
  const navigate = useNavigate();
  const crash = useCrash();
  const { task, forCode } = practice;

  // No confirmation (the spec says so): the attempt is abandoned and the learner is back at the picker.
  const leave = () => {
    usePracticeStore
      .getState()
      .leavePractice()
      .then(() => navigate('/'))
      .catch(crash);
  };

  return (
    <section
      data-practice-banner
      aria-labelledby="practice-title"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-wood-light bg-cream px-4 py-2"
    >
      <Ollie mood="happy" size={48} decorative className="shrink-0" />
      <div className="min-w-0 basis-72 xl:basis-[28rem]">
        <h1 id="practice-title" className="break-words font-heading text-xl font-semibold leading-7 text-ink">
          {practiceTitle(task)}
        </h1>
        <p className="font-body text-sm leading-5 text-ink-soft">{practiceBannerText(task, forCode)}</p>
      </div>
      <div
        data-practice-goal
        className="flex min-w-0 flex-1 basis-80 items-start gap-2 rounded-control border-l-4 border-teal bg-teal-tint px-3 py-1"
      >
        <span className="shrink-0 font-heading text-sm font-semibold leading-5 text-ink">{t('practice.goalLabel')}</span>
        <p className="min-w-0 font-body text-sm leading-5 text-ink">{practiceGoal(task)}</p>
      </div>
      <Button variant="quiet" icon={ArrowLeft} className="shrink-0" onClick={leave}>
        {t('practice.exit')}
      </Button>
    </section>
  );
}
