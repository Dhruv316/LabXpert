import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

/** DESIGN.md §9: a toast stays for 2 seconds. */
export const TOAST_DURATION_MS = 2000;

/** `success` is the check-mark pill (Reading recorded). `warning` is for a refusal: a warn-coloured edge and a different icon, so it is never colour alone. */
export type ToastVariant = 'success' | 'warning';

const VARIANT: Record<ToastVariant, { glyph: LucideIcon; pill: string; icon: string }> = {
  success: { glyph: Check, pill: '', icon: '' },
  warning: { glyph: TriangleAlert, pill: 'border-2 border-warn', icon: 'text-warn' },
};

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  /** Pass text from t(). */
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** The visual only: a small ink pill. Used by the viewport and by the Gallery. */
export function ToastPill({ children, className, variant = 'success' }: { children: ReactNode; className?: string; variant?: ToastVariant }) {
  const look = VARIANT[variant];
  return (
    <div
      data-variant={variant}
      className={cn(
        'inline-flex items-center gap-2 rounded-pill bg-ink px-5 py-3 font-body font-semibold text-cream shadow-lift',
        look.pill,
        className,
      )}
    >
      <Icon icon={look.glyph} className={look.icon} />
      <span>{children}</span>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const show = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, variant }]);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, TOAST_DURATION_MS),
    );
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The live region exists before any toast so screen readers announce each new one politely. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex flex-col items-center gap-2"
      >
        {toasts.map((toast) => (
          <ToastPill key={toast.id} variant={toast.variant} className="animate-toast-in">
            {toast.message}
          </ToastPill>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
