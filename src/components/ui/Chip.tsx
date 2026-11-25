import type { HTMLAttributes, ReactNode } from 'react';
import { Check, CircleAlert, Circle, Clock, type LucideIcon } from 'lucide-react';
import { useActivation, type PressHandler } from './activation';
import { cn } from './cn';
import { Icon } from './Icon';
import { FOCUS_RING, LIFT, MOTION_BASE } from './styles';

export type ChipTone = 'neutral' | 'progress' | 'ok' | 'error';

export interface ChipProps extends Omit<HTMLAttributes<HTMLElement>, 'onClick' | 'onKeyDown' | 'onKeyUp' | 'children'> {
  tone?: ChipTone;
  /** Overrides the tone's icon. A chip always shows one, so state is never colour alone. */
  icon?: LucideIcon;
  /** Makes the chip a button (e.g. "Also check" highlighting a part on the bench). */
  onClick?: PressHandler;
  children: ReactNode;
}

const TONE: Record<ChipTone, { box: string; icon: string; glyph: LucideIcon }> = {
  neutral: { box: 'border-wood bg-mat', icon: 'text-ink-soft', glyph: Circle },
  progress: { box: 'border-teal-deep bg-teal-tint', icon: 'text-teal-deep', glyph: Clock },
  ok: { box: 'border-ok bg-ok-tint', icon: 'text-ok', glyph: Check },
  error: { box: 'border-error bg-error-tint', icon: 'text-error', glyph: CircleAlert },
};

const BASE = 'inline-flex items-center gap-2 rounded-small border-2 px-3 py-1 font-body text-sm font-semibold text-ink';

/** Status pill or, with onClick, a button chip. Text is ink on a tint (high contrast); colour is never the only signal. */
export function Chip({ tone = 'neutral', icon, onClick, className, children, ...rest }: ChipProps) {
  const activation = useActivation<HTMLButtonElement>(onClick, false);
  const look = TONE[tone];
  const content = (
    <>
      <Icon icon={icon ?? look.glyph} size={16} className={look.icon} />
      {children}
    </>
  );

  if (onClick === undefined) {
    return (
      <span {...rest} data-tone={tone} className={cn(BASE, 'min-h-[32px]', look.box, className)}>
        {content}
      </span>
    );
  }

  return (
    <button
      {...rest}
      {...activation}
      type="button"
      data-tone={tone}
      data-variant="chip"
      className={cn(BASE, 'min-h-[44px]', look.box, MOTION_BASE, FOCUS_RING, LIFT, className)}
    >
      {content}
    </button>
  );
}
