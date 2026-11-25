import type { LucideIcon } from 'lucide-react';

export interface IconProps {
  icon: LucideIcon;
  /** px; DESIGN.md §9 sets 20 for buttons. */
  size?: number;
  /** Accessible name. Leave out when the icon sits next to text or inside a labelled button. */
  label?: string;
  className?: string;
}

/** The only place lucide icons are configured: 20 px, stroke 2, hidden from assistive tech unless labelled. */
export function Icon({ icon: Glyph, size = 20, label, className }: IconProps) {
  if (label === undefined) {
    return <Glyph size={size} strokeWidth={2} aria-hidden="true" focusable="false" className={className} />;
  }
  return <Glyph size={size} strokeWidth={2} role="img" aria-label={label} className={className} />;
}
