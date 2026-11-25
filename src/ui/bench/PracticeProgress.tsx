import { useEffect, useRef } from 'react';
import { t } from '../../i18n';
import { selectPracticeProgress, usePracticeStore } from '../../state';
import { useAnnounce } from './announcer';

/**
 * "Progress: 1 of 3" for the practice attempt's completion condition, always visible at the right of the bench
 * toolbar. The words carry the value; the small bar only repeats it. Nothing on an experiment bench.
 */
export function PracticeProgress() {
  const progress = usePracticeStore(selectPracticeProgress);
  const announce = useAnnounce();
  const text = progress === undefined ? undefined : t('practice.progress', { have: progress.have, need: progress.need });
  const have = progress?.have;
  // Starts as the current value, so opening or resuming a run is silent; only a reading that moves it is said.
  const seen = useRef(have);

  useEffect(() => {
    if (seen.current === have) return;
    seen.current = have;
    if (text !== undefined) announce(text);
  }, [have, text, announce]);

  if (progress === undefined || text === undefined) return null;
  const share = progress.need === 0 ? 0 : Math.round((progress.have / progress.need) * 100);
  return (
    <div
      data-practice-progress
      role="progressbar"
      aria-label={text}
      aria-valuemin={0}
      aria-valuemax={progress.need}
      aria-valuenow={progress.have}
      aria-valuetext={text}
      className="ml-auto flex flex-col gap-1 rounded-control border-2 border-wood-light bg-cream px-3 py-1"
    >
      <span className="font-body text-sm font-bold leading-5 text-ink">{text}</span>
      <span aria-hidden="true" className="block h-1 w-full overflow-hidden rounded-small bg-wood-light">
        <span className="block h-full rounded-small bg-teal-deep" style={{ width: `${share}%` }} />
      </span>
    </div>
  );
}
