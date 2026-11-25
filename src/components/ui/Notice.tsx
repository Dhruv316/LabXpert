import type { ReactNode } from 'react';
import { CircleAlert, Check, Info, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export type NoticeTone = 'error' | 'ok' | 'info';

const TONE: Record<NoticeTone, { box: string; icon: string; glyph: LucideIcon; role: 'alert' | 'status' }> = {
  error: { box: 'border-error bg-error-tint', icon: 'text-error', glyph: CircleAlert, role: 'alert' },
  ok: { box: 'border-ok bg-ok-tint', icon: 'text-ok', glyph: Check, role: 'status' },
  info: { box: 'border-teal bg-teal-tint', icon: 'text-teal-deep', glyph: Info, role: 'status' },
};

/** A banner or inline message: coloured edge plus an icon, so the tone is never colour alone. */
export function Notice({ tone = 'info', children, className }: { tone?: NoticeTone; children: ReactNode; className?: string }) {
  const look = TONE[tone];
  return (
    <div
      role={look.role}
      data-tone={tone}
      className={cn('flex items-start gap-3 rounded-control border-l-4 p-4 font-body text-ink', look.box, className)}
    >
      <Icon icon={look.glyph} className={cn('mt-0.5 shrink-0', look.icon)} />
      <div>{children}</div>
    </div>
  );
}
