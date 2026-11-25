import { useRef } from 'react';
import { Button, useToast } from '../../components/ui';
import { t } from '../../i18n';
import { selectRecordingAllowed, useBenchStore, useReadingsStore } from '../../state';
import { useCrash } from '../shell/use-crash';
import { useAnnounce } from './announcer';

/** The compact dock's 44 px button (the design's smallest control). */
const SHORT_BUTTON = '!min-h-[44px] !px-4';

/**
 * Record reading. Disabled at 0 V with the reason as a tooltip (the button stays focusable). A clean
 * check shows the toast and says it politely; a blocked check shows nothing here, because the tutor
 * panel already carries the error. Focus never moves.
 */
export function RecordButton({ compact = false }: { compact?: boolean }) {
  const allowed = useBenchStore(selectRecordingAllowed);
  const recordReading = useReadingsStore((state) => state.recordReading);
  const toast = useToast();
  const announce = useAnnounce();
  const crash = useCrash();
  // One press at a time: a second press while the first is still being saved is ignored.
  const working = useRef(false);

  const press = () => {
    if (working.current) return;
    working.current = true;
    recordReading()
      .then((result) => {
        if (result.status !== 'recorded') return;
        const message = t('bench.recordedToast');
        toast.show(message);
        announce(message);
      })
      .catch(crash)
      .finally(() => {
        working.current = false;
      });
  };

  return (
    <Button variant="primary" className={compact ? SHORT_BUTTON : undefined} disabled={!allowed} disabledReason={t('bench.recordNeedVoltage')} onClick={press}>
      {t('bench.record')}
    </Button>
  );
}
