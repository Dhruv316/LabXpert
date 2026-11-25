import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import type { ExperimentConfig } from '../../model/types';
import { t, isUiKey } from '../../i18n';
import { useAppStore, useBenchStore, useDb } from '../../state';
import { BenchView } from '../bench/BenchView';
import { useCrash } from '../shell/use-crash';
import { NotFoundScreen } from './NotFoundScreen';
import { EXPERIMENTS } from './experiment-list';

function Bench({ experiment, userId }: { experiment: ExperimentConfig; userId: string }) {
  const db = useDb();
  const crash = useCrash();
  const ready = useBenchStore(
    (state) => state.session?.experiment.id === experiment.id && state.session.userId === userId,
  );

  // Finds the in-progress attempt or starts one, exactly as the picker does.
  useEffect(() => {
    useBenchStore.getState().open({ db, userId, experiment }).catch(crash);
  }, [db, userId, experiment, crash]);

  // Experiment text arrives as a key string from the spec file, as on the picker.
  const title = isUiKey(experiment.titleKey) ? t(experiment.titleKey) : experiment.id;

  // Until the attempt is loaded nothing is drawn, so a bench left over from another experiment never flashes.
  if (!ready) return <div className="flex-1" aria-busy="true" />;

  return <BenchView experiment={experiment} title={title} />;
}

/** Lab bench `/experiment/:id` (UI_SCREENS §3). The experiment comes from its JSON file, so a new one needs no code here. */
export function BenchScreen() {
  const { id } = useParams();
  const user = useAppStore((state) => state.user);
  const experiment = EXPERIMENTS.find((candidate) => candidate.id === id);
  if (experiment === undefined) return <NotFoundScreen />;
  // The route guard guarantees a user; keyed so another learner never inherits this bench.
  if (user === undefined) return null;
  return <Bench key={`${user.userId}:${experiment.id}`} experiment={experiment} userId={user.userId} />;
}
