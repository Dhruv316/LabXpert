import { useMemo } from 'react';
import { focusAfterWireDelete } from '../../bench/wires';
import { t } from '../../i18n';
import { useBenchStore } from '../../state';
import { useCrash } from '../shell/use-crash';
import { useAnnounce } from './announcer';
import { focusTarget } from './wire-focus';

/**
 * The store's db-backed actions, with a failed write handed to the error boundary (the friendly
 * screen) instead of being lost in an unhandled promise.
 */
export function useBenchActions() {
  const crash = useCrash();
  const announce = useAnnounce();
  return useMemo(
    () => ({
      remove: (id: string) => {
        useBenchStore.getState().remove(id).catch(crash);
      },
      // Said only once the wire is really gone, so a refused or repeated delete is not announced.
      // Focus moves first, to a wire or terminal that stays on the bench, so it never drops to the page top.
      removeWire: (id: string) => {
        const store = useBenchStore.getState();
        focusTarget(document, focusAfterWireDelete(store.circuit, id));
        store
          .removeWire(id)
          .then((removed) => {
            if (removed) announce(t('bench.wireRemoved'));
          })
          .catch(crash);
      },
      clear: () => {
        useBenchStore.getState().clear().catch(crash);
      },
      undo: () => {
        useBenchStore.getState().undo().catch(crash);
      },
    }),
    [crash, announce],
  );
}
