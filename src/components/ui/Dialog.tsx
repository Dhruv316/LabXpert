import { forwardRef, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './IconButton';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogPanelProps {
  title: string;
  titleId: string;
  /** Text for the close button, from t(). */
  closeLabel: string;
  onClose?: () => void;
  /** Buttons, from the caller. */
  actions: ReactNode;
  children: ReactNode;
  className?: string;
  /** True inside a real modal: adds the dialog role and name. The Gallery shows the panel without it. */
  modal?: boolean;
}

/** The dialog's look, without any overlay behaviour, so the Gallery can show it in place. */
export const DialogPanel = forwardRef<HTMLDivElement, DialogPanelProps>(function DialogPanel(
  { title, titleId, closeLabel, onClose, actions, children, className, modal = false },
  ref,
) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={modal ? 'dialog' : undefined}
      aria-modal={modal ? true : undefined}
      aria-labelledby={modal ? titleId : undefined}
      className={cn('relative max-h-full w-full max-w-md overflow-y-auto rounded-panel bg-mat p-8 text-ink shadow-panel', className)}
    >
      {onClose !== undefined && (
        <IconButton icon={X} label={closeLabel} onClick={onClose} className="absolute right-3 top-3" />
      )}
      <h2 id={titleId} className="pr-10 font-heading text-2xl font-semibold">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
      <div data-dialog-actions className="mt-6 flex flex-wrap justify-end gap-3">
        {actions}
      </div>
    </div>
  );
});

export interface DialogProps extends Omit<DialogPanelProps, 'titleId' | 'onClose' | 'modal'> {
  open: boolean;
  /** Without it the dialog cannot be dismissed (no close button, Escape and a click outside do nothing): the buttons in `actions` are the only way out. */
  onClose?: () => void;
}

/** Modal dialog: Escape closes (when it can be dismissed), focus moves in and returns, Tab stays inside. */
export function Dialog({ open, onClose, ...panel }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Declared first, so its cleanup runs before focus goes back to where it was. Focus that lands outside the panel (a
  // press on the backdrop, a script) is pulled back in, so Tab can never reach the page behind a modal.
  useEffect(() => {
    if (!open) return undefined;
    const pullBack = (event: FocusEvent) => {
      const node = panelRef.current;
      if (node === null || (event.target instanceof Node && node.contains(event.target))) return;
      const firstAction = node.querySelector('[data-dialog-actions]')?.querySelector<HTMLElement>(FOCUSABLE);
      (firstAction ?? node).focus();
    };
    document.addEventListener('focusin', pullBack);
    return () => document.removeEventListener('focusin', pullBack);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panelRef.current;
    // First action button (the caller lists the safe choice first); fall back to the panel itself.
    const firstAction = node?.querySelector('[data-dialog-actions]')?.querySelector<HTMLElement>(FOCUSABLE);
    (firstAction ?? node)?.focus();
    return () => before?.focus();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose?.();
      return;
    }
    if (event.key !== 'Tab' || panelRef.current === null) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 animate-fade-in"
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        // A press on the backdrop must not move focus out of the dialog (the browser would send it to the page).
        event.preventDefault();
        onClose?.();
      }}
    >
      <DialogPanel {...panel} ref={panelRef} titleId={titleId} onClose={onClose} modal />
    </div>,
    document.body,
  );
}
