import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, RotateCcw } from 'lucide-react';
import { Button, Chip, type ChipTone } from '../../components/ui';
import { loadProgress, type ExperimentStatus, type ProgressData } from '../../db';
import { t } from '../../i18n';
import type { UserRecord } from '../../model/types';
import { useAppStore, useDb } from '../../state';
import { useCrash } from '../shell/use-crash';
import { EXPERIMENTS } from './experiment-list';
import { PRACTICE_TASKS } from './practice-list';
import { bestResultText, practiceRows, textForKey, topicRows } from './progress-model';

const SECTION_TITLE = 'font-heading text-2xl font-semibold leading-8';
// Body text is 16/26 (DESIGN.md §3); Tailwind's own `text-base` is 16/24, so the line height is set here.
const BODY = 'text-base leading-[1.625rem]';
// Wraps a very long word instead of pushing the page wider (min-w-0 lets a flex child shrink to allow it).
const WRAP = 'min-w-0 break-words';
const ROW = 'flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-card bg-mat p-4 text-ink shadow-lift';

const CHIP_TONE: Record<ExperimentStatus, ChipTone> = {
  not_started: 'neutral',
  in_progress: 'progress',
  done: 'ok',
};

/** The learner's saved progress, or undefined while it loads. A failed read goes to the error boundary. */
function useProgress(userId: string): ProgressData | undefined {
  const db = useDb();
  const crash = useCrash();
  const [data, setData] = useState<ProgressData | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    loadProgress(
      db,
      userId,
      EXPERIMENTS.map((experiment) => experiment.id),
    ).then(
      (found) => {
        if (!cancelled) setData(found);
      },
      (error: unknown) => {
        if (!cancelled) crash(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, userId, crash]);

  return data;
}

function LoadingBlocks() {
  // Calm loading: still placeholders where the lists will be, no text and no motion.
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <span className="h-16 w-full rounded-card bg-wood-light" />
      <span className="h-16 w-full rounded-card bg-wood-light" />
    </div>
  );
}

function ProgressBody({ user }: { user: UserRecord }) {
  const navigate = useNavigate();
  const language = useAppStore((state) => state.language);
  const data = useProgress(user.userId);

  // Worked out while drawing: a record the language file cannot explain reaches the error boundary, never the student.
  const topics = data === undefined ? [] : topicRows(data.profile, PRACTICE_TASKS);
  const practice = data === undefined ? [] : practiceRows(data.practice, PRACTICE_TASKS, language);

  return (
    <main className="mx-auto flex w-full max-w-4xl min-w-0 flex-1 flex-col gap-8 p-8" aria-busy={data === undefined}>
      <h1 className={`${WRAP} font-heading text-[2rem] font-semibold leading-10 text-ink`}>{t('progress.title')}</h1>

      <section aria-labelledby="progress-experiments" className="flex flex-col gap-3">
        <h2 id="progress-experiments" className={SECTION_TITLE}>
          {t('progress.experiments')}
        </h2>
        {data === undefined ? (
          <LoadingBlocks />
        ) : (
          <ul className="flex flex-col gap-3">
            {EXPERIMENTS.map((experiment) => {
              const row = data.experiments.find((entry) => entry.experimentId === experiment.id);
              return (
                <li key={experiment.id} className={ROW}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 className={`${WRAP} font-heading text-xl font-semibold leading-7`}>{textForKey(experiment.titleKey)}</h3>
                    {row?.bestKinds !== undefined && <p className={`${BODY} ${WRAP}`}>{bestResultText(row.bestKinds)}</p>}
                  </div>
                  {row !== undefined && <Chip tone={CHIP_TONE[row.status]}>{t(`picker.status.${row.status}`)}</Chip>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="progress-topics" className="flex flex-col gap-3">
        <h2 id="progress-topics" className={SECTION_TITLE}>
          {t('progress.topics')}
        </h2>
        {data === undefined ? (
          <LoadingBlocks />
        ) : topics.length === 0 ? (
          <p className={`${BODY} ${WRAP} text-ink`}>{t('progress.topicsEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {topics.map((row) => {
              const nameId = `topic-${row.id}`;
              return (
                <li key={row.id} className={ROW}>
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 id={nameId} className={`${WRAP} font-heading text-xl font-semibold leading-7`}>
                      {row.topic}
                    </h3>
                    <p className={`${BODY} ${WRAP}`}>{row.countText}</p>
                  </div>
                  <Button aria-describedby={nameId} onClick={() => navigate(`/practice/${row.taskId}`)}>
                    {t('progress.startPractice')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="progress-practice" className="flex flex-col gap-3">
        <h2 id="progress-practice" className={SECTION_TITLE}>
          {t('progress.practiceDone')}
        </h2>
        {data === undefined ? (
          <LoadingBlocks />
        ) : practice.length === 0 ? (
          <p className={`${BODY} ${WRAP} text-ink`}>{t('progress.practiceEmpty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {practice.map((row) => (
              <li key={row.id} className={ROW}>
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className={`${WRAP} font-heading text-xl font-semibold leading-7`}>{row.title}</h3>
                  <p className={`${BODY} ${WRAP}`}>{row.date}</p>
                </div>
                <Chip tone={row.clean ? 'ok' : 'progress'} icon={row.clean ? Check : RotateCcw}>
                  {row.resultText}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate('/')}>
          {t('result.back')}
        </Button>
      </div>
    </main>
  );
}

/** My progress (UI_SCREENS §6): experiments with their best result, topics to practise, completed practice. */
export function ProgressScreen() {
  const user = useAppStore((state) => state.user);
  // The route guard guarantees a user; keyed so a different learner never sees the last one's data.
  if (user === undefined) return null;
  return <ProgressBody key={user.userId} user={user} />;
}
