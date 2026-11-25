import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article';
}

/** Picker and result cards: mat fill, card radius, physical lift shadow (DESIGN.md §9). */
export function Card({ as: Tag = 'div', className, ...rest }: CardProps) {
  return <Tag {...rest} className={cn('rounded-card bg-mat p-6 text-ink shadow-lift', className)} />;
}
