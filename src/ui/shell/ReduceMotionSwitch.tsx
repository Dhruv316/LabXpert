import { Check } from 'lucide-react';
import { cn, Icon } from '../../components/ui';
import { t } from '../../i18n';
import { changeReduceMotion, useAppStore, useDb } from '../../state';

/** A real switch (role, aria-checked). The knob position and the check show the state, not colour alone. */
export function ReduceMotionSwitch() {
  const db = useDb();
  const on = useAppStore((state) => state.reduceMotion);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => void changeReduceMotion(db, !on)}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-control px-2 font-body text-ink',
        'hover:bg-teal-tint focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-teal',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-block h-6 w-11 shrink-0 rounded-full border-2 border-ink',
          on ? 'bg-teal-deep' : 'bg-white',
        )}
      >
        <span
          className={cn(
            'absolute top-px flex h-4 w-4 items-center justify-center rounded-full bg-ink text-cream',
            on ? 'left-6' : 'left-px',
          )}
        >
          {on && <Icon icon={Check} size={12} />}
        </span>
      </span>
      {t('common.reduceMotion')}
    </button>
  );
}
