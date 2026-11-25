import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button, Card, Chip, Icon, type ChipTone } from '../../components/ui';
import { FOCUS_RING, MOTION_BASE } from '../../components/ui/styles';
import {
  appNow,
  findInProgressAttempt,
  getExperimentStatus,
  newRecordId,
  startAttempt,
  type ExperimentStatus,
} from '../../db';
import { isUiKey, t, UnknownTextKeyError } from '../../i18n';
import type { ExperimentId, UserRecord } from '../../model/types';
import { useAppStore, useDb } from '../../state';
import { useCrash } from '../shell/use-crash';
import { ExperimentArt } from './ExperimentArt';
import { EXPERIMENTS } from './experiment-list';

const CHIP_TONE: Record<ExperimentStatus, ChipTone> = {
  not_started: 'neutral',
  in_progress: 'progress',
  done: 'ok',
};

type StatusMap = Readonly<Record<string, ExperimentStatus>>;

/** Experiment text arrives as a key string from the spec file; an unknown key is a spec error, not a student one. */
function textFor(key: string): string {
  if (!isUiKey(key)) throw new UnknownTextKeyError(key);
  return t(key);
}

/** The learner's status for every experiment, or undefined while it loads. */
function useStatuses(userId: string): StatusMap | undefined {
  const db = useDb();
  const crash = useCrash();
  const [statuses, setStatuses] = useState<StatusMap | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setStatuses(undefined);
    const load = async () => {
      try {
        const entries = await Promise.all(
          EXPERIMENTS.map(async ({ id }) => [id, await getExperimentStatus(db, userId, id)] as const),
        );
        if (!cancelled) setStatuses(Object.fromEntries(entries));
      } catch (error) {
        if (!cancelled) crash(error);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [db, userId, crash]);

  return statuses;
}

function PickerBody({ user }: { user: UserRecord }) {
  const db = useDb();
  const navigate = useNavigate();
  const crash = useCrash();
  const statuses = useStatuses(user.userId);
  // A ref, not state: two quick presses must still create exactly one attempt.
  const opening = useRef(false);

  const open = async (experimentId: ExperimentId) => {
    if (opening.current) return;
    opening.current = true;
    try {
      // Decided now, from the db, so a stale chip can never create a second in-progress attempt.
      const existing = await findInProgressAttempt(db, user.userId, experimentId);
      if (existing === undefined) {
        await startAttempt(db, {
          id: newRecordId(),
          userId: user.userId,
          experimentId,
          kind: 'experiment',
          startedAt: appNow(),
        });
      }
      navigate(`/experiment/${experimentId}`);
    } catch (error) {
      opening.current = false;
      crash(error);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-8" aria-busy={statuses === undefined}>
      <div className="flex flex-col gap-1">
        <p className="break-words text-lg text-ink-soft">{t('picker.hello', { name: user.displayName })}</p>
        <h1 className="font-heading text-[2rem] font-semibold leading-10">{t('picker.title')}</h1>
      </div>
      <div className="grid grid-cols-1 gap-6 min-[1100px]:grid-cols-2">
        {EXPERIMENTS.map((experiment) => {
          const status = statuses?.[experiment.id];
          const headingId = `experiment-${experiment.id}`;
          return (
            <Card key={experiment.id} as="article" aria-labelledby={headingId} className="flex flex-col gap-4">
              <ExperimentArt experiment={experiment} />
              <h2 id={headingId} className="font-heading text-2xl font-semibold">
                {textFor(experiment.titleKey)}
              </h2>
              <p>{textFor(experiment.summaryKey)}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                {status === undefined ? (
                  // Calm loading: a still placeholder where the chip will be, no text and no motion.
                  <span aria-hidden="true" className="h-8 w-32 rounded-small bg-wood-light" />
                ) : (
                  <Chip tone={CHIP_TONE[status]}>{t(`picker.status.${status}`)}</Chip>
                )}
                <Button
                  aria-describedby={headingId}
                  disabled={status === undefined}
                  onClick={() => void open(experiment.id)}
                >
                  {t('picker.open')}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      <Link
        to="/progress"
        className={`inline-flex min-h-[48px] w-fit items-center gap-2 rounded-control px-2 font-heading font-medium text-ink underline underline-offset-4 ${MOTION_BASE} ${FOCUS_RING} hover:bg-teal-tint active:translate-y-0.5`}
      >
        {t('picker.progress')}
        <Icon icon={ArrowRight} />
      </Link>
    </main>
  );
}

/** Experiment picker (UI_SCREENS §2). One card per file in `spec/experiments/`. */
export function PickerScreen() {
  const user = useAppStore((state) => state.user);
  // The route guard guarantees a user; keyed so a different learner never sees the last one's statuses.
  if (user === undefined) return null;
  return <PickerBody key={user.userId} user={user} />;
}
