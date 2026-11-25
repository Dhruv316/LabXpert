import { ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import { Icon, cn } from '../../components/ui';
import { t } from '../../i18n';
import { useBenchStore } from '../../state';

/** Thin read-only strip under the bench: the live switch state and the supply voltage. The controls are on the bench. */
export function StatusStrip({ compact = false }: { compact?: boolean }) {
  const circuit = useBenchStore((state) => state.circuit);
  const bench = circuit.components;
  const supply = bench.find((c) => c.type === 'supply');
  const toggle = bench.find((c) => c.type === 'switch');

  return (
    <div
      data-testid="bench-status"
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-t-2 border-wood-light px-4 font-body text-sm font-bold text-ink',
        compact ? 'min-h-[30px] py-0.5' : 'min-h-[40px] py-1',
      )}
    >
      {toggle?.type === 'switch' && (
        <span className="inline-flex items-center gap-2">
          <Icon icon={toggle.closed ? ToggleRight : ToggleLeft} />
          {toggle.closed ? t('bench.switchClosed') : t('bench.switchOpen')}
        </span>
      )}
      {supply?.type === 'supply' && (
        <span className="inline-flex items-center gap-2">
          <Icon icon={Zap} />
          <span className="font-semibold text-ink-soft">{t('bench.supplyVoltage')}</span>
          <span data-numeric className="font-heading text-base font-semibold">
            {t('bench.supplyValue', { volts: supply.voltage })}
          </span>
        </span>
      )}
    </div>
  );
}
