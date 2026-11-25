import type { MeterType, MeterView } from '../../bench/meters';
import { t } from '../../i18n';

export interface MeterTextProps {
  type: MeterType;
  view: MeterView;
}

/** The unit is part of the text: meterAmps or meterVolts. */
export function meterText(type: MeterType, view: MeterView): string {
  return t(type === 'ammeter' ? 'bench.meterAmps' : 'bench.meterVolts', { value: view.number });
}

/**
 * What assistive tech gets for a meter: the value once, as text (`meterReading`). It sits inside the part,
 * which the part points to with aria-describedby. It is not a live region, so a changing reading is not announced.
 * The digits on screen are drawn by the label layer (PartLabelLayer) and hidden from assistive tech.
 */
export function MeterDescription({ type, view, descriptionId }: MeterTextProps & { descriptionId: string }) {
  return <desc id={descriptionId}>{t('bench.meterReading', { meter: t(`components.${type}`), value: meterText(type, view) })}</desc>;
}
