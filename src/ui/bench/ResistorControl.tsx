import { useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { cn, Icon, Tooltip } from '../../components/ui';
import { useActivation } from '../../components/ui/activation';
import { DISABLED_LOOK, FOCUS_RING, MOTION_BASE } from '../../components/ui/styles';
import { t } from '../../i18n';
import type { ResistorComponent } from '../../model/types';
import { OVERLAY_CONTROL } from './ControlOverlay';
import { useResistorChoice } from './use-live-controls';

interface OptionProps {
  ohms: number;
  checked: boolean;
  /** Exactly one option is a Tab stop (roving tabindex); arrow keys move between them. */
  tabbable: boolean;
  /** Fixed for this task: the option can be focused and read, but does nothing. */
  locked: boolean;
  onChoose: () => void;
  optionRef: (node: HTMLButtonElement | null) => void;
}

/** One value in the segmented control. The check icon and the heavier edge say "chosen", so colour is never the only sign. */
function Option({ ohms, checked, tabbable, locked, onChoose, optionRef }: OptionProps) {
  const activation = useActivation<HTMLButtonElement>(onChoose, locked);
  return (
    <button
      {...activation}
      ref={optionRef}
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={locked ? true : undefined}
      tabIndex={tabbable ? 0 : -1}
      data-ohms={ohms}
      className={cn(
        OVERLAY_CONTROL,
        'inline-flex items-center justify-center gap-1 rounded-small border-2 px-3 font-heading text-base font-semibold text-ink',
        MOTION_BASE,
        FOCUS_RING,
        checked ? 'border-ink bg-teal-tint' : 'border-transparent bg-cream hover:bg-teal-tint',
        locked && DISABLED_LOOK,
      )}
    >
      {checked && <Icon icon={Check} size={16} />}
      {t('bench.resistanceValue', { ohms })}
    </button>
  );
}

/**
 * Enter on a resistor selects it and moves focus into its value control, so a keyboard user does not have to
 * Tab past every terminal to reach it. The control exists only after the selection renders, hence the timeout.
 */
export function focusResistorControl(partId: string): void {
  window.setTimeout(() => {
    document.querySelector<HTMLElement>(`[data-resistor-control="${partId}"] [role="radio"][tabindex="0"]`)?.focus();
  }, 0);
}

export interface ResistorControlProps {
  part: ResistorComponent;
  /** The experiment's allowed values, in order. */
  values: readonly number[];
}

/**
 * The segmented control for a selected resistor (DESIGN.md §9): a radio group of the allowed values.
 * One Tab stop; arrow keys, Home and End move and choose; a locked value can be read but not changed.
 */
export function ResistorControl({ part, values }: ResistorControlProps) {
  const choose = useResistorChoice();
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const locked = part.valueLocked === true;
  const checkedIndex = values.indexOf(part.ohms);
  const tabStop = checkedIndex >= 0 ? checkedIndex : 0;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      // The mat deselects the part on Escape, which removes this control; focus goes back to the part first.
      document.querySelector<SVGGElement>(`[data-part-id="${part.id}"]`)?.focus();
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // Move from the option that has focus now (not from the saved value), so a held key keeps travelling.
    const current = options.current.findIndex((node) => node === document.activeElement);
    const last = values.length - 1;
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = current < 0 || current === last ? 0 : current + 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = current <= 0 ? last : current - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    options.current[next]?.focus();
    const ohms = values[next];
    if (!locked && ohms !== undefined) choose(part.id, ohms);
  };

  const group = (describedBy: string | undefined) => (
    <div
      role="radiogroup"
      aria-label={t('bench.resistance')}
      aria-describedby={describedBy}
      data-resistor-control={part.id}
      onKeyDown={onKeyDown}
      className="pointer-events-auto flex items-center gap-1 rounded-control border-2 border-ink bg-cream p-1 shadow-lift"
    >
      {values.map((ohms, index) => (
        <Option
          key={ohms}
          ohms={ohms}
          checked={ohms === part.ohms}
          tabbable={index === tabStop}
          locked={locked}
          onChoose={() => choose(part.id, ohms)}
          optionRef={(node) => {
            options.current[index] = node;
          }}
        />
      ))}
    </div>
  );

  // The reason is in the DOM for screen readers (aria-describedby) and shows as a bubble on hover or focus.
  return locked ? <Tooltip content={t('bench.valueLocked')}>{group}</Tooltip> : group(undefined);
}
