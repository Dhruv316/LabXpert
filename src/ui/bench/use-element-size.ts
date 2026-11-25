import { useLayoutEffect, useState, type RefObject } from 'react';
import type { BoxSize } from '../../bench/overlay';

/**
 * The element's size in screen px, kept current as the window or the layout changes. Undefined until
 * it has been measured. Read in a layout effect, so the first paint already has the right positions.
 */
export function useElementSize(ref: RefObject<HTMLElement>): BoxSize | undefined {
  const [size, setSize] = useState<BoxSize | undefined>(undefined);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const read = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize((previous) => (previous?.width === width && previous.height === height ? previous : { width, height }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
