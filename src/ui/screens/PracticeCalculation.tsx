import { useCallback, useRef } from 'react';
import { answeredText } from '../../bench/calc-cards';
import type { PracticeTask } from '../../model/types';
import { usePracticeStore } from '../../state';
import { CalcCard } from '../bench/CalcCard';
import { CompletionOverlay } from '../bench/CompletionOverlay';
import { AnnouncerProvider } from '../bench/LiveRegion';
import { PracticeBanner } from '../bench/PracticeBanner';
import { PracticeProgress } from '../bench/PracticeProgress';
import { NotFoundScreen } from './NotFoundScreen';
import { usePracticeOpening } from './use-practice-opening';

/**
 * A calculation practice task (UI_SCREENS §5): the banner of every practice screen, one card per `calcPairs` entry,
 * the progress and the completion overlay. The attempt, the saved answers and the completion all come from the
 * practice store (14A); this screen only draws them.
 */
export function PracticeCalculation({ task, userId }: { task: PracticeTask; userId: string }) {
  const opening = usePracticeOpening(task, userId);
  const calcDone = usePracticeStore((state) => state.calcDone);
  const answers = usePracticeStore((state) => state.evidence.answers);
  const inputs = useRef(new Map<number, HTMLInputElement>());

  const registerInput = useCallback((index: number, element: HTMLInputElement | null) => {
    if (element === null) inputs.current.delete(index);
    else inputs.current.set(index, element);
  }, []);

  // A locked card cannot keep focus, so after a correct answer focus goes on to the next card still open. When that
  // answer finished the task, the completion overlay takes focus instead.
  const focusNext = useCallback((from: number) => {
    const state = usePracticeStore.getState();
    if (state.completion !== undefined) return;
    const pairs = state.current?.task.calcPairs ?? [];
    const open = pairs.map((_pair, index) => index).filter((index) => !state.calcDone.includes(index));
    const next = open.find((index) => index > from) ?? open[0];
    if (next !== undefined) inputs.current.get(next)?.focus();
  }, []);

  if (opening.status === 'unavailable') return <NotFoundScreen />;
  if (opening.status === 'loading') return <div className="flex-1" aria-busy="true" />;

  const pairs = task.calcPairs ?? [];
  return (
    <AnnouncerProvider>
      <PracticeBanner practice={opening.practice} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-4">
        <div className="flex">
          <PracticeProgress />
        </div>
        <ol className="flex flex-col gap-4">
          {pairs.map((pair, index) => (
            <li key={index}>
              <CalcCard
                index={index}
                pair={pair}
                done={calcDone.includes(index)}
                answeredText={calcDone.includes(index) ? answeredText(pair, answers) : ''}
                registerInput={registerInput}
                onCorrect={focusNext}
              />
            </li>
          ))}
        </ol>
      </main>
      <CompletionOverlay />
    </AnnouncerProvider>
  );
}
