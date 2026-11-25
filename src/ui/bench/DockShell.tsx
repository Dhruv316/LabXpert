import { useId } from 'react';
import { t } from '../../i18n';

/** The 220 px dock under the bench. Only its title for now: the readings table and graph come later. */
export function DockShell() {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="h-[220px] shrink-0 border-t-4 border-wood bg-mat px-4 py-3">
      <h2 id={titleId} className="font-heading text-xl font-semibold leading-7">
        {t('bench.readings')}
      </h2>
    </section>
  );
}
