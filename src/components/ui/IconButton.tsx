import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useActivation, type PressHandler } from './activation';
import { cn } from './cn';
import { Icon } from './Icon';
import { DISABLED_LOOK, FOCUS_RING, MOTION_BASE } from './styles';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onKeyDown' | 'onKeyUp' | 'children' | 'aria-label'> {
  icon: LucideIcon;
  /** Required: an icon alone has no name. Pass text from t(). */
  label: string;
  onClick?: PressHandler;
}

/** 44 × 44 minimum target, 20 px icon, stroke 2 (DESIGN.md §9). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, disabled = false, onClick, type = 'button', className, ...rest },
  ref,
) {
  const activation = useActivation<HTMLButtonElement>(onClick, disabled, type === 'submit');

  return (
    <button
      {...rest}
      {...activation}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-label={label}
      data-variant="icon"
      className={cn(
        'inline-flex h-11 w-11 items-center justify-center rounded-control bg-transparent text-ink',
        MOTION_BASE,
        FOCUS_RING,
        disabled ? DISABLED_LOOK : 'hover:bg-teal-tint active:translate-y-0.5',
        className,
      )}
    >
      <Icon icon={icon} />
    </button>
  );
});
