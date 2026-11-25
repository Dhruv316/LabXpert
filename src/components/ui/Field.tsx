import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className' | 'aria-invalid'> {
  /** Always visible, above the input (never placeholder-only). */
  label: string;
  hint?: string;
  /** Shown under the input with an icon, so an error is never colour alone. */
  error?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, 'aria-describedby': extraDescribedBy, ...rest },
  ref,
) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint !== undefined ? hintId : undefined, errorId, extraDescribedBy].filter(Boolean).join(' ');
  const invalid = error !== undefined;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-body font-bold text-ink">
        {label}
      </label>
      {hint !== undefined && (
        <p id={hintId} className="text-sm text-ink-soft">
          {hint}
        </p>
      )}
      <input
        {...rest}
        ref={ref}
        id={id}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-12 rounded-control border-2 bg-white px-4 font-body text-ink',
          'transition-[border-color] duration-fast',
          invalid ? 'border-error' : 'border-ink-soft',
          'focus-visible:border-teal-deep focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-0 focus-visible:outline-teal',
          'disabled:cursor-not-allowed disabled:opacity-40',
        )}
      />
      {/* Always in the DOM so screen readers announce the text when it appears. */}
      <div id={errorId} aria-live="polite">
        {invalid && (
          <p className="flex items-start gap-2 text-sm font-semibold text-error">
            <Icon icon={CircleAlert} className="mt-px shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  );
});
