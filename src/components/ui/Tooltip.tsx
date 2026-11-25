import { useId, useState, type ReactNode } from 'react';
import { cn } from './cn';

export interface TooltipProps {
  content: string;
  /** Start open; used by the Gallery to show the bubble without hovering. */
  defaultOpen?: boolean;
  /** Receives the id to put in aria-describedby on the real control. */
  children: (describedBy: string) => ReactNode;
}

/** Shows on hover and keyboard focus; Escape hides it (WCAG 1.4.13). The text stays in the DOM so it can describe the control. */
export function Tooltip({ content, defaultOpen = false, children }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      {children(id)}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[16rem] -translate-x-1/2',
          'rounded-small bg-ink px-3 py-2 text-center font-body text-sm font-semibold text-cream',
          !open && 'hidden',
        )}
      >
        {content}
      </span>
    </span>
  );
}
