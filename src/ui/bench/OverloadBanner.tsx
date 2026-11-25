import { Notice } from '../../components/ui';
import { t } from '../../i18n';
import { selectLive, useBenchStore } from '../../state';

/**
 * The overload banner (UI_SCREENS §3): a short circuit shows it at the top of the bench, and it goes the
 * moment the short is removed. It is the shared error Notice (icon, edge and text, never colour alone), which
 * is role="alert", so it is announced when it appears. It floats over the bench, so nothing is pushed around,
 * and it lets every pointer event through. Nothing about it animates, so Reduce motion changes nothing.
 */
export function OverloadBanner() {
  const overload = useBenchStore((state) => selectLive(state)?.overload === true);
  if (!overload) return null;
  return (
    <div data-testid="overload-banner" className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3">
      <Notice tone="error" className="max-w-xl">
        <p className="font-body text-base font-bold">{t('bench.overload')}</p>
      </Notice>
    </div>
  );
}
