import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Check, Wrench } from 'lucide-react';
import { Chip, Icon } from '../../components/ui';
import { FOCUS_RING } from '../../components/ui/styles';
import { t } from '../../i18n';
import type { RuleResult } from '../../model/types';
import { useTutorStore } from '../../state';
import { feedbackOf } from './tutor-text';

const SECTION_TITLE = 'font-heading text-base font-semibold leading-6 text-ink';

/**
 * The bubble: a card whose tail points up at Ollie. It is the same fill as the panel, so its edge is
 * a wood border, and the tail is a rotated square that shares that border on its two outer sides.
 */
export function Bubble({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-card border-2 border-wood bg-mat p-4 text-ink shadow-lift" data-testid="tutor-bubble">
      <span aria-hidden="true" className="absolute -top-2 left-10 h-4 w-4 rotate-45 border-l-2 border-t-2 border-wood bg-mat" />
      {children}
    </div>
  );
}

function ErrorCard({ result, headingRef }: { result: RuleResult; headingRef: RefObject<HTMLHeadingElement> }) {
  const entry = feedbackOf(result);
  return (
    <Bubble>
      <h3 ref={headingRef} tabIndex={-1} className={`font-heading text-xl font-semibold leading-7 text-ink ${FOCUS_RING}`}>
        {entry.title}
      </h3>
      <p className="mt-2 font-body text-base leading-[26px] text-ink">{entry.explain}</p>
      {entry.fix !== undefined && (
        <div className="mt-4 rounded-control border-l-4 border-teal bg-teal-tint p-3" data-testid="how-to-fix">
          <p className="flex items-center gap-2 font-heading text-base font-semibold leading-6 text-ink">
            <Icon icon={Wrench} className="shrink-0 text-teal-deep" />
            {t('bench.howToFix')}
          </p>
          <p className="mt-1 font-body text-base leading-[26px] text-ink">{entry.fix}</p>
        </div>
      )}
    </Bubble>
  );
}

function AlsoCheck({ errors, primaryIndex, onChoose }: { errors: RuleResult[]; primaryIndex: number; onChoose: (index: number) => void }) {
  const others = errors.map((result, index) => ({ result, index })).filter(({ index }) => index !== primaryIndex);
  if (others.length === 0) return null;
  return (
    <section>
      <h3 className={SECTION_TITLE}>{t('bench.alsoCheck')}</h3>
      <ul className="mt-2 flex flex-col items-start gap-2">
        {others.map(({ result, index }) => (
          <li key={index} className="max-w-full">
            <Chip tone="error" onClick={() => onChoose(index)} className="max-w-full text-left">
              {feedbackOf(result).title}
            </Chip>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GoingWell({ confirmations }: { confirmations: RuleResult[] }) {
  if (confirmations.length === 0) return null;
  return (
    <section>
      <h3 className={SECTION_TITLE}>{t('bench.goodStuff')}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {confirmations.map((result, index) => (
          <li key={`${index}-${result.feedbackKey}`} className="flex items-start gap-3 rounded-control bg-ok-tint p-3 font-body text-base leading-6 text-ink">
            <Icon icon={Check} className="mt-0.5 shrink-0 text-ok" />
            <span>{feedbackOf(result).title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The results state: the primary error large, the others as chips, then what is going well. */
export function TutorResults() {
  const errors = useTutorStore((state) => state.errors);
  const confirmations = useTutorStore((state) => state.confirmations);
  const primaryIndex = useTutorStore((state) => state.primaryIndex);
  const selectError = useTutorStore((state) => state.selectError);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const primary: RuleResult | undefined = errors[primaryIndex];

  // The chip that was pressed turns into the big card and leaves the list, so focus follows to the new title.
  const focusTitle = useRef(false);
  useEffect(() => {
    if (!focusTitle.current) return;
    focusTitle.current = false;
    headingRef.current?.focus();
  }, [primaryIndex]);
  const choose = (index: number) => {
    focusTitle.current = true;
    selectError(index);
  };

  return (
    <>
      {primary !== undefined && <ErrorCard result={primary} headingRef={headingRef} />}
      <AlsoCheck errors={errors} primaryIndex={primaryIndex} onChoose={choose} />
      <GoingWell confirmations={confirmations} />
    </>
  );
}
