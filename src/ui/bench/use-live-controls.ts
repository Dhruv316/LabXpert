import { useCallback } from 'react';
import { findComponent } from '../../bench/ops';
import { stepSupplyVoltage, type StepDirection } from '../../bench/supply';
import { t } from '../../i18n';
import { checkAfterSwitchToggle, useBenchStore } from '../../state';
import { useCrash } from '../shell/use-crash';
import { useAnnounce } from './announcer';

/**
 * Flips a switch through the store and says the new state. A refused or missing switch says nothing.
 * Click, Enter and Space all come through here, so closing the switch runs the SWITCH_CLOSE check
 * once, whichever way it was done; opening it runs nothing.
 */
export function useSwitchToggle(): (id: string) => void {
  const crash = useCrash();
  const announce = useAnnounce();
  return useCallback(
    (id: string) => {
      useBenchStore
        .getState()
        .toggleSwitch(id)
        .then((closed) => {
          if (closed !== undefined) announce(t(closed ? 'bench.switchClosed' : 'bench.switchOpen'));
          // Called in this same tick, so it sees the circuit this toggle made and no later one.
          return checkAfterSwitchToggle(closed);
        })
        .catch(crash);
    },
    [crash, announce],
  );
}

// The voltage the last press asked for, until its save finishes. A held arrow key presses faster than
// the database saves, so each press steps from this target and not from the circuit on screen, or
// presses would be lost. Shared by the supply part and the stepper, which are one control to the learner.
let requested: { id: string; volts: number } | undefined;

/** One press of the stepper or an arrow key: saves the new voltage and announces it. Runs no check. */
export function useSupplyStep(): (id: string, direction: StepDirection) => void {
  const crash = useCrash();
  const announce = useAnnounce();
  return useCallback(
    (id: string, direction: StepDirection) => {
      const { circuit, session } = useBenchStore.getState();
      const part = findComponent(circuit, id);
      if (session === undefined || part?.type !== 'supply' || part.valueLocked === true) return;
      const from = requested?.id === id ? requested.volts : part.voltage;
      const to = stepSupplyVoltage(from, direction, session.experiment.supply);
      if (to === from) return;
      const mine = { id, volts: to };
      requested = mine;
      useBenchStore
        .getState()
        .setSupplyVoltage(id, to)
        .then((result) => {
          if (result !== 'changed') return;
          const now = findComponent(useBenchStore.getState().circuit, id);
          if (now?.type === 'supply') announce(t('bench.supplyAnnounce', { volts: now.voltage }));
        })
        .catch(crash)
        .finally(() => {
          if (requested === mine) requested = undefined;
        });
    },
    [crash, announce],
  );
}

/** Sets a resistor to one of the allowed values through the store and says the new value. Refused or unchanged says nothing. */
export function useResistorChoice(): (id: string, ohms: number) => void {
  const crash = useCrash();
  const announce = useAnnounce();
  return useCallback(
    (id: string, ohms: number) => {
      useBenchStore
        .getState()
        .setResistorValue(id, ohms)
        .then((result) => {
          if (result === 'changed') announce(t('bench.resistanceAnnounce', { ohms }));
        })
        .catch(crash);
    },
    [crash, announce],
  );
}
