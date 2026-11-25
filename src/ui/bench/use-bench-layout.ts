import { useEffect, useState } from 'react';
import { benchLayout, textScaleOf, type BenchLayout } from '../../bench/layout';

interface Viewport {
  width: number;
  height: number;
  textScale: number;
}

const read = (): Viewport => ({
  width: window.innerWidth,
  height: window.innerHeight,
  textScale: textScaleOf(Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize)),
});

const same = (a: Viewport, b: Viewport): boolean => a.width === b.width && a.height === b.height && a.textScale === b.textScale;

/** The window size and text scale, kept current. */
function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(read);
  useEffect(() => {
    const update = () => setViewport((previous) => {
      const next = read();
      return same(previous, next) ? previous : next;
    });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return viewport;
}

export interface BenchLayoutOptions {
  panelCollapsed: boolean;
  bannerHeight: number;
  hasFooter: boolean;
}

/** The bench screen's layout for the current window (see `src/bench/layout.ts`). */
export function useBenchLayout({ panelCollapsed, bannerHeight, hasFooter }: BenchLayoutOptions): BenchLayout {
  const { width, height, textScale } = useViewport();
  return benchLayout({ viewportWidth: width, viewportHeight: height, panelCollapsed, textScale, bannerHeight, hasFooter });
}
