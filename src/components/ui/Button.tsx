import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useActivation, type PressHandler } from './activation';
import { cn } from './cn';
import { Icon } from './Icon';
import { DISABLED_LOOK, FOCUS_RING, LIFT, MOTION_BASE } from './styles';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onKeyDown' | 'onKeyUp' | 'children'> {
  /** primary = the one main action in an area (orange); secondary = teal; quiet = everything else. */
  variant?: ButtonVariant;
  icon?: LucideIcon;
  /** Why the button is disabled. Shown as a tooltip; the button stays focusable so keyboard users can read it. */
  disabledReason?: string;
  onClick?: PressHandler;
  children: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-orange text-ink shadow-lift',
  secondary: 'bg-teal-deep text-white shadow-lift',
  quiet: 'bg-transparent text-ink hover:bg-teal-tint',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', icon, disabled = false, disabledReason, onClick, type = 'button', className, children, ...rest },
  ref,
) {
  // With a reason, use aria-disabled so the button can take focus and show the tooltip.
  const explainWhy = disabled && disabledReason !== undefined;
  const activation = useActivation<HTMLButtonElement>(onClick, disabled, type === 'submit');

  const render = (describedBy?: string) => (
    <button
      {...rest}
      {...activation}
      ref={ref}
      type={type}
      data-variant={variant}
      disabled={disabled && !explainWhy}
      aria-disabled={explainWhy ? true : undefined}
      aria-describedby={describedBy ?? rest['aria-describedby']}
      className={cn(
        'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-control px-6 py-2',
        'font-heading text-base font-medium',
        MOTION_BASE,
        FOCUS_RING,
        VARIANT_CLASS[variant],
        disabled ? DISABLED_LOOK : variant !== 'quiet' && LIFT,
        className,
      )}
    >
      {icon !== undefined && <Icon icon={icon} />}
      {children}
    </button>
  );

  return explainWhy ? <Tooltip content={disabledReason}>{render}</Tooltip> : render();
});
