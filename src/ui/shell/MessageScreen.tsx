import { useEffect, useRef, type ReactNode } from 'react';
import { Ollie } from '../../components/Ollie';
import { Card, cn } from '../../components/ui';

export interface MessageScreenProps {
  title: string;
  body: string;
  /** The way out, if there is one (a button). The storage screen has none. */
  action?: ReactNode;
  className?: string;
}

/**
 * Shared look of the three error screens: Ollie thinking beside a short kind message.
 * Fills whatever room it is given, so it works both full page and inside the shell.
 */
export function MessageScreen({ title, body, action, className }: MessageScreenProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  // The screen replaces whatever had focus (a button that was just pressed, a page that is gone).
  // Moving focus to the message lets a keyboard or screen-reader user start from it, not from the top.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <main className={cn('flex flex-1 items-center justify-center bg-cream p-8', className)}>
      <Card as="section" className="flex max-w-2xl flex-wrap items-center gap-8">
        <Ollie mood="thinking" size={140} decorative />
        <div className="flex min-w-0 flex-1 basis-64 flex-col items-start gap-4">
          <h1 ref={heading} tabIndex={-1} className="font-heading text-[2rem] font-semibold leading-10 focus:outline-none">
            {title}
          </h1>
          <p className="max-w-[70ch]">{body}</p>
          {action}
        </div>
      </Card>
    </main>
  );
}
