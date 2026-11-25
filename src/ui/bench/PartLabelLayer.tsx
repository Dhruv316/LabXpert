import { useRef, type CSSProperties, type ReactNode } from 'react';
import {
  labelBoxHeight,
  labelEdge,
  labelGap,
  labelPx,
  LABEL_BORDER_PX,
  LABEL_DESIGN_SIZE,
  LABEL_LINE_HEIGHT,
  LABEL_PAD_PX,
} from '../../bench/labels';
import { isMeterType, meterView } from '../../bench/meters';
import { layoutOrDefault, slotPlacement } from '../../bench/overlay';
import { cn } from '../../components/ui';
import { t } from '../../i18n';
import type { CircuitComponent } from '../../model/types';
import { selectLive, useBenchStore } from '../../state';
import { meterText } from './MeterReadout';
import { useElementSize } from './use-element-size';

interface Chip {
  designSize: number;
  className: string;
  /** Set on a meter's reading, so it can be found by the meter it belongs to. */
  meter?: 'ammeter' | 'voltmeter';
  content: ReactNode;
}

const PLATE = 'whitespace-nowrap rounded-small font-heading font-semibold tabular-nums';

/** What each part shows on its label: the value that was drawn on the kit picture, now in real text. */
function chipOf(part: CircuitComponent, reading: string | undefined): Chip | undefined {
  switch (part.type) {
    case 'ammeter':
    case 'voltmeter':
      return reading === undefined
        ? undefined
        : { designSize: LABEL_DESIGN_SIZE.meter, className: cn(PLATE, 'border-ink bg-white text-ink'), meter: part.type, content: reading };
    case 'supply':
      return {
        designSize: LABEL_DESIGN_SIZE.supply,
        className: cn(PLATE, 'border-ink bg-ink text-teal-tint'),
        content: t('bench.supplyValue', { volts: part.voltage }),
      };
    case 'resistor':
      return {
        designSize: LABEL_DESIGN_SIZE.resistor,
        className: cn(PLATE, 'border-ink bg-cream text-ink'),
        content: (
          <>
            {part.role !== 'R' && <span className="mr-2 rounded-pill bg-ink px-2 text-cream">{part.role}</span>}
            {t('bench.resistanceValue', { ohms: part.ohms })}
          </>
        ),
      };
    case 'switch':
      return {
        designSize: LABEL_DESIGN_SIZE.switch,
        className: cn(PLATE, 'border-ink bg-cream font-body font-bold capitalize text-ink'),
        content: t('components.switch'),
      };
  }
}

/**
 * The text that must stay readable on a small bench (meter digits, resistor value and name, supply display,
 * the switch's name), as real HTML over the bench. Each label is at least 14 px on screen whatever the bench
 * scale and follows its part; it lies over the wires, never over the part's terminals (it sits above the
 * part, or under the switch), and lets every pointer press through. Hidden from assistive tech: the part's
 * own name and the meter's `meterReading` already say all of it.
 */
export function PartLabelLayer() {
  const circuit = useBenchStore((state) => state.circuit);
  const live = useBenchStore(selectLive);
  const experiment = useBenchStore((state) => state.session?.experiment);
  const ref = useRef<HTMLDivElement>(null);
  const measured = useElementSize(ref);
  const { layout, size } = layoutOrDefault(measured);

  return (
    <div ref={ref} data-testid="part-chip-layer" aria-hidden="true" className="pointer-events-none absolute inset-0">
      {circuit.components.map((part) => {
        const reading =
          live !== undefined && experiment !== undefined && isMeterType(part.type) ? meterText(part.type, meterView(live, experiment, part.type)) : undefined;
        const chip = chipOf(part, reading);
        if (chip === undefined) return null;
        const px = labelPx(chip.designSize, layout.scale);
        const place = slotPlacement(layout, size, part, labelEdge(part.type), labelBoxHeight(px), labelGap(layout.scale));
        const style: CSSProperties = {
          left: place.left,
          ...(place.anchor === 'top' ? { top: place.offset } : { bottom: place.offset }),
          fontSize: px,
          lineHeight: LABEL_LINE_HEIGHT,
          paddingBlock: LABEL_PAD_PX,
          paddingInline: LABEL_PAD_PX * 2,
          borderWidth: LABEL_BORDER_PX,
        };
        return (
          <div
            key={part.id}
            data-part-chip={part.id}
            data-edge={place.edge}
            data-meter-readout={chip.meter}
            style={style}
            className={cn('absolute -translate-x-1/2 border-solid', chip.className)}
          >
            {chip.content}
          </div>
        );
      })}
    </div>
  );
}
