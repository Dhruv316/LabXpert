import { useEffect, useRef, type FocusEvent, type KeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { canStepSupply, type StepDirection } from '../../bench/supply';
import { t } from '../../i18n';
import type { ExperimentConfig, SupplyComponent } from '../../model/types';
import { OverlayButton } from './OverlayButton';
import { useSupplyStep } from './use-live-controls';

const ARROW_STEP: Readonly<Record<string, StepDirection | undefined>> = {
  ArrowUp: 1,
  ArrowRight: 1,
  ArrowDown: -1,
  ArrowLeft: -1,
};

export interface SupplyStepperProps {
  part: SupplyComponent;
  supply: ExperimentConfig['supply'];
}

/** The − and + buttons for one supply, 1 V a press (DESIGN.md §9). They sit in the control overlay under the supply. */
export function SupplyStepper({ part, supply }: SupplyStepperProps) {
  const step = useSupplyStep();
  const downRef = useRef<HTMLButtonElement>(null);
  const upRef = useRef<HTMLButtonElement>(null);
  const locked = part.valueLocked === true;
  const canDown = !locked && canStepSupply(part.voltage, -1, supply);
  const canUp = !locked && canStepSupply(part.voltage, 1, supply);

  // A button that reaches its limit turns off while it has focus, and some browsers then drop focus to the
  // page. So the button last focused is remembered (until focus goes to some other element), and when it is
  // the one that just turned off, focus moves to its partner. A keyboard user is never dropped at the page top.
  const lastFocus = useRef<HTMLButtonElement | null>(null);
  const remember = { onFocus: (event: FocusEvent<HTMLButtonElement>) => { lastFocus.current = event.currentTarget; } };
  const forget = (event: FocusEvent<HTMLButtonElement>) => {
    if (event.relatedTarget !== null) lastFocus.current = null;
  };
  useEffect(() => {
    const held = lastFocus.current;
    const active = document.activeElement;
    if (held === null || (active !== held && active !== document.body && active !== null)) return;
    if (held === upRef.current && !canUp && canDown) downRef.current?.focus();
    if (held === downRef.current && !canDown && canUp) upRef.current?.focus();
  }, [canDown, canUp]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = ARROW_STEP[event.key];
    if (direction === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    step(part.id, direction);
  };

  return (
    <div role="group" aria-label={t('bench.supplyVoltage')} data-supply-stepper={part.id} onKeyDown={onKeyDown} className="flex items-center gap-2">
      <OverlayButton ref={downRef} icon={Minus} label={t('bench.supplyDown')} disabled={!canDown} onClick={() => step(part.id, -1)} {...remember} onBlur={forget} />
      <OverlayButton ref={upRef} icon={Plus} label={t('bench.supplyUp')} disabled={!canUp} onClick={() => step(part.id, 1)} {...remember} onBlur={forget} />
    </div>
  );
}
