import { useEffect, useState } from 'react';
import { textScaleOf } from '../../bench/layout';
import { fitBenchLayout, type FittedLayout } from '../../bench/toolbar-layout';
import { t } from '../../i18n';

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

/** The bench screen's layout (and the toolbar's tier) for the current window (see `src/bench/layout.ts`). */
export function useBenchLayout({ panelCollapsed, bannerHeight, hasFooter }: BenchLayoutOptions): FittedLayout {
  const { width, height, textScale } = useViewport();
  // The longest the toolbar's counters read: three digits is more than any experiment or practice run needs.
  const counter = [t('bench.taskProgress', { current: 3, total: 3 }), t('practice.progress', { have: 3, need: 3 })].reduce((a, b) => (b.length > a.length ? b : a));
  const labels = { undo: t('bench.undo'), reset: t('bench.reset'), remove: t('bench.deleteSelected'), counter };
  return fitBenchLayout({ viewportWidth: width, viewportHeight: height, panelCollapsed, textScale, bannerHeight, hasFooter }, labels);
}
