import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useActivation, type PressHandler } from '../../components/ui/activation';
import { cn, Icon } from '../../components/ui';
import { DISABLED_LOOK, FOCUS_RING, MOTION_BASE } from '../../components/ui/styles';
import { OVERLAY_CONTROL } from './ControlOverlay';

export interface OverlayButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onKeyDown' | 'onKeyUp' | 'children' | 'aria-label'> {
  icon: LucideIcon;
  /** Required: an icon alone has no name. Pass text from t(). */
  label: string;
  onClick?: PressHandler;
}

/**
 * An icon button that sits over the bench: a cream chip with an ink edge, so it reads on the mat,
 * and never smaller than 44 × 44 px. One press path for mouse, touch, Enter and Space (activation.ts).
 */
export const OverlayButton = forwardRef<HTMLButtonElement, OverlayButtonProps>(function OverlayButton(
  { icon, label, disabled = false, onClick, type = 'button', className, ...rest },
  ref,
) {
  const activation = useActivation<HTMLButtonElement>(onClick, disabled);
  return (
    <button
      {...rest}
      {...activation}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-label={label}
      className={cn(
        OVERLAY_CONTROL,
        'inline-flex items-center justify-center rounded-control border-2 border-ink bg-cream text-ink',
        MOTION_BASE,
        FOCUS_RING,
        disabled ? DISABLED_LOOK : 'shadow-lift hover:bg-teal-tint active:translate-y-0.5 active:shadow-press',
        className,
      )}
    >
      <Icon icon={icon} />
    </button>
  );
});
