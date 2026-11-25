/** Joins class names, skipping anything falsy so conditions read naturally at the call site. */
export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
