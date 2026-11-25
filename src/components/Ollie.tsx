import { useEffect, useRef, useState } from 'react';
import type { FeedbackEntry } from '../model/types';
import { t } from '../i18n';
import happyRaw from '../assets/owl/owl-happy.svg?raw';
import thinkingRaw from '../assets/owl/owl-thinking.svg?raw';
import celebratingRaw from '../assets/owl/owl-celebrating.svg?raw';
import { cn } from './ui/cn';
import { useMotionReduced } from './ui/motion';

/** Same three values as FeedbackEntry.owl, so a feedback entry maps straight to a pose (DESIGN.md §8). */
export type OllieMood = FeedbackEntry['owl'];

const VIEW_BOX = '-14 -4 148 128';
const VIEW_WIDTH = 148;
const VIEW_HEIGHT = 128;

/**
 * The kit SVGs are used as given, inline. Only the outer <svg> and <title> are dropped:
 * they carry a hard-coded English name, and the accessible name must come from t().
 */
function innerMarkup(raw: string): string {
  return raw
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .trim();
}

const POSES: Record<OllieMood, string> = {
  happy: innerMarkup(happyRaw),
  thinking: innerMarkup(thinkingRaw),
  celebrating: innerMarkup(celebratingRaw),
};

export interface OllieProps {
  mood: OllieMood;
  /** Width in px; height follows the kit's aspect ratio. 96 is the panel header size. */
  size?: number;
  /** True when a nearby heading or bubble already says it: hides the owl from assistive tech. */
  decorative?: boolean;
  className?: string;
}

export function Ollie({ mood, size = 96, decorative = false, className }: OllieProps) {
  const reduced = useMotionReduced();
  const previous = useRef(mood);
  const [bounces, setBounces] = useState(0);

  // One quick scale-bounce when the mood changes, never on first render (DESIGN.md §8).
  useEffect(() => {
    if (previous.current === mood) return;
    previous.current = mood;
    setBounces((count) => count + 1);
  }, [mood]);

  const height = Math.round((size * VIEW_HEIGHT) / VIEW_WIDTH);

  return (
    <span
      key={bounces}
      data-mood={mood}
      className={cn('inline-block origin-bottom', bounces > 0 && !reduced && 'animate-owl-bounce', className)}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={VIEW_BOX}
        width={size}
        height={height}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : t('app.owlName')}
        aria-hidden={decorative ? true : undefined}
        focusable="false"
        dangerouslySetInnerHTML={{ __html: POSES[mood] }}
      />
    </span>
  );
}
