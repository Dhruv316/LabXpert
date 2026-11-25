import { useEffect, useState } from 'react';
import { textScaleOf } from '../../bench/layout';

interface TopBarMetrics {
  viewportWidth: number;
  textScale: number;
}

function read(): TopBarMetrics {
  return {
    viewportWidth: window.innerWidth,
    textScale: textScaleOf(Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize)),
  };
}

/** The window width and the text scale (root font size over 16) the top bar rule needs; re-read on resize, which text zoom also fires. */
export function useTopBarMetrics(): TopBarMetrics {
  const [metrics, setMetrics] = useState<TopBarMetrics>(read);
  useEffect(() => {
    const update = () => {
      const next = read();
      setMetrics((prev) =>
        prev.viewportWidth === next.viewportWidth && prev.textScale === next.textScale ? prev : next,
      );
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return metrics;
}
