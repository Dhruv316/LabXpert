/** Shared class strings so every interactive component shows the same focus and lift behaviour. */

/** 3 px teal ring on keyboard focus (DESIGN.md §11). */
export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-teal';

/** Disabled look: 40% opacity, no lift (DESIGN.md §9). Covers native and aria-disabled. */
export const DISABLED_LOOK = 'opacity-40 cursor-not-allowed shadow-none';

/** Physical lift on hover, drop on press (DESIGN.md §4 and §9). Applied only while enabled. */
export const LIFT = 'hover:-translate-y-px active:translate-y-0.5 active:shadow-press';

export const MOTION_BASE =
  'transition-[transform,box-shadow,background-color] duration-fast ease-bouncy';
