import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CircleAlert, Wrench } from 'lucide-react';
import { Ollie } from '../../components/Ollie';
import { Button, Icon, useMotionReduced } from '../../components/ui';
import { FOCUS_RING } from '../../components/ui/styles';
import { loadResult, suggestPractice, type AttemptConfirmation, type AttemptError, type ResultLookup } from '../../db';
import { t } from '../../i18n';
import type { ExperimentConfig } from '../../model/types';
import { useAppStore, useDb } from '../../state';
import { useAnnounce } from '../bench/announcer';
import { AnnouncerProvider } from '../bench/LiveRegion';
import { useCrash } from '../shell/use-crash';
import { NotFoundScreen } from './NotFoundScreen';
import { EXPERIMENTS } from './experiment-list';
import { PRACTICE_TASKS } from './practice-list';
import { confirmationRows, mistakeCards } from './result-model';

const SECTION_TITLE = 'font-heading text-2xl font-semibold leading-8';
// Body text is 16/26 (DESIGN.md §3); Tailwind's own `text-base` is 16/24, so the line height is set here.
const BODY = 'text-base leading-[1.625rem]';
// Wraps a very long word instead of pushing the page wider (min-w-0 lets a flex child shrink to allow it).
const WRAP = 'min-w-0 break-words';

interface ViewProps {
  userId: string;
  experiment: ExperimentConfig;
  errors: AttemptError[];
  confirmations: AttemptConfirmation[];
}

function ResultView({ userId, experiment, errors, confirmations }: ViewProps) {
  const db = useDb();
  const navigate = useNavigate();
  const crash = useCrash();
  const announce = useAnnounce();
  const reduced = useMotionReduced();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // A ref, not state: two quick presses must still ask for one suggestion.
  const choosing = useRef(false);

  // On arrival focus goes to the title and the live region says it, so a screen reader user knows the screen changed.
  useEffect(() => {
    headingRef.current?.focus();
    announce(t('result.title'));
  }, [announce]);

  // Worked out while drawing: a record the language file cannot explain reaches the error boundary, never the student.
  const wentWell = confirmationRows(confirmations, experiment);
  const mistakes = mistakeCards(errors);

  const goToPractice = async () => {
    if (choosing.current) return;
    choosing.current = true;
    try {
      const choice = await suggestPractice(db, userId, experiment.id, PRACTICE_TASKS);
      // Every experiment has an extension task, so a missing choice means the practice data is broken.
      if (choice === undefined) throw new Error(`No practice task for ${experiment.id}`);
      navigate(`/practice/${choice.task.id}`);
    } catch (error) {
      choosing.current = false;
      crash(error);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl min-w-0 flex-1 flex-col gap-8 p-8">
      <header className="flex flex-wrap items-center gap-6">
        {/* One 160 ms bounce on arrival; with Reduce motion there is no class at all. */}
        <Ollie mood="celebrating" size={160} decorative className={reduced ? undefined : 'animate-owl-bounce'} />
        <h1
          ref={headingRef}
          tabIndex={-1}
          className={`${WRAP} font-heading text-[2rem] font-semibold leading-10 text-ink ${FOCUS_RING}`}
        >
          {t('result.title')}
        </h1>
      </header>

      {wentWell.length > 0 && (
        <section aria-labelledby="result-well" className="flex flex-col gap-3">
          <h2 id="result-well" className={SECTION_TITLE}>
            {t('result.wentWell')}
          </h2>
          <ul className="flex flex-col gap-2">
            {wentWell.map((row) => (
              <li key={row.id} className={`flex items-start gap-3 rounded-control bg-ok-tint p-3 ${BODY} text-ink`}>
                <Icon icon={Check} className="mt-0.5 shrink-0 text-ok" />
                <span className={WRAP}>{row.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="result-mistakes" className="flex flex-col gap-3">
        <h2 id="result-mistakes" className={SECTION_TITLE}>
          {t('result.mistakesTitle')}
        </h2>
        {mistakes.length === 0 ? (
          <p className={`flex items-start gap-3 rounded-control bg-ok-tint p-3 ${BODY} text-ink`}>
            <Icon icon={Check} className="mt-0.5 shrink-0 text-ok" />
            <span className={WRAP}>{t('result.noMistakes')}</span>
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-2">
            {mistakes.map((card) => (
              <li
                key={card.id}
                className="flex min-w-0 flex-col gap-3 rounded-card border-l-4 border-error bg-mat p-5 text-ink shadow-lift"
              >
                <div className="flex items-start gap-3">
                  <Icon icon={CircleAlert} className="mt-1 shrink-0 text-error" />
                  <h3 className={`${WRAP} font-heading text-xl font-semibold leading-7`}>{card.title}</h3>
                </div>
                <p className={`${BODY} ${WRAP} font-semibold`}>{card.countText}</p>
                {card.fix !== undefined && (
                  <p className={`flex items-start gap-3 rounded-control border-l-4 border-teal bg-teal-tint p-3 ${BODY}`}>
                    <Icon icon={Wrench} className="mt-0.5 shrink-0 text-teal-deep" />
                    <span className={WRAP}>{card.fix}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <Button icon={ArrowRight} onClick={() => void goToPractice()}>
          {t('result.practice')}
        </Button>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/')}>
          {t('result.back')}
        </Button>
      </div>
    </main>
  );
}

function ResultBody({ userId, attemptId }: { userId: string; attemptId: string }) {
  const db = useDb();
  const crash = useCrash();
  const [lookup, setLookup] = useState<ResultLookup | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadResult(db, userId, attemptId).then(
      (found) => {
        if (!cancelled) setLookup(found);
      },
      (error: unknown) => {
        if (!cancelled) crash(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, userId, attemptId, crash]);

  // Calm loading: a still block where the title will be, no text and no motion.
  if (lookup === undefined) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 p-8" aria-busy="true">
        <div aria-hidden="true" className="h-40 rounded-card bg-mat" />
      </main>
    );
  }
  if (lookup.status === 'not-found') return <NotFoundScreen />;
  if (lookup.status === 'in-progress') return <Navigate to={`/experiment/${lookup.experimentId}`} replace />;

  const experiment = EXPERIMENTS.find((candidate) => candidate.id === lookup.attempt.experimentId);
  if (experiment === undefined) return <NotFoundScreen />;
  return (
    <AnnouncerProvider>
      <ResultView userId={userId} experiment={experiment} errors={lookup.errors} confirmations={lookup.confirmations} />
    </AnnouncerProvider>
  );
}

/** Result `/result/:attemptId` (UI_SCREENS §4): the student's own finished experiment, and nothing else. */
export function ResultScreen() {
  const { attemptId } = useParams();
  const user = useAppStore((state) => state.user);
  if (attemptId === undefined) return <NotFoundScreen />;
  // The route guard guarantees a user; keyed so another learner never inherits this learner's result.
  if (user === undefined) return null;
  return <ResultBody key={`${user.userId}:${attemptId}`} userId={user.userId} attemptId={attemptId} />;
}
