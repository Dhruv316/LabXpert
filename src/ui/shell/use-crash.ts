import { useCallback, useState } from 'react';

/**
 * Hands an async failure (a db read or write) to the error boundary, which shows the friendly
 * screen. Event handlers and effects cannot throw into React's render, so the throw is moved
 * into a state updater, which runs during render.
 */
export function useCrash(): (error: unknown) => void {
  const [, setState] = useState<void>();
  return useCallback((error: unknown) => {
    setState(() => {
      throw error;
    });
  }, []);
}
